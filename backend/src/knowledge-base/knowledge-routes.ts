import { Router } from 'express';
import type { Server as SocketServer } from 'socket.io';
import { KnowledgeBaseService } from './knowledge-base-service.js';
import type { CreateCardInput, UpdateCardInput, CreateNoteInput, UpdateNoteInput, SourceFile } from './types.js';
import fs from 'fs-extra';
import path from 'path';
import { getQQLogger } from '../qq-logger.js';

export function createKnowledgeRoutes(getService: () => KnowledgeBaseService, io: SocketServer): Router {
  const router = Router();

  const service = new Proxy({} as KnowledgeBaseService, {
    get(target, prop, _receiver) {
      const actualService = getService();
      const value = Reflect.get(actualService, prop, actualService);
      if (typeof value === 'function') {
        return value.bind(actualService);
      }
      return value;
    }
  });

  // =========================================================================
  // Wiki Cards
  // =========================================================================

  router.get('/cards', async (_req, res) => {
    try {
      const cards = await service.listCards();
      res.json({ cards });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/cards/search', async (req, res) => {
    try {
      const q = (req.query.q as string) || '';
      const results = await service.searchCards(q);
      res.json({ results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/cards/:id', async (req, res) => {
    try {
      const card = await service.getCard(req.params.id);
      if (!card) return res.status(404).json({ error: 'Card not found' });
      res.json(card);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/cards', async (req, res) => {
    try {
      const input: CreateCardInput = req.body;
      if (!input.title || !input.body) {
        return res.status(400).json({ error: 'title and body are required' });
      }
      const card = await service.createCard(input);
      io.emit('knowledge:card-created', { card });
      res.status(201).json(card);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/cards/:id', async (req, res) => {
    try {
      const input: UpdateCardInput = req.body;
      const card = await service.updateCard(req.params.id, input);
      if (!card) return res.status(404).json({ error: 'Card not found' });
      io.emit('knowledge:card-updated', { card });
      res.json(card);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/cards/:id', async (req, res) => {
    try {
      const ok = await service.deleteCard(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Card not found' });
      io.emit('knowledge:card-deleted', { id: req.params.id });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/cards/:id/boost', async (req, res) => {
    try {
      const newScore = await service.boostCard(req.params.id);
      if (newScore === null) return res.status(404).json({ error: 'Card not found' });
      const card = await service.getCard(req.params.id);
      io.emit('knowledge:card-updated', { card });
      res.json({ confidence_score: newScore, card });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // Curated Notes
  // =========================================================================

  router.get('/notes', async (_req, res) => {
    try {
      const notes = await service.listNotes();
      res.json({ notes });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/notes/:id', async (req, res) => {
    try {
      const note = await service.getNote(req.params.id);
      if (!note) return res.status(404).json({ error: 'Note not found' });
      res.json(note);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/notes', async (req, res) => {
    try {
      const input: CreateNoteInput = req.body;
      if (!input.title || !input.body) {
        return res.status(400).json({ error: 'title and body are required' });
      }
      const note = await service.createNote(input);
      io.emit('knowledge:note-created', { note });
      res.status(201).json(note);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/notes/:id', async (req, res) => {
    try {
      const input: UpdateNoteInput = req.body;
      const note = await service.updateNote(req.params.id, input);
      if (!note) return res.status(404).json({ error: 'Note not found' });
      io.emit('knowledge:note-updated', { note });
      res.json(note);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/notes/:id', async (req, res) => {
    try {
      const ok = await service.deleteNote(req.params.id);
      if (!ok) return res.status(404).json({ error: 'Note not found' });
      io.emit('knowledge:note-deleted', { id: req.params.id });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/notes/:id/review', async (req, res) => {
    try {
      const grade = typeof req.body.grade === 'number' ? req.body.grade : -1;
      if (grade < 0 || grade > 4) {
        return res.status(400).json({ error: 'grade must be 0-4' });
      }
      const note = await service.reviewNote(req.params.id, grade);
      if (!note) return res.status(404).json({ error: 'Note not found' });
      io.emit('knowledge:note-updated', { note });
      res.json(note);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // Archive
  // =========================================================================

  router.get('/archive/list', async (_req, res) => {
    try {
      const archived = await service.listArchivedCards();
      res.json({ archived });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/archive/review', async (_req, res) => {
    try {
      const content = await service.getArchiveReview();
      res.json({ content });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/archive/lint', async (_req, res) => {
    try {
      const review = await service.runArchiveLint();
      io.emit('knowledge:archive-lint', { candidatesCount: review.candidates.length });
      res.json(review);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/archive/execute', async (req, res) => {
    try {
      const vetoList: string[] | undefined = req.body?.vetoList;
      const result = await service.executeArchive(vetoList);
      io.emit('knowledge:archive-done', { moved: result.moved });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // Sources (Layer 1: Immutable Raw Materials)
  // =========================================================================

  router.get('/sources', async (_req, res) => {
    try {
      const sources = await service.listSources();
      res.json({ sources });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/sources/:filename', async (req, res) => {
    try {
      const source = await service.getSource(req.params.filename);
      if (!source) return res.status(404).json({ error: 'Source not found' });
      res.json(source);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/sources', async (req, res) => {
    try {
      const { filename, content } = req.body;
      if (!filename || content === undefined) {
        return res.status(400).json({ error: 'filename and content are required' });
      }
      const result = await service.createSource(filename, content);
      io.emit('knowledge:source-created', { filename });
      res.status(201).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/sources/:filename', async (req, res) => {
    try {
      const ok = await service.deleteSource(req.params.filename);
      if (!ok) return res.status(404).json({ error: 'Source not found' });
      io.emit('knowledge:source-deleted', { filename: req.params.filename });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // Stats
  // =========================================================================

  router.get('/stats', async (_req, res) => {
    try {
      const stats = await service.getStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // Memory Libraries (KB switching/creation/deletion)
  // =========================================================================

  router.get('/libraries', async (_req, res) => {
    try {
      const actualService = getService();
      const kbRoot = path.join(actualService.workspaceCwd, 'knowledge_bases');
      await fs.ensureDir(kbRoot);
      
      const dirs = await fs.readdir(kbRoot);
      const libraries: string[] = [];
      for (const dir of dirs) {
        const fullPath = path.join(kbRoot, dir);
        if ((await fs.stat(fullPath)).isDirectory()) {
          libraries.push(dir);
        }
      }

      // Ensure 'default' is in the list
      if (!libraries.includes('default')) {
        libraries.push('default');
      }

      res.json({
        libraries: libraries.sort(),
        active: actualService.activeKbId
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/libraries/switch', async (req, res) => {
    try {
      const { kbId } = req.body;
      if (!kbId || typeof kbId !== 'string') {
        return res.status(400).json({ error: 'kbId must be a string' });
      }

      const actualService = getService();
      actualService.activeKbId = kbId;
      await actualService.ensureDirectories();

      // Write active KB status to .pi/active_kb.json for Agent process
      const activeKbPath = path.join(actualService.workspaceCwd, '.pi', 'active_kb.json');
      await fs.ensureDir(path.dirname(activeKbPath));
      await fs.writeJson(activeKbPath, { activeKbId: kbId }, { spaces: 2 });

      io.emit('knowledge:library-switched', { active: kbId });

      // 同步重定向 QQ 日志器到新记忆库的 inbox 目录
      try {
        const qqLogger = getQQLogger();
        qqLogger.setLogDir(path.join(actualService.inboxDir, 'qq-logs'));
      } catch {
        // QQLogger 未初始化时忽略
      }

      res.json({ success: true, active: kbId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/libraries/create', async (req, res) => {
    try {
      const { kbId } = req.body;
      if (!kbId || typeof kbId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(kbId)) {
        return res.status(400).json({ error: 'kbId must be alphanumeric, dashes, or underscores' });
      }

      const actualService = getService();
      const newService = new KnowledgeBaseService(actualService.workspaceCwd);
      newService.activeKbId = kbId;
      await newService.ensureDirectories();

      io.emit('knowledge:library-created', { kbId });
      res.status(201).json({ success: true, kbId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/libraries/:id', async (req, res) => {
    try {
      const id = req.params.id;
      if (id === 'default') {
        return res.status(400).json({ error: 'Cannot delete the default library' });
      }

      const actualService = getService();
      const kbPath = path.join(actualService.workspaceCwd, 'knowledge_bases', id);
      if (!(await fs.pathExists(kbPath))) {
        return res.status(404).json({ error: 'Library not found' });
      }

      await fs.remove(kbPath);

      // If deleted library was active, switch back to default
      if (actualService.activeKbId === id) {
        actualService.activeKbId = 'default';
        await actualService.ensureDirectories();
        const activeKbPath = path.join(actualService.workspaceCwd, '.pi', 'active_kb.json');
        await fs.ensureDir(path.dirname(activeKbPath));
        await fs.writeJson(activeKbPath, { activeKbId: 'default' }, { spaces: 2 });
        io.emit('knowledge:library-switched', { active: 'default' });
      }

      io.emit('knowledge:library-deleted', { id });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
