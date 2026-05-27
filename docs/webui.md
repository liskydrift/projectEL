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
* 在 Body 中使用两个/三个高斯模糊（`filter: blur(80px)`）的彩色半透明圆形 DIV，映射底层的主题基色。
* 配以温和的缓动帧动画（`animation: floatCircle 20s infinite alternate`），使背景呈现呼吸般的彩色流光溢彩，折射在毛玻璃卡片上极具品质感。
* **渐变主题预设包 (Mesh Theme Presets) [新]**:
  - 在全局配置抽屉中提供 3-4 种静态色调渐变包供用户手动切换：
    - *静谧极光* (Default): 青绿 (`#00f2fe`) 与 深靛紫 (`#6366f1`) 混合流动。
    - *日落余晖*: 珊瑚橙 (`#f97316`) 与 蔓越莓红 (`#db2777`) 混合流动。
    - *冰川深海*: 冰晶蓝 (`#06b6d4`) 与 深海蓝 (`#1d4ed8`) 混合流动。
    - *苍穹迷雾*: 极地白雾与银灰色柔和漂移（亮色模式专享）。
  - 切换色调包时，通过修改 CSS 变量平滑过渡背景球的背景色，产生无缝的气氛变换。

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
* **整体布局风格与参数卡片**:
  - **多卡片拖拽布局**: 系统由“聊天卡片”与“参数控制卡片”两部分解耦构成。
  - **Socrates 聊天卡片 (ChatCard)**: 位于工作区中心，左侧自带可收缩的会话历史侧栏，中间为聊天工作流与底部输入区。
  - **Socrates 参数卡片 (SocratesSettingsCard) [新]**: 作为一个可独立唤出、自由拖拽、拖入分栏的 Workspace 卡片。
* **外观质感**:
  - 应用 `--glass-blur` 与 `--panel-bg` 毛玻璃质感。聊天气泡采用不对称大圆角设计（用户气泡：右上/左上/左下 `16px`，右下角 `4px` 尖角，淡紫色；AI 气泡：左上/右上/右下 `16px`，左下角 `4px` 尖角，防尘雾白发色）。
* **Markdown 高级渲染与代码盒**:
  - 完美渲染标题、GFM 列表与多维表格。
  - 自定义 `<CodeBlock />` 组件：带半透明磨砂头部，包含语言 Badge 与 2 秒延时微状态的“[Copy]”复制按钮。
* **输入框与指令联想 Popover**:
  - 输入框为胶囊形设计，键入 `/` 时在上方唤出悬浮联想框。
  - 联想框支持模糊匹配搜索已编译的 Skill、内核指令、提示词模板和扩展，支持用键盘 `↑` / `↓` 切换与 `Enter` 选择，带有微微的弹簧弹出动画。
* **自适应输入工具栏 (Input Toolbar)**:
  - **多行文本框**: 支持高度随字数自适应增长，使用 `Shift + Enter` 换行，单按 `Enter` 触发发送。
  - **Token 实时统计器**: 实时渲染当前输入文本的 Token 消耗与字符数，优化开发者 API 成本感知。
  - **快捷提问引导片 (Quick Prompt Chips)**: 在输入框上方浮动展示若干卡片式预设苏格拉底提问（如“剖析此概念原理”、“请从第一性原理分析”），点击直接填充至输入框。
  - **多模态附件**: 支持将图片和文件直接拖拽拖入输入区，或通过剪贴板直接 `Ctrl+V` 粘贴上传。
* **消息悬浮动作栏 (Hover Action Bar)**:
  - 鼠标悬停于消息气泡时，在气泡边缘淡入浮动工具栏：
    - 对所有消息：提供“复制内容”按钮。
    - 对用户消息：提供“编辑提问”按钮，点击将消息转为输入框，允许编辑并从该节点“分叉重新生成”（Steer/Fork）。
    - 对 AI 消息：提供“重新生成”（Regenerate）按钮。
    - 生成过程中：全局或气泡上显示“停止响应”（Stop）以中止生成流。
* **多会话侧栏与文件夹分组 (Session Folder History)**:
  - **文件夹树状分组**: 支持用户在侧栏内自定义创建分类文件夹（例如“编程类”、“历史学”、“数学思考”）。
  - **拖拽管理**: 用户可以通过鼠标拖拽直接将某个聊天会话拖入对应分类文件夹中。
  - **会话检索**: 侧栏顶部集成实时会话关键字搜索框，可对历史标题与内容进行模糊匹配。
  - **会话操作**: 支持双击快速修改会话标题，以及一键删除会话。

### 2.1.1 ⚙️ Socrates 参数卡片 (SocratesSettingsCard) —— 双标签页控制中心 [已确认]
* **标签页 1：当前会话微调 (Session Tuning)**:
  - **智能体绑定选择**: 提供下拉菜单快速选择/绑定当前会话的智能体预设（如“默认苏格拉底”、“编程专家”）。选择后，会话将自动继承该智能体的模型、Prompt、技能与文档关联。
  - **温度调节器 (Temperature)**: `0.0` 至 `2.0` 的滑块调节，支持微调当前会话的随机性。
  - **采样限制 (Top P / Top K)**: 滑块调节，限制词汇采样范围。
  - **最大输出限制 (Max Output Tokens)**: 动态配置当前会话的回复 Token 上限。
  - **安全过滤等级滑块 (Safety Settings)**: 提供针对仇恨言论、色情、危险内容的四挡安全阈值独立配置。
* **标签页 2：智能体预设工厂 (Agent Preset Factory) [新]**:
  - **智能体列表管理**: 左侧提供扁平列表显示所有已定义的智能体预设，支持快速创建（`+`）、重命名与删除。
  - **模型配置器**: 为选中的智能体分配默认供应商与 Model ID（如 `Anthropic/Claude-3.5-Sonnet`）。
  - **核心系统提示词 (System Instructions)**: 
    - 大文本编辑区，支持为该智能体书写核心 Prompt。
    - **预设模板库**: 顶部下拉单可一键加载官方预设模版（如“代码审查官”、“概念引导师”）。
  - **技能绑定 (Linked Skills Checkbox)**: 呈现当前 `skills/` 目录下所有已保存的低代码画板技能列表，允许通过勾选复选框，直接为该智能体分配/挂载对应的执行工具集。
  - **参考上下文文档 (Context Documents Binder)**: 提供输入框，支持为该智能体配置参考笔记文件路径（指向 `wiki_core/`），在智能体启动时自动作为背景知识参考注入上下文。

### 2.2 ⚙️ Skill Canvas Map (技能画布卡片) —— 智能体编排画板 [已确认]
* **卡片视觉重构**:
  - **苹果风磨砂面板**: React Flow 画布卡片容器全面应用 `--glass-blur` 玻璃效果与极细半透明发光边框。
  - **发光节点 (Canvas Node)**: 节点圆角升级为 `14px`，去除 Neo-Brutalist 粗黑框。根据节点类型应用柔和的半透明霓虹发光阴影（如：`BASH` 为青色，`LLM` 为紫色，`WRITE_FILE` 为粉色）。
  - **右侧侧滑配置抽屉 (Settings Drawer)**: 双击节点或点击配置按钮时，右侧平滑滑出半透明磨砂的配置抽屉，用以编辑节点参数、 Prompt 与执行脚本。
* **智能体节点级指令编排 (Agent-Assisted Node Orchestration) [新]**:
  - **Agent 辅助入口**: 在配置抽屉内，针对每个输入项（如 LLM 的 Prompt 框，BASH 的命令行输入框）增加“AI 协写/优化”按钮。
  - **指令生成流**: 点击后弹出一个微型输入浮窗，用户可输入自然语言需求（例如：“帮我写一段总结科技新闻并按表格排版的提示词”），由 Socrates 智能体（或 Pi 内核底层的辅助 Agent）自动在该节点级别生成对应的指令/脚本，并自动填充至抽屉输入框中。
  - **双向数据同步**: 智能体生成填充后的参数立即触发 React Flow 的 Nodes 状态更新，并自动保存到 `workflow.json` 中，保持可视化画布与内核配置的强实时同步。

### 2.3 📚 2D 知识图谱卡片 (KnowledgeGraphCard) —— 炫酷粒子关系网
* **2D 粒子力导向关系网**:
  - **引擎与绘制**: 基于 HTML5 Canvas 2D 或 d3-force 渲染轻量、流畅的二维粒子网络，保持高刷新率以符合 Apple Fluent 动效标准。
  - **视觉映射**: 
    - 粒子小球：发光的 2D 圆形粒子，其半径大小线性映射概念文件的字节大小；小球颜色根据置信度 $C(t)$ 指数衰减程度动态渐变（高置信度展现为极光紫，低置信度衰减至消隐的暗灰色）。
    - 关联线条：半透明的动态连线表示 [[双向链接]] 关联，带有微弱流光的波动动画。
* **极简交互与侧滑详情抽屉 (Slide Drawer)**:
  - **点击选中**: 单击任一粒子小球，图谱平滑对焦并居中至选中节点。
  - **右侧抽屉详情**: 选中节点后，页面右侧向左拉伸滑出半透明磨砂抽屉面板（Slide Drawer），完整显示该概念文件的 Markdown 详情，支持直接编辑 Frontmatter（如将 `lifecycle` 修改为 `immortal` 并实时重载图谱数据）。
  - **交互减负**: 隐藏不必要的力学常数配置（如排斥力、连线距离等滑块）与冗余的关系过滤逻辑，确保用户专注于概念间的直接层级关联。

### 2.4 💻 系统控制中心与 Wiki 仪表盘 (DashboardCard) —— 状态监控与 Wiki 审查面板 [已确认]
* **Wiki 置信度健康与双轨数据统计 (Wiki Analytics)**:
  - **容量与计数**: 展现系统当前总概念数（常青、标准、临时）及已归档条目的占比。
  - **总览健康度**: 以简练的统计数据卡片形式展示当前知识库的整体置信度均值与已归档比例。
* **低频文件归档审查 Veto 控制区**:
  - **待审清单**: 
    - 嵌入 `wiki-lint` 定时扫描生成的低频/衰减概念列表（置信度 $C(t) < 0.15$ 的待归档笔记）。
    - **极简数值标示**: 列表项摒弃图表和进度条，采用纯文本数字进行极简呈现（如：`当前置信度: 0.12 | 衰减模式: 标准 (半衰期约180天)`），以确保界面清晰直观，聚焦于内容本身。
  - **双链关联重写影响预览 (Veto Modal) [新]**: 
    - 当用户点击“确认归档”时，唤出一个半透明磨砂遮罩的预览浮窗。
    - 浮窗中以列表形式清晰列出所有包含指向该归档笔记 `[[双链]]` 的引用源文件。
    - 提供重写前后的 Diff 对比预览（例如：`[[数据结构]]` ➔ `**数据结构[已归档]**`），以便用户直观评估其对关联知识上下文的影响。
    - 用户一键点击“确认执行重写并归档”后，后端将完成双链的物理重写与文件的物理移位，并在前端同步更新图谱关系网。
  - **快捷审批操作**: 支持一键修改该概念 Frontmatter 为 `lifecycle: immortal`（Veto 否决归档，永久保留）；或确认允许物理归档并降级相关链接。
* **QQ Bot (NapCat OneBotv11) 监控面板 (QQBotCard)** — ✅ 已实现:
  - **服务启停控制**: 卡片页头提供绿色 `▶ 启动` / 红色 `■ 停止` 按钮，一键拉起/关闭 NapCat QQ 服务。启动时通过 PowerShell 管理员提权执行 `launcher.bat`，二维码显示在 NapCat 自带的命令行窗口中，用户扫码后自动连接。
  - **等待状态提示**: 适配器运行但尚无 QQ 账号连接时，显示 “正在等待 QQ 登录...请在弹出的 NapCat 命令行窗口中扫码” 绿色提示横幅。
  - **连接状态面板**: 实时显示各 QQ 账号 (selfId + 昵称) 的在线/离线状态，在线账号旁显示绿色圆点。
  - **答题统计面板**: 展示知识库卡片总数、近期答题次数，内嵌每日答题趋势迷你柱状图 (TrendMiniChart)。
  - **活跃排行榜**: Top 5 用户 XP 排行 (🥇🥈🥉 奖牌图标)，显示总 XP 与正确率百分比。
  - **薄弱知识点面板**: AI 分析置信度最低的知识卡片列表，显示卡片标题 + 当前置信度。
  - **热门话题面板**: 高频讨论标签云，以标签 pill 形式展示 (话题名 + 出现次数)。
  - **自动刷新**: 30 秒轮询 + 手动刷新按钮，底部状态栏显示更新时间。
* **视觉风格**: 保持 Neo-Brutalist 暗黑主题 (黑底 + 2px 硬边框 + 硬阴影)，与 WebUI 现有风格统一。未来可升级为 Glassmorphism。

### 2.5 🧭 全局导航侧栏 (Sidebar) —— 卡片控制中枢 [已确认]
* **卡片导航项映射**:
  - 提供五大核心视图的开关切换项（包括：MessageSquare 💬 聊天卡片、Layers ⚙️ 编排画布卡片、BookOpen 📚 知识库卡片、Bot 🤖 QQ Bot 监控卡片、Settings ⚙️ 全局配置）。
  - 点击开关在全局 Workspace 容器中添加/隐藏该卡片，支持用户通过拖拽分割线自定义四栏/多栏交互布局，实现定制化工作流排布。
  - 选中卡片后，侧栏中对应的图标以高对比度高亮发色（如 Lime 绿 / Indigo 靛蓝）显示，并在边缘浮动呈现微细的活跃圆点。
* **全局凭证入口**: 底部常驻 Settings 齿轮图标，点击触发全局模型供应商 API 秘钥与 Base URL 的滑出抽屉面板（Settings Drawer）。

### 2.6 📸 多模态图片上传与无感子智能体分析 (Multi-modal Image Upload) [已确认]
* **图片预览加载动效 (Image Loader)**:
  - 用户上传图片后，输入栏上方即时生成缩略图预览。
  - 缩略图上层覆盖半透明毛玻璃蒙版，展现脉冲呼吸发光的加载动画 (Spinner / Pulse Glow)，表示后台 Qwen-VL 识图子智能体正在提取图像细节。
* **无感知后台注入 (Silent Prompt Injection)**:
  - 图像文本描述提取完成后，蒙版与加载动画自动隐退，恢复清晰的缩略图预览。
  - 提取的结构化图像描述将在后台静默拼装并注入发送包的 Prompt 顶部，前端保持完全洁净，不展示任何冗余的分析文本日志，以提供类似 ChatGPT / Google AI Studio 的无缝图像多模态体验。

---

## 💻 3. 后端支持架构与文件变更规范

为适配上述 WebUI 苹果风交互新特性，后端需要进行如下文件的改造与新建：

### 3.1 现有后端文件改造

#### 📄 [server.ts](file:///c:/Users/lisky/Desktop/projectEL/backend/src/server.ts) (网关服务)
* **多会话与多智能体预设支持 (Sessions & Selectable Agents) [新]**:
  - **内存管理器重构**: 重构全局单会话实例化逻辑，变更为内存管理器模式 `Record<string, AgentSession>`。
  - **Socket.io 隔离**: 监听 Socket.io 连接参数，支持客户端传递 `sessionId` 加入对应通信房间，实现消息数据隔离投递。
  - **会话 API 挂载**: 
    - `GET /api/sessions`: 列出所有会话，包含关联的智能体 ID (`agentId`)。
    - `POST /api/sessions/create`: 新建会话，参数中支持绑定特定的智能体 ID。
    - `POST /api/sessions/switch`: 切换当前活跃会话，自动重置前端面板上的智能体配置绑定。
    - `DELETE /api/sessions/:id`: 物理删除会话并释放内核资源。
  - **智能体预设 API (Agent Preset APIs) [新]**:
    - `GET /api/agents`: 获取所有已配置的智能体预设（包含预设 ID、名称、绑定模型、核心系统提示词、绑定的 skills 技能集、参考文档路径以及温度等参数）。
    - `POST /api/agents`: 创建新的智能体预设。
    - `PUT /api/agents/:id`: 编辑更新指定智能体预设的参数。
    - `DELETE /api/agents/:id`: 删除某个智能体预设。
  - **指令模糊检索 API**:
    - `GET /api/commands`: 检索并归纳用于前端输入的命令提示符（Builtin / Skill / Template / Extension）。
* **接口路由汇聚**:
  - 引入并挂载 `wiki-manager.ts` 和 `qq-adapter.ts` 模块暴露的 HTTP 接口路由。
  - **QQ 服务启停端点** (已实现):
    - `POST /api/qq/start` — 初始化 QQ 适配器 + `child_process.spawn` 通过 PowerShell `Start-Process -Verb runAs` 拉起 NapCat (管理员提权) + 写 `enabled: true`
    - `POST /api/qq/stop` — 关闭适配器 + `taskkill /PID /T /F` 终止进程树 + 写 `enabled: false`

#### 📄 [study-agent-extension.ts](file:///c:/Users/lisky/Desktop/projectEL/backend/src/study-agent-extension.ts) (Pi 内核扩展)
* **自定义测试工具注册**:
  - 注册 `ask_quiz` 或 `trigger_quiz` 工具，允许 Socrates Agent 在发现需要进行学习测验时，向前端 Socket 发送测验触发事件。
* **数据拦截拦截器**:
  - 增加拦截逻辑，在答题结束时，更新用户的错题库与 Gamification 经验统计。

### 3.2 建议新增的后端模块

#### 📄 `backend/src/wiki-manager.ts` (Wiki 管理与图谱服务)
* **2D 图谱数据计算 API** (`/api/wiki/graph`):
  - 递归扫描 `wiki_core/` 目录中的 markdown 概念文件，提取 YAML Frontmatter 置信度、文件大小。
  - 正则扫描笔记内 `[[双链]]` 引用，计算出拓扑节点 (Nodes) 与连线 (Links) 数据，以规范格式返回前端。
* **待归档审阅 (Veto) 与生命周期修改 API** (`/api/wiki/veto`):
  - 解析 `inbox/archive_review.md` 为 JSON 返回。
  - 响应前端锁死修改，物理读写对应 MD Frontmatter 修改为 `lifecycle: immortal`；或执行物理归档至 `archive/` 并降级相关双链。

#### 📄 `backend/src/qq-adapter.ts` (OneBot QQ 机器人适配器) — ✅ 已实现

核心适配器 (~850 行)，实现以下模块：

* **QQWebSocketServer**: `noServer: true` 模式 WebSocket 服务端，通过 `httpServer.on('upgrade')` 路由共享 3000 端口。支持 accessToken 校验、动态启停 (`initQQAdapter` / `stopQQAdapter`)。
* **QQConnection**: WebSocket 封装层，含心跳超时检测 (60s)、API 调用 echo 匹配 + 3 次指数退避重试 (1s/2s/4s)、`sendApiCall()` 通用方法。
* **OneBotMessageHandler**: 滑动窗口限流器、@提及/关键词触发检测、命令路由 (`/quiz`, `/help`, `/stats`)、测验答题路由。
* **QQAIService**: Pi Agent 会话桥接，群上下文管理 (最近 20 条消息), ChatRefiner 知识提取触发, QuizService 答题判定, ContentRouter 内容格式化。
* **markdownToPlainText()**: Markdown → QQ 纯文本转换 (标题→emoji, 粗体→【】, 列表→数字 emoji, 链接→文本+URL)。
* **chunkMessage()**: 段落边界感知的智能分段 (1500 字/段)。
* **sanitizeInput()**: 控制字符过滤 + 8000 字截断。

配套模块：

| 文件 | 功能 |
|------|------|
| `backend/src/qq-renderer.ts` | Puppeteer 浏览器池 + KaTeX LaTeX 公式渲染为图片 |
| `backend/src/qq-chat-refiner.ts` | 群聊知识提取 → `kbService.createCard()` + `[[wikilinks]]` |
| `backend/src/qq-quiz-service.ts` | AI 出题测验 (SM-2 联动 + XP 评分 + JSONL 日志) |
| `backend/src/qq-report-generator.ts` | 运营周报 (热门话题/薄弱知识/排行榜/打卡趋势) |
| `backend/src/qq-logger.ts` | 结构化 JSONL 日志 (日轮转 + 5s 缓冲区刷新) |

---

## 🛠️ 4. 开发实施计划与迁移方案

### 阶段 1: 基础设计系统与全局变量迁移 (CSS Migration)
* **前端与样式任务**:
  - 重构 `frontend/src/index.css`，定义双主题变量与大圆角（卡片 `20px`，控件 `12px`），移除 Neo-Brutalist 硬阴影。
  - 在 Body 中加入高斯模糊弥散流光球 DIV，并在全局配置抽屉中对接 `静谧极光`、`日落余晖`、`冰川深海` 3-4 个静态色调渐变包的 CSS 变量切换过渡。
  - 引入全局阻尼弹簧动画与阻尼交互反馈。

### 阶段 2: 升级 Socrates 聊天控制台与多智能体预设 (Socrates Chat & Agents Presets)
* **前端 UI 任务 (Frontend Layer)**:
  - 安装 `react-markdown` 与 `remark-gfm` 依赖，重构 Socrates 聊天气泡文字输出区，编写代码高亮与右上角磨砂复制按钮组件 `<CodeBlock />`。
  - 在 `ChatCard` 头部添加可收缩的会话历史栏，支持文件夹树状分类、拖拽移动与模糊查询。
  - 编写自适应文本框、Token/字符实时统计条、快捷提问引导片（Quick Prompt Chips）。
  - 在输入框上游嵌入 `/` 指令联想 Popover（支持上下键滚动与无参指令一键发送）。
  - 重构 `SocratesSettingsCard` 调试卡片为**双标签页结构**：
    - 标签页 1：提供绑定智能体下拉单、温度/MaxTokens/Safety 调节滑块。
    - 标签页 2：提供智能体列表管理、核心 System Prompt 编写框与常用技能、文档绑定勾选框。
* **后端接口与数据任务 (Backend Layer)**:
  - 升级 `server.ts` 会话实例化，由单会话改造为多会话记录模式 `Record<string, AgentSession>`。
  - 实现 Socket.io 会话隔离（连接时传递并加入 `sessionId` 独立房间，前端使用 Refs 过滤跨会话事件防止数据交叉污染）。
  - 挂载会话控制 REST 路由（`GET /api/sessions`、`POST /api/sessions/create`、`POST /api/sessions/switch`、`DELETE /api/sessions/:id`）。
  - 挂载智能体预设 REST 路由（`GET /api/agents`、`POST /api/agents`、`PUT /api/agents/:id`、`DELETE /api/agents/:id`）以持久化预置件。
  - 实现指令模糊匹配接口 `/api/commands`。

### 阶段 3: 新增控制中心、QQ 监控器与 2D 知识图谱 (System Dashboard & 2D Topology Graph)
* **前端 UI 任务 (Frontend Layer)**:
  - 实现 `DashboardCard.tsx`（包含总览容量与健康度数据，QQ 开关设置与 Cron 表达式输入）。
  - 编写**低频笔记待审归档列表**：单条只展示简练置信度与衰减率文本，去除图表元素。
  - 编写**双链重写预览弹窗 (Veto Modal)**：显示引用该概念的所有双链源文件在重写前后的 Diff 对比。
  - 编写 `QQBotMonitorCard.tsx`：黑色底终端外观的活动日志组件，用以实时输出 Quiz 推送与答题结果。
  - 使用 `react-force-graph-2d` 完成 `KnowledgeGraphCard.tsx` 的极简交互 2D 粒子拓扑网络渲染，仅支持节点点击对焦和右侧 Markdown 侧滑详情抽屉。
* **后端接口与数据任务 (Backend Layer)**:
  - 建立 `qq-adapter.ts` 通过 WebSocket Client 连接 NapCat QQ 框架，获取连线时延与事件日志，并通过 Web Sockets 实时将 Quiz 推送事件与用户答题详情投递至前端监控终端.
  - 建立 `wiki-manager.ts` 计算 `/api/wiki/graph` 2D 图谱拓扑数据。
  - 实现归档审批接口 `/api/wiki/veto`，根据待审清单生成 JSON，支持物理修改 frontmatter Lifecycle 或物理移位归档并执行双链接重写逻辑。

