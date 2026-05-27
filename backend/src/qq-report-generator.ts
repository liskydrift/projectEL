import fs from 'fs-extra';
import path from 'path';
import type { KnowledgeBaseService } from './knowledge-base/knowledge-base-service.js';
import type { WikiCard } from './knowledge-base/types.js';

// ─── Types ───────────────────────────────────────────────────────────

interface HotTopic {
  tag: string;
  count: number;
}

interface LeaderboardEntry {
  userId: number;
  totalXp: number;
  correct: number;
  total: number;
  accuracy: number;
}

interface DailyTrend {
  date: string;
  totalAttempts: number;
  correctAttempts: number;
}

export interface WeeklyReport {
  generatedAt: string;
  periodDays: number;
  highFrequencyTopics: HotTopic[];
  weakestConcepts: { title: string; confidence: number }[];
  leaderboard: LeaderboardEntry[];
  checkinTrends: DailyTrend[];
  totalCards: number;
  totalCheckins: number;
}

interface CheckinLogEntry {
  userId: number;
  groupId: number;
  correct: boolean;
  grade: number;
  xpAwarded: number;
  conceptId: string;
  timestamp: string;
}

// ─── 报告生成器 ──────────────────────────────────────────────────────

export class ReportGenerator {
  private kbService: KnowledgeBaseService;
  private workspaceCwd: string;

  constructor(kbService: KnowledgeBaseService, workspaceCwd: string) {
    this.kbService = kbService;
    this.workspaceCwd = workspaceCwd;
  }

  async generateWeeklyReport(groupId?: number): Promise<WeeklyReport> {
    const periodDays = 7;
    const cards = await this.kbService.listCards();
    const allLogs = await this.loadCheckinLogs();

    // 过滤近 N 天的日志
    const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000;
    const recentLogs = allLogs.filter(
      (l) => new Date(l.timestamp).getTime() > cutoff && (groupId === undefined || l.groupId === groupId),
    );

    // 1. 高频话题：统计 tags 频率
    const tagCount: Map<string, number> = new Map();
    for (const card of cards) {
      for (const tag of card.tags || []) {
        tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
      }
    }
    const highFrequencyTopics: HotTopic[] = Array.from(tagCount.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 2. 最薄弱概念：effective_confidence 最低的5个
    const weakestConcepts = cards
      .filter((c) => c.directory !== 'archive')
      .sort((a, b) => a.effective_confidence - b.effective_confidence)
      .slice(0, 5)
      .map((c) => ({ title: c.title, confidence: Math.round(c.effective_confidence * 100) / 100 }));

    // 3. 活跃排行：按 XP 汇总
    const userStats: Map<number, { xp: number; correct: number; total: number }> = new Map();
    for (const log of recentLogs) {
      const stats = userStats.get(log.userId) || { xp: 0, correct: 0, total: 0 };
      stats.xp += log.xpAwarded;
      stats.total++;
      if (log.correct) stats.correct++;
      userStats.set(log.userId, stats);
    }
    const leaderboard: LeaderboardEntry[] = Array.from(userStats.entries())
      .map(([userId, s]) => ({
        userId,
        totalXp: s.xp,
        correct: s.correct,
        total: s.total,
        accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0,
      }))
      .sort((a, b) => {
        if (b.correct !== a.correct) {
          return b.correct - a.correct;
        }
        return a.total - b.total; // 答题数少优先
      })
      .slice(0, 10);

    // 4. 打卡趋势：按天统计
    const dailyMap: Map<string, { total: number; correct: number }> = new Map();
    // 初始化最近7天
    for (let i = periodDays - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateKey = d.toISOString().slice(0, 10);
      dailyMap.set(dateKey, { total: 0, correct: 0 });
    }
    for (const log of recentLogs) {
      const dateKey = log.timestamp.slice(0, 10);
      const day = dailyMap.get(dateKey);
      if (day) {
        day.total++;
        if (log.correct) day.correct++;
      }
    }
    const checkinTrends: DailyTrend[] = Array.from(dailyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, d]) => ({
        date,
        totalAttempts: d.total,
        correctAttempts: d.correct,
      }));

    return {
      generatedAt: new Date().toISOString(),
      periodDays,
      highFrequencyTopics,
      weakestConcepts,
      leaderboard,
      checkinTrends,
      totalCards: cards.length,
      totalCheckins: recentLogs.length,
    };
  }

  formatReportForQQ(report: WeeklyReport, groupId?: number): string {
    const lines: string[] = [];
    lines.push(`📊 群运营周报 (近${report.periodDays}天)`);
    lines.push('——————————————————');

    // 高频话题
    lines.push('🔥 热门话题：');
    if (report.highFrequencyTopics.length === 0) {
      lines.push('  （暂无数据）');
    } else {
      for (const t of report.highFrequencyTopics) {
        lines.push(`  ▸ #${t.tag} (${t.count}个卡片)`);
      }
    }

    // 薄弱概念
    lines.push('📉 薄弱知识点：');
    if (report.weakestConcepts.length === 0) {
      lines.push('  （暂无数据）');
    } else {
      for (const c of report.weakestConcepts) {
        const bar = this.confidenceBar(c.confidence);
        lines.push(`  ▸ ${c.title} ${bar} ${c.confidence}`);
      }
    }

    // 活跃排行
    lines.push('🏆 活跃排行 (Top 10)：');
    if (report.leaderboard.length === 0) {
      lines.push('  （暂无答题记录）');
    } else {
      report.leaderboard.forEach((entry, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        lines.push(`  ${medal} QQ${entry.userId}: 正确 ${entry.correct}/${entry.total} 题 (正确率${entry.accuracy}%)`);
      });
    }

    // 打卡趋势
    lines.push('📅 每日打卡趋势：');
    if (report.checkinTrends.every((d) => d.totalAttempts === 0)) {
      lines.push('  （近7天无答题记录）');
    } else {
      for (const d of report.checkinTrends) {
        const bar = this.trendBar(d.totalAttempts, 10);
        lines.push(`  ${d.date}: ${bar} ${d.totalAttempts}次 (正确${d.correctAttempts})`);
      }
    }

    lines.push('——————————————————');
    lines.push(`📚 知识库共计 ${report.totalCards} 个概念卡片`);

    return lines.join('\n');
  }

  private confidenceBar(value: number): string {
    const filled = Math.round(value * 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  private trendBar(value: number, max: number): string {
    const filled = Math.min(value, max);
    const empty = max - filled;
    return '▇'.repeat(filled) + '—'.repeat(empty);
  }

  private async loadCheckinLogs(): Promise<CheckinLogEntry[]> {
    const logPath = path.join(this.workspaceCwd, 'inbox', 'checkin_logs.jsonl');
    if (!(await fs.pathExists(logPath))) return [];

    try {
      const content = await fs.readFile(logPath, 'utf-8');
      return content
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line) as CheckinLogEntry;
          } catch {
            return null;
          }
        })
        .filter((entry): entry is CheckinLogEntry => entry !== null);
    } catch {
      return [];
    }
  }
}
