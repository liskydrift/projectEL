import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const API_BASE = 'http://localhost:3000/api/knowledge';

export interface WikiCard {
  id: string;
  title: string;
  lifecycle: 'immortal' | 'standard' | 'decay_fast';
  confidence_score: number;
  effective_confidence: number;
  decay_rate: number;
  last_interacted: string;
  created_at: string;
  tags: string[];
  type: 'concept';
  body: string;
  filename: string;
  directory: 'concepts' | 'temporary' | 'archive';
}

export interface CuratedNote {
  id: string;
  title: string;
  tags: string[];
  lifecycle: 'immortal' | 'standard' | 'decay_fast';
  next_review: string;
  stability: number;
  difficulty: number;
  reps: number;
  created_at: string;
  type: 'note';
  body: string;
  filename: string;
}

export interface CreateCardInput {
  title: string;
  lifecycle: 'immortal' | 'standard' | 'decay_fast';
  body: string;
  tags?: string[];
}

export interface CreateNoteInput {
  title: string;
  body: string;
  tags?: string[];
  lifecycle?: 'immortal' | 'standard' | 'decay_fast';
}

export interface ArchiveReviewContent {
  generatedAt: string;
  candidates: Array<{ filename: string; title: string; confidence: number; filePath: string }>;
  raw_markdown: string;
}

export function useKnowledgeBase() {
  const [cards, setCards] = useState<WikiCard[]>([]);
  const [notes, setNotes] = useState<CuratedNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Socket connection for real-time updates
  useEffect(() => {
    const socket = io('http://localhost:3000', {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('knowledge:card-created', () => { fetchCards(); });
    socket.on('knowledge:card-updated', () => { fetchCards(); });
    socket.on('knowledge:card-deleted', () => { fetchCards(); });
    socket.on('knowledge:note-created', () => { fetchNotes(); });
    socket.on('knowledge:note-updated', () => { fetchNotes(); });
    socket.on('knowledge:archive-lint', () => {});
    socket.on('knowledge:archive-done', () => { fetchCards(); });
    socket.on('knowledge:library-switched', () => { fetchCards(); fetchNotes(); });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);

  const apiCall = useCallback(async <T>(url: string, options?: RequestInit): Promise<T> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}${url}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data as T;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // =========================================================================
  // Wiki Cards
  // =========================================================================

  const fetchCards = useCallback(async () => {
    const data = await apiCall<{ cards: WikiCard[] }>('/cards');
    setCards(data.cards);
  }, [apiCall]);

  const fetchCard = useCallback(async (id: string): Promise<WikiCard> => {
    return apiCall<WikiCard>(`/cards/${id}`);
  }, [apiCall]);

  const createCard = useCallback(async (input: CreateCardInput): Promise<WikiCard> => {
    const card = await apiCall<WikiCard>('/cards', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    await fetchCards();
    return card;
  }, [apiCall, fetchCards]);

  const updateCard = useCallback(async (id: string, input: Partial<CreateCardInput>): Promise<WikiCard> => {
    const card = await apiCall<WikiCard>(`/cards/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    await fetchCards();
    return card;
  }, [apiCall, fetchCards]);

  const deleteCard = useCallback(async (id: string): Promise<void> => {
    await apiCall(`/cards/${id}`, { method: 'DELETE' });
    await fetchCards();
  }, [apiCall, fetchCards]);

  const boostCard = useCallback(async (id: string): Promise<number> => {
    const data = await apiCall<{ confidence_score: number }>(`/cards/${id}/boost`, { method: 'POST' });
    await fetchCards();
    return data.confidence_score;
  }, [apiCall, fetchCards]);

  const searchCards = useCallback(async (query: string): Promise<WikiCard[]> => {
    const data = await apiCall<{ results: WikiCard[] }>(`/cards/search?q=${encodeURIComponent(query)}`);
    return data.results;
  }, [apiCall]);

  // =========================================================================
  // Curated Notes
  // =========================================================================

  const fetchNotes = useCallback(async () => {
    const data = await apiCall<{ notes: CuratedNote[] }>('/notes');
    setNotes(data.notes);
  }, [apiCall]);

  const createNote = useCallback(async (input: CreateNoteInput): Promise<CuratedNote> => {
    const note = await apiCall<CuratedNote>('/notes', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    await fetchNotes();
    return note;
  }, [apiCall, fetchNotes]);

  const updateNote = useCallback(async (id: string, input: Partial<CreateNoteInput>): Promise<CuratedNote> => {
    const note = await apiCall<CuratedNote>(`/notes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    await fetchNotes();
    return note;
  }, [apiCall, fetchNotes]);

  const reviewNote = useCallback(async (id: string, grade: number): Promise<CuratedNote> => {
    const note = await apiCall<CuratedNote>(`/notes/${id}/review`, {
      method: 'POST',
      body: JSON.stringify({ grade }),
    });
    await fetchNotes();
    return note;
  }, [apiCall, fetchNotes]);

  const deleteNote = useCallback(async (id: string): Promise<void> => {
    await apiCall(`/notes/${id}`, { method: 'DELETE' });
    await fetchNotes();
  }, [apiCall, fetchNotes]);

  // =========================================================================
  // Archive
  // =========================================================================

  const runArchiveLint = useCallback(async (): Promise<ArchiveReviewContent> => {
    return apiCall<ArchiveReviewContent>('/archive/lint', { method: 'POST' });
  }, [apiCall]);

  const executeArchive = useCallback(async (vetoList?: string[]): Promise<{ moved: number; linksRewritten: number }> => {
    const result = await apiCall<{ moved: number; linksRewritten: number }>('/archive/execute', {
      method: 'POST',
      body: JSON.stringify({ vetoList }),
    });
    await fetchCards();
    return result;
  }, [apiCall, fetchCards]);

  const fetchArchiveReview = useCallback(async (): Promise<string | null> => {
    const data = await apiCall<{ content: string | null }>('/archive/review');
    return data.content;
  }, [apiCall]);

  const fetchArchivedCards = useCallback(async (): Promise<WikiCard[]> => {
    const data = await apiCall<{ archived: WikiCard[] }>('/archive/list');
    return data.archived;
  }, [apiCall]);

  const fetchStats = useCallback(async (): Promise<{ totalCards: number; totalNotes: number; archivedCount: number }> => {
    return apiCall('/stats');
  }, [apiCall]);

  // =========================================================================
  // Sources (Layer 1: Immutable Raw Materials)
  // =========================================================================

  const fetchSources = useCallback(async (): Promise<{ filename: string; title: string; size: number; lastModified: string }[]> => {
    const data = await apiCall<{ sources: { filename: string; title: string; size: number; lastModified: string }[] }>('/sources');
    return data.sources;
  }, [apiCall]);

  const fetchSource = useCallback(async (filename: string): Promise<{ content: string; title: string; size: number }> => {
    return apiCall(`/sources/${encodeURIComponent(filename)}`);
  }, [apiCall]);

  const fetchLibraries = useCallback(async (): Promise<{ libraries: string[], active: string }> => {
    return apiCall<{ libraries: string[], active: string }>('/libraries');
  }, [apiCall]);

  const switchLibrary = useCallback(async (kbId: string): Promise<void> => {
    await apiCall(`/libraries/switch`, {
      method: 'POST',
      body: JSON.stringify({ kbId }),
    });
    await fetchCards();
    await fetchNotes();
  }, [apiCall, fetchCards, fetchNotes]);

  const createLibrary = useCallback(async (kbId: string): Promise<void> => {
    await apiCall(`/libraries/create`, {
      method: 'POST',
      body: JSON.stringify({ kbId }),
    });
  }, [apiCall]);

  const deleteLibrary = useCallback(async (kbId: string): Promise<void> => {
    await apiCall(`/libraries/${kbId}`, {
      method: 'DELETE',
    });
  }, [apiCall]);

  return {
    cards, notes, loading, error,
    fetchCards, fetchCard, createCard, updateCard, deleteCard, boostCard, searchCards,
    fetchNotes, createNote, updateNote, reviewNote, deleteNote,
    runArchiveLint, executeArchive, fetchArchiveReview, fetchArchivedCards,
    fetchStats,
    fetchSources, fetchSource,
    fetchLibraries, switchLibrary, createLibrary, deleteLibrary,
  };
}
