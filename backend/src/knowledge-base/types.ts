export type Lifecycle = 'immortal' | 'standard' | 'decay_fast';

export interface WikiCard {
  id: string;
  title: string;
  lifecycle: Lifecycle;
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
  lifecycle: Lifecycle;
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
  lifecycle: Lifecycle;
  body: string;
  tags?: string[];
}

export interface UpdateCardInput {
  title?: string;
  lifecycle?: Lifecycle;
  body?: string;
  tags?: string[];
}

export interface CreateNoteInput {
  title: string;
  body: string;
  tags?: string[];
  lifecycle?: Lifecycle;
}

export interface UpdateNoteInput {
  title?: string;
  body?: string;
  tags?: string[];
  lifecycle?: Lifecycle;
}

export interface ArchiveCandidate {
  filename: string;
  title: string;
  confidence: number;
  filePath: string;
}

export interface ArchiveReviewContent {
  generatedAt: string;
  candidates: ArchiveCandidate[];
  raw_markdown: string;
}

export interface SourceFile {
  filename: string;
  title: string;
  content: string;
  size: number;
  lastModified: string;
}
