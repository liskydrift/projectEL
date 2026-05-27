import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createHttpServer } from 'http';
import type { Server as HTTPServer } from 'http';
import type { Server as IOServer } from 'socket.io';
import { randomUUID } from 'crypto';
import { getContentRouter } from './qq-renderer.js';
import { ChatRefiner } from './qq-chat-refiner.js';
import { QuizService } from './qq-quiz-service.js';
import type { KnowledgeBaseService } from './knowledge-base/knowledge-base-service.js';
import { getQQLogger } from './qq-logger.js';

const QQ_WS_PORT = 3001;

// ─── Types ───────────────────────────────────────────────────────────

interface QQBotConfig {
  enabled: boolean;
  wsPath: string;
  accessToken: string;
  dedicatedPresetId: string;
  maxGroupContextMessages: number;
  rateLimit: { maxMessages: number; windowSeconds: number };
  triggerKeywords: string[];
  quiz: {
    enabled: boolean;
    questionsPerRound: number;
    xpPerGrade: Record<string, number>;
  };
  rendering: {
    formulaImageWidth: number;
    maxMessageLength: number;
    messageChunkOverlap: number;
  };
  groupSync: {
    enabled: boolean;
    allowedGroupIds: number[];
  };
}

interface OneBotMessageSegment {
  type: string;
  data: Record<string, string>;
}

interface OneBotMessageEvent {
  time: number;
  self_id: number;
  post_type: 'message';
  message_type: 'group' | 'private';
  sub_type: string;
  message_id: number;
  group_id?: number;
  user_id: number;
  message: OneBotMessageSegment[] | string;
  raw_message: string;
  sender: {
    user_id: number;
    nickname: string;
    card?: string;
    role?: string;
  };
}

interface OneBotNoticeEvent {
  time: number;
  self_id: number;
  post_type: 'notice';
  notice_type: string;
  [key: string]: unknown;
}

interface OneBotRequestEvent {
  time: number;
  self_id: number;
  post_type: 'request';
  request_type: string;
  [key: string]: unknown;
}

interface OneBotMetaEvent {
  time: number;
  self_id: number;
  post_type: 'meta_event';
  meta_event_type: string;
  [key: string]: unknown;
}

type OneBotEvent = OneBotMessageEvent | OneBotNoticeEvent | OneBotRequestEvent | OneBotMetaEvent;

interface OneBotApiCall {
  action: string;
  params: Record<string, unknown>;
  echo?: string;
}

interface OneBotApiResponse {
  status: 'ok' | 'failed';
  retcode: number;
  data: unknown;
  echo?: string;
}

interface GroupContext {
  group_id: number;
  recentMessages: {
    user_id: number;
    nickname: string;
    text: string;
    timestamp: number;
  }[];
}

interface RateLimitEntry {
  timestamps: number[];
}

// ─── 输入安全处理 ────────────────────────────────────────────────────

function sanitizeInput(text: string): string {
  // 过滤控制字符和空字节
  let cleaned = text
    .replace(/\x00/g, '') // 空字节
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // 控制字符(保留 \n \t)
    .trim();

  // 截断过长消息（QQ 最多约 4500 字，预处理阶段限 8000）
  if (cleaned.length > 8000) {
    cleaned = cleaned.slice(0, 8000) + '...[截断]';
  }

  return cleaned;
}

function getFriendlyErrorMessage(err: any): string {
  const msg = String(err?.message || err || '').toLowerCase();
  
  if (msg.includes('api_key') || msg.includes('api key') || msg.includes('credential') || msg.includes('not configured') || msg.includes('no key')) {
    return '⚠️ 服务配置错误：未配置当前 AI 模型的 API Key。请管理员在后台控制面板配置有效凭证。';
  }
  if (msg.includes('fetch failed') || msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('timeout') || msg.includes('connect')) {
    return '⚠️ 网络连接失败：无法建立与 AI 服务商的连接，请检查网络或稍后重试。';
  }
  if (msg.includes('quota') || msg.includes('429') || msg.includes('rate limit') || msg.includes('limit exceeded')) {
    return '⚠️ 请求受限：AI 服务商配额已耗尽或触发频率限制，请稍后再试。';
  }
  
  const cleanMsg = String(err?.message || err || '未知错误').slice(0, 100);
  return `⚠️ AI 服务异常：${cleanMsg}`;
}

// ─── Markdown → QQ 纯文本转换器 ─────────────────────────────────────

const EMOJI_NUMBERS = [
  '1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟',
  '1️⃣1️⃣','1️⃣2️⃣','1️⃣3️⃣','1️⃣4️⃣','1️⃣5️⃣','1️⃣6️⃣','1️⃣7️⃣','1️⃣8️⃣','1️⃣9️⃣','2️⃣0️⃣',
  '2️⃣1️⃣','2️⃣2️⃣','2️⃣3️⃣','2️⃣4️⃣','2️⃣5️⃣',
];

export function markdownToPlainText(md: string): string {
  let text = md;

  // 代码块
  text = text.replace(/```[\s\S]*?```/g, (match) => {
    const inner = match.replace(/^```\w*\n?/, '').replace(/```$/, '');
    return `[代码]\n${inner}\n[/代码]`;
  });

  // 行内代码
  text = text.replace(/`([^`]+)`/g, '「$1」');

  // 粗体 **text**
  text = text.replace(/\*\*(.+?)\*\*/g, '【$1】');

  // 斜体 *text* 或 _text_
  text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '「$1」');
  text = text.replace(/_([^_\n]+)_/g, '「$1」');

  // 链接 [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

  // 标题 #  ##  ###
  text = text.replace(/^#### (.+)$/gm, '▪ $1');
  text = text.replace(/^### (.+)$/gm, '▹ $1');
  text = text.replace(/^## (.+)$/gm, '▸ $1');
  text = text.replace(/^# (.+)$/gm, '📌 $1');

  // 水平线
  text = text.replace(/^---$/gm, '——————————————————');

  // 无序列表 - item
  let itemIndex = 0;
  text = text.replace(/^- (.+)$/gm, () => {
    const emoji = EMOJI_NUMBERS[itemIndex % EMOJI_NUMBERS.length];
    itemIndex++;
    return `${emoji} $1`;
  });

  // 有序列表
  text = text.replace(/^\d+\. (.+)$/gm, (_match, content) => {
    const emoji = EMOJI_NUMBERS[itemIndex % EMOJI_NUMBERS.length];
    itemIndex++;
    return `${emoji} ${content}`;
  });

  // 引用
  text = text.replace(/^> (.+)$/gm, '┃ $1');

  // 清理多余空行
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

// ─── 消息分段 ────────────────────────────────────────────────────────

export function chunkMessage(
  text: string,
  maxLen: number = 1500,
  _overlap: number = 100,
): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  const paragraphs = text.split('\n');

  let current = '';
  for (const para of paragraphs) {
    if (current.length + para.length + 1 > maxLen && current.length > 0) {
      chunks.push(current.trimEnd());
      current = para;
    } else {
      current += (current ? '\n' : '') + para;
    }
  }
  if (current.trim()) {
    chunks.push(current.trimEnd());
  }

  // 如果某段仍然太长，强制按字符截断
  const result: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxLen) {
      result.push(chunk);
    } else {
      let i = 0;
      while (i < chunk.length) {
        result.push(chunk.slice(i, i + maxLen));
        i += maxLen;
      }
    }
  }

  return result;
}

// ─── CQ 码解析 ───────────────────────────────────────────────────────

function extractTextFromSegments(segments: OneBotMessageSegment[] | string): string {
  if (typeof segments === 'string') return segments;
  return segments
    .filter((s) => s.type === 'text')
    .map((s) => s.data.text || '')
    .join('');
}

function extractImagesFromSegments(segments: OneBotMessageSegment[] | string): string[] {
  if (typeof segments === 'string') return [];
  return segments
    .filter((s) => s.type === 'image')
    .map((s) => s.data.url || s.data.file || '')
    .filter(Boolean);
}

function isBotMentioned(text: string, selfId: number, keywords: string[], rawMessage?: string, segments?: OneBotMessageSegment[] | string): boolean {
  const lower = text.toLowerCase();
  // Check @mention by QQ number in raw_message (always contains CQ codes regardless of messagePostFormat)
  if (rawMessage && rawMessage.includes(`[CQ:at,qq=${selfId}]`)) return true;
  // Check @mention in message segments (at type segments are stripped by extractTextFromSegments)
  if (segments && Array.isArray(segments)) {
    for (const seg of segments) {
      if (seg.type === 'at' && seg.data?.qq === String(selfId)) return true;
    }
  }
  // Check trigger keywords
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) return true;
  }
  return false;
}

// ─── 连接管理器 ──────────────────────────────────────────────────────

class QQConnection {
  ws: WebSocket;
  selfId: number | null = null;
  nickname: string = '';
  connectedAt: number = Date.now();
  lastHeartbeat: number = Date.now();
  private pendingApiCalls: Map<string, {
    resolve: (value: OneBotApiResponse) => void;
    reject: (reason: Error) => void;
    timer: NodeJS.Timeout;
  }> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  onClose: (() => void) | null = null;
  onMessage: ((event: OneBotEvent) => void) | null = null;

  constructor(ws: WebSocket) {
    this.ws = ws;

    ws.on('message', (raw) => {
      this.lastHeartbeat = Date.now();
      try {
        const data = JSON.parse(raw.toString());
        // 区分 API 响应和事件推送
        if (data.echo !== undefined && data.status !== undefined) {
          this.handleApiResponse(data as OneBotApiResponse);
        } else {
          this.handleEvent(data as OneBotEvent);
        }
      } catch {
        // 忽略解析失败的消息
      }
    });

    ws.on('close', () => {
      this.cleanup();
      this.onClose?.();
    });

    ws.on('error', () => {
      this.cleanup();
    });

    // 心跳超时检测
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastHeartbeat > 60000) {
        // 60s 无心跳，主动断开
        ws.close();
      }
    }, 15000);
  }

  private handleEvent(event: OneBotEvent): void {
    // 记录 meta_event.lifecycle 中的 self_id
    if (event.post_type === 'meta_event' && event.meta_event_type === 'lifecycle') {
      this.selfId = event.self_id;
    }
    // 记录 heartbeat
    if (event.post_type === 'meta_event' && event.meta_event_type === 'heartbeat') {
      this.lastHeartbeat = Date.now();
      return;
    }
    this.onMessage?.(event);
  }

  private handleApiResponse(resp: OneBotApiResponse): void {
    if (!resp.echo) return;
    const pending = this.pendingApiCalls.get(resp.echo);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingApiCalls.delete(resp.echo);
      pending.resolve(resp);
    }
  }

  sendApiCall(action: string, params: Record<string, unknown>, retries = 3): Promise<OneBotApiResponse> {
    return new Promise((resolve, reject) => {
      const attempt = (remainingRetries: number) => {
        if (this.ws.readyState !== WebSocket.OPEN) {
          return reject(new Error('WebSocket not connected'));
        }

        const echo = randomUUID();
        const call: OneBotApiCall = { action, params, echo };

        const timer = setTimeout(() => {
          this.pendingApiCalls.delete(echo);
          if (remainingRetries > 0) {
            const delay = Math.pow(2, 3 - remainingRetries) * 1000;
            setTimeout(() => attempt(remainingRetries - 1), delay);
          } else {
            reject(new Error(`API call "${action}" timed out after retries`));
          }
        }, 30000);

        this.pendingApiCalls.set(echo, {
          resolve: (resp) => {
            clearTimeout(timer);
            resolve(resp);
          },
          reject: (err) => {
            clearTimeout(timer);
            if (remainingRetries > 0) {
              const delay = Math.pow(2, 3 - remainingRetries) * 1000;
              setTimeout(() => attempt(remainingRetries - 1), delay);
            } else {
              reject(err);
            }
          },
          timer,
        });

        try {
          this.ws.send(JSON.stringify(call));
        } catch (err) {
          clearTimeout(timer);
          this.pendingApiCalls.delete(echo);
          if (remainingRetries > 0) {
            const delay = Math.pow(2, 3 - remainingRetries) * 1000;
            setTimeout(() => attempt(remainingRetries - 1), delay);
          } else {
            reject(err);
          }
        }
      };

      attempt(retries);
    });
  }

  get isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  private cleanup(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    // 拒绝所有待处理的 API 调用
    for (const [echo, pending] of this.pendingApiCalls) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Connection closed'));
    }
    this.pendingApiCalls.clear();
    getQQLogger().info('connection', `Account ${this.selfId || 'unknown'} connection closed`);
  }
}

// ─── WebSocket 服务器 ────────────────────────────────────────────────

class QQWebSocketServer {
  private wss: WebSocketServer;
  private connections: Map<number, QQConnection> = new Map();
  private messageHandler: OneBotMessageHandler;
  private aiService: QQAIService;
  private config: QQBotConfig;
  private io: IOServer;
  private httpServer: HTTPServer;

  constructor(
    _httpServer: HTTPServer,
    getOrCreateSession: (sessionId: string, presetId?: string) => Promise<unknown>,
    io: IOServer,
    config: QQBotConfig,
    kbService: KnowledgeBaseService,
    workspaceCwd: string,
  ) {
    this.config = config;
    this.io = io;
    this.httpServer = _httpServer;
    this.messageHandler = new OneBotMessageHandler(config);
    this.aiService = new QQAIService(getOrCreateSession, io, config, kbService, workspaceCwd);

    // 创建独立的 HTTP 服务器，避免与主后端端口 3000 冲突
    this.httpServer = createHttpServer();
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.httpServer.listen(QQ_WS_PORT, () => {
      getQQLogger().info('server', `QQ WebSocket server listening on port ${QQ_WS_PORT}`);
    });

    this.wss.on('connection', (ws) => {
      const conn = new QQConnection(ws);

      conn.onClose = () => {
        if (conn.selfId !== null) {
          this.connections.delete(conn.selfId);
          getQQLogger().info('connection', `Account ${conn.selfId} disconnected`, { selfId: conn.selfId });
          // 清理对应的 AI 会话
          this.aiService.abortSession(conn.selfId);
        }
      };

      conn.onMessage = (event) => {
        if (event.post_type === 'meta_event' && event.meta_event_type === 'lifecycle') {
          const existing = this.connections.get(event.self_id);
          if (existing && existing !== conn) {
            // 旧连接还存在，关闭旧连接
            existing.ws.close();
          }
          this.connections.set(event.self_id, conn);
          getQQLogger().info('connection', `Account ${event.self_id} connected`, { selfId: event.self_id });
          return;
        }

        if (event.post_type === 'message') {
          const msgEvent = event as OneBotMessageEvent;
          // 忽略机器人自己发送的消息
          if (msgEvent.user_id === conn.selfId) return;

          if (msgEvent.message_type === 'group') {
            this.messageHandler.handleGroupMessage(msgEvent, conn, this.aiService);
          } else if (msgEvent.message_type === 'private') {
            this.messageHandler.handlePrivateMessage(msgEvent, conn, this.aiService);
          }
        }
      };
    });
  }

  getStatus(): {
    accounts: { selfId: number; nickname: string; connectedAt: number; online: boolean }[];
  } {
    const accounts = [];
    for (const [selfId, conn] of this.connections) {
      accounts.push({
        selfId,
        nickname: conn.nickname,
        connectedAt: conn.connectedAt,
        online: conn.ws.readyState === WebSocket.OPEN,
      });
    }
    return { accounts };
  }

  getConnection(selfId: number): QQConnection | undefined {
    return this.connections.get(selfId);
  }

  hasConnection(selfId: number): boolean {
    return this.connections.has(selfId);
  }

  close(): void {
    getQQLogger().info('server', 'QQWebSocketServer shutting down...');
    // 关闭所有活跃连接
    for (const [selfId, conn] of this.connections) {
      try {
        conn.ws.close();
      } catch {
        // 忽略关闭错误
      }
    }
    this.connections.clear();
    // 关闭 WebSocket 服务器
    this.wss.close();
    // 关闭独立 HTTP 服务器
    this.httpServer.close();
    getQQLogger().info('server', 'QQWebSocketServer closed');
  }
}

// ─── 限流器 ──────────────────────────────────────────────────────────

class OneBotMessageHandler {
  private config: QQBotConfig;
  private rateLimitMap: Map<string, RateLimitEntry> = new Map();

  constructor(config: QQBotConfig) {
    this.config = config;
  }

  handleGroupMessage(
    event: OneBotMessageEvent,
    conn: QQConnection,
    aiService: QQAIService,
  ): void {
    const text = sanitizeInput(extractTextFromSegments(event.message));
    const images = extractImagesFromSegments(event.message);

    if (!text && images.length === 0) return;

    getQQLogger().debug('message',
      `Group message from ${event.user_id} in ${event.group_id}`,
      { userId: event.user_id, groupId: event.group_id, textPreview: text.slice(0, 50) },
    );

    // 限流检查
    const rateKey = `u${event.user_id}_g${event.group_id}`;
    if (!this.checkRateLimit(rateKey)) {
      getQQLogger().debug('ratelimit', `Rate limited user ${event.user_id} in group ${event.group_id}`);
      return;
    }

    // 过滤掉触发词本身
    let cleanText = text;
    for (const kw of this.config.triggerKeywords) {
      cleanText = cleanText.replace(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').trim();
    }
    // 也去掉 @ 提及本身
    if (conn.selfId) {
      cleanText = cleanText.replace(`[CQ:at,qq=${conn.selfId}]`, '').trim();
    }

    const isCmd = cleanText.startsWith('/');

    // 触发词检查（如果是命令，则免 @ 放行；否则进行触发词检测）
    if (!isCmd && !isBotMentioned(text, conn.selfId!, this.config.triggerKeywords, event.raw_message, event.message)) {
      getQQLogger().debug('message',
        `Group message from ${event.user_id} in ${event.group_id} (no trigger)`,
        { userId: event.user_id, groupId: event.group_id, textPreview: text.slice(0, 50) },
      );
      return;
    }

    if (!cleanText && images.length === 0) return;

    getQQLogger().info('message', `Group message from ${event.user_id} in ${event.group_id}`, {
      userId: event.user_id,
      groupId: event.group_id,
      textLength: cleanText.length,
    });

    // 命令路由：以 / 开头的消息视为命令
    if (cleanText.startsWith('/')) {
      aiService
        .handleCommand(cleanText, conn, event.group_id!, event.user_id)
        .catch((err) => {
          console.error('[QQ] Command error:', err);
          const errMsg = getFriendlyErrorMessage(err);
          conn.sendApiCall('send_group_msg', {
            group_id: event.group_id!,
            message: errMsg,
          }).catch((sendErr) => {
            console.error('[QQ] Failed to send command error reply (group):', sendErr);
          });
        });
      return;
    }

    // 测验答题路由：检查是否有进行中的测验
    const groupId = event.group_id!;
    if (aiService.isQuizActive(groupId)) {
      const answerResult = aiService.submitQuizAnswer(event.user_id, groupId, cleanText);
      if (answerResult) return; // 已作为答题处理
    }

    aiService
      .handleGroupMessage(cleanText, images, conn, groupId, event.user_id)
      .catch((err) => {
        console.error('[QQ] AI respond error:', err);
        const errMsg = getFriendlyErrorMessage(err);
        conn.sendApiCall('send_group_msg', {
          group_id: groupId,
          message: errMsg,
        }).catch((sendErr) => {
          console.error('[QQ] Failed to send AI error reply (group):', sendErr);
        });
      });
  }

  handlePrivateMessage(
    event: OneBotMessageEvent,
    conn: QQConnection,
    aiService: QQAIService,
  ): void {
    const text = sanitizeInput(extractTextFromSegments(event.message));
    const images = extractImagesFromSegments(event.message);

    if (!text && images.length === 0) return;

    getQQLogger().debug('message',
      `Private message from ${event.user_id}`,
      { userId: event.user_id, textPreview: text.slice(0, 50) },
    );

    // 限流检查
    const rateKey = `private_u${event.user_id}`;
    if (!this.checkRateLimit(rateKey)) {
      getQQLogger().debug('ratelimit', `Rate limited user ${event.user_id} in private chat`);
      return;
    }

    // 过滤掉触发词本身
    let cleanText = text;
    for (const kw of this.config.triggerKeywords) {
      cleanText = cleanText.replace(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').trim();
    }
    if (conn.selfId) {
      cleanText = cleanText.replace(`[CQ:at,qq=${conn.selfId}]`, '').trim();
    }

    if (!cleanText && images.length === 0) return;

    getQQLogger().info('message', `Private message from ${event.user_id}`, {
      userId: event.user_id,
      textLength: cleanText.length,
    });

    // 命令路由：以 / 开头的消息视为命令
    if (cleanText.startsWith('/')) {
      aiService
        .handleCommand(cleanText, conn, undefined, event.user_id)
        .catch((err) => {
          console.error('[QQ] Command error (private):', err);
          const errMsg = getFriendlyErrorMessage(err);
          conn.sendApiCall('send_private_msg', {
            user_id: event.user_id,
            message: errMsg,
          }).catch((sendErr) => {
            console.error('[QQ] Failed to send command error reply (private):', sendErr);
          });
        });
      return;
    }

    aiService
      .handlePrivateMessage(cleanText, images, conn, event.user_id)
      .catch((err) => {
        console.error('[QQ] AI respond error (private):', err);
        const errMsg = getFriendlyErrorMessage(err);
        conn.sendApiCall('send_private_msg', {
          user_id: event.user_id,
          message: errMsg,
        }).catch((sendErr) => {
          console.error('[QQ] Failed to send AI error reply (private):', sendErr);
        });
      });
  }

  private checkRateLimit(key: string): boolean {
    const now = Date.now();
    const entry = this.rateLimitMap.get(key);
    const { maxMessages, windowSeconds } = this.config.rateLimit;

    if (!entry) {
      this.rateLimitMap.set(key, { timestamps: [now] });
      return true;
    }

    // 清理过期的时间戳
    const windowMs = windowSeconds * 1000;
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

    if (entry.timestamps.length >= maxMessages) {
      return false; // 限流触发
    }

    entry.timestamps.push(now);
    return true;
  }
}

// ─── AI 服务桥接 ─────────────────────────────────────────────────────

class QQAIService {
  private getOrCreateSession: (sessionId: string, presetId?: string) => Promise<any>;
  private io: IOServer;
  private config: QQBotConfig;
  private activeSessions: Map<string, any> = new Map();
  private groupContexts: Map<number, GroupContext> = new Map();
  private chatRefiner: ChatRefiner;
  private quizService: QuizService;
  private sessionLocks: Map<string, Promise<void>> = new Map();

  constructor(
    getOrCreateSession: (sessionId: string, presetId?: string) => Promise<any>,
    io: IOServer,
    config: QQBotConfig,
    kbService: KnowledgeBaseService,
    workspaceCwd: string,
  ) {
    this.getOrCreateSession = getOrCreateSession;
    this.io = io;
    this.config = config;
    this.chatRefiner = new ChatRefiner(getOrCreateSession, kbService);
    this.quizService = new QuizService(
      getOrCreateSession,
      kbService,
      workspaceCwd,
      config.quiz.xpPerGrade,
      config.quiz.questionsPerRound,
    );
  }

  private async runQueue<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.sessionLocks.get(sessionId) || Promise.resolve();
    let resolveLock: () => void;
    const next = new Promise<void>((r) => {
      resolveLock = r;
    });
    this.sessionLocks.set(sessionId, next);

    try {
      await prev;
      return await fn();
    } finally {
      resolveLock!();
    }
  }

  private getSessionId(selfId: number): string {
    return `qq-${selfId}`;
  }

  private getGroupContext(groupId: number): GroupContext {
    if (!this.groupContexts.has(groupId)) {
      this.groupContexts.set(groupId, {
        group_id: groupId,
        recentMessages: [],
      });
    }
    return this.groupContexts.get(groupId)!;
  }

  private addMessageToContext(groupId: number, userId: number, nickname: string, text: string): void {
    const ctx = this.getGroupContext(groupId);
    ctx.recentMessages.push({ user_id: userId, nickname, text, timestamp: Date.now() });

    const max = this.config.maxGroupContextMessages || 20;
    while (ctx.recentMessages.length > max) {
      ctx.recentMessages.shift();
    }
  }

  private maybeRefineContext(selfId: number, groupId: number): void {
    const ctx = this.getGroupContext(groupId);
    const msgCount = ctx.recentMessages.length;

    if (!this.chatRefiner.shouldExtract(groupId, msgCount)) return;

    // 异步执行知识提取，不阻塞消息处理
    this.chatRefiner.extractConcepts(selfId, groupId, ctx.recentMessages).catch((err) => {
      console.error('[QQ] ChatRefiner async error:', err);
    });
  }

  isQuizActive(groupId: number): boolean {
    return this.quizService.isActive(groupId);
  }

  submitQuizAnswer(userId: number, groupId: number, text: string): boolean {
    return this.quizService.submitAnswer(userId, groupId, text);
  }

  async handleCommand(
    text: string,
    conn: QQConnection,
    groupId: number | undefined,
    userId: number,
  ): Promise<void> {
    const parts = text.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const selfId = conn.selfId!;

    // 为测验服务设置消息发送回调
    this.quizService.setSendMessage(async (gid, msg) => {
      await conn.sendApiCall('send_group_msg', { group_id: gid, message: msg });
    });

    let response: string | null = null;

    switch (cmd) {
      case '/quiz-start':
        if (groupId) {
          response = await this.quizService.startQuiz(selfId, groupId);
        } else {
          response = '测验功能仅限在群聊中使用。';
        }
        break;

      case '/quiz-stop':
        if (groupId) {
          response = this.quizService.stopQuiz(groupId);
        } else {
          response = '测验功能仅限在群聊中使用。';
        }
        break;

      case '/quiz-stats':
        if (groupId) {
          response = this.quizService.getStats(groupId);
        } else {
          response = '测验功能仅限在群聊中使用。';
        }
        break;

      case '/help':
        response = `📚 可用命令：
/quiz-start - 开始一轮知识测验 (仅限群聊)
/quiz-stop - 提前终止测验 (仅限群聊)
/quiz-stats - 查看测验状态 (仅限群聊)
/help - 显示此帮助

直接向我发送消息提问即可进行私聊学习！`;
        break;

      case '/stats':
        if (groupId) {
          response = this.quizService.getStats(groupId, userId);
        } else {
          response = '测验状态查询仅限在群聊中使用。';
        }
        break;

      default:
        // 未知命令，交给 AI 处理
        if (groupId) {
          await this.handleGroupMessage(text, [], conn, groupId, userId);
        } else {
          await this.handlePrivateMessage(text, [], conn, userId);
        }
        return;
    }

    if (response) {
      if (groupId) {
        await conn.sendApiCall('send_group_msg', {
          group_id: groupId,
          message: response,
        });
      } else {
        await conn.sendApiCall('send_private_msg', {
          user_id: userId,
          message: response,
        });
      }
    }
  }

  async handleGroupMessage(
    text: string,
    images: string[],
    conn: QQConnection,
    groupId: number,
    userId: number,
  ): Promise<void> {
    const sessionId = this.getSessionId(conn.selfId!);
    return this.runQueue(sessionId, async () => {
      if (images.length > 0) {
        // 有图片的情况，在 prompt 中附加图片 URL 信息
        text = text || '请分析这张图片';
        text += '\n[图片URL: ' + images.join(', ') + ']';
      }

      // 添加到群上下文
      this.addMessageToContext(groupId, userId, `User${userId}`, text);

      // 异步触发知识提取（不阻塞当前消息）
      this.maybeRefineContext(conn.selfId!, groupId);

      // 获取或创建 AI 会话
      const presetId = this.config.dedicatedPresetId;
      const session = await this.getOrCreateSession(sessionId, presetId);
      this.activeSessions.set(sessionId, session);

      // 构建上下文前缀
      const ctx = this.getGroupContext(groupId);
      const contextPrefix = this.buildContextPrefix(ctx);

      // 发送 AI 请求
      const promptText = contextPrefix + '\n---\n' + `用户提问: ${text}`;

      try {
        const responseText = await this.collectResponse(session, sessionId, promptText);
        if (!responseText) {
          console.warn('[QQ] Empty AI response for group', groupId, 'user', userId);
          await conn.sendApiCall('send_group_msg', {
            group_id: groupId,
            message: 'I received your message but could not generate a response. Please try again.',
          }).catch((sendErr) => console.error('[QQ] Failed to send empty-response notice (group):', sendErr));
          return;
        }

        // 格式化并发送（通过 ContentRouter 自动选择 Track A/B）
        const contentRouter = getContentRouter();
        const chunks = await contentRouter.routeMessage(
          responseText,
          this.config.rendering,
          markdownToPlainText,
          chunkMessage,
        );

        for (const chunk of chunks) {
          await conn.sendApiCall('send_group_msg', {
            group_id: groupId,
            message: chunk,
          });
          // 小间隔避免 QQ 限流
          if (chunks.length > 1) {
            await new Promise((r) => setTimeout(r, 500));
          }
        }
      } catch (err) {
        console.error('[QQ] AI error:', err);
        throw err;
      }
    });
  }

  async handlePrivateMessage(
    text: string,
    images: string[],
    conn: QQConnection,
    userId: number,
  ): Promise<void> {
    const sessionId = this.getSessionId(conn.selfId!);
    return this.runQueue(sessionId, async () => {
      if (images.length > 0) {
        text = text || '请分析这张图片';
        text += '\n[图片URL: ' + images.join(', ') + ']';
      }

      const presetId = this.config.dedicatedPresetId;
      const session = await this.getOrCreateSession(sessionId, presetId);
      this.activeSessions.set(sessionId, session);

      try {
        const responseText = await this.collectResponse(session, sessionId, text);
        if (!responseText) {
          console.warn('[QQ] Empty AI response for private user', userId);
          await conn.sendApiCall('send_private_msg', {
            user_id: userId,
            message: 'I received your message but could not generate a response. Please try again.',
          }).catch((sendErr) => console.error('[QQ] Failed to send empty-response notice (private):', sendErr));
          return;
        }

        // 格式化并发送（通过 ContentRouter 自动选择 Track A/B）
        const contentRouter = getContentRouter();
        const chunks = await contentRouter.routeMessage(
          responseText,
          this.config.rendering,
          markdownToPlainText,
          chunkMessage,
        );

        for (const chunk of chunks) {
          await conn.sendApiCall('send_private_msg', {
            user_id: userId,
            message: chunk,
          });
          if (chunks.length > 1) {
            await new Promise((r) => setTimeout(r, 500));
          }
        }
      } catch (err) {
        console.error('[QQ] AI error (private):', err);
        throw err;
      }
    });
  }

  private buildContextPrefix(ctx: GroupContext): string {
    if (ctx.recentMessages.length === 0) return '';
    const lines = ['以下是群聊的历史消息上下文：'];
    for (const msg of ctx.recentMessages) {
      const shortText = msg.text.length > 80 ? msg.text.slice(0, 80) + '...' : msg.text;
      lines.push(`- ${msg.nickname}: ${shortText}`);
    }
    return lines.join('\n');
  }

  private async collectResponse(
    session: any,
    sessionId: string,
    promptText: string,
  ): Promise<string> {
    const modelInfo = session.model
      ? `${session.model.provider}/${session.model.id}`
      : 'none';
    console.log('[QQ:Collect] Starting, model:', modelInfo, 'thinkingLevel:', session.thinkingLevel);

    return new Promise((resolve, reject) => {
      let collected = '';
      let finished = false;
      let unsubscribe: () => void;

      const cleanUp = () => {
        finished = true;
        clearTimeout(timeout);
        if (unsubscribe) {
          try {
            unsubscribe();
          } catch (err) {
            // Ignore unsubscription errors
          }
        }
      };

      const timeout = setTimeout(() => {
        if (!finished) {
          console.warn('[QQ:Collect] Timed out after 120s, collected so far:', collected.slice(0, 200));
          cleanUp();
          resolve(collected);
        }
      }, 120000); // 2分钟超时

      const extractText = (msg: any): string => {
        if (!msg || msg.role !== 'assistant') return '';
        if (Array.isArray(msg.content)) {
          return msg.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text || '')
            .join('');
        }
        if (typeof msg.content === 'string') return msg.content;
        return '';
      };

      unsubscribe = session.subscribe((event: any) => {
        console.log('[QQ:SessionEvent]', JSON.stringify(event));
        if (finished) return;

        if (event.type === 'message_start') {
          if (event.message && event.message.role === 'assistant') {
            const text = extractText(event.message);
            if (text) collected = text;
          }
        } else if (event.type === 'message_update') {
          if (event.message && event.message.role === 'assistant') {
            const text = extractText(event.message);
            if (text) collected = text;
          }
        } else if (event.type === 'message_end') {
          if (event.message && event.message.role === 'assistant') {
            const text = extractText(event.message);
            if (text) collected = text;
            if (event.message.stopReason === 'error') {
              const errMsg = event.message.errorMessage || 'AI error';
              cleanUp();
              reject(new Error(errMsg));
              return;
            }
            console.log('[QQ:Collect] message_end, collected', collected.length, 'chars');
            cleanUp();
            resolve(collected);
          }
        } else if (event.type === 'error') {
          console.error('[QQ:Collect] Error event:', event.message || event);
          cleanUp();
          reject(new Error(event.message || 'AI error'));
        }
      });

      // 异步发送 prompt
      console.log('[QQ:Collect] Calling session.prompt...');
      session.prompt(promptText)
        .then(() => {
          console.log('[QQ:Collect] session.prompt resolved, collected', collected.length, 'chars');
        })
        .catch((err: Error) => {
          console.error('[QQ:Collect] session.prompt rejected:', err.message);
          if (!finished) {
            cleanUp();
            reject(err);
          }
        });
    });
  }

  abortSession(selfId: number): void {
    const sessionId = this.getSessionId(selfId);
    this.activeSessions.delete(sessionId);
  }

  getStatus(): {
    activeSessionCount: number;
    activeGroupContexts: number;
  } {
    return {
      activeSessionCount: this.activeSessions.size,
      activeGroupContexts: this.groupContexts.size,
    };
  }
}

// ─── 导出入口 ────────────────────────────────────────────────────────

let qqServer: QQWebSocketServer | null = null;

export function initQQAdapter(
  httpServer: HTTPServer,
  getOrCreateSession: (sessionId: string, presetId?: string) => Promise<any>,
  io: IOServer,
  config: QQBotConfig,
  kbService: KnowledgeBaseService,
  workspaceCwd: string,
): void {
  if (qqServer) {
    console.warn('[QQ] Adapter already initialized');
    return;
  }

  // 初始化日志器
  getQQLogger(workspaceCwd);

  qqServer = new QQWebSocketServer(httpServer, getOrCreateSession, io, config, kbService, workspaceCwd);
  console.log('[QQ] OneBot v11 adapter initialized on path:', config.wsPath);
}

export function getQQServer(): QQWebSocketServer | null {
  return qqServer;
}

export function stopQQAdapter(): void {
  if (qqServer) {
    qqServer.close();
    qqServer = null;
  }
}
