# projectEL 全面开发计划与架构建议

## 项目现状 (V0.1)

### 已实现功能
- Monorepo 脚手架：npm workspaces（frontend / backend / pi-sdk）
- Pi Agent 集成：AgentSession 创建、WebSocket 流式通信、模型配置
- 聊天界面：基本 ChatCard、流式消息渲染、图片上传、Socket.io 通信
- 工作流画板：React Flow 画布、3 种节点类型（bash / llm / write_file）、保存编译为 SKILL.md
- 知识库核心引擎：指数衰减置信度模型、SM-2 间隔重复算法、归档系统
- 15 个 REST API 端点、前端 CRUD UI、Socket.io 实时同步
- 设置面板：多供应商 API 密钥配置、模型选择
- 多列工作区：拖拽卡片布局、列大小调整
- 识图扩展：Qwen-VL 子智能体、静默注入
- 工作流编译器：JSON → SKILL.md（拓扑排序）

### 待实现（根据 docs/）
| 文档 | 未实现内容 |
|------|-----------|
| webui.md | Glassmorphism 视觉重构、Markdown 渲染、会话侧栏、命令联想、智能体预设工厂、知识图谱、QQ Bot、仪表盘 |
| learning_agent_architecture.md | trigger_quiz 测验工具、XP/等级仪表盘 |
| knowledge_base_architecture_v2.md | 核心引擎已实现，缺 2D 图谱可视化 |

### 架构痛点
| 问题 | 影响 |
|------|------|
| App.tsx 500+ 行单体组件 | 不可维护，所有状态耦合 |
| 单 AgentSession | 无法支持多任务/多智能体 |
| Neo-Brutalist CSS | 难以扩展，代码风格不统一 |
| 纯文本聊天 | 无 Markdown，无代码高亮 |
| 无状态管理 | 纯 useState 传递过深 |
| 无测试 | 回归风险高 |

---

## Phase 1: 架构重构与基础设施升级

### 1.1 状态管理解耦 — App.tsx → Context + Hooks

创建 3 个 Context，将 App.tsx 中的状态按职责拆分：

**ChatContext** (`frontend/src/contexts/ChatContext.tsx`)
- 状态：messages[], inputText, isStreaming, activeModel, thinkingLevel, selectedImages[], sessionId
- actions：sendMessage, abort, clearSession, uploadImage, removeImage
- 副作用：Socket.io 连接管理、事件监听、幂等 ID 去重

**WorkspaceContext** (`frontend/src/contexts/WorkspaceContext.tsx`)
- 状态：activeCards[], cardLayout[], columnWidths
- actions：toggleCard, updateLayout, resizeColumn

**CanvasContext** (`frontend/src/contexts/CanvasContext.tsx`)
- 状态：nodes[], edges[], selectedNode
- actions：onNodesChange, onEdgesChange, onConnect, updateNodeData, saveAndCompile

重构后 App.tsx 缩减为：
```tsx
export default function App() {
  return (
    <ChatProvider>
      <WorkspaceProvider>
        <CanvasProvider>
          <div>...布局...</div>
        </CanvasProvider>
      </WorkspaceProvider>
    </ChatProvider>
  );
}
```

### 1.2 多会话后端支持

修改 `backend/src/server.ts`：

```
// 当前（单会话）
const { session } = await createAgentSession({...});

// 改为（多会话管理器）
const sessions = new Map<string, AgentSession>();
function getOrCreateSession(sessionId: string): AgentSession { ... }
```

- Socket.io 连接时客户端传递 `sessionId`，加入独立房间
- `pi-event` 按房间广播，不交叉
- 新增路由：
  - `GET /api/sessions` — 列出所有会话
  - `POST /api/sessions/create` — 新建会话
  - `POST /api/sessions/switch` — 切换活跃会话
  - `DELETE /api/sessions/:id` — 删除会话

### 1.3 智能体预设系统

新建 `backend/src/agent-presets.ts`：

```typescript
interface AgentPreset {
  id: string;
  name: string;
  description: string;
  modelConfig: { provider: string; modelId: string; thinkingLevel: string };
  systemPrompt: string;
  temperature: number;
  linkedSkills: string[];   // skills 目录下的技能 ID
  contextDocs: string[];    // wiki_core 中的文档路径
}
```

- 文件存储：`skills/agent-presets.json`
- REST 路由：`GET /api/agents`、`POST /api/agents`、`PUT /api/agents/:id`、`DELETE /api/agents/:id`
- 后端扩展 `createAgentSession` 支持接收 preset 参数

### 1.4 系统指令注入机制 — 让后端 Agent 识别预设

Pi SDK 提供了 4 个事件入口，用于向 Agent 注入系统指令和上下文。不同入口影响不同的对象层级：

```
用户发送消息
    │
    ▼
session.prompt(text)
    │
    ├─ ① `input` 事件 ──────────── action: "transform" → 修改用户消息文本
    │     (当前 Qwen-VL 在此处注入图片描述)
    │
    ├─ ② `before_agent_start` ──── return { systemPrompt } → 覆盖 LLM 的 System Prompt
    │     (在此处注入苏格拉底预设、角色设定、行为规则)
    │     ↓
    │     this.agent.state.systemPrompt = result.systemPrompt
    │
    ├─ ③ `context` 事件 ────────── return { messages } → 修改发往 LLM 的 messages[]
    │
    ├─ ④ LLM 调用 ──────────────── Agent 看到最终 systemPrompt + messages
    │
    └─ ⑤ tool_execution_start/end ─ Agent 调用注册的工具
```

**四种入口对比**：

| 入口 | 影响范围 | 持久性 | 适合场景 |
|------|---------|--------|---------|
| ① `input` | 单次 User Message | 仅本次 | 注入文档上下文、图片描述、知识库引用 |
| ② `before_agent_start` | 单次 System Prompt | 每轮重置，可覆盖 | **角色设定、行为规则、工具使用指南**（最常用） |
| ③ `context` | 发往 LLM 的全部消息 | 仅本次 | 高级场景：插入系统消息、重排消息顺序 |
| ④ `registerTool` 工具 + 拦截器 | 持久 | 整个 session 生命周期 | 固定行为绑定（如 write_workflow） |

**推荐实现方式** —— 在 `before_agent_start` 中注入 preset 的 systemPrompt：

```typescript
// study-agent-extension.ts
pi.on("before_agent_start", async (event, ctx) => {
  // event.systemPrompt — Pi 内置的 system prompt（含工具定义、文件结构等）
  // event.prompt — 用户本次输入文本

  // 从 preset 配置读取 systemPrompt（在创建 session 时已绑定到扩展上下文）
  const preset = getPresetForSession(ctx.cwd);
  if (!preset?.systemPrompt) return;

  return {
    // 将 preset 的 system prompt 放在 Pi 内置 prompt 之前
    // 这样 Agent 先读到角色设定，再读到工具定义
    systemPrompt: `${preset.systemPrompt}\n\n${event.systemPrompt}`,
  };
});
```

**`input` vs `before_agent_start` 的决策规则**：

```
要注入的内容属于：
├─ 告诉 Agent "如何思考/你是谁" → before_agent_start
│  例：苏格拉底教学法、代码审查规范、翻译风格指南
│
├─ 告诉 Agent "回答什么" → input transform
│  例：知识库文档、图片描述、错误日志
│
└─ 两者都要 → 同时使用两个事件
    before_agent_start 设角色，input 注入上下文
```

**多会话场景下的绑定流程**：

```
前端请求新建会话 (POST /api/sessions/create { presetId: "socrates" })
  │
  ▼
后端 createSessionWithPreset("socrates")
  │
  ├─ ① 查找 preset 配置（systemPrompt, model, skills, docs）
  │
  ├─ ② createAgentSession({ model, resourceLoader, ... })
  │
  ├─ ③ 为当前 session 注册特有拦截器：
  │     pi.on("before_agent_start", () => {
  │       return { systemPrompt: preset.systemPrompt + event.systemPrompt }
  │     })
  │     pi.on("input", () => {
  │       if 有 contextDocs → transform 注入知识库内容
  │     })
  │
  ├─ ④ sessions.set(sessionId, { session, presetId, createdAt })
  │
  └─ ⑤ Socket.io 返回 sessionId + preset 信息给前端
```

---

## Phase 2: 视觉重构 — Glassmorphism

对应 webui.md Phase 1。

### 2.1 CSS 变量体系

重写 `frontend/src/index.css`，定义双主题：

```css
:root[data-theme="dark"] {
  --bg-color: #08080c;
  --panel-bg: rgba(22, 22, 28, 0.5);
  --panel-border: 1px solid rgba(255,255,255,0.08);
  --panel-border-active: 1px solid rgba(255,255,255,0.22);
  --text-main: #f8fafc;
  --text-muted: #94a3b8;
  --primary: #6366f1;
  --secondary: #06b6d4;
  --accent: #ec4899;
  --glass-blur: blur(20px) saturate(190%);
  --glass-shadow: 0 12px 40px rgba(0,0,0,0.4);
  --border-radius-card: 20px;
  --border-radius-control: 12px;
}

:root[data-theme="light"] {
  --bg-color: #f2f4f8;
  --panel-bg: rgba(255, 255, 255, 0.45);
  --panel-text: #0f172a;
  /* ... */
}
```

### 2.2 弥散流光背景

body 中添加 2-3 个高斯模糊 DIV：
```html
<div class="mesh-gradient mesh-aurora" />  <!-- 静谧极光 -->
<div class="mesh-gradient mesh-sunset" />   <!-- 日落余晖 -->
<div class="mesh-gradient mesh-glacier" />  <!-- 冰川深海 -->
```

```css
.mesh-gradient {
  position: fixed;
  width: 600px; height: 600px;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.4;
  animation: floatCircle 20s infinite alternate;
}
```

4 种渐变主题预设，通过切换 CSS 变量实现。

### 2.3 组件迁移清单

按顺序逐个迁移：

| 组件 | 改动 |
|------|------|
| `.glass-panel` | 圆角 20px，`backdrop-filter: var(--glass-blur)`，移除粗边框和硬阴影 |
| `.btn-premium` | 圆角 12px，玻璃背景，hover scale(1.02) |
| `.input-premium` | 圆角 12px，毛玻璃内背景 |
| ChatCard | 消息气泡不对称圆角设计 |
| CanvasCard | 节点圆角 14px，霓虹发光阴影 |
| KnowledgeCard | 卡片磨砂化 |
| Sidebar | 图标高亮改为发光圆点 |
| SlideDrawer | 磨砂背板 + 弹性动画 |

全局动画曲线：`transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)`

---

## Phase 3: 聊天控制台升级

### 3.1 Markdown 渲染 & 代码块

```json
// frontend/package.json 新增依赖
"react-markdown": "^9.0.0",
"remark-gfm": "^4.0.0",
"react-syntax-highlighter": "^15.5.0"
```

创建 `frontend/src/components/CodeBlock.tsx`：
- 磨砂头部：显示语言 badge + 复制按钮（点击后 2 秒显示 "Copied"）
- 语法高亮：`react-syntax-highlighter` 配合深色主题
- 横向滚动支持长代码行

ChatCard 中消息内容从 `<pre>{m.text}</pre>` 改为：
```tsx
<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  components={{ code: CodeBlock }}
>
  {m.text}
</ReactMarkdown>
```

### 3.2 输入框增强

- `<textarea>` 替代 `<input type="text">`
- 自适应高度：`onInput` 中 `this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px'`
- Enter 发送，Shift+Enter 换行
- Token 计数器：用 `@anthropic-ai/token-counter` 或简单估算（~4 chars/token）

### 3.3 Quick Prompt Chips

浮动在输入框上方的预设提问芯片：
```tsx
const PROMPT_CHIPS = [
  "剖析此概念原理",
  "请从第一性原理分析",
  "帮我总结要点",
  "生成复习卡片"
];
```

点击后自动填充到输入框。

### 3.4 `/` 命令弹出框

- 监听输入 `/` 时弹出 Popover
- 数据源：内置命令 + skills 列表 + prompt 模板
- 模糊匹配（fuse.js 或 indexOf）
- 键盘 ↑/↓ 切换，Enter 确认
- 弹簧弹出动画

### 3.5 消息悬浮操作栏

hover 消息气泡时显示：
- 所有消息：复制按钮
- 用户消息：编辑按钮（将消息转为输入框，支持分叉重新生成）
- AI 消息：重新生成按钮
- 流式时：停止按钮

### 3.6 会话侧栏 & 文件夹分组

ChatCard 左侧添加可收缩面板：
- 新建文件夹（"编程类"、"历史学"、"数学思考"）
- 拖拽会话到文件夹
- 模糊搜索会话标题
- 双击修改标题，右键删除

### 3.7 Socrates 参数卡片

新建 `frontend/src/components/SocratesSettingsCard.tsx`：

**标签页 1: Session Tuning**
- 绑定智能体下拉选择
- Temperature 滑块（0.0 - 2.0）
- Top P 滑块
- Max Tokens 滑块
- 安全过滤等级

**标签页 2: Agent Preset Factory**
- 左侧：预设列表（+ 新建 / 重命名 / 删除）
- 右侧：模型选择、System Prompt 编辑器（大文本区）、预设模板库下拉
- 技能绑定：skills 目录 checkbox 列表
- 文档绑定：wiki_core 路径输入框

---

## Phase 4: 知识库增强

### 4.1 2D 知识图谱

新建 `frontend/src/components/KnowledgeCard/KnowledgeGraphCard.tsx`：

- 渲染引擎：`d3-force` 或原生 Canvas 2D
- 数据获取：`GET /api/wiki/graph`（扫描 wiki_core/，提取 Frontmatter + [[双链]]）
- 视觉映射：
  - 粒子半径 = log(文件大小)
  - 粒子颜色 = 置信度渐变（>=0.7 极光紫，>=0.3 青蓝，<0.3 暗灰）
  - 连线 = [[双链]] 关系，半透明流光动画
- 交互：
  - 单击对焦居中
  - 拖拽力导向布局
  - 右侧滑出详情抽屉（显示 Markdown，支持编辑 lifecycle）

### 4.2 归档审查 Veto Modal

在归档确认时弹出：
- 引用源文件列表：哪些文件包含指向此笔记的 `[[双链]]`
- Diff 预览：`[[数据结构]]` → `**数据结构[已归档]**`
- 一键确认执行归档 + 链接重写
- 一键否决（设为 immortal）

### 4.3 仪表盘卡片

新建 `frontend/src/components/DashboardCard.tsx`：

- 统计卡片：总概念数（常青 / 标准 / 临时）、已归档数
- 健康度：置信度均值、归档占比
- 低频列表：置信度 < 0.15 的条目
- 快捷操作：设为 immortal、确认归档

后端新增 `GET /api/wiki/stats` 返回聚合统计数据。

### 4.4 wiki-manager 后端模块

新建 `backend/src/wiki-manager.ts`：

- `GET /api/wiki/graph` — 递归扫描 wiki_core/，返回拓扑节点 + 连线
- `GET /api/wiki/veto` — 解析 inbox/archive_review.md 返回待审列表
- `POST /api/wiki/veto/override` — 将卡片设为 immortal
- `POST /api/wiki/veto/execute` — 执行归档 + 链接重写

---

## Phase 5: 学习闭环与苏格拉底教学

### 5.1 trigger_quiz 工具

在 `study-agent-extension.ts` 中注册 Pi Agent 工具：

```typescript
pi.registerTool({
  name: "trigger_quiz",
  parameters: Type.Object({
    question: Type.String(),
    options: Type.Array(Type.String()),
    correctAnswer: Type.String(),
    relatedCard: Type.Optional(Type.String())
  }),
  async execute(toolCallId, params) {
    pi.sendEvent("quiz:trigger", params);
    // 等待前端作答
    // 收到 answer 后判定正误，更新置信度
  }
});
```

前端监听 `quiz:trigger` 事件，弹出 QuizModal。

### 5.2 用户进度系统

后端维护用户统计数据：
- 答题正确/错误数
- 知识卡片创建数
- SM-2 复习完成数
- XP 计算公式：Σ(答题正确 × 10 + 创建卡片 × 5 + 复习 × 2)

仪表盘显示：
- XP 进度条（当前等级 / 下一级所需）
- 等级徽章（青铜 → 白银 → 黄金 → 钻石）
- 本周学习统计

---

## Phase 6: 子代理 (Sub-Agent) 架构

### 背景

Pi Agent SDK **不原生支持子代理**（README 明确说明 `"No sub-agents"`），但提供了扩展机制来实现：

| 机制 | 说明 |
|------|------|
| `pi.exec()` | 在扩展中派生新的 AgentSession 实例 |
| `subagent/` 扩展命名空间 | 官方示例：`registerTool` + `exec` 生成子代理 |
| `completeSimple()` | 直接调用 LLM（当前 Qwen-VL 识图已在使用） |
| `pi.on("input")` 拦截器 | 劫持输入，派生子任务，变换后继续 |

当前 `study-agent-extension.ts` 中的 Qwen-VL 识图已是最基础的子代理模式——在拦截器中调用独立 LLM，将结果注入主会话。本阶段将其正式化并扩展到通用子代理编排。

### 6.1 子代理抽象层

新建 `backend/src/subagent/index.ts`，定义统一接口：

```typescript
export type SubAgentMode = 
  | "chain"      // 串行：子代理 A → B → C
  | "parallel"   // 并行：子代理同时执行，结果聚合
  | "supervisor" // 监督：主代理分配任务，收集子代理结果并做最终决策
  | "router";    // 路由：根据输入分发到不同专用子代理

export interface SubAgentDef {
  id: string;
  name: string;
  description: string;
  modelConfig?: { provider: string; modelId: string };
  systemPrompt: string;
  tools?: string[];          // 允许子代理使用的工具列表
  outputSchema?: Type.Object; // 结构化输出约束
}

export interface SubAgentTask {
  agentId: string;
  input: string;
  context?: { images?: any[]; files?: any[] };
  parentSessionId?: string;
}
```

三种子代理执行引擎：

- **`execAgent()`** — 通过 `pi.exec()` 派生完整 AgentSession，支持工具调用
- **`execLLM()`** — 轻量级，通过 `completeSimple()` 只调用 LLM（如当前 Qwen-VL）
- **`execPipeline()`** — 按 mode 编排多个子代理的依赖和执行顺序

### 6.2 子代理运行器

新建 `backend/src/subagent/runner.ts`，支持两种执行模式：

**轻量模式 (LLM only)** — 适用于纯文本处理：
```typescript
// 复用当前 Qwen-VL 模式：直接调用 completeSimple()
async function runLLMSubAgent(def: SubAgentDef, task: SubAgentTask): Promise<string> {
  const model = modelRegistry.find(...);
  const auth = await modelRegistry.getApiKeyAndHeaders(model);
  const result = await completeSimple(model, { messages: [/* system + user */] }, { apiKey: auth.apiKey });
  return extractText(result);
}
```

**完整模式 (Full Agent)** — 适用于需要工具调用的子代理：
```typescript
// createAgentSession 不直接接收 systemPrompt 参数
// 需要通过 before_agent_start 事件注入子代理的角色设定
async function runFullSubAgent(def: SubAgentDef, task: SubAgentTask): Promise<string> {
  const { session: subSession } = await createAgentSession({
    cwd: workspaceCwd,
    resourceLoader,
    authStorage,
    modelRegistry,
  });
  // 限制子代理可用工具
  subSession.setAvailableTools(def.tools || []);

  // 在扩展中监听 before_agent_start，为子代理注入其专属 systemPrompt
  subSession.on("before_agent_start", async (event) => {
    return { systemPrompt: `${def.systemPrompt}\n\n${event.systemPrompt}` };
  });
  
  const result = await subSession.prompt(task.input, { images: task.context?.images });
  await subSession.destroy();
  return result.content;
}
```

### 6.3 编排模式

**Chain 串行模式**：
```
用户输入 → SubAgent A(分析) → SubAgent B(总结) → SubAgent C(格式化) → 最终输出
```
每个子代理的输出自动作为下一个的输入上下文。

**Parallel 并行模式**：
```
用户输入 → 任务分割器
           ├── SubAgent A(角度1) ─┐
           ├── SubAgent B(角度2) ─┼─→ 结果聚合器 → 最终输出
           └── SubAgent C(角度3) ─┘
```
所有子代理同时运行，完成后由聚合器合并结果。

**Supervisor 监督模式**：
```
Supervisor Agent(分配任务)
  ├── SubAgent A → 报告给 Supervisor
  ├── SubAgent B → 报告给 Supervisor
  └── SubAgent C → 报告给 Supervisor
Supervisor Agent(综合决策 → 最终输出)
```
主 Agent 作为监督者，分配任务、审查结果、做出最终判断。

**Router 路由模式**：
```
输入 → 路由分类器
        ├── [编程问题] → CodeExpert Agent
        ├── [数学问题] → MathTutor Agent
        ├── [历史问题] → HistoryScholar Agent
        └── [通用问题] → Default Socrates Agent
```
根据输入内容自动分派到最合适的专用子代理。

### 6.4 现有 Qwen-VL 子代理重构

当前 `study-agent-extension.ts` 的识图逻辑是硬编码在 `pi.on("input")` 拦截器中的。将其改造为通用子代理框架：

```
当前：拦截器内直接调用 completeSimple()
重构后：
  pi.on("input") {
    → subagentRegistry.get("vision-qwen")
    → runLLMSubAgent(visionDef, { input, images })
    → 注入结果
  }
```

好处：
- 识图子代理配置化，可切换模型（Qwen / Gemini / GPT-4o）
- 拦截器与执行引擎解耦
- 可为其他用途（代码审查、知识提取等）注册新的子代理

### 6.5 前端子代理监控

在 ChatCard 中对子代理消息做专用渲染增强：

| 消息类型 | 显示 |
|---------|------|
| `customType: "subagent-start"` | "🔍 正在调用识图子代理..." + 脉冲动画 |
| `customType: "subagent-delta"` | 增量流式显示子代理中间结果 |
| `customType: "subagent-end"` | "✅ 子代理完成" + 耗时 |
| `subagent-error` | "❌ 子代理出错" + 错误信息 + 重试按钮 |

当前已经是这种模式，但增加：
- 耗时显示（从 start 到 end 的经过时间）
- 子代理名称和模型标签
- 展开/折叠中间结果

### 6.6 工作流画板中的子代理节点

在 React Flow 画板中新增 `subagent` 节点类型：

- **SubAgent 节点**：配置子代理定义（system prompt、模型、工具列表）
- **编排节点**：选择编排模式（chain / parallel / supervisor）
- **聚合节点**：多路结果合并逻辑

这允许用户在可视化画板中拖拽构建多 Agent 协作流程，而不只是简单的 bash → llm → write_file 流水线。

### 6.7 相关文件清单

| 文件 | 操作 |
|------|------|
| `backend/src/subagent/index.ts` | 新建 — 类型定义与注册表 |
| `backend/src/subagent/runner.ts` | 新建 — 执行引擎 (light + full) |
| `backend/src/subagent/pipeline.ts` | 新建 — chain/parallel/supervisor 编排 |
| `backend/src/study-agent-extension.ts` | 改造 — Qwen-VL 迁移到 subagent 框架 |
| `backend/src/subagent/agents/vision.ts` | 新建 — 识图子代理定义 |
| `backend/src/subagent/agents/code-review.ts` | 新建 — 代码审查子代理示例 |
| `backend/src/server.ts` | 改造 — 挂载 subagent 路由和注册表 |
| `frontend/src/components/SubAgentMonitor.tsx` | 新建 — 子代理执行状态可视化 |
| `frontend/src/components/ChatCard.tsx` | 改造 — 子代理消息专用渲染 |

## Phase 7: QQ Bot 集成 (已完成)

### 7.1 Phase 1 — WebSocket 桥接 + 基础消息回路

新建 `backend/src/qq-adapter.ts` (~850 行)：

- **QQWebSocketServer**: `noServer: true` 模式 WSS，通过 `httpServer.on('upgrade')` 路由共享 3000 端口，accessToken 校验
- **QQConnection**: WebSocket 封装，心跳超时检测 (60s)，API 调用 echo 匹配 + 3 次指数退避重试
- **OneBotMessageHandler**: 滑动窗口限流，@提及/关键词触发，命令路由 (`/quiz`, `/help`, `/stats`)
- **QQAIService**: Pi Agent 会话桥接，群上下文管理 (最近 20 条消息)，`/quiz` 命令处理
- **markdownToPlainText()**: Markdown → QQ 纯文本转换 (标题→emoji, 粗体→【】, 列表→数字 emoji)
- **chunkMessage()**: 段落边界感知的智能分段 (1500 字/段)
- **sanitizeInput()**: 控制字符过滤 + 8000 字截断
- **CQ 码解析**: `extractTextFromSegments()`, `extractImagesFromSegments()`

### 7.2 Phase 2 — LaTeX 公式渲染 + 内容路由

新建 `backend/src/qq-renderer.ts`：

- **FormulaRenderer**: Puppeteer 浏览器池 (最多 2 个并发页面, 60s 空闲超时, 100 次渲染后重启)
- 使用 `katex.renderToString()` 服务端渲染 LaTeX → HTML → Puppeteer 截图 → Base64 PNG
- **ContentRouter**: Track A (纯文本 ≤1500 字) / Track B (含公式 → 渲染为图片 + CQ 码)
- **detectLatexFormulas()**: `$$...$$` 和 `$...$` 模式检测

### 7.3 Phase 3 — 群聊知识提取

新建 `backend/src/qq-chat-refiner.ts`：

- **ChatRefiner**: 15 条消息阈值 + 5 分钟冷却触发知识提取
- 发送最近 ~30 条消息给 AI，解析 JSON 概念列表
- 自动调用 `kbService.createCard()` 创建 wiki 卡片，添加 `[[wikilinks]]`

### 7.4 Phase 4 — 测验系统

新建 `backend/src/qq-quiz-service.ts`：

- AI 根据置信度最低的知识卡片生成选择题
- SM-2 算法联动：答对提升置信度，答错降低
- XP 评分 (S: +100, A: +75, B: +50, C: +25, D: +10)
- 答题日志持久化到 `inbox/checkin_logs.jsonl`

### 7.5 Phase 5 — 运营周报 + 前端监控面板

新建 `backend/src/qq-report-generator.ts` + 修改 `frontend/src/components/QQBotCard.tsx`：

- **ReportGenerator**: 读取 wiki_core/concepts/ + checkin_logs.jsonl，生成高频话题、薄弱知识、排行榜、打卡趋势
- **QQBotCard**: 5 个可折叠面板 (连接状态 / 答题统计+趋势图 / 活跃排行 / 薄弱知识点 / 热门话题标签云)
- 30s 自动轮询 + 手动刷新
- 侧边栏新增 QQ Bot 图标入口

### 7.6 Phase 6 — 生产加固

- **结构化日志器** (`backend/src/qq-logger.ts`): JSONL 格式, 日轮转 (`inbox/qq-logs/qq-YYYY-MM-DD.jsonl`), 5s 缓冲区刷新, 进程退出钩子
- **API 调用重试**: 指数退避 (1s/2s/4s), 30s 超时
- **Puppeteer 浏览器池**: 并发限制 + 空闲回收 + 渲染计数重启

### 7.7 WebUI 服务启停按钮

修改 `backend/src/qq-adapter.ts` + `backend/src/server.ts` + `frontend/src/components/QQBotCard.tsx`：

- **QQWebSocketServer.close()**: 移除 `upgrade` 监听器 + 关闭所有 WebSocket + 关闭 WSS
- **stopQQAdapter()**: 调用 `close()` 并将 `qqServer = null`
- `POST /api/qq/start`: 初始化适配器 + `child_process.spawn` 通过 PowerShell `Start-Process -Verb runAs` 拉起 NapCat (管理员提权) + 写 `enabled: true`
- `POST /api/qq/stop`: 关闭适配器 + `taskkill /PID /T /F` 终止进程树 + 写 `enabled: false`
- **QQBotCard**: 绿色 ▶ 启动按钮 / 红色 ■ 停止按钮,"正在等待 QQ 登录..." 提示横幅
- 状态端点新增 `running: boolean` 字段

### 7.8 相关文件清单

| 文件 | 操作 | 行数 |
|------|------|------|
| `backend/src/qq-adapter.ts` | 新建 | ~850 行 |
| `backend/src/qq-renderer.ts` | 新建 | ~200 行 |
| `backend/src/qq-chat-refiner.ts` | 新建 | ~120 行 |
| `backend/src/qq-quiz-service.ts` | 新建 | ~250 行 |
| `backend/src/qq-report-generator.ts` | 新建 | ~180 行 |
| `backend/src/qq-logger.ts` | 新建 | ~140 行 |
| `backend/src/server.ts` | 修改 | +6 个 QQ 端点 (含 start/stop) |
| `frontend/src/components/QQBotCard.tsx` | 新建 | ~400 行 |
| `frontend/src/components/Sidebar.tsx` | 修改 | +1 QQ Bot 入口 |
| `frontend/src/App.tsx` | 修改 | +1 卡片路由 |
| `qq-bot-config.json` | 新建 | 运行时配置 |
| `skills/agent-presets.json` | 修改 | +1 qq-tutor 预设 |

---

## Phase 8: 工作流画板增强

### 8.1 新增节点类型

| 类型 | 说明 |
|------|------|
| `api_request` | HTTP API 调用节点，配置 method/url/headers/body |
| `condition` | 条件分支节点，配置 if/else 逻辑 |
| `loop` | 循环节点，配置迭代逻辑 |
| `subagent` | 子代理节点，绑定 subagent 定义，支持编排模式选择 |

compiler.ts 增加对应类型的 Markdown 编译逻辑。

### 8.2 read_workflow 工具

当前只有 `write_workflow`，补充 `read_workflow` 让 Agent 能读取自身技能结构：

```typescript
pi.registerTool({
  name: "read_workflow",
  parameters: Type.Object({
    skillId: Type.String()
  }),
  async execute(toolCallId, params) {
    const data = await fs.readJson(`skills/${params.skillId}/workflow.json`);
    return JSON.stringify(data, null, 2);
  }
});
```

### 8.3 Agent 辅助节点编排

CanvasCard 中每个节点配置抽屉底部增加 "AI 协写" 按钮：
- 点击后弹出微型输入浮窗
- 用户输入自然语言需求
- 调用 Pi Agent 生成节点配置
- 自动填充到配置抽屉并更新 React Flow 状态

---

## Phase 9: 质量与工程化

### 9.1 测试

```json
// frontend/package.json
"vitest": "^1.6.0",
"@testing-library/react": "^14.0.0"
```

| 测试范围 | 内容 |
|---------|------|
| 知识库服务 | 置信度计算、SM-2 算法、归档逻辑、Frontmatter 解析 |
| ChatContext | 消息流式更新、幂等 ID 去重 |
| KnowledgeCard | CRUD 流程、搜索过滤 |
| ArchiveReview | Veto 勾选/取消、执行归档 |
| CanvasCard | 节点选择/编辑、保存编译 |

```bash
npx vitest run    # CI
npx vitest        # watch mode
```

### 9.2 Playwright E2E

- 配置 `playwright.config.ts`
- 测试场景：
  - 完整聊天流程：输入 → 发送 → 流式渲染 → 完成
  - 知识库 CRUD 流程
  - 工作流保存编译
  - 主题切换

---

## 执行顺序图

```
Phase 1 ──────────────────────────────────┐
         ├─ 1.1 Context 拆分              │ (必须先做，解耦后才能安全扩展)
         ├─ 1.2 多会话后端                 │
         └─ 1.3 Agent Preset             │
                                          │
Phase 2 ───── CSS Glassmorphism ──────────┤ (可与 Phase 3 并行)
                                          │
Phase 3 ───── 聊天控制台升级 ──────────────┤ (可与 Phase 2 并行)
                                          │
Phase 4 ───── 知识库增强 ─────────────────┤
  ├─ 4.1 2D 知识图谱                      │
  ├─ 4.2 Veto Modal                      │ (独立开发)
  ├─ 4.3 DashboardCard                   │
  └─ 4.4 wiki-manager 后端                │
                                          │
Phase 5 ───── 学习闭环 ───────────────────┤ (依赖 Phase 1, 3)
                                          │
Phase 6 ───── 子代理架构 ─────────────────┤ (依赖 Phase 1)
  ├─ 6.1-6.2 抽象层 + 运行器              │
  ├─ 6.3-6.4 编排模式 + Qwen 重构          │ (独立开发)
  └─ 6.5-6.6 前端监控 + 画板节点           │
                                          │
Phase 7 ───── QQ Bot ────────────────────┤ (独立开发)
                                          │
Phase 8 ───── 画板增强 ───────────────────┤ (依赖 Phase 1, 6.6)
                                          │
Phase 9 ───── 测试工程化 ─────────────────┘ (贯穿始终)
```

## 关键原则

1. **每 Phase 一个独立 commit**，保持 git 历史清晰
2. **Phase 1 必须先做**，否则后续扩展风险高
3. **不引入额外状态管理库**（React Context + useReducer 足够）
4. **保持卡片式架构**，不引入 React Router（URL hash 同步可后续加）
5. **文件系统持久化**，不引入数据库
6. **逐步迁移**，每次只改一个组件，验证后再继续
