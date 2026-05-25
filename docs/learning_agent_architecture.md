# 🎓 基于 Pi Agent 内核的辅助学习 Agent 架构设计

本设计基于交互式问答（Grill-me）的共识结果，为您量身定制了一套**从前端到内核底层**的辅助学习 Agent 架构方案。

---

## 🏗️ 整体系统架构 (Mermaid)

```mermaid
graph TD
    subgraph Frontend [前端 WebUI (Vite + React + React Flow)]
        UI[React Chat & Dashboard] <--> |WebSocket / API| Server[Node.js Server]
        Canvas[Dify-style 画板] <--> |可视化编辑| FlowJSON[workflow.json]
        UI --> |展示| Dashboard[学习进度看板]
        UI --> |展示| QuizModal[交互式测验弹窗]
    end

    subgraph Backend [统一 Node.js 后端服务]
        Server <--> |直接API调用| Session[AgentSession API]
        Server --> |编译 JSON 为 Markdown| Compiler[Workflow Compiler]
        Compiler --> |写出| SkillMD[SKILL.md]
        Session <--> |加载扩展| Ext[study-agent-extension.ts]
        Session <--> |运行工具| Tools[ask_quiz / read_workflow / write_workflow]
    end

    subgraph Filesystem [本地存储 & 工作区]
        Session <--> |序列化会话| JSONL[Session .jsonl 文件]
        SkillMD -.-> |热重载读取| Session
        Tools <---> |读取/写入| FlowJSON
        Tools <---> |执行测试/校验| Workspace[本地代码目录]
    end

    Client <---> Server
```

---

## 📋 模块职责划分

### 1. 前端 (Vite + React + React Flow)
* **Chat Interface**：标准的流式对话界面。
* **Dashboard Widget**：显示经验值、等级以及知识点树的仪表盘。
* **React Flow 画板**：类似 Dify 的可视化流程图画板。用户可以直观地拖拽添加节点（如：LLM 提问节点、Bash 命令节点、API 请求节点），配置连线关系，并自动将数据格式化为 `workflow.json` 发送给后端。

### 2. 后端 (Node.js Server)
* **会话与 RPC 核心**：实例化 Pi 内核的 `AgentSession` 进行底层驱动。
* **编译引擎 (Workflow Compiler)**：当 `workflow.json` 被用户在前端编辑，或被 Agent 修改后，后端将其编译转化为 Pi 内核原生的 Markdown 格式 `SKILL.md`（包含元数据 YAML 和步骤指令段）。
* **热重载控制器**：编译完成后，通过发送内置的重载指令，动态刷新 Pi 的运行时，使新技能即时生效。

### 3. Pi 内核与扩展
* **自我进化工具 (Meta-Tools)**：Agent 配备 `read_workflow` 和 `write_workflow` 工具，允许 Agent 直接读写 `workflow.json`，实现“Agent 自主修改自己的技能结构”。
* **教学管理**：使用苏格拉底系统提示词约束，并利用 `trigger_quiz` 触发测验。

---

## 💻 核心代码与协议设计

### 1. 工作流 JSON 格式设计 (`workflow.json`)
```json
{
  "id": "fetch-and-summarize-news",
  "name": "新闻抓取与总结",
  "description": "抓取科技新闻并自动整理为学习卡片",
  "nodes": [
    { "id": "node-1", "type": "bash", "data": { "command": "curl -s https://news.ycombinator.com/" } },
    { "id": "node-2", "type": "llm", "data": { "prompt": "从中筛选出5条与AI相关的最热新闻" } },
    { "id": "node-3", "type": "write_file", "data": { "path": "./study-cards/ai-news.md" } }
  ],
  "edges": [
    { "source": "node-1", "target": "node-2" },
    { "source": "node-2", "target": "node-3" }
  ]
}
```

### 2. 后端 JSON 编译为 SKILL.md 逻辑 (`compiler.ts`)
```typescript
import fs from "fs-extra";

export async function compileWorkflowToSkill(jsonPath: string, outputPath: string) {
  const workflow = await fs.readJson(jsonPath);
  
  // 生成 SKILL.md 的 Frontmatter 描述段
  let markdown = `---\n`;
  markdown += `name: ${workflow.id}\n`;
  markdown += `description: ${workflow.description}\n`;
  markdown += `---\n\n`;
  
  markdown += `# ${workflow.name} 运行手册\n\n`;
  markdown += `当你执行此技能时，必须按顺序严格执行以下步骤：\n\n`;
  
  workflow.nodes.forEach((node: any, idx: number) => {
    markdown += `### 步骤 ${idx + 1}: ${node.type} 节点\n`;
    if (node.type === "bash") {
      markdown += `使用 bash 工具执行以下命令：\`${node.data.command}\`\n\n`;
    } else if (node.type === "llm") {
      markdown += `分析上一步 of 输出，并执行此 prompt："${node.data.prompt}"\n\n`;
    } else if (node.type === "write_file") {
      markdown += `将结果用 write_file 写入到此路径：\`${node.data.path}\`\n\n`;
    }
  });

  await fs.writeFile(outputPath, markdown, "utf-8");
}
```

### 3. Agent 的自我修改与热重载工具
```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  // 注册让 Agent 修改自身技能结构的工具
  pi.registerTool({
    name: "write_workflow",
    label: "修改技能工作流",
    description: "写入或修改一个技能的可视化工作流 JSON",
    parameters: Type.Object({
      skillId: Type.String(),
      workflowData: Type.String({ description: "JSON 格式的工作流节点与边定义" }),
    }),
    async execute(toolCallId, params, onUpdate, ctx) {
      const filePath = `./skills/${params.skillId}/workflow.json`;
      await fs.outputJson(filePath, JSON.parse(params.workflowData), { spaces: 2 });
      
      // 触发后端编译
      const skillMDPath = `./.pi/agent/skills/${params.skillId}/SKILL.md`;
      await compileWorkflowToSkill(filePath, skillMDPath);
      
      // 重要：通过发送 followUp 消息让内核执行 `/reload-runtime` 重载
      pi.sendUserMessage("/reload-runtime", { deliverAs: "followUp" });

      return {
        content: [{ type: "text", text: `工作流已保存并成功编译为 SKILL.md。将在下一轮对话自动重载生效。` }],
        details: {}
      };
    }
  });
}
```

---

## 🗺️ 开发路线图 (Roadmap)

1. **Phase 1: 环境搭建**
   * 初始化 Vite + React (画板前端) 与 Node.js Express (通信与编译后端) 的 monorepo 工程。
2. **Phase 2: 内核对接**
   * 编写 `AgentSession`，建立 WebSocket 通信流，实现聊天界面的实时渲染与思考展示。
3. **Phase 3: 基础辅助学习扩展**
   * 实现苏格拉底教学提示词追加，以及 `trigger_quiz` 弹窗测验闭环。
4. **Phase 4: 可视化画板研发**
   * 引入 `React Flow`。设计 Dify-style 节点编辑画板，打通 `JSON <-> 画板` 渲染。
5. **Phase 5: 技能编译与热重载**
   * 实现后端编译模块（JSON 转 Markdown SKILL.md）。
   * 结合 `write_workflow` 工具与 `/reload-runtime` 命令，达成“Agent 帮我做个新能力 -> 编译热重载 -> 即可在对话中使用”的终极闭环！
