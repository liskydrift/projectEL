import puppeteer, { Browser, Page } from 'puppeteer';
import katex from 'katex';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── KaTeX CSS 加载 ──────────────────────────────────────────────────

let _katexCssCache: string | null = null;

async function getKatexCSS(): Promise<string> {
  if (_katexCssCache) return _katexCssCache;
  const pathsToTry = [
    path.join(__dirname, '..', 'node_modules', 'katex', 'dist', 'katex.min.css'),
    path.join(__dirname, '..', '..', 'node_modules', 'katex', 'dist', 'katex.min.css')
  ];

  for (const cssPath of pathsToTry) {
    if (await fs.pathExists(cssPath)) {
      _katexCssCache = await fs.readFile(cssPath, 'utf-8');
      return _katexCssCache;
    }
  }
  throw new Error(`katex.min.css not found in any of: ${pathsToTry.join(', ')}`);
}

// ─── KaTeX 渲染模板 ──────────────────────────────────────────────────

function buildFormulaPage(formulaHtml: string, css: string, width: number): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>${css}</style>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #ffffff;
    display: inline-block;
    padding: 12px 16px;
    font-size: 16px;
  }
  .katex { font-size: 1.1em; }
  .katex-display { margin: 4px 0; }
</style>
</head>
<body>
  <div id="formula">${formulaHtml}</div>
</body>
</html>`;
}

// ─── 公式渲染器 ──────────────────────────────────────────────────────

class FormulaRenderer {
  private browser: Browser | null = null;
  private renderCount = 0;
  private maxRenders = 100;
  private idleTimer: NodeJS.Timeout | null = null;
  private idleTimeoutMs = 60000;
  private activePages = 0;
  private maxConcurrentPages = 2;
  private initPromise: Promise<Browser> | null = null;

  private async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) {
      // 重置空闲计时器
      this.resetIdleTimer();
      return this.browser;
    }

    if (this.initPromise) return this.initPromise;

    this.initPromise = puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    }).then((b) => {
      this.browser = b;
      this.renderCount = 0;
      this.initPromise = null;
      return b;
    });

    return this.initPromise;
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.closeBrowser();
    }, this.idleTimeoutMs);
  }

  private async closeBrowser(): Promise<void> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // 忽略关闭错误
      }
      this.browser = null;
      this.renderCount = 0;
    }
  }

  private async acquirePage(): Promise<Page> {
    // 等待可用并发槽位
    while (this.activePages >= this.maxConcurrentPages) {
      await new Promise((r) => setTimeout(r, 50));
    }
    this.activePages++;

    const browser = await this.getBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 600 });
    return page;
  }

  private async releasePage(page: Page): Promise<void> {
    try {
      await page.close();
    } catch {
      // 忽略
    }
    this.activePages--;
    this.renderCount++;

    // 渲染100次后重启浏览器，防止内存泄漏
    if (this.renderCount >= this.maxRenders) {
      await this.closeBrowser();
    }
  }

  async renderFormulaToPNG(latex: string, width: number = 800): Promise<Buffer> {
    const page = await this.acquirePage();
    try {
      const css = await getKatexCSS();

      // 使用 KaTeX 渲染公式为 HTML
      let formulaHtml: string;
      try {
        formulaHtml = katex.renderToString(latex, {
          displayMode: true,
          throwOnError: false,
        });
      } catch {
        // 如果 KaTeX 渲染失败，回退到纯文本显示
        formulaHtml = `<span style="font-family:monospace;font-size:14px;">${escapeHtml(latex)}</span>`;
      }

      const html = buildFormulaPage(formulaHtml, css, width);
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 10000 });

      // 获取公式元素的尺寸并截图
      const element = await page.$('#formula');
      if (!element) {
        throw new Error('Formula element not found in page');
      }

      const screenshot = await element.screenshot({
        type: 'png',
        omitBackground: false,
      });

      return Buffer.from(screenshot);
    } finally {
      await this.releasePage(page);
    }
  }

  async shutdown(): Promise<void> {
    await this.closeBrowser();
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── 单例 ────────────────────────────────────────────────────────────

let rendererInstance: FormulaRenderer | null = null;

function getRenderer(): FormulaRenderer {
  if (!rendererInstance) {
    rendererInstance = new FormulaRenderer();
  }
  return rendererInstance;
}

// ─── LaTeX 公式检测 ──────────────────────────────────────────────────

interface TextSegment {
  type: 'text';
  content: string;
}

interface LatexSegment {
  type: 'latex';
  content: string;  // 原始 LaTeX 内容（不含 $ 符号）
  display: boolean; // true = $$...$$, false = $...$
}

type ParsedSegment = TextSegment | LatexSegment;

function detectLatexFormulas(text: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  // 匹配 $$...$$ 或 $...$
  const regex = /(\$\$([\s\S]+?)\$\$|\$([^\$\n]+?)\$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // 前面的普通文本
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }

    const isDisplay = match[0].startsWith('$$');
    const latexContent = isDisplay ? match[2] : match[3];

    segments.push({
      type: 'latex',
      content: latexContent.trim(),
      display: isDisplay,
    });

    lastIndex = match.index + match[0].length;
  }

  // 尾部剩余文本
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', content: text }];
}

// ─── 内容路由器 ──────────────────────────────────────────────────────

interface RenderingConfig {
  formulaImageWidth: number;
  maxMessageLength: number;
  messageChunkOverlap: number;
}

class ContentRouter {
  private renderer: FormulaRenderer;

  constructor() {
    this.renderer = getRenderer();
  }

  async routeMessage(
    text: string,
    config: RenderingConfig,
    markdownToPlainText: (md: string) => string,
    chunkMessage: (text: string, maxLen: number, overlap: number) => string[],
  ): Promise<string[]> {
    const segments = detectLatexFormulas(text);
    const hasFormulas = segments.some((s) => s.type === 'latex');

    if (!hasFormulas) {
      // Track B: 纯文本转换
      const plainText = markdownToPlainText(text);
      return chunkMessage(plainText, config.maxMessageLength, config.messageChunkOverlap);
    }

    // Track A: 混合渲染（文本 + 公式图片）
    const parts: string[] = [];

    for (const seg of segments) {
      if (seg.type === 'text') {
        const formatted = markdownToPlainText(seg.content);
        if (formatted) parts.push(formatted);
      } else {
        try {
          const pngBuffer = await this.renderer.renderFormulaToPNG(
            seg.content,
            config.formulaImageWidth,
          );
          const base64 = pngBuffer.toString('base64');
          parts.push(`[CQ:image,file=base64://${base64}]`);
        } catch (err) {
          console.error('[QQ] Formula render error:', err);
          // 回退：显示原始 LaTeX 代码
          parts.push(`[公式] ${seg.content}`);
        }
      }
    }

    // 将 parts 合并为消息，控制每条的 CQ 码数量（图片太多时分段发送）
    const result: string[] = [];
    let current = '';
    for (const part of parts) {
      if (part.startsWith('[CQ:image')) {
        // 图片单独发送或在当前文本后附加
        if (current && current.length + part.length > config.maxMessageLength) {
          result.push(current);
          current = part;
        } else if (current) {
          current += '\n' + part;
        } else {
          current = part;
        }
      } else {
        if (current && current.length + part.length > config.maxMessageLength) {
          result.push(current);
          current = part;
        } else {
          current += (current ? '\n' : '') + part;
        }
      }
    }
    if (current) result.push(current);

    return result;
  }
}

let routerInstance: ContentRouter | null = null;

export function getContentRouter(): ContentRouter {
  if (!routerInstance) {
    routerInstance = new ContentRouter();
  }
  return routerInstance;
}

export { FormulaRenderer, ContentRouter, detectLatexFormulas, getRenderer };
