import fs from 'fs-extra';
import path from 'path';

// ─── 结构化日志器 ────────────────────────────────────────────────────

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: Record<string, unknown>;
}

export class QQLogger {
  private logDir: string;
  private level: LogLevel;
  private buffer: string[] = [];
  private flushTimer: NodeJS.Timeout;
  private flushIntervalMs = 5000;
  private maxBufferSize = 100;

  constructor(workspaceCwd: string, level: LogLevel = 'info') {
    this.logDir = path.join(workspaceCwd, 'inbox', 'qq-logs');
    this.level = level;
    this.flushTimer = setInterval(() => this.flush(), this.flushIntervalMs);

    // 进程退出时刷新
    process.on('exit', () => this.flushSync());
    process.on('SIGINT', () => { this.flushSync(); process.exit(); });
    process.on('SIGTERM', () => { this.flushSync(); process.exit(); });
  }

  private levelPriority(l: LogLevel): number {
    return { debug: 0, info: 1, warn: 2, error: 3 }[l];
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority(level) >= this.levelPriority(this.level);
  }

  private formatEntry(entry: LogEntry): string {
    return JSON.stringify(entry);
  }

  private getLogPath(): string {
    const date = new Date().toISOString().slice(0, 10);
    return path.join(this.logDir, `qq-${date}.jsonl`);
  }

  private async ensureLogDir(): Promise<void> {
    await fs.ensureDir(this.logDir);
  }

  log(level: LogLevel, category: string, message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data,
    };

    const line = this.formatEntry(entry);
    this.buffer.push(line);

    // 同步输出到控制台
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : level === 'debug' ? '🔍' : 'ℹ️';
    const consoleMsg = `[QQ:${category}] ${prefix} ${message}`;
    if (level === 'error') console.error(consoleMsg, data || '');
    else if (level === 'warn') console.warn(consoleMsg, data || '');
    else console.log(consoleMsg, data || '');

    // 缓冲区达到阈值时立即刷新
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush();
    }
  }

  info(category: string, message: string, data?: Record<string, unknown>): void {
    this.log('info', category, message, data);
  }

  warn(category: string, message: string, data?: Record<string, unknown>): void {
    this.log('warn', category, message, data);
  }

  error(category: string, message: string, data?: Record<string, unknown>): void {
    this.log('error', category, message, data);
  }

  debug(category: string, message: string, data?: Record<string, unknown>): void {
    this.log('debug', category, message, data);
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const lines = this.buffer.splice(0);
    try {
      await this.ensureLogDir();
      await fs.appendFile(this.getLogPath(), lines.join('\n') + '\n', 'utf-8');
    } catch (err) {
      console.error('[QQ:Logger] Failed to flush logs:', err);
    }
  }

  private flushSync(): void {
    if (this.buffer.length === 0) return;
    try {
      fs.ensureDirSync(this.logDir);
      fs.appendFileSync(this.getLogPath(), this.buffer.join('\n') + '\n', 'utf-8');
      this.buffer = [];
    } catch {
      // 同步刷新失败时静默
    }
  }

  async shutdown(): Promise<void> {
    clearInterval(this.flushTimer);
    await this.flush();
  }
}

let loggerInstance: QQLogger | null = null;

export function getQQLogger(workspaceCwd?: string): QQLogger {
  if (!loggerInstance) {
    if (!workspaceCwd) {
      throw new Error('QQLogger not initialized. Call getQQLogger(workspaceCwd) first.');
    }
    loggerInstance = new QQLogger(workspaceCwd);
    loggerInstance.info('logger', 'QQLogger initialized');
  }
  return loggerInstance;
}
