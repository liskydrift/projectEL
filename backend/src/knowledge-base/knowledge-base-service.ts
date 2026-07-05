import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import type { WikiCard, CuratedNote, CreateCardInput, UpdateCardInput, CreateNoteInput, UpdateNoteInput, Lifecycle, ArchiveCandidate, ArchiveReviewContent } from './types.js';

const DECAY_RATES: Record<Lifecycle, number> = {
  immortal: 0,
  standard: 0.0038,
  decay_fast: 0.0495,
};

const HALF_LIFE_DAYS: Record<Lifecycle, number> = {
  immortal: Infinity,
  standard: 180,
  decay_fast: 14,
};

const ARCHIVE_THRESHOLD = 0.15;
const BOOST_DELTA = 0.2;

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
}

function frontmatterRegex(): RegExp {
  return /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
}

function parseFrontmatterContent(content: string): { frontmatter: Record<string, any>; body: string } {
  const match = content.match(frontmatterRegex());
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const fmLines = match[1].split('\n');
  const frontmatter: Record<string, any> = {};

  for (const line of fmLines) {
    const sepIndex = line.indexOf(':');
    if (sepIndex === -1) continue;
    const key = line.slice(0, sepIndex).trim();
    let value: any = line.slice(sepIndex + 1).trim();

    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (/^\d+\.?\d*$/.test(value)) value = parseFloat(value);
    else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else if (value.startsWith('[') && value.endsWith(']')) {
      try {
        const inner = value.slice(1, -1).trim();
        if (inner === '') {
          value = [];
        } else {
          value = inner.split(',').map((s: string) => {
            s = s.trim();
            if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
              return s.slice(1, -1);
            }
            return s;
          });
        }
      } catch {
        value = [];
      }
    }

    frontmatter[key] = value;
  }

  return { frontmatter, body: match[2] || '' };
}

function serializeFrontmatter(fm: Record<string, any>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(fm)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`${key}: [${value.map(v => typeof v === 'string' && v.startsWith('#') ? v : `"${v}"`).join(', ')}]`);
    } else if (typeof value === 'number') {
      lines.push(`${key}: ${value}`);
    } else if (typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  return lines.join('\n');
}

function toCardFrontmatter(card: Partial<WikiCard>): Record<string, any> {
  return {
    id: card.id,
    title: card.title,
    lifecycle: card.lifecycle,
    confidence_score: card.confidence_score,
    decay_rate: card.decay_rate,
    last_interacted: card.last_interacted,
    created_at: card.created_at,
    tags: card.tags || [],
    type: 'concept',
  };
}

function toNoteFrontmatter(note: Partial<CuratedNote>): Record<string, any> {
  return {
    id: note.id,
    title: note.title,
    tags: note.tags || [],
    lifecycle: note.lifecycle,
    next_review: note.next_review,
    stability: note.stability,
    difficulty: note.difficulty,
    reps: note.reps,
    created_at: note.created_at,
    type: 'note',
    source_card_id: note.source_card_id,
  };
}

export class KnowledgeBaseService {
  readonly workspaceCwd: string;
  activeKbId: string = 'default';

  get wikiRoot(): string {
    return path.join(this.workspaceCwd, 'knowledge_bases', this.activeKbId, 'wiki_core');
  }
  get conceptsDir(): string {
    return path.join(this.wikiRoot, 'concepts');
  }
  get temporaryDir(): string {
    return path.join(this.wikiRoot, 'temporary');
  }
  get archiveDir(): string {
    return path.join(this.wikiRoot, 'archive');
  }
  get curatedNotesDir(): string {
    return path.join(this.workspaceCwd, 'knowledge_bases', this.activeKbId, 'curated_notes');
  }
  get inboxDir(): string {
    return path.join(this.workspaceCwd, 'knowledge_bases', this.activeKbId, 'inbox');
  }
  get sourcesDir(): string {
    return path.join(this.workspaceCwd, 'knowledge_bases', this.activeKbId, 'sources');
  }

  get activeKbPath(): string {
    return path.join(this.workspaceCwd, '.pi', 'active_kb.json');
  }

  async listKbs(): Promise<string[]> {
    const kbRoot = path.join(this.workspaceCwd, 'knowledge_bases');
    if (!await fs.pathExists(kbRoot)) return ['default'];
    const entries = await fs.readdir(kbRoot, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  }

  async switchKb(kbId: string): Promise<void> {
    this.activeKbId = kbId;
    await fs.ensureDir(path.dirname(this.activeKbPath));
    await fs.writeJson(this.activeKbPath, { activeKbId: kbId }, { spaces: 2 });
    await this.ensureDirectories();
  }

  constructor(workspaceCwd: string) {
    this.workspaceCwd = workspaceCwd;
  }

  async migrateOldPaths(): Promise<void> {
    const oldWiki = path.join(this.workspaceCwd, 'wiki_core');
    const oldNotes = path.join(this.workspaceCwd, 'curated_notes');
    const oldSources = path.join(this.workspaceCwd, 'sources');
    const oldInbox = path.join(this.workspaceCwd, 'inbox');

    const defaultKbRoot = path.join(this.workspaceCwd, 'knowledge_bases', 'default');

    if (
      await fs.pathExists(oldWiki) ||
      await fs.pathExists(oldNotes) ||
      await fs.pathExists(oldSources) ||
      await fs.pathExists(oldInbox)
    ) {
      console.log('[KB Migration] Detecting old knowledge base layout. Migrating to knowledge_bases/default/...');
      await fs.ensureDir(defaultKbRoot);

      if (await fs.pathExists(oldWiki)) {
        await fs.move(oldWiki, path.join(defaultKbRoot, 'wiki_core'), { overwrite: true });
        console.log('[KB Migration] Moved wiki_core.');
      }
      if (await fs.pathExists(oldNotes)) {
        await fs.move(oldNotes, path.join(defaultKbRoot, 'curated_notes'), { overwrite: true });
        console.log('[KB Migration] Moved curated_notes.');
      }
      if (await fs.pathExists(oldSources)) {
        await fs.move(oldSources, path.join(defaultKbRoot, 'sources'), { overwrite: true });
        console.log('[KB Migration] Moved sources.');
      }
      if (await fs.pathExists(oldInbox)) {
        await fs.move(oldInbox, path.join(defaultKbRoot, 'inbox'), { overwrite: true });
        console.log('[KB Migration] Moved inbox.');
      }
      console.log('[KB Migration] Migration completed successfully.');
    }
  }

  async ensureDirectories(): Promise<void> {
    await fs.ensureDir(this.conceptsDir);
    await fs.ensureDir(this.temporaryDir);
    await fs.ensureDir(this.archiveDir);
    await fs.ensureDir(this.curatedNotesDir);
    await fs.ensureDir(this.inboxDir);
    await fs.ensureDir(this.sourcesDir);
  }

  // =========================================================================
  // Confidence Engine
  // =========================================================================

  getDecayRate(lifecycle: Lifecycle): number {
    return DECAY_RATES[lifecycle];
  }

  getHalfLife(lifecycle: Lifecycle): number {
    return HALF_LIFE_DAYS[lifecycle];
  }

  calculateEffectiveConfidence(fm: { confidence_score?: number; decay_rate?: number; last_interacted?: string }): number {
    const baseScore = fm.confidence_score ?? 0.5;
    const decayRate = fm.decay_rate ?? DECAY_RATES.standard;
    if (decayRate === 0) return baseScore;

    const lastInteracted = fm.last_interacted ? new Date(fm.last_interacted).getTime() : Date.now();
    const now = Date.now();
    const daysSince = (now - lastInteracted) / (1000 * 60 * 60 * 24);
    if (daysSince <= 0) return baseScore;

    const effective = baseScore * Math.exp(-decayRate * daysSince);
    return Math.round(Math.max(0, Math.min(1, effective)) * 100) / 100;
  }

  boostConfidenceScore(currentScore: number): number {
    return Math.round(Math.min(1.0, currentScore + BOOST_DELTA) * 100) / 100;
  }

  // =========================================================================
  // File Operations
  // =========================================================================

  private async readFileContent(filePath: string): Promise<{ frontmatter: Record<string, any>; body: string } | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return parseFrontmatterContent(content);
    } catch { return null; }
  }

  private async readFileAsCard(filePath: string): Promise<WikiCard | null> {
    const parsed = await this.readFileContent(filePath);
    if (!parsed) return null;

    const fm = parsed.frontmatter;
    const directory = filePath.includes(this.temporaryDir) ? 'temporary' : filePath.includes(this.archiveDir) ? 'archive' : 'concepts';
    const lifecycle: Lifecycle = ['immortal', 'standard', 'decay_fast'].includes(fm.lifecycle) ? fm.lifecycle : 'standard';

    const card: WikiCard = {
      id: fm.id || crypto.randomUUID(),
      title: fm.title || path.basename(filePath, '.md'),
      lifecycle,
      confidence_score: typeof fm.confidence_score === 'number' ? fm.confidence_score : 0.5,
      effective_confidence: 0,
      decay_rate: typeof fm.decay_rate === 'number' ? fm.decay_rate : DECAY_RATES[lifecycle],
      last_interacted: fm.last_interacted || new Date().toISOString(),
      created_at: fm.created_at || new Date().toISOString(),
      tags: Array.isArray(fm.tags) ? fm.tags : [],
      type: 'concept',
      body: parsed.body,
      filename: path.basename(filePath),
      directory,
    };
    card.effective_confidence = this.calculateEffectiveConfidence(card);
    return card;
  }

  private async readFileAsNote(filePath: string): Promise<CuratedNote | null> {
    const parsed = await this.readFileContent(filePath);
    if (!parsed) return null;

    const fm = parsed.frontmatter;
    const lifecycle: Lifecycle = ['immortal', 'standard', 'decay_fast'].includes(fm.lifecycle) ? fm.lifecycle : 'standard';

    return {
      id: fm.id || crypto.randomUUID(),
      title: fm.title || path.basename(filePath, '.md'),
      tags: Array.isArray(fm.tags) ? fm.tags : [],
      lifecycle,
      next_review: fm.next_review || new Date().toISOString(),
      stability: typeof fm.stability === 'number' ? fm.stability : 1,
      difficulty: typeof fm.difficulty === 'number' ? fm.difficulty : 3,
      reps: typeof fm.reps === 'number' ? fm.reps : 0,
      created_at: fm.created_at || new Date().toISOString(),
      type: 'note',
      body: parsed.body,
      filename: path.basename(filePath),
      source_card_id: fm.source_card_id,
    };
  }

  // =========================================================================
  // Wiki Card CRUD
  // =========================================================================

  async listCards(): Promise<WikiCard[]> {
    const all: WikiCard[] = [];

    for (const dir of [this.conceptsDir, this.temporaryDir] as const) {
      if (!await fs.pathExists(dir)) continue;
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const card = await this.readFileAsCard(path.join(dir, file));
        if (card) all.push(card);
      }
    }

    all.sort((a, b) => b.effective_confidence - a.effective_confidence);
    return all;
  }

  async getCard(id: string): Promise<WikiCard | null> {
    for (const dir of [this.conceptsDir, this.temporaryDir, this.archiveDir] as const) {
      if (!await fs.pathExists(dir)) continue;
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const parsed = await this.readFileContent(path.join(dir, file));
        if (parsed && parsed.frontmatter.id === id) {
          return this.readFileAsCard(path.join(dir, file));
        }
      }
    }
    return null;
  }

  async createCard(input: CreateCardInput): Promise<WikiCard> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const lifecycle: Lifecycle = input.lifecycle || 'standard';
    const decayRate = DECAY_RATES[lifecycle];
    const targetDir = lifecycle === 'decay_fast' ? this.temporaryDir : this.conceptsDir;

    const card: WikiCard = {
      id,
      title: input.title,
      lifecycle,
      confidence_score: 0.8,
      effective_confidence: 0.8,
      decay_rate: decayRate,
      last_interacted: now,
      created_at: now,
      tags: input.tags || [],
      type: 'concept',
      body: input.body || `# ${input.title}\n\n`,
      filename: `${slugify(input.title)}.md`,
      directory: lifecycle === 'decay_fast' ? 'temporary' : 'concepts',
    };

    const frontmatter = toCardFrontmatter(card);
    const content = `---\n${serializeFrontmatter(frontmatter)}\n---\n\n${card.body}`;
    const filePath = path.join(targetDir, card.filename);

    // Handle filename conflicts
    if (await fs.pathExists(filePath)) {
      card.filename = `${slugify(input.title)}-${id.slice(0, 8)}.md`;
    }

    await fs.writeFile(path.join(targetDir, card.filename), content, 'utf-8');
    return card;
  }

  async updateCard(id: string, input: UpdateCardInput): Promise<WikiCard | null> {
    const existing = await this.getCard(id);
    if (!existing) return null;

    const filePath = this.resolveCardPath(existing);
    if (!filePath) return null;

    const parsed = await this.readFileContent(filePath);
    if (!parsed) return null;

    const fm = parsed.frontmatter;
    const now = new Date().toISOString();

    if (input.title !== undefined) fm.title = input.title;
    if (input.lifecycle !== undefined) {
      fm.lifecycle = input.lifecycle;
      fm.decay_rate = DECAY_RATES[input.lifecycle];
    }
    if (input.body !== undefined) parsed.body = input.body;
    if (input.tags !== undefined) fm.tags = input.tags;
    fm.last_interacted = now;

    const content = `---\n${serializeFrontmatter(fm)}\n---\n\n${parsed.body}`;
    await fs.writeFile(filePath, content, 'utf-8');

    // Handle directory move if lifecycle changed
    if (input.lifecycle !== undefined) {
      const newDir = input.lifecycle === 'decay_fast' ? this.temporaryDir : this.conceptsDir;
      const oldDir = path.dirname(filePath);
      if (oldDir !== newDir) {
        const newPath = path.join(newDir, existing.filename);
        await fs.move(filePath, newPath, { overwrite: true });
      }
    }

    return this.getCard(id);
  }

  async deleteCard(id: string): Promise<boolean> {
    const existing = await this.getCard(id);
    if (!existing) return false;

    const filePath = this.resolveCardPath(existing);
    if (!filePath) return false;

    await fs.remove(filePath);
    return true;
  }

  async deleteNote(id: string): Promise<boolean> {
    const existing = await this.getNote(id);
    if (!existing) return false;
    const filePath = path.join(this.curatedNotesDir, existing.filename);
    if (!await fs.pathExists(filePath)) return false;
    await fs.remove(filePath);
    return true;
  }

  async boostCard(id: string): Promise<number | null> {
    const existing = await this.getCard(id);
    if (!existing) return null;

    const filePath = this.resolveCardPath(existing);
    if (!filePath) return null;

    const parsed = await this.readFileContent(filePath);
    if (!parsed) return null;

    const newScore = this.boostConfidenceScore(existing.confidence_score);
    parsed.frontmatter.confidence_score = newScore;
    parsed.frontmatter.last_interacted = new Date().toISOString();

    const content = `---\n${serializeFrontmatter(parsed.frontmatter)}\n---\n\n${parsed.body}`;
    await fs.writeFile(filePath, content, 'utf-8');

    return newScore;
  }

  async searchCards(query: string): Promise<WikiCard[]> {
    if (!query.trim()) return this.listCards();
    const q = query.toLowerCase();
    const all = await this.listCards();
    return all.filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.body.toLowerCase().includes(q) ||
      c.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  // =========================================================================
  // Curated Notes CRUD + SM-2
  // =========================================================================

  async listNotes(): Promise<CuratedNote[]> {
    if (!await fs.pathExists(this.curatedNotesDir)) return [];
    const files = await fs.readdir(this.curatedNotesDir);
    const notes: CuratedNote[] = [];

    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const note = await this.readFileAsNote(path.join(this.curatedNotesDir, file));
      if (note) notes.push(note);
    }

    return notes;
  }

  async getNote(id: string): Promise<CuratedNote | null> {
    if (!await fs.pathExists(this.curatedNotesDir)) return null;
    const files = await fs.readdir(this.curatedNotesDir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const parsed = await this.readFileContent(path.join(this.curatedNotesDir, file));
      if (parsed && parsed.frontmatter.id === id) {
        return this.readFileAsNote(path.join(this.curatedNotesDir, file));
      }
    }
    return null;
  }

  async createNote(input: CreateNoteInput): Promise<CuratedNote> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const note: CuratedNote = {
      id,
      title: input.title,
      tags: input.tags || [],
      lifecycle: input.lifecycle || 'standard',
      next_review: now,
      stability: 1,
      difficulty: 3,
      reps: 0,
      created_at: now,
      type: 'note',
      body: input.body || `# ${input.title}\n\n`,
      filename: `${slugify(input.title)}.md`,
      source_card_id: input.source_card_id,
    };

    const frontmatter = toNoteFrontmatter(note);
    const content = `---\n${serializeFrontmatter(frontmatter)}\n---\n\n${note.body}`;
    const filePath = path.join(this.curatedNotesDir, note.filename);

    if (await fs.pathExists(filePath)) {
      note.filename = `${slugify(input.title)}-${id.slice(0, 8)}.md`;
    }

    await fs.writeFile(path.join(this.curatedNotesDir, note.filename), content, 'utf-8');
    return note;
  }

  async updateNote(id: string, input: UpdateNoteInput): Promise<CuratedNote | null> {
    const existing = await this.getNote(id);
    if (!existing) return null;

    const filePath = path.join(this.curatedNotesDir, existing.filename);
    const parsed = await this.readFileContent(filePath);
    if (!parsed) return null;

    const fm = parsed.frontmatter;
    if (input.title !== undefined) fm.title = input.title;
    if (input.body !== undefined) parsed.body = input.body;
    if (input.tags !== undefined) fm.tags = input.tags;
    if (input.lifecycle !== undefined) fm.lifecycle = input.lifecycle;
    if (input.source_card_id !== undefined) fm.source_card_id = input.source_card_id;

    const content = `---\n${serializeFrontmatter(fm)}\n---\n\n${parsed.body}`;
    await fs.writeFile(filePath, content, 'utf-8');

    return this.getNote(id);
  }

  async reviewNote(id: string, grade: number): Promise<CuratedNote | null> {
    // SM-2 Algorithm
    const existing = await this.getNote(id);
    if (!existing) return null;

    const filePath = path.join(this.curatedNotesDir, existing.filename);
    const parsed = await this.readFileContent(filePath);
    if (!parsed) return null;

    const fm = parsed.frontmatter;
    let stability = typeof fm.stability === 'number' ? fm.stability : 1;
    let difficulty = typeof fm.difficulty === 'number' ? fm.difficulty : 3;
    let reps = typeof fm.reps === 'number' ? fm.reps : 0;

    if (grade >= 3) {
      // Pass: increase stability
      if (reps === 0) {
        stability = 1;
      } else if (reps === 1) {
        stability = 6;
      } else {
        stability = Math.round(stability * difficulty * 0.8);
      }
      reps++;
      difficulty = Math.max(1.3, difficulty - 0.2);
    } else {
      // Fail: reset
      reps = 0;
      stability = 1;
      difficulty = Math.min(5, difficulty + 0.3);
    }

    const nextReview = new Date(Date.now() + stability * 86400 * 1000).toISOString();
    fm.stability = stability;
    fm.difficulty = Math.round(difficulty * 10) / 10;
    fm.reps = reps;
    fm.next_review = nextReview;

    const content = `---\n${serializeFrontmatter(fm)}\n---\n\n${parsed.body}`;
    await fs.writeFile(filePath, content, 'utf-8');

    return this.getNote(id);
  }

  // =========================================================================
  // Archive System
  // =========================================================================

  async runArchiveLint(): Promise<ArchiveReviewContent> {
    const candidates: ArchiveCandidate[] = [];

    for (const dir of [this.conceptsDir, this.temporaryDir] as const) {
      if (!await fs.pathExists(dir)) continue;
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const card = await this.readFileAsCard(path.join(dir, file));
        if (card && card.effective_confidence < ARCHIVE_THRESHOLD) {
          candidates.push({
            filename: card.filename,
            title: card.title,
            confidence: card.effective_confidence,
            filePath: path.join(dir, file),
          });
        }
      }
    }

    const now = new Date().toISOString();
    let md = `# 知识库归档预告清单（生成时间：${now}）\n\n`;
    md += `以下知识节点置信度已低于 ${ARCHIVE_THRESHOLD}。如果在下一次清理周期前未被"否决"，系统将自动将其移入 \`wiki_core/archive/\` 并重构引用链路。\n\n`;
    md += `## 拟归档文件列表（编辑此列表删除某行即可否决归档）\n\n`;

    for (const c of candidates) {
      md += `- [ ] ${c.filename} (置信度: ${c.confidence.toFixed(2)})\n`;
    }

    md += `\n---\n`;
    md += `> 编辑此文件删除对应行即可行使一票否决权。\n`;

    const reviewPath = path.join(this.inboxDir, 'archive_review.md');
    await fs.writeFile(reviewPath, md, 'utf-8');

    return { generatedAt: now, candidates, raw_markdown: md };
  }

  async executeArchive(vetoList?: string[]): Promise<{ moved: number; linksRewritten: number }> {
    const vetoSet = new Set(vetoList || []);
    let moved = 0;
    let linksRewritten = 0;

    for (const dir of [this.conceptsDir, this.temporaryDir] as const) {
      if (!await fs.pathExists(dir)) continue;
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        if (vetoSet.has(file)) continue;

        const card = await this.readFileAsCard(path.join(dir, file));
        if (card && card.effective_confidence < ARCHIVE_THRESHOLD) {
          const src = path.join(dir, file);
          const dest = path.join(this.archiveDir, file);
          await fs.move(src, dest, { overwrite: true });
          moved++;
        }
      }
    }

    // Rewrite [[links]] in remaining wiki files
    if (moved > 0) {
      const archivedCards: WikiCard[] = [];
      if (await fs.pathExists(this.archiveDir)) {
        const archivedFiles = await fs.readdir(this.archiveDir);
        for (const file of archivedFiles) {
          if (!file.endsWith('.md')) continue;
          const card = await this.readFileAsCard(path.join(this.archiveDir, file));
          if (card) archivedCards.push(card);
        }
      }

      for (const dir of [this.conceptsDir, this.temporaryDir] as const) {
        if (!await fs.pathExists(dir)) continue;
        const files = await fs.readdir(dir);
        for (const file of files) {
          if (!file.endsWith('.md')) continue;
          const filePath = path.join(dir, file);
          let content = await fs.readFile(filePath, 'utf-8');
          let modified = false;

          for (const archivedCard of archivedCards) {
            const nameWithoutExt = archivedCard.filename.replace(/\.md$/, '');
            const escapeRegex = (s: string) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            
            const titlePattern = new RegExp(`\\[\\[\\s*${escapeRegex(archivedCard.title)}\\s*\\]\\]`, 'gi');
            const namePattern = new RegExp(`\\[\\[\\s*${escapeRegex(nameWithoutExt)}\\s*\\]\\]`, 'gi');
            
            if (titlePattern.test(content)) {
              content = content.replace(titlePattern, `**${archivedCard.title}[已归档]**`);
              modified = true;
              linksRewritten++;
            } else if (namePattern.test(content)) {
              content = content.replace(namePattern, `**${archivedCard.title}[已归档]**`);
              modified = true;
              linksRewritten++;
            }
          }

          if (modified) {
            await fs.writeFile(filePath, content, 'utf-8');
          }
        }
      }
    }

    return { moved, linksRewritten };
  }

  async listArchivedCards(): Promise<WikiCard[]> {
    if (!await fs.pathExists(this.archiveDir)) return [];
    const files = await fs.readdir(this.archiveDir);
    const cards: WikiCard[] = [];
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const card = await this.readFileAsCard(path.join(this.archiveDir, file));
      if (card) cards.push(card);
    }
    return cards;
  }

  async getArchiveReview(): Promise<string | null> {
    const reviewPath = path.join(this.inboxDir, 'archive_review.md');
    if (await fs.pathExists(reviewPath)) {
      return fs.readFile(reviewPath, 'utf-8');
    }
    return null;
  }

  // =========================================================================
  // Sources (Layer 1: Immutable Raw Materials)
  // =========================================================================

  async listSources(): Promise<{ filename: string; title: string; size: number; lastModified: string }[]> {
    if (!await fs.pathExists(this.sourcesDir)) return [];
    const files = await fs.readdir(this.sourcesDir);
    const result: { filename: string; title: string; size: number; lastModified: string }[] = [];

    for (const file of files.sort()) {
      const filePath = path.join(this.sourcesDir, file);
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) continue;
      const title = file.replace(/\.\w+$/, '').replace(/[-_]/g, ' ');
      result.push({
        filename: file,
        title,
        size: stat.size,
        lastModified: stat.mtime.toISOString(),
      });
    }

    return result;
  }

  async getSource(filename: string): Promise<{ content: string; title: string; size: number } | null> {
    const filePath = path.join(this.sourcesDir, filename);
    // Prevent directory traversal
    if (!filePath.startsWith(this.sourcesDir)) return null;
    if (!await fs.pathExists(filePath)) return null;
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return null;

    const content = await fs.readFile(filePath, 'utf-8');
    const title = filename.replace(/\.\w+$/, '').replace(/[-_]/g, ' ');
    return { content, title, size: stat.size };
  }

  async createSource(filename: string, content: string): Promise<{ filename: string }> {
    await fs.ensureDir(this.sourcesDir);
    const filePath = path.join(this.sourcesDir, filename);
    if (!filePath.startsWith(this.sourcesDir)) throw new Error('Invalid filename');
    await fs.writeFile(filePath, content, 'utf-8');
    return { filename };
  }

  async deleteSource(filename: string): Promise<boolean> {
    const filePath = path.join(this.sourcesDir, filename);
    if (!filePath.startsWith(this.sourcesDir)) return false;
    if (!await fs.pathExists(filePath)) return false;
    await fs.remove(filePath);
    return true;
  }

  async deleteNote(id: string): Promise<boolean> {
    const existing = await this.getNote(id);
    if (!existing) return false;
    const filePath = path.join(this.curatedNotesDir, existing.filename);
    if (!await fs.pathExists(filePath)) return false;
    await fs.remove(filePath);
    return true;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  private resolveCardPath(card: WikiCard): string | null {
    const dir = card.directory === 'temporary' ? this.temporaryDir
      : card.directory === 'archive' ? this.archiveDir
      : this.conceptsDir;
    const filePath = path.join(dir, card.filename);
    // Check exists
    return fs.pathExistsSync(filePath) ? filePath : null;
  }

  async getStats(): Promise<{ totalCards: number; totalNotes: number; archivedCount: number }> {
    const cards = await this.listCards();
    const notes = await this.listNotes();
    let archivedCount = 0;
    if (await fs.pathExists(this.archiveDir)) {
      archivedCount = (await fs.readdir(this.archiveDir)).filter(f => f.endsWith('.md')).length;
    }
    return { totalCards: cards.length, totalNotes: notes.length, archivedCount };
  }
}
