import { createAgentSession, SessionManager, DefaultResourceLoader, AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs-extra";
import { compileWorkflowToSkill } from "./compiler.js";
import { KnowledgeBaseService } from "./knowledge-base/knowledge-base-service.js";
import { createKnowledgeRoutes } from "./knowledge-base/knowledge-routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// workspaceCwd 指向 projectEL 的根目录
const workspaceCwd = path.resolve(__dirname, "../../");
const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // 确保项目本地的技能与扩展工作区目录存在
  await fs.ensureDir(path.join(workspaceCwd, "skills"));
  await fs.ensureDir(path.join(workspaceCwd, ".pi", "skills"));
  await fs.ensureDir(path.join(workspaceCwd, ".pi", "extensions"));

  // 将我们的开发扩展及依赖的编译器复制到 .pi/extensions 目录下，以便 Pi 底层加载器自动发现并运行
  const extSource = path.resolve(__dirname, "study-agent-extension.ts");
  const extDest = path.join(workspaceCwd, ".pi", "extensions", "study-agent-extension.ts");
  await fs.copy(extSource, extDest);

  const compilerSource = path.resolve(__dirname, "compiler.ts");
  const compilerDest = path.join(workspaceCwd, ".pi", "extensions", "compiler.ts");
  await fs.copy(compilerSource, compilerDest);

  // 初始化 Pi 资源加载器 (加载本地的 skills, prompts, 扩展等)
  const loader = new DefaultResourceLoader({
    cwd: workspaceCwd,
    agentDir: path.join(workspaceCwd, ".pi", "agent"), // 使用本地的 agentDir
    additionalExtensionPaths: [extDest]
  });
  await loader.reload();

  // 初始化项目本地的 API key 存储与模型列表
  const authStoragePath = path.join(workspaceCwd, ".pi", "auth.json");
  const modelsJsonPath = path.join(workspaceCwd, ".pi", "models.json");

  const authStorage = AuthStorage.create(authStoragePath);
  const modelRegistry = ModelRegistry.create(authStorage, modelsJsonPath);

  // 实例化 Pi 智能体对话 Session，传入本地的 authStorage 和 modelRegistry
  const { session } = await createAgentSession({
    cwd: workspaceCwd,
    resourceLoader: loader,
    authStorage,
    modelRegistry,
    sessionManager: SessionManager.inMemory() // 内存型会话，适合开发调试
  });

  // 核心：订阅 Pi 运行事件并实时双向投递给前端 Socket 客户端
  session.subscribe((event) => {
    io.emit("pi-event", event);
  });

  // 初始化知识库模块
  const kbService = new KnowledgeBaseService(workspaceCwd);
  await kbService.ensureDirectories();
  const kbRouter = createKnowledgeRoutes(kbService, io);
  app.use('/api/knowledge', kbRouter);

  // ----------------- HTTP 路由 -----------------

  // 1. 获取特定技能的可视化工作流 JSON
  app.get("/api/workflow/:id", async (req, res) => {
    const jsonPath = path.join(workspaceCwd, "skills", req.params.id, "workflow.json");
    if (await fs.pathExists(jsonPath)) {
      const data = await fs.readJson(jsonPath);
      res.json(data);
    } else {
      res.status(404).json({ error: "Workflow json not found" });
    }
  });

  // 2. 保存并编译可视化工作流 JSON ➔ SKILL.md
  app.post("/api/workflow/:id", async (req, res) => {
    const { name, description, nodes, edges } = req.body;
    const targetDir = path.join(workspaceCwd, "skills", req.params.id);
    const jsonPath = path.join(targetDir, "workflow.json");

    try {
      await fs.ensureDir(targetDir);
      await fs.outputJson(jsonPath, { id: req.params.id, name, description, nodes, edges }, { spaces: 2 });

      // 编译为 Markdown SKILL.md 写入到 .pi/skills 目录中
      const skillMDPath = path.join(workspaceCwd, ".pi", "skills", req.params.id, "SKILL.md");
      await compileWorkflowToSkill(jsonPath, skillMDPath);

      // 通过 prompt 触发内核 /reload 指令，动态热重载新编译的技能
      await session.prompt("/reload");

      res.json({ success: true, message: "Workflow saved and compiled successfully" });
    } catch (err: any) {
      console.error("Workflow save error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 3. 获取所有可用模型与 Provider 状态
  app.get("/api/models", async (req, res) => {
    try {
      const allModels = modelRegistry.getAll();
      const providersList = ["anthropic", "openai", "google", "deepseek", "qwen", "openrouter"];
      
      const providersData = providersList.map((p) => {
        const authStatus = modelRegistry.getProviderAuthStatus(p);
        
        // 查找该 provider 是否在 models.json 中配置了特殊的 baseUrl
        let configuredBaseUrl = "";
        const allRegisteredModels = modelRegistry.getAll();
        const firstModelOfProvider = allRegisteredModels.find(m => m.provider === p);
        if (firstModelOfProvider) {
          configuredBaseUrl = firstModelOfProvider.baseUrl;
        }

        return {
          id: p,
          name: modelRegistry.getProviderDisplayName(p),
          configured: authStatus.configured || !!authStatus.source,
          source: authStatus.source,
          baseUrl: configuredBaseUrl
        };
      });

      const modelsData = allModels.map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        reasoning: m.reasoning,
        contextWindow: m.contextWindow,
        maxTokens: m.maxTokens
      }));

      res.json({
        providers: providersData,
        models: modelsData,
        activeModel: session.model?.id,
        activeProvider: session.model?.provider,
        thinkingLevel: session.thinkingLevel
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. 配置 Provider (API Key, Base URL 等)
  app.post("/api/models/configure", async (req, res) => {
    const { provider, apiKey, baseUrl, api, models } = req.body;
    try {
      // 1. 保存/移除 API Key 到 authStorage
      if (apiKey !== undefined) {
        if (apiKey.trim() === "") {
          authStorage.remove(provider);
        } else {
          authStorage.set(provider, { type: "api_key", key: apiKey });
        }
      }

      // 2. 更新 models.json 中的 baseUrl 与 models 列表
      let modelsConfig: any = { providers: {} };
      if (await fs.pathExists(modelsJsonPath)) {
        try {
          modelsConfig = await fs.readJson(modelsJsonPath);
        } catch (err) {
          // 容错忽略损坏的 JSON
        }
      }

      if (!modelsConfig.providers) {
        modelsConfig.providers = {};
      }

      // 确保 provider 键存在
      if (!modelsConfig.providers[provider]) {
        modelsConfig.providers[provider] = {};
      }

      if (baseUrl !== undefined) {
        modelsConfig.providers[provider].baseUrl = baseUrl;
      }

      if (api !== undefined) {
        modelsConfig.providers[provider].api = api;
      }

      if (models !== undefined) {
        modelsConfig.providers[provider].models = models;
      }

      // 如果整个 provider 配置为空，则删除它以保持整洁
      if (Object.keys(modelsConfig.providers[provider]).length === 0) {
        delete modelsConfig.providers[provider];
      }

      await fs.outputJson(modelsJsonPath, modelsConfig, { spaces: 2 });

      // 3. 重新加载
      modelRegistry.refresh();
      authStorage.reload();

      res.json({ success: true, message: `Provider ${provider} configured successfully` });
    } catch (err: any) {
      console.error("Configure provider error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 5. 切换激活的模型与思考级别
  app.post("/api/models/select", async (req, res) => {
    const { provider, modelId, thinkingLevel } = req.body;
    try {
      const model = modelRegistry.find(provider, modelId);
      if (!model) {
        return res.status(404).json({ error: `Model ${provider}/${modelId} not found` });
      }

      await session.setModel(model);
      
      if (thinkingLevel) {
        await session.setThinkingLevel(thinkingLevel);
      }

      // 广播状态更新
      io.emit("session-state", {
        model: session.model?.id,
        thinkingLevel: session.thinkingLevel,
        messages: session.messages
      });

      res.json({
        success: true,
        activeModel: session.model?.id,
        thinkingLevel: session.thinkingLevel
      });
    } catch (err: any) {
      console.error("Select model error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------- Socket.io 实时通信 -----------------
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // 建立连接后，将当前会话的初始状态发送给客户端
    socket.emit("session-state", {
      model: session.model?.id,
      thinkingLevel: session.thinkingLevel,
      messages: session.messages
    });

    // 客户端发送新消息
    socket.on("send-message", async (data: { text: string; images?: any[] }) => {
      try {
        await session.prompt(data.text, { images: data.images });
      } catch (err: any) {
        socket.emit("pi-error", { message: err.message });
      }
    });

    // 客户端触发中断/中止执行
    socket.on("abort", () => {
      session.abort();
    });

    // 客户端触发清空对话 / 新建会话
    socket.on("clear-session", async () => {
      try {
        await session.abort();
        session.sessionManager.newSession();
        session.agent.state.messages = [];
        io.emit("session-state", {
          model: session.model?.id,
          thinkingLevel: session.thinkingLevel,
          messages: session.messages
        });
      } catch (err: any) {
        socket.emit("pi-error", { message: err.message });
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  httpServer.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start backend server:", err);
});

