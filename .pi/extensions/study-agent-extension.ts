import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import fs from "fs-extra";
import path from "path";
import { compileWorkflowToSkill } from "./compiler.js";

export default function (pi: ExtensionAPI) {
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
      // 目标存储 workflow.json 的位置 (在工作区 skills 目录)
      const targetDir = path.resolve(ctx.cwd, "skills", params.skillId);
      const jsonPath = path.join(targetDir, "workflow.json");

      // 1. 确保目录存在并写入 workflow.json
      await fs.ensureDir(targetDir);
      const data = JSON.parse(params.workflowData);
      await fs.outputJson(jsonPath, data, { spaces: 2 });

      // 2. 编译为 SKILL.md 并保存至工作区本地的 .pi/skills/ 目录下
      const skillMDDir = path.resolve(ctx.cwd, ".pi", "skills", params.skillId);
      const skillMDPath = path.join(skillMDDir, "SKILL.md");
      await compileWorkflowToSkill(jsonPath, skillMDPath);

      // 3. 重要：通过发送 followUp 消息让内核执行 `/reload` 重新加载新技能
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
