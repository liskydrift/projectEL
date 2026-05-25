# 🎨 projectEL WebUI 设计与方向规划白皮书

本白皮书旨在分析 `projectEL` 当前的 WebUI 设计实现，明确其视觉风格与布局逻辑，并归纳 **【设计与后端架构决议】** 达成一致后的各大扩展模块设计决策。

---

## 🗺️ 1. 核心视觉风格：苹果风玻璃悬浮 (Apple-Style Glassmorphism)

根据最新对齐决策，系统由原有的硬边角高对比度 Neo-Brutalist 风格全面重构为**轻量悬浮、毛玻璃磨砂（Glassmorphism）、大圆角、流光弥散背景的 Apple Fluent 体验**，且同时兼容 **深色玻璃模式** 与 **亮色玻璃模式**。

### 1.1 双主题玻璃参数规范
系统底层引入基于 CSS 变量的主题管理，通过在 HTML 根节点切换 `data-theme="dark"` 或 `data-theme="light"` 达成全局平滑切换：

| CSS 变量键名 | 🌑 深色玻璃模式 (Dark Glassmorphism) | ☀️ 亮色玻璃模式 (Light Glassmorphism) |
| :--- | :--- | :--- |
| `--bg-color` | 深空钛灰 (`#08080c`) | 冰川白雾 (`#f2f4f8`) |
| `--panel-bg` | 半透明炭黑 (`rgba(22, 22, 28, 0.5)`) | 半透明牛奶白 (`rgba(255, 255, 255, 0.45)`) |
| `--panel-border` | 极细透光白 (`1px solid rgba(255,255,255,0.08)`) | 极细透光灰 (`1px solid rgba(0,0,0,0.06)`) |
| `--panel-border-active`| 高亮白光边 (`1px solid rgba(255,255,255,0.22)`) | 灰黑压边 (`1px solid rgba(0,0,0,0.16)`) |
| `--text-main` | 极地白 (`#f8fafc`) | 曜石黑 (`#0f172a`) |
| `--text-muted` | 灰蓝 (`#94a3b8`) | 板岩灰 (`#475569`) |
| `--primary` | 极光紫 (`#6366f1`) | 皇家靛蓝 (`#4f46e5`) |
| `--secondary` | 冰晶蓝 (`#06b6d4`) | 苍穹蓝 (`#0284c7`) |
| `--accent` | 珊瑚粉 (`#ec4899`) | 蔓越莓红 (`#db2777`) |
| `--glass-blur` | `blur(20px) saturate(190%)` | `blur(20px) saturate(190%)` |
| `--glass-shadow` | 漫反射深邃投影 `0 12px 40px rgba(0,0,0,0.4)` | 优雅微投影 `0 12px 40px rgba(31,38,135,0.06)` |

### 1.2 背景弥散流光 (Mesh Gradients)
为了提供 Apple 般自然灵动的生命力，背景层不再采用普通的纯色或格线，而是引入了**后台流动的弥散渐变球（Mesh Gradients）**：
* 在 Body 中使用两个/三个高斯模糊（`filter: blur(80px)`）的彩色半透明圆形 DIV。
* 配以温和的缓动帧动画（`animation: floatCircle 20s infinite alternate`），使背景呈现呼吸般的彩色流光溢彩，折射在毛玻璃卡片上极具品质感。

### 1.3 几何与交互微反馈 (Geometry & Spring Transitions)
* **圆润几何 (Soft Contours)**:
  - 窗口/卡片容器：统一使用大圆角 `--border-radius-card: 20px`。
  - 输入框与按钮：统一使用中圆角 `--border-radius-control: 12px`。
* **阻尼弹簧过渡 (Spring Dynamics)**:
  - 全局过渡使用仿 Apple 的弹性曲线：`transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)`。
* **悬浮交互微反馈**:
  - 卡片在 Hover 时不再是生硬的硬位移，而是轻微平滑上移 `translateY(-4px)`，同时大阴影渲染变得更柔和扩散。
  - 按钮在 Hover 时产生轻微的背光发色与缩放 `scale(1.02)`，点击（Active）时伴随物理回弹缩放 `scale(0.97)`。

---

## 🎯 2. 已确认的 WebUI 核心卡片设计

### 2.1 💬 Socrates 聊天卡片 (ChatCard) —— 体验升级
* **外观质感**:
  - 全透明卡片，应用 `--glass-blur` 与 `--panel-bg`。聊天气泡采用不对称大圆角设计（如用户气泡：左上/右上/左下 `16px`，右下角 `4px` 尖角；AI 气泡反之），气泡背景带有淡淡的防尘雾面发色。
* **Markdown 高级渲染**:
  - 使用 `react-markdown` + `remark-gfm` 渲染优雅的标题、列表、多维表格与引用。
  - 代码块应用 `react-syntax-highlighter`，使用精美的暗色主题高亮，并在代码块右上角浮动展现 `[Copy]` 苹果风半透明磨砂按钮。
* **输入框与指令联想 Popover**:
  - 输入框为胶囊形设计，键入 `/` 时在上方唤出悬浮联想框。
  - 联想框支持模糊匹配搜索已编译的 Skill 和内核指令，支持用键盘 `↑` / `↓` 切换与 `Enter` 选择，带有微微的弹簧弹出动画。
* **多会话侧栏**:
  - 聊天卡片左侧自带一个可收缩（Collapsible）的会话侧栏，显示最近聊天会话列表，切换时具有平滑的横向拉伸过渡效果。

### 2.2 ⚙️ Skill Canvas Map (技能画布卡片) —— 视觉重塑
* **卡片重构**:
  - React Flow 画布卡片同样应用毛玻璃面板。
  - Canvas Node 节点由粗黑边框改为磨砂发光边框，圆角升级为 `14px`。
  - `BASH`、`LLM`、`WRITE_FILE` 节点边框不再是生硬高饱和色，而改用半透明的霓虹发光（`box-shadow: 0 0 15px rgba(var(--accent-rgb), 0.2)`）。
  - 属性配置面板从底部弹出改为右侧平滑侧滑出的半透明磨砂抽屉（Settings Drawer）。

### 2.3 📚 3D 知识图谱卡片 (KnowledgeGraphCard) —— 炫酷粒子关系网
* **3D 粒子力导向图**:
  - 采用 **3D Canvas / d3-force** 渲染三维关系网。
  - 每个知识点呈现为一个发光的 3D 粒子小球，小球大小反映笔记字节量，粒子之间的双链关系连线带有流动光效。
  - 节点颜色随置信度 $C(t)$ 的衰减程度，在深色主题下由高亮的极光紫（Immortal / Confidence 1.0）渐变为消隐的暗灰色（Decay < 0.15）。
* **笔记侧滑抽屉**:
  - 点击 3D 粒子节点，页面右侧平滑滑出精美的 Markdown 笔记详情，支持直接在抽屉内修改 YAML 的生命周期并即时重载。

### 2.4 🏆 系统控制中心与游戏化看板 (DashboardCard) —— 游戏化常驻卡片
* **XP 进度条**: 磨砂白描边条框，内部使用柔和渐变填充，升级时伴随 Confetti 喷洒。
* **归档审批区**: 嵌入“待归档审阅”卡片列表，列出每周 `wiki-lint` 筛选出的低频衰减文件，支持 Web 端一键更改 `Immortal` 永久保留或确认归档。
* **QQ Bot (NapCat) 监控器**: 面板展示心跳时延波形图，支持配置 WebSocket 绑定和自动 Quiz 推送。

---

## 💻 3. 后端支持架构与文件变更规范

为适配上述 WebUI 苹果风交互新特性，后端需要进行如下文件的改造与新建：

### 3.1 现有后端文件改造

#### 📄 [server.ts](file:///c:/Users/lisky/Desktop/projectEL/backend/src/server.ts) (网关服务)
* **多会话支持**:
  - 重构全局单会话实例化逻辑，变更为内存管理器模式 `Record<string, AgentSession>`。
  - 监听 Socket.io 连接参数，支持客户端传递 `sessionId` 加入对应通信房间，实现消息数据隔离投递。
  - 挂载新增的会话 API（新建 `/api/sessions/create`、删除 `/api/sessions/delete`、切换 `/api/sessions/switch`）。
* **接口路由汇聚**:
  - 引入并挂载 `wiki-manager.ts` 和 `qq-adapter.ts` 模块暴露的 HTTP 接口路由。

#### 📄 [study-agent-extension.ts](file:///c:/Users/lisky/Desktop/projectEL/backend/src/study-agent-extension.ts) (Pi 内核扩展)
* **自定义测试工具注册**:
  - 注册 `ask_quiz` 或 `trigger_quiz` 工具，允许 Socrates Agent 在发现需要进行学习测验时，向前端 Socket 发送测验触发事件。
* **数据拦截拦截器**:
  - 增加拦截逻辑，在答题结束时，更新用户的错题库与 Gamification 经验统计。

### 3.2 建议新增的后端模块

#### 📄 `backend/src/wiki-manager.ts` (Wiki 管理与图谱服务)
* **3D 图谱数据计算 API** (`/api/wiki/graph`):
  - 递归扫描 `wiki_core/` 目录中的 markdown 概念文件，提取 YAML Frontmatter 置信度、文件大小。
  - 正则扫描笔记内 `[[双链]]` 引用，计算出拓扑节点 (Nodes) 与连线 (Links) 数据，以规范格式返回前端。
* **待归档审阅 (Veto) 与生命周期修改 API** (`/api/wiki/veto`):
  - 解析 `inbox/archive_review.md` 为 JSON 返回。
  - 响应前端锁死修改，物理读写对应 MD Frontmatter 修改为 `lifecycle: immortal`；或执行物理归档至 `archive/` 并降级相关双链。

#### 📄 `backend/src/qq-adapter.ts` (OneBot QQ 机器人适配器)
* **连接与心跳健康监视**:
  - 通过 WebSocket Client 连接 NapCat QQ 框架，向前端同步连接握手与时延数据。
* **双向答题交互逻辑**:
  - 监控绑定的 QQ 群聊消息，拦截并处理用户的选择题快捷回复（如回复字母 "A/B/C/D"），判定并写回错题库。
  - 实现基于 Cron 的定时器，在预设学习时段通过 QQ 推送 Quiz 题目。

---

## 🛠️ 4. 开发实施计划与迁移方案

### 阶段 1: 基础设计系统与全局变量迁移 (CSS Migration)
* **步骤 1**: 在 `frontend/src/index.css` 中重构 `:root`，定义双主题变量，并添加背景弥散流光球（Mesh Gradient Elements）及其呼吸动画。
* **步骤 2**: 重构 `.glass-panel` 等全局 CSS 类，移除 Neo-Brutalist 硬阴影和 `0px` 边角，写入圆角 `20px`、`backdrop-filter` 以及 Apple 风格阴影和弹簧过渡。

### 阶段 2: 升级 Socrates 聊天控制台 (Chat Upgrade)
* 安装 `react-markdown`，`remark-gfm` 与 `react-syntax-highlighter` 依赖。
* 编写 Markdown 消息渲染组件与代码复制模块。
* 升级后端 `server.ts` 以支持多会话 Session 数据隔离与历史会话切换 API。

### 阶段 3: 新增控制中心与 3D 知识图谱
* 实现 `DashboardCard.tsx`（XP 看板、QQ 设置、错题归档），建立 `qq-adapter.ts` 建立 OneBot 监听。
* 使用 `react-force-graph-3d` 或 `d3-force-3d` 完成 `KnowledgeGraphCard.tsx` 的 3D 粒子网渲染，新增 `wiki-manager.ts` 后端图谱解析及一键归档 API。
