import fs from 'fs-extra';
import path from 'path';
import type { KnowledgeBaseService } from './knowledge-base/knowledge-base-service.js';

// ─── Types ───────────────────────────────────────────────────────────

interface QuizQuestion {
  conceptId: string;
  question: string;
  options: string[]; // [A, B, C, D]
  correctIndex: number; // 0-3
}

interface QuizState {
  active: boolean;
  groupId: number;
  currentQuestionIndex: number;
  questions: QuizQuestion[];
  scores: Map<number, { xp: number; correct: number; total: number }>;
  currentAnswers: Map<number, number>; // user_id -> option index
  timer: NodeJS.Timeout | null;
  startTime: number;
}

interface QuizResult {
  userId: number;
  groupId: number;
  correct: boolean;
  grade: number;
  xpAwarded: number;
  conceptId: string;
  timestamp: string;
}

interface XpPerGrade {
  [grade: string]: number;
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'];
const ANSWER_WINDOW_SECONDS = 30;
const QUESTION_INTERVAL_MS = 3000; // 题目间间隔

// ─── 测验服务 ────────────────────────────────────────────────────────

export class QuizService {
  private kbService: KnowledgeBaseService;
  private getSession: (sessionId: string, presetId?: string) => Promise<any>;
  private workspaceCwd: string;
  private activeQuizzes: Map<number, QuizState> = new Map();
  private xpPerGrade: XpPerGrade;
  private questionsPerRound: number;
  private onSendMessage: ((groupId: number, message: string) => Promise<void>) | null = null;

  constructor(
    getSession: (sessionId: string, presetId?: string) => Promise<any>,
    kbService: KnowledgeBaseService,
    workspaceCwd: string,
    xpPerGrade: XpPerGrade = { '0': 0, '1': 1, '2': 3, '3': 5, '4': 10 },
    questionsPerRound: number = 3,
  ) {
    this.getSession = getSession;
    this.kbService = kbService;
    this.workspaceCwd = workspaceCwd;
    this.xpPerGrade = xpPerGrade;
    this.questionsPerRound = questionsPerRound;
  }

  setSendMessage(fn: (groupId: number, message: string) => Promise<void>): void {
    this.onSendMessage = fn;
  }

  private async sendToGroup(groupId: number, message: string): Promise<void> {
    if (this.onSendMessage) {
      await this.onSendMessage(groupId, message);
    }
  }

  private getQuiz(groupId: number): QuizState | undefined {
    return this.activeQuizzes.get(groupId);
  }

  private removeQuiz(groupId: number): void {
    const quiz = this.activeQuizzes.get(groupId);
    if (quiz) {
      if (quiz.timer) clearTimeout(quiz.timer);
      this.activeQuizzes.delete(groupId);
    }
  }

  isActive(groupId: number): boolean {
    const q = this.activeQuizzes.get(groupId);
    return q ? q.active : false;
  }

  async startQuiz(selfId: number, groupId: number): Promise<string> {
    if (this.isActive(groupId)) {
      return '当前已有正在进行的测验，请等结束后再开始新测验。';
    }

    try {
      // 获取知识库中置信度最低的卡片
      const cards = await this.kbService.listCards();
      const sorted = cards
        .filter((c) => c.directory === 'concepts' || c.directory === 'temporary')
        .sort((a, b) => a.effective_confidence - b.effective_confidence)
        .slice(0, this.questionsPerRound);

      if (sorted.length === 0) {
        return '知识库中暂无卡片，无法生成测验题目。请先在群聊中积累一些知识讨论。';
      }

      // 使用 AI 生成选择题
      const questions = await this.generateQuestions(selfId, sorted);
      if (questions.length === 0) {
        return '生成测验题目失败，请稍后再试。';
      }

      const quizState: QuizState = {
        active: true,
        groupId,
        currentQuestionIndex: 0,
        questions,
        scores: new Map(),
        currentAnswers: new Map(),
        timer: null,
        startTime: Date.now(),
      };

      this.activeQuizzes.set(groupId, quizState);

      // 发送开场消息
      const cardCount = questions.length;
      await this.sendToGroup(
        groupId,
        `📝 知识测验开始！共 ${cardCount} 题，每题 ${ANSWER_WINDOW_SECONDS} 秒作答时间。\n发送 A / B / C / D 回答问题。`,
      );

      // 开始第一题
      await this.sendCurrentQuestion(groupId);

      return '';
    } catch (err) {
      console.error('[QQ] Quiz start error:', err);
      return '启动测验失败，请稍后再试。';
    }
  }

  private async sendCurrentQuestion(groupId: number): Promise<void> {
    const quiz = this.getQuiz(groupId);
    if (!quiz || !quiz.active) return;

    const q = quiz.questions[quiz.currentQuestionIndex];
    quiz.currentAnswers.clear();

    const optionLines = q.options.map((opt, i) => `${OPTION_LABELS[i]}. ${opt}`).join('\n');
    await this.sendToGroup(
      groupId,
      `第 ${quiz.currentQuestionIndex + 1}/${quiz.questions.length} 题：\n${q.question}\n\n${optionLines}\n\n⏱️ ${ANSWER_WINDOW_SECONDS}秒内回复字母作答`,
    );

    // 设置自动推进计时器
    if (quiz.timer) clearTimeout(quiz.timer);
    quiz.timer = setTimeout(() => {
      this.advanceQuestion(groupId);
    }, ANSWER_WINDOW_SECONDS * 1000);
  }

  submitAnswer(userId: number, groupId: number, text: string): boolean {
    const quiz = this.getQuiz(groupId);
    if (!quiz || !quiz.active) return false;

    const answer = text.trim().toUpperCase();
    const answerIndex = OPTION_LABELS.indexOf(answer);
    if (answerIndex < 0) return false; // 不是有效答案

    // 每个用户每道题只能答一次
    if (quiz.currentAnswers.has(userId)) return false;

    quiz.currentAnswers.set(userId, answerIndex);
    return true;
  }

  private async advanceQuestion(groupId: number): Promise<void> {
    const quiz = this.getQuiz(groupId);
    if (!quiz || !quiz.active) return;

    const question = quiz.questions[quiz.currentQuestionIndex];
    const correctLabel = OPTION_LABELS[question.correctIndex];

    // 计算本轮得分
    const results: string[] = [];
    for (const [userId, answerIndex] of quiz.currentAnswers) {
      const correct = answerIndex === question.correctIndex;
      const grade: number = correct ? 4 : 1; // 正确=4级, 错误=1级
      const xp = this.xpPerGrade[String(grade)] || 0;

      // 更新累计积分
      const score = quiz.scores.get(userId) || { xp: 0, correct: 0, total: 0 };
      score.xp += xp;
      score.total++;
      if (correct) score.correct++;
      quiz.scores.set(userId, score);

      // 记录答题结果
      const result: QuizResult = {
        userId,
        groupId,
        correct,
        grade,
        xpAwarded: xp,
        conceptId: question.conceptId,
        timestamp: new Date().toISOString(),
      };
      this.logCheckin(result);

      // 更新知识卡片置信度
      if (correct) {
        try {
          await this.kbService.boostCard(question.conceptId);
        } catch {
          // 静默失败
        }
      }
    }

    // 宣布正确答案
    let resultMsg = `⏰ 时间到！正确答案是 ${correctLabel}。${question.options[question.correctIndex]}\n\n`;
    if (quiz.currentAnswers.size === 0) {
      resultMsg += '😴 无人作答。';
    } else {
      const answered = Array.from(quiz.currentAnswers.keys());
      const correctUsers = answered.filter(
        (uid) => quiz.currentAnswers.get(uid) === question.correctIndex,
      );
      resultMsg += `📊 作答 ${quiz.currentAnswers.size} 人，正确 ${correctUsers.length} 人。`;
    }

    await this.sendToGroup(groupId, resultMsg);

    // 推进到下一题
    quiz.currentQuestionIndex++;

    if (quiz.currentQuestionIndex >= quiz.questions.length) {
      // 测验结束
      await this.endQuiz(groupId);
    } else {
      // 短暂间隔后发下一题
      await new Promise((r) => setTimeout(r, QUESTION_INTERVAL_MS));
      await this.sendCurrentQuestion(groupId);
    }
  }

  private async endQuiz(groupId: number): Promise<void> {
    const quiz = this.getQuiz(groupId);
    if (!quiz) return;

    quiz.active = false;
    if (quiz.timer) clearTimeout(quiz.timer);

    // 生成排名
    const rankings = Array.from(quiz.scores.entries())
      .sort((a, b) => {
        if (b[1].correct !== a[1].correct) {
          return b[1].correct - a[1].correct;
        }
        return a[1].total - b[1].total; // 答题数少优先
      })
      .slice(0, 10);

    let summary = `🎉 测验结束！共 ${quiz.questions.length} 题。\n\n🏆 排行榜：\n`;
    if (rankings.length === 0) {
      summary += '（无人参与）';
    } else {
      rankings.forEach(([userId, score], i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        const accuracy = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;
        summary += `${medal} QQ${userId}: 正确 ${score.correct}/${score.total} 题 (正确率${accuracy}%)\n`;
      });
    }

    await this.sendToGroup(groupId, summary);
    this.removeQuiz(groupId);
  }

  stopQuiz(groupId: number): string {
    const quiz = this.getQuiz(groupId);
    if (!quiz || !quiz.active) {
      return '当前没有进行中的测验。';
    }
    this.removeQuiz(groupId);
    return '测验已提前终止。';
  }

  getStats(groupId: number, userId?: number): string {
    const quiz = this.getQuiz(groupId);
    if (!quiz || !quiz.active) {
      return '当前没有进行中的测验。';
    }

    const q = quiz.questions[quiz.currentQuestionIndex];
    const remaining = Math.max(
      0,
      Math.ceil(
        (ANSWER_WINDOW_SECONDS * 1000 -
          (Date.now() - (quiz.startTime + quiz.currentQuestionIndex * (ANSWER_WINDOW_SECONDS + 3) * 1000))) /
          1000,
      ),
    );

    if (userId) {
      const score = quiz.scores.get(userId);
      if (score) {
        const accuracy = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;
        return `你的战绩：正确 ${score.correct}/${score.total} | 正确率 ${accuracy}%`;
      }
      return '你还未参与本次测验。';
    }

    return `📝 第 ${quiz.currentQuestionIndex + 1}/${quiz.questions.length} 题进行中 | ${quiz.currentAnswers.size} 人已作答`;
  }

  private async generateQuestions(
    selfId: number,
    cards: { id: string; title: string; body: string; tags: string[] }[],
  ): Promise<QuizQuestion[]> {
    const sessionId = `qq-quizgen-${selfId}`;
    const session = await this.getSession(sessionId, undefined);

    const cardDescriptions = cards.map(
      (c, i) => `概念${i + 1}: "${c.title}"\n内容: ${c.body.slice(0, 500)}`,
    );

    const prompt = `根据以下知识概念生成 ${cards.length} 道单项选择题。每道题4个选项(A/B/C/D)，包含1个正确答案和3个干扰项。

${cardDescriptions.join('\n\n')}

请以JSON数组格式返回，每道题包含以下字段：
- conceptIndex: 对应上述概念的序号(1-${cards.length})
- question: 题目描述
- options: ["选项A内容", "选项B内容", "选项C内容", "选项D内容"]
- correctIndex: 正确选项的索引(0-3)

只返回JSON数组，不要附带其他文字。`;

    const responseText = await this.promptAndCollect(session, prompt);
    if (!responseText) return [];

    try {
      let jsonText = responseText.trim();
      const codeMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeMatch) jsonText = codeMatch[1];

      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter((q: any) => q && typeof q.question === 'string' && Array.isArray(q.options) && q.options.length === 4)
        .map((q: any) => ({
          conceptId: cards[q.conceptIndex - 1]?.id || cards[0]?.id || '',
          question: q.question,
          options: q.options.slice(0, 4),
          correctIndex: Math.max(0, Math.min(3, q.correctIndex || 0)),
        }));
    } catch (err) {
      console.error('[QQ] Quiz question parse error:', err);
      return [];
    }
  }

  private async promptAndCollect(session: any, promptText: string): Promise<string> {
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
      }, 60000);

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
              const errMsg = event.message.errorMessage || 'Quiz AI error';
              cleanUp();
              reject(new Error(errMsg));
              return;
            }
          }
          cleanUp();
          resolve(collected);
        } else if (event.type === 'error') {
          cleanUp();
          reject(new Error(event.message || 'Quiz AI error'));
        }
      });

      session.prompt(promptText)
        .then(() => {
          console.log('[Quiz] session.prompt resolved, collected', collected.length, 'chars');
        })
        .catch((err: Error) => {
          console.error('[Quiz] session.prompt rejected:', err.message);
          if (!finished) {
            cleanUp();
            reject(err);
          }
        });
    });
  }

  private async logCheckin(result: QuizResult): Promise<void> {
    try {
      const logPath = path.join(this.workspaceCwd, 'inbox', 'checkin_logs.jsonl');
      await fs.ensureDir(path.join(this.workspaceCwd, 'inbox'));
      const line = JSON.stringify(result) + '\n';
      await fs.appendFile(logPath, line, 'utf-8');
    } catch (err) {
      console.error('[QQ] Checkin log write error:', err);
    }
  }
}
