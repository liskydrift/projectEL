import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs-extra";
import { randomUUID } from "crypto";
import { compileWorkflowToSkill } from "./compiler.js";
import { KnowledgeBaseService } from "./knowledge-base/knowledge-base-service.js";
import { createKnowledgeRoutes } from "./knowledge-base/knowledge-routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// workspaceCwd 指向 projectEL 的根目录
const workspaceCwd = path.resolve(__dirname, "../../");
const PORT = 3000;
const PI_CODING_AGENT_PACKAGE = "@earendil-works/pi-coding-agent";

const PROVIDER_IDS = ["anthropic", "openai", "google", "deepseek", "qwen", "openrouter"];
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  openrouter: "OpenRouter"
};
const PROVIDER_ENV_KEYS: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  qwen: "DASHSCOPE_API_KEY",
  openrouter: "OPENROUTER_API_KEY"
};

function readJsonIfExists(filePath: string, fallback: any) {
  try {
    return fs.pathExistsSync(filePath) ? fs.readJsonSync(filePath) : fallback;
  } catch {
    return fallback;
  }
}

function createFileAuthStorage(authStoragePath: string) {
  return {
    set(provider: string, credential: any) {
      const data = readJsonIfExists(authStoragePath, {});
      data[provider] = credential;
      fs.outputJsonSync(authStoragePath, data, { spaces: 2 });
    },
    remove(provider: string) {
      const data = readJsonIfExists(authStoragePath, {});
      delete data[provider];
      fs.outputJsonSync(authStoragePath, data, { spaces: 2 });
    },
    reload() {
      // File-backed fallback reads on demand.
    }
  };
}

function createFileModelRegistry(modelsJsonPath: string, authStoragePath: string) {
  const readModelsConfig = () => readJsonIfExists(modelsJsonPath, { providers: {} });
  const readAuthConfig = () => readJsonIfExists(authStoragePath, {});

  const getModels = () => {
    const config = readModelsConfig();
    return Object.entries(config.providers || {}).flatMap(([provider, providerConfig]: [string, any]) =>
      (providerConfig.models || []).map((model: any) => ({
        ...model,
        provider,
        baseUrl: providerConfig.baseUrl || ""
      }))
    );
  };

  return {
    getAll() {
      return getModels();
    },
    find(provider: string, modelId: string) {
      return getModels().find((model: any) => model.provider === provider && model.id === modelId);
    },
    getProviderDisplayName(provider: string) {
      return PROVIDER_DISPLAY_NAMES[provider] || provider;
    },
    getProviderAuthStatus(provider: string) {
      const authConfig = readAuthConfig();
      const modelsConfig = readModelsConfig();
      const providerConfig = modelsConfig.providers?.[provider] || {};
      const envKey = providerConfig.apiKey || PROVIDER_ENV_KEYS[provider];
      const hasFileCredential = Boolean(authConfig[provider]?.key || authConfig[provider]?.apiKey);
      const hasEnvCredential = Boolean(envKey && process.env[envKey]);

      return {
        configured: hasFileCredential || hasEnvCredential,
        source: hasEnvCredential ? envKey : hasFileCredential ? "auth.json" : undefined
      };
    },
    refresh() {
      // File-backed fallback reads on demand.
    }
  };
}

function createDegradedSession(sessionId: string, modelRegistry: any) {
  let model = modelRegistry.getAll()[0];
  let thinkingLevel = "off";
  const sessionManager = {
    getEntries: () => [],
    getHeader: () => ({ timestamp: new Date().toISOString() }),
    getSessionName: () => sessionId,
    newSession: () => {}
  };

  return {
    model,
    thinkingLevel,
    messages: [],
    sessionManager,
    agent: { state: { messages: [] } },
    subscribe: () => {},
    async setModel(nextModel: any) {
      model = nextModel;
      this.model = nextModel;
    },
    async setThinkingLevel(nextLevel: string) {
      thinkingLevel = nextLevel;
      this.thinkingLevel = nextLevel;
    },
    async prompt() {
      throw new Error("Pi Agent SDK is unavailable; chat and workflow reload are disabled until the local SDK is built or installed.");
    },
    async abort() {},
    dispose() {}
  };
}

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

  let piSdk: any = null;
  try {
    piSdk = await import(PI_CODING_AGENT_PACKAGE);
  } catch (err: any) {
    console.warn("[projectEL] Pi Agent SDK could not be loaded. Running backend in degraded model-config mode.");
    console.warn(`[projectEL] ${err?.message || err}`);
  }

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
  const loader = piSdk
    ? new piSdk.DefaultResourceLoader({
    cwd: workspaceCwd,
    agentDir: path.join(workspaceCwd, ".pi", "agent"), // 使用本地的 agentDir
    additionalExtensionPaths: [extDest]
      })
    : null;
  if (loader) {
    await loader.reload();
  }

  // 初始化项目本地的 API key 存储与模型列表
  const authStoragePath = path.join(workspaceCwd, ".pi", "auth.json");
  const modelsJsonPath = path.join(workspaceCwd, ".pi", "models.json");

  const authStorage = piSdk ? piSdk.AuthStorage.create(authStoragePath) : createFileAuthStorage(authStoragePath);
  const modelRegistry = piSdk ? piSdk.ModelRegistry.create(authStorage, modelsJsonPath) : createFileModelRegistry(modelsJsonPath, authStoragePath);

  // 多会话与预设管理器
  const sessions = new Map<string, any>();
  const sessionPresets = new Map<string, string>();

  // 查找一个本地已配置 API key 的可用模型作为保底
  function getConfiguredFallbackModel(): any {
    const allModels = modelRegistry.getAll();
    for (const m of allModels) {
      const authStatus = modelRegistry.getProviderAuthStatus(m.provider);
      if (authStatus.configured || !!authStatus.source) {
        return m;
      }
    }
    return allModels[0];
  }

  // 加载 JSONL 文件的辅助函数
  async function loadEntriesFromFile(filePath: string) {
    if (!(await fs.pathExists(filePath))) return [];
    try {
      const content = await fs.readFile(filePath, "utf8");
      return content
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  async function getOrCreateSession(sessionId: string, presetId?: string): Promise<any> {
    if (sessions.has(sessionId)) {
      return sessions.get(sessionId)!;
    }

    if (!piSdk || !loader) {
      const session = createDegradedSession(sessionId, modelRegistry);
      sessions.set(sessionId, session);
      return session;
    }

    const sessionDir = path.join(workspaceCwd, ".pi", "agent", "sessions");
    await fs.ensureDir(sessionDir);

    const files = await fs.readdir(sessionDir);
    const sessionFile = files.find(f => f.endsWith(`_${sessionId}.jsonl`));

    let sessionManager: any;
    if (sessionFile) {
      sessionManager = piSdk.SessionManager.open(path.join(sessionDir, sessionFile), sessionDir, workspaceCwd);
    } else {
      sessionManager = piSdk.SessionManager.create(workspaceCwd, sessionDir);
      sessionManager.newSession({ id: sessionId });
    }

    if (presetId) {
      sessionManager.appendCustomEntry("preset", { presetId });
      sessionPresets.set(sessionId, presetId);
    } else {
      const entries = sessionManager.getEntries();
      const presetEntry = entries.find((e: any) => e.type === "custom" && e.customType === "preset");
      if (presetEntry) {
        sessionPresets.set(sessionId, (presetEntry as any).data?.presetId);
      }
    }

    const { session } = await piSdk.createAgentSession({
      cwd: workspaceCwd,
      resourceLoader: loader,
      authStorage,
      modelRegistry,
      sessionManager
    });

    session.subscribe((event: any) => {
      io.to(sessionId).emit("pi-event", event);
    });

    const activePresetId = sessionPresets.get(sessionId);
    if (activePresetId && !sessionFile) {
      const presetsPath = path.join(workspaceCwd, "skills", "agent-presets.json");
      if (await fs.pathExists(presetsPath)) {
        const presets = await fs.readJson(presetsPath);
        const preset = presets.find((p: any) => p.id === activePresetId);
        if (preset && preset.modelConfig) {
          const { provider, modelId, thinkingLevel } = preset.modelConfig;
          let model = modelRegistry.find(provider, modelId);
          
          // 检查该模型是否已配置凭证，否则采用已配置的可用模型作为保底
          let isConfigured = false;
          if (model) {
            const authStatus = modelRegistry.getProviderAuthStatus(model.provider);
            isConfigured = authStatus.configured || !!authStatus.source;
          }
          
          if (!model || !isConfigured) {
            model = getConfiguredFallbackModel();
          }

          if (model) {
            try {
              await session.setModel(model);
            } catch (err) {
              console.error(`Failed to set model ${model.provider}/${model.id} for preset:`, err);
            }
            // 独立设置思考等级，不受 setModel 失败影响
            if (thinkingLevel && thinkingLevel !== "off") {
              try {
                await session.setThinkingLevel(thinkingLevel);
              } catch (err) {
                console.error(`Failed to set thinkingLevel "${thinkingLevel}" for preset, trying fallback "low"...`, err);
                try {
                  await session.setThinkingLevel("low");
                } catch (fallbackErr) {
                  console.error(`Fallback thinkingLevel "low" also failed:`, fallbackErr);
                }
              }
            }
          }
        }
      }
    }

    sessions.set(sessionId, session);
    return session;
  }

  // 初始化第一个默认会话，确保有个保底
  const defaultSessionId = "default-session";
  await getOrCreateSession(defaultSessionId);

  // 初始化知识库模块
  const kbService = new KnowledgeBaseService(workspaceCwd);
  await kbService.ensureDirectories();
  const kbRouter = createKnowledgeRoutes(kbService, io);
  app.use('/api/knowledge', kbRouter);

  // ----------------- HTTP 会话路由 -----------------

  // 1. 列出所有会话
  app.get("/api/sessions", async (req, res) => {
    try {
      const sessionDir = path.join(workspaceCwd, ".pi", "agent", "sessions");
      await fs.ensureDir(sessionDir);
      const list = piSdk ? await piSdk.SessionManager.list(workspaceCwd, sessionDir) : [];

      const presetsPath = path.join(workspaceCwd, "skills", "agent-presets.json");
      const presets = (await fs.pathExists(presetsPath)) ? await fs.readJson(presetsPath) : [];

      const results = await Promise.all(
        list.map(async (info: any) => {
          const entries = await loadEntriesFromFile(info.path);
          const presetEntry = entries.find((e: any) => e.type === "custom" && e.customType === "preset");
          const presetId = presetEntry ? presetEntry.data?.presetId : undefined;
          const preset = presets.find((p: any) => p.id === presetId);

          return {
            id: info.id,
            name: info.name || info.firstMessage || "(新会话)",
            firstMessage: info.firstMessage,
            createdAt: info.created,
            modifiedAt: info.modified,
            messageCount: info.messageCount,
            preset: preset ? { id: preset.id, name: preset.name } : null
          };
        })
      );

      // Merge active in-memory sessions that are not yet persisted on disk
      const activeSessionIds = Array.from(sessions.keys());
      for (const sId of activeSessionIds) {
        if (!results.some((r) => r.id === sId)) {
          const s = sessions.get(sId);
          if (s && s.sessionManager) {
            let firstMessage = "";
            let messageCount = 0;
            const entries = s.sessionManager.getEntries() || [];
            for (const entry of entries) {
              if (entry.type === "message") {
                messageCount++;
                const msg = entry.message;
                if (msg && (msg.role === "user" || msg.role === "assistant")) {
                  let text = "";
                  if (typeof msg.content === "string") {
                    text = msg.content;
                  } else if (Array.isArray(msg.content)) {
                    text = msg.content.map((c: any) => c.text || "").join("");
                  }
                  if (text && !firstMessage && msg.role === "user") {
                    firstMessage = text;
                  }
                }
              }
            }

            const header = s.sessionManager.getHeader();
            const created = header?.timestamp ? new Date(header.timestamp) : new Date();
            const sName = s.sessionManager.getSessionName();
            const presetId = sessionPresets.get(sId);
            const preset = presets.find((p: any) => p.id === presetId);

            results.push({
              id: sId,
              name: sName || firstMessage || "(新会话)",
              firstMessage: firstMessage || "(无消息)",
              createdAt: created,
              modifiedAt: new Date(),
              messageCount: messageCount,
              preset: preset ? { id: preset.id, name: preset.name } : null
            });
          }
        }
      }

      // Sort sessions by modifiedAt date descending
      results.sort((a, b) => {
        const timeA = new Date(a.modifiedAt).getTime();
        const timeB = new Date(b.modifiedAt).getTime();
        return timeB - timeA;
      });

      res.json({ sessions: results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. 新建会话
  app.post("/api/sessions/create", async (req, res) => {
    const { presetId, sessionId } = req.body;
    const sId = sessionId || randomUUID();
    try {
      const session = await getOrCreateSession(sId, presetId);
      res.json({
        success: true,
        sessionId: sId,
        presetId,
        model: session.model?.id,
        thinkingLevel: session.thinkingLevel
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. 切换会话
  app.post("/api/sessions/switch", async (req, res) => {
    const { sessionId } = req.body;
    try {
      const session = await getOrCreateSession(sessionId);
      res.json({
        success: true,
        sessionId,
        model: session.model?.id,
        thinkingLevel: session.thinkingLevel
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. 删除会话
  app.delete("/api/sessions/:id", async (req, res) => {
    const sessionId = req.params.id;
    if (sessionId === "default-session") {
      return res.status(400).json({ error: "不能删除默认会话" });
    }
    try {
      if (sessions.has(sessionId)) {
        const s = sessions.get(sessionId)!;
        await s.abort();
        s.dispose();
        sessions.delete(sessionId);
      }
      sessionPresets.delete(sessionId);

      const sessionDir = path.join(workspaceCwd, ".pi", "agent", "sessions");
      const files = (await fs.pathExists(sessionDir)) ? await fs.readdir(sessionDir) : [];
      const sessionFile = files.find(f => f.endsWith(`_${sessionId}.jsonl`));
      if (sessionFile) {
        await fs.remove(path.join(sessionDir, sessionFile));
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------- HTTP 智能体预设路由 -----------------

  // 获取所有预设
  app.get("/api/agents", async (req, res) => {
    try {
      const presetsPath = path.join(workspaceCwd, "skills", "agent-presets.json");
      const presets = (await fs.pathExists(presetsPath)) ? await fs.readJson(presetsPath) : [];
      res.json({ presets });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 新建预设
  app.post("/api/agents", async (req, res) => {
    try {
      const presetsPath = path.join(workspaceCwd, "skills", "agent-presets.json");
      const presets = (await fs.pathExists(presetsPath)) ? await fs.readJson(presetsPath) : [];
      
      const presetData = { ...req.body };
      if (!presetData.modelConfig || !presetData.modelConfig.provider || !presetData.modelConfig.modelId) {
        const fallback = getConfiguredFallbackModel();
        if (fallback) {
          presetData.modelConfig = {
            provider: fallback.provider,
            modelId: fallback.id,
            thinkingLevel: presetData.modelConfig?.thinkingLevel || "off"
          };
        }
      }

      const newPreset = { id: randomUUID().slice(0, 8), ...presetData };
      presets.push(newPreset);
      await fs.outputJson(presetsPath, presets, { spaces: 2 });
      res.json({ success: true, preset: newPreset });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 更新预设
  app.put("/api/agents/:id", async (req, res) => {
    try {
      const presetsPath = path.join(workspaceCwd, "skills", "agent-presets.json");
      let presets = (await fs.pathExists(presetsPath)) ? await fs.readJson(presetsPath) : [];
      const index = presets.findIndex((p: any) => p.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: "Preset not found" });
      }

      const presetData = { ...req.body };
      if (!presetData.modelConfig || !presetData.modelConfig.provider || !presetData.modelConfig.modelId) {
        const fallback = getConfiguredFallbackModel();
        if (fallback) {
          presetData.modelConfig = {
            provider: fallback.provider,
            modelId: fallback.id,
            thinkingLevel: presetData.modelConfig?.thinkingLevel || "off"
          };
        }
      }

      presets[index] = { ...presets[index], ...presetData, id: req.params.id };
      await fs.outputJson(presetsPath, presets, { spaces: 2 });
      res.json({ success: true, preset: presets[index] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 删除预设
  app.delete("/api/agents/:id", async (req, res) => {
    try {
      const presetsPath = path.join(workspaceCwd, "skills", "agent-presets.json");
      let presets = (await fs.pathExists(presetsPath)) ? await fs.readJson(presetsPath) : [];
      presets = presets.filter((p: any) => p.id !== req.params.id);
      await fs.outputJson(presetsPath, presets, { spaces: 2 });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------- HTTP 技能与模型路由 -----------------

  // 获取特定技能的可视化工作流 JSON
  app.get("/api/workflow/:id", async (req, res) => {
    const jsonPath = path.join(workspaceCwd, "skills", req.params.id, "workflow.json");
    if (await fs.pathExists(jsonPath)) {
      const data = await fs.readJson(jsonPath);
      res.json(data);
    } else {
      res.status(404).json({ error: "Workflow json not found" });
    }
  });

  // 保存并编译可视化工作流 JSON ➔ SKILL.md
  app.post("/api/workflow/:id", async (req, res) => {
    const { name, description, nodes, edges, sessionId } = req.body;
    const targetDir = path.join(workspaceCwd, "skills", req.params.id);
    const jsonPath = path.join(targetDir, "workflow.json");

    try {
      await fs.ensureDir(targetDir);
      await fs.outputJson(jsonPath, { id: req.params.id, name, description, nodes, edges }, { spaces: 2 });

      // 编译为 Markdown SKILL.md 写入到 .pi/skills 目录中
      const skillMDPath = path.join(workspaceCwd, ".pi", "skills", req.params.id, "SKILL.md");
      await compileWorkflowToSkill(jsonPath, skillMDPath);

      // 通过 prompt 触发内核 /reload 指令，动态热重载新编译的技能
      const targetSessionId = sessionId || defaultSessionId;
      const s = await getOrCreateSession(targetSessionId);
      await s.prompt("/reload");

      res.json({ success: true, message: "Workflow saved and compiled successfully" });
    } catch (err: any) {
      console.error("Workflow save error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 获取所有可用模型与 Provider 状态
  app.get("/api/models", async (req, res) => {
    const sessionId = (req.query.sessionId as string) || defaultSessionId;
    try {
      const s = await getOrCreateSession(sessionId);
      const allModels = modelRegistry.getAll();
      const providersList = PROVIDER_IDS;

      const providersData = providersList.map((p) => {
        const authStatus = modelRegistry.getProviderAuthStatus(p);

        let configuredBaseUrl = "";
        const allRegisteredModels = modelRegistry.getAll();
        const firstModelOfProvider = allRegisteredModels.find((m: any) => m.provider === p);
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

      const modelsData = allModels.map((m: any) => ({
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
        activeModel: s.model?.id,
        activeProvider: s.model?.provider,
        thinkingLevel: s.thinkingLevel
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 配置 Provider (API Key, Base URL 等)
  app.post("/api/models/configure", async (req, res) => {
    const { provider, apiKey, baseUrl, api, models } = req.body;
    try {
      if (apiKey !== undefined) {
        if (apiKey.trim() === "") {
          authStorage.remove(provider);
        } else {
          authStorage.set(provider, { type: "api_key", key: apiKey });
        }
      }

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

      if (Object.keys(modelsConfig.providers[provider]).length === 0) {
        delete modelsConfig.providers[provider];
      }

      await fs.outputJson(modelsJsonPath, modelsConfig, { spaces: 2 });

      modelRegistry.refresh();
      authStorage.reload();

      res.json({ success: true, message: `Provider ${provider} configured successfully` });
    } catch (err: any) {
      console.error("Configure provider error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 切换激活的模型与思考级别
  app.post("/api/models/select", async (req, res) => {
    const { provider, modelId, thinkingLevel, sessionId } = req.body;
    const targetSessionId = sessionId || defaultSessionId;
    try {
      const s = await getOrCreateSession(targetSessionId);
      const model = modelRegistry.find(provider, modelId);
      if (!model) {
        return res.status(404).json({ error: `Model ${provider}/${modelId} not found` });
      }

      await s.setModel(model);

      if (thinkingLevel) {
        await s.setThinkingLevel(thinkingLevel);
      }

      io.to(targetSessionId).emit("session-state", {
        model: s.model?.id,
        thinkingLevel: s.thinkingLevel,
        messages: s.messages
      });

      res.json({
        success: true,
        activeModel: s.model?.id,
        thinkingLevel: s.thinkingLevel
      });
    } catch (err: any) {
      console.error("Select model error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------- Socket.io 实时通信 -----------------
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // 加入指定会话的房间
    socket.on("join-session", async (data: { sessionId: string }) => {
      const sId = data.sessionId || defaultSessionId;
      socket.join(sId);
      console.log(`Socket ${socket.id} joined session: ${sId}`);

      try {
        const s = await getOrCreateSession(sId);
        socket.emit("session-state", {
          model: s.model?.id,
          thinkingLevel: s.thinkingLevel,
          messages: s.messages
        });
      } catch (err: any) {
        socket.emit("pi-error", { message: err.message });
      }
    });

    // 离开会话房间
    socket.on("leave-session", (data: { sessionId: string }) => {
      if (data.sessionId) {
        socket.leave(data.sessionId);
        console.log(`Socket ${socket.id} left session: ${data.sessionId}`);
      }
    });

    // 客户端发送新消息
    socket.on("send-message", async (data: { text: string; images?: any[]; sessionId: string }) => {
      const sId = data.sessionId || defaultSessionId;
      try {
        const s = await getOrCreateSession(sId);
        await s.prompt(data.text, { images: data.images });
      } catch (err: any) {
        socket.emit("pi-error", { message: err.message });
      }
    });

    // 客户端触发中断/中止执行
    socket.on("abort", async (data: { sessionId: string }) => {
      const sId = data.sessionId || defaultSessionId;
      try {
        const s = await getOrCreateSession(sId);
        await s.abort();
      } catch (err: any) {
        socket.emit("pi-error", { message: err.message });
      }
    });

    // 客户端触发清空对话 / 新建会话
    socket.on("clear-session", async (data: { sessionId: string }) => {
      const sId = data.sessionId || defaultSessionId;
      try {
        const s = await getOrCreateSession(sId);
        await s.abort();
        s.sessionManager.newSession({ id: sId });
        s.agent.state.messages = [];
        io.to(sId).emit("session-state", {
          model: s.model?.id,
          thinkingLevel: s.thinkingLevel,
          messages: s.messages
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
