import { Router } from 'express';
import type { Server as SocketServer } from 'socket.io';
import { KnowledgeBaseService } from './knowledge-base-service.js';
import type { CreateCardInput, UpdateCardInput, CreateNoteInput, UpdateNoteInput } from './types.js';

export function createKnowledgeRoutes(service: KnowledgeBaseService, io: SocketServer): Router {
  const router = Router();

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

  return router;
}
