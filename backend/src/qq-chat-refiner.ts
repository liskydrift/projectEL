import type { KnowledgeBaseService } from './knowledge-base/knowledge-base-service.js';

// ─── 聊天提炼器 ──────────────────────────────────────────────────────

interface ExtractedConcept {
  title: string;
  body: string;
  tags: string[];
  related_to: string[];
}

export interface GroupMessageRecord {
  user_id: number;
  nickname: string;
  text: string;
  timestamp: number;
}

export class ChatRefiner {
  private kbService: KnowledgeBaseService;
  private getSession: (sessionId: string, presetId?: string) => Promise<any>;
  private processedBuffers: Map<number, number> = new Map(); // groupId -> last processed message count
  private minMessagesThreshold = 15;
  private cooldownMs = 300000; // 5 minutes between extractions per group

  private lastExtractionTime: Map<number, number> = new Map();

  constructor(
    getSession: (sessionId: string, presetId?: string) => Promise<any>,
    kbService: KnowledgeBaseService,
  ) {
    this.getSession = getSession;
    this.kbService = kbService;
  }

  shouldExtract(groupId: number, messageCount: number): boolean {
    // 检查消息数量阈值
    if (messageCount < this.minMessagesThreshold) return false;

    // 检查上次提取后是否有足够的新消息
    const processed = this.processedBuffers.get(groupId) || 0;
    const newMessages = messageCount - processed;
    if (newMessages < this.minMessagesThreshold) return false;

    // 检查冷却时间
    const lastTime = this.lastExtractionTime.get(groupId) || 0;
    if (Date.now() - lastTime < this.cooldownMs) return false;

    return true;
  }

  async extractConcepts(
    selfId: number,
    groupId: number,
    messages: GroupMessageRecord[],
  ): Promise<number> {
    const batchSize = 30; // 最多取最近 30 条消息
    const recentMessages = messages.slice(-batchSize);

    // 构建包含发送者信息的上下文
    const messageLines = recentMessages.map(
      (m) => `- ${m.nickname || `User${m.user_id}`}: ${m.text.slice(0, 200)}`,
    );

    const prompt = `从以下QQ群聊记录中提取核心知识概念。只提取有实质知识价值的内容，过滤掉闲聊、表情、问候等无意义信息。

群聊记录：
${messageLines.join('\n')}

请以JSON数组格式返回提取的概念，每个概念包含以下字段：
- title: 概念名称（简洁准确）
- body: 详细的markdown格式知识解释（综合群聊中的讨论，补充完善该概念的知识点）
- tags: 相关标签数组（如 ["javascript", "前端"]）
- related_to: 与此概念存在关联的其他概念名称数组（用于建立双链引用）

只返回JSON数组，不要附带任何其他文字。如果没有值得提取的知识内容，返回空数组 []。`;

    try {
      const sessionId = `qq-refiner-${selfId}`;
      const session = await this.getSession(sessionId, undefined);

      const responseText = await this.promptAndCollect(session, prompt);

      // 尝试解析 JSON
      const concepts = this.parseConceptsJson(responseText);
      if (concepts.length === 0) {
        // 更新已处理计数，避免重复提取同一批
        this.processedBuffers.set(groupId, messages.length);
        this.lastExtractionTime.set(groupId, Date.now());
        return 0;
      }

      let createdCount = 0;

      for (const concept of concepts) {
        try {
          // 在 body 中添加双链引用
          let body = concept.body || '';
          for (const related of concept.related_to || []) {
            const slug = this.slugify(related);
            if (!body.includes(`[[${slug}]]`) && !body.includes(`[[${related}]]`)) {
              body += `\n\n相关概念：[[${slug}]]`;
            }
          }

          await this.kbService.createCard({
            title: concept.title,
            lifecycle: 'standard',
            body: body,
            tags: concept.tags || [],
          });
          createdCount++;
        } catch (err) {
          console.error(`[QQ] Failed to create card "${concept.title}":`, err);
        }
      }

      // 更新处理状态
      this.processedBuffers.set(groupId, messages.length);
      this.lastExtractionTime.set(groupId, Date.now());

      if (createdCount > 0) {
        console.log(`[QQ] Extracted ${createdCount} concepts from group ${groupId}`);
      }

      return createdCount;
    } catch (err) {
      console.error('[QQ] ChatRefiner extraction error:', err);
      return 0;
    }
  }

  private parseConceptsJson(text: string): ExtractedConcept[] {
    if (!text) return [];

    // 尝试直接解析
    let jsonText = text.trim();

    // 去掉可能的 markdown 代码块包裹
    const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1];
    }

    try {
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item: any) =>
            item && typeof item.title === 'string' && item.title.trim().length > 0,
        );
      }
      return [];
    } catch {
      // 尝试修复常见 JSON 问题：找到最外层的 []
      const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          const parsed = JSON.parse(arrayMatch[0]);
          if (Array.isArray(parsed)) {
            return parsed.filter(
              (item: any) =>
                item && typeof item.title === 'string' && item.title.trim().length > 0,
            );
          }
        } catch {
          // 彻底失败
        }
      }
      return [];
    }
  }

  private async promptAndCollect(
    session: any,
    promptText: string,
  ): Promise<string> {
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
          cleanUp();
          resolve(collected);
        }
      }, 90000); // 1.5分钟超时

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
              const errMsg = event.message.errorMessage || 'Refiner AI error';
              cleanUp();
              reject(new Error(errMsg));
              return;
            }
          }
          cleanUp();
          resolve(collected);
        } else if (event.type === 'error') {
          cleanUp();
          reject(new Error(event.message || 'Refiner AI error'));
        }
      });

      session.prompt(promptText)
        .then(() => {
          console.log('[Refiner] session.prompt resolved, collected', collected.length, 'chars');
        })
        .catch((err: Error) => {
          console.error('[Refiner] session.prompt rejected:', err.message);
          if (!finished) {
            cleanUp();
            reject(err);
          }
        });
    });
  }

  private slugify(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w一-鿿]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'untitled';
  }
}
