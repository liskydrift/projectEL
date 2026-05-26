import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import fs from "fs-extra";
import path from "path";
import { compileWorkflowToSkill } from "./compiler.js";
import { completeSimple } from "@earendil-works/pi-ai";

export default function (pi: ExtensionAPI) {
  // 注入预设 System Prompt
  pi.on("before_agent_start", async (event, ctx) => {
    try {
      const entries = ctx.sessionManager.getEntries();
      const presetEntry = entries.find((e: any) => e.type === "custom" && e.customType === "preset");
      if (!presetEntry) return;

      const presetId = (presetEntry as any).data?.presetId;
      if (!presetId) return;

      const presetsPath = path.join(ctx.cwd, "skills", "agent-presets.json");
      if (await fs.pathExists(presetsPath)) {
        const presets = await fs.readJson(presetsPath);
        const preset = presets.find((p: any) => p.id === presetId);
        if (preset && preset.systemPrompt) {
          return {
            systemPrompt: `${preset.systemPrompt}\n\n${event.systemPrompt}`
          };
        }
      }
    } catch (err) {
      console.error("Preset systemPrompt injection error:", err);
    }
  });

  // 监听用户输入事件，用于自动拦截并调用 Qwen 子智能体识图以及注入知识库文档
  pi.on("input", async (event, ctx) => {
    let text = event.text;
    let images = event.images || [];
    let transformed = false;

    // 1. 识图逻辑 (如果上传了图片，且当前主模型不支持多模态输入)
    const activeModelSupportsVision = ctx.model?.input?.includes("image");
    if (images.length > 0 && !activeModelSupportsVision) {
      try {
        // 寻找可用的识图模型
        let visionModel = ctx.modelRegistry.find("qwen", "qwen3.6-flash-2026-04-16") || 
                            ctx.modelRegistry.find("qwen", "qwen3.6-35b-a3b") || 
                            ctx.modelRegistry.find("qwen", "qwen-vl-max");
        let auth = visionModel ? await ctx.modelRegistry.getApiKeyAndHeaders(visionModel) : { ok: false, apiKey: undefined, headers: undefined };
        
        if (!auth.ok) {
          const allModels = ctx.modelRegistry.getAll();
          const candidateModels = allModels.filter(m => m.input && m.input.includes("image"));
          
          for (const m of candidateModels) {
            const a = await ctx.modelRegistry.getApiKeyAndHeaders(m);
            if (a.ok) {
              if (m.provider === "anthropic" && a.apiKey?.startsWith("sk-ant-router") && m.baseUrl?.includes("api.anthropic.com")) {
                continue;
              }
              if (m.provider === "google" && a.apiKey?.startsWith("sk-ant-router") && m.baseUrl?.includes("generativelanguage.googleapis.com")) {
                continue;
              }
              visionModel = m;
              auth = a;
              break;
            }
          }
        }

        if (!visionModel || !auth.ok) {
          throw new Error("模型注册表里找不到任何已配置且有效的识图模型（如 Qwen, Gemini, GPT-4o 等），请在配置面板中添加服务商凭证");
        }

        pi.sendMessage({
          customType: "subagent-status",
          content: `🤖 **识图子智能体**：检测到上传图片，正在调用 ${visionModel.name || visionModel.id} 进行图像分析和细节提取...`,
          display: true,
          details: { status: "working", agent: visionModel.provider }
        });

        const content = [
          { 
            type: "text" as const, 
            text: "请详细描述用户上传的这张或多张图片。你的描述将被传递给另一个主大语言模型（如 DeepSeek），以便它能够根据你的描述准确解答用户的问题。因此，请聚焦于图片的细节、文字、结构、颜色和关键信息，并客观、清晰、结构化地进行描述。" 
          },
          ...images.map(img => ({
            type: "image" as const,
            data: img.data,
            mimeType: img.mimeType
          }))
        ];

        const context = {
          messages: [
            { role: "user" as const, content, timestamp: Date.now() }
          ]
        };

        const assistantMessage = await completeSimple(visionModel, context, {
          apiKey: auth.apiKey,
          headers: auth.headers
        });

        let description = "";
        let thinkingContent = "";
        for (const part of assistantMessage.content) {
          if (part.type === "text") {
            description += part.text;
          } else if (part.type === "thinking") {
            thinkingContent += part.thinking;
          }
        }

        if (!description.trim() && thinkingContent.trim()) {
          description = thinkingContent;
        }

        if (!description.trim()) {
          const diag = `stopReason=${assistantMessage.stopReason}, error=${assistantMessage.errorMessage || 'none'}, contentBlocks=${assistantMessage.content.map(c => c.type).join(',') || 'empty'}`;
          throw new Error(`${visionModel.name || visionModel.id} 子智能体返回了空的图像描述 [诊断: ${diag}]`);
        }

        pi.sendMessage({
          customType: "subagent-result",
          content: `🤖 **${visionModel.name || visionModel.id} 识图子智能体**分析完成！\n\n**图片详细描述：**\n${description}`,
          display: true,
          details: { status: "done", agent: visionModel.provider, result: description }
        });

        text = `[${visionModel.name || visionModel.id} 图像分析子智能体提供的图片描述]\n${description}\n\n---\n\n[用户的原问题]\n${text}`;
        images = []; // 清除图片防止 text-only 模型报错
        transformed = true;
      } catch (err: any) {
        console.error("Vision subagent error:", err);
        pi.sendMessage({
          customType: "subagent-error",
          content: `❌ **识图子智能体执行出错**：${err.message || err}`,
          display: true,
          details: { status: "error", agent: "vision", error: err.message }
        });
        
        text = `[识图子智能体运行出错：${err.message || err}]\n\n${text}`;
        images = [];
        transformed = true;
      }
    }

    // 2. 注入预设绑定的知识库文档
    try {
      const entries = ctx.sessionManager.getEntries();
      const presetEntry = entries.find((e: any) => e.type === "custom" && e.customType === "preset");
      if (presetEntry) {
        const presetId = (presetEntry as any).data?.presetId;
        if (presetId) {
          const presetsPath = path.join(ctx.cwd, "skills", "agent-presets.json");
          if (await fs.pathExists(presetsPath)) {
            const presets = await fs.readJson(presetsPath);
            const preset = presets.find((p: any) => p.id === presetId);
            if (preset && preset.contextDocs && preset.contextDocs.length > 0) {
              let docsContent = "";
              for (const doc of preset.contextDocs) {
                const docPath = path.isAbsolute(doc) ? doc : path.join(ctx.cwd, "wiki_core", doc);
                if (await fs.pathExists(docPath)) {
                  const content = await fs.readFile(docPath, "utf8");
                  docsContent += `\n\n--- 文档: ${path.basename(doc)} ---\n${content}\n`;
                }
              }
              if (docsContent.trim()) {
                text = `[知识库文档上下文]\n${docsContent.trim()}\n\n---\n\n${text}`;
                transformed = true;
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Error reading contextDocs in input event:", err);
    }

    if (transformed) {
      return {
        action: "transform" as const,
        text,
        images
      };
    }

    return { action: "continue" as const };
  });

  // 注册让 Agent 修改自身技能结构的工具
  pi.registerTool({
    name: "write_workflow",
    label: "修改技能工作流",
    description: "写入或修改一个技能的可视化工作流 JSON 并自动生成对应的 SKILL.md 技能定义",
    parameters: Type.Object({
      skillId: Type.String({ description: "技能的唯一ID标识，例如 fetch-and-summarize-news" }),
      workflowData: Type.String({ description: "JSON 格式的工作流节点与边定义（包含 nodes 与 edges 字段）" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const targetDir = path.resolve(ctx.cwd, "skills", params.skillId);
      const jsonPath = path.join(targetDir, "workflow.json");

      await fs.ensureDir(targetDir);
      const data = JSON.parse(params.workflowData);
      await fs.outputJson(jsonPath, data, { spaces: 2 });

      const skillMDDir = path.resolve(ctx.cwd, ".pi", "skills", params.skillId);
      const skillMDPath = path.join(skillMDDir, "SKILL.md");
      await compileWorkflowToSkill(jsonPath, skillMDPath);

      pi.sendUserMessage("/reload", { deliverAs: "followUp" });

      return {
        content: [{
          type: "text",
          text: `工作流已保存至: ${jsonPath}\n并且已成功编译为 Pi 技能文件: ${skillMDPath}\nAgent 会话将在当前回合结束后自动执行 /reload 进行热更新。`
        }],
        details: {
          jsonPath,
          skillMDPath
        }
      };
    }
  });
}
