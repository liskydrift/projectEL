import React, { useRef, useState } from 'react';
import type { WikiCard, CuratedNote } from '../../hooks/useKnowledgeBase';
import { useKnowledgeBase } from '../../hooks/useKnowledgeBase';
import ConfidenceBadge from './ConfidenceBadge';
import WikiDetailView from './WikiDetailView';
import WikiFormView from './WikiFormView';
import ArchiveReview from './ArchiveReview';
import { Search, Plus, Archive, RefreshCw, BookOpen, FileText, ChevronLeft, Trash2 } from 'lucide-react';

type View = 'list' | 'detail' | 'form' | 'archive' | 'search' | 'sources';

export default function KnowledgeCard({ onClose }: { onClose: () => void }) {
  const kb = useKnowledgeBase();
  const [view, setView] = useState<View>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<WikiCard[]>([]);
  const [sources, setSources] = useState<{ filename: string; title: string; size: number; lastModified: string }[]>([]);
  const [sourceContent, setSourceContent] = useState<{ content: string; title: string } | null>(null);
  const [noteSearchQuery, setNoteSearchQuery] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const [tabView, setTabView] = useState<'cards' | 'notes'>('notes');



  const ensureNotes = () => {
    if (kb.notes.length === 0) kb.fetchNotes();
  };

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) {
      setSearchResults([]);
      setView('list');
      return;
    }
    searchTimer.current = setTimeout(async () => {
      const results = await kb.searchCards(q);
      setSearchResults(results);
      setView('search');
    }, 300);
  };

  const filteredNotes = noteSearchQuery.trim()
    ? kb.notes.filter(n =>
        n.title.toLowerCase().includes(noteSearchQuery.toLowerCase()) ||
        (n.tags || []).some(t => t.toLowerCase().includes(noteSearchQuery.toLowerCase()))
      )
    : kb.notes;

  const selectedNote = selectedNoteId ? kb.notes.find(n => n.id === selectedNoteId) : null;

  const lifecycleColor = (l: string) => {
    switch (l) {
      case 'immortal': return 'var(--success)';
      case 'standard': return 'var(--secondary)';
      case 'decay_fast': return 'var(--error)';
      default: return '#888';
    }
  };

  const lifecycleLabel = (l: string) => {
    switch (l) {
      case 'immortal': return '永生';
      case 'standard': return '标准';
      case 'decay_fast': return '快速衰减';
      default: return l;
    }
  };

  const renderCardGrid = (items: WikiCard[]) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {items.map(card => (
        <div
          key={card.id}
          onClick={() => { setSelectedId(card.id); setView('detail'); }}
          style={{
            padding: '12px 14px',
            backgroundColor: '#111111',
            border: '2px solid #222222',
            cursor: 'pointer',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--secondary)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#222222'; }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#d1d5db', margin: 0, fontFamily: 'var(--font-sans)' }}>
              {card.title}
            </h3>
            <span style={{
              fontSize: '9px',
              fontFamily: 'var(--font-mono)',
              color: lifecycleColor(card.lifecycle),
              padding: '2px 6px',
              border: '1px solid ' + lifecycleColor(card.lifecycle),
            }}>
              {lifecycleLabel(card.lifecycle)}
            </span>
          </div>
          <ConfidenceBadge score={card.effective_confidence} />
        </div>
      ))}
      {items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '12px' }}>
          知识库为空。点击"+ 新建" 创建第一条知识卡片。
        </div>
      )}
    </div>
  );

  const renderNoteDetail = (note: CuratedNote) => (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button
          onClick={() => setSelectedNoteId(null)}
          className="btn-premium btn-secondary"
          style={{ padding: '6px 10px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <ChevronLeft size={12} /> 返回列表
        </button>
        <button
          onClick={async () => {
            if (!confirm('确定将这条整理笔记转为知识卡片？卡片将出现在「知识卡片」标签页中。')) return;
            try {
              await kb.createCard({
                title: note.title,
                body: note.body,
                tags: note.tags,
                lifecycle: note.lifecycle,
              });
              alert('已转为知识卡片！');
            } catch (e: any) {
              alert('转换失败：' + e.message);
            }
          }}
          className="btn-premium btn-secondary"
          style={{ padding: '6px 10px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <FileText size={12} /> 转为知识卡片
        </button>
        <button
          onClick={async () => {
            if (!confirm('确定要删除「' + note.title + '」？此操作不可撤销。')) return;
            try {
              await kb.deleteNote(note.id);
              setSelectedNoteId(null);
            } catch (e: any) {
              alert('删除失败：' + e.message);
            }
          }}
          className="btn-premium btn-secondary"
          style={{ padding: '6px 10px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', borderColor: 'var(--error)', color: 'var(--error)' }}
        >
          <Trash2 size={12} /> 删除
        </button>
      </div>
      <div style={{
        padding: '14px', backgroundColor: '#111111',
        border: '2px solid #222222', marginBottom: '10px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#d1d5db', margin: 0, fontFamily: 'var(--font-sans)' }}>
            {note.title}
          </h3>
          <span style={{
            fontSize: '10px', fontFamily: 'var(--font-mono)',
            color: lifecycleColor(note.lifecycle),
            padding: '2px 6px', border: '1px solid ' + lifecycleColor(note.lifecycle),
          }}>
            {lifecycleLabel(note.lifecycle)}
          </span>
        </div>
        {note.tags && note.tags.length > 0 && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
            {note.tags.map((tag, i) => (
              <span key={i} style={{
                fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
                padding: '1px 5px', border: '1px solid #333',
              }}>
                {tag}
              </span>
            ))}
          </div>
        )}
        <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: '10px' }}>
          稳定性 {note.stability} · 难度 {note.difficulty} · 已复习 {note.reps} 次 · 下次复习 {new Date(note.next_review).toLocaleDateString('zh-CN')}
        </div>
      </div>
      <div style={{
        backgroundColor: '#0a0a0a', padding: '14px', fontSize: '12px',
        fontFamily: 'var(--font-mono)', color: '#cccccc', whiteSpace: 'pre-wrap',
        border: '2px solid #222222', maxHeight: '400px', overflow: 'auto', lineHeight: '1.6',
      }}>
        {note.body}
      </div>
    </div>
  );

  const renderNotesList = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {filteredNotes.map(note => (
        <div
          key={note.id}
          onClick={() => setSelectedNoteId(note.id)}
          style={{
            padding: '12px 14px',
            backgroundColor: '#111111',
            border: '2px solid #222222',
            cursor: 'pointer',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#222222'; }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#d1d5db', margin: 0, fontFamily: 'var(--font-sans)' }}>
              {note.title}
            </h3>
            <span style={{
              fontSize: '9px',
              fontFamily: 'var(--font-mono)',
              color: lifecycleColor(note.lifecycle),
              padding: '2px 6px',
              border: '1px solid ' + lifecycleColor(note.lifecycle),
            }}>
              {lifecycleLabel(note.lifecycle)}
            </span>
          </div>
          {note.tags && note.tags.length > 0 && (
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
              {note.tags.map((tag, i) => (
                <span key={i} style={{
                  fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
                  padding: '1px 5px', border: '1px solid #333',
                }}>
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              稳定性 {note.stability} · 难度 {note.difficulty} · 复习 {note.reps} 次
            </div>
            <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--accent)', cursor: 'pointer' }}>
              查看详情 →
            </div>
          </div>
        </div>
      ))}
      {filteredNotes.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '12px' }}>
          {noteSearchQuery.trim() ? '没有匹配的笔记。' : '📝 还没有整理笔记。让智能体帮你创建学习卡片，它们会出现在这里。'}
        </div>
      )}
    </div>
  );

  return (
    <div className="glass-panel" style={{
      flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%',
      backgroundColor: '#0c0c0c', border: '3px solid #222222', boxShadow: '4px 4px 0px #000000',
    }}>
      {/* Header with Tabs */}
      <div style={{ borderBottom: '3px solid #222222', backgroundColor: '#000000' }}>
        <div className="card-drag-header" style={{
          padding: '10px 16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'grab',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <BookOpen size={16} color="var(--accent)" />
            <h2 style={{ fontSize: '15px', fontWeight: 900, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: '#d1d5db', margin: 0 }}>
              知识库
            </h2>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={onClose}
              style={{ background: 'none', border: 'none', color: '#d1d5db', cursor: 'pointer', padding: '4px' }}>
              ✕
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', borderTop: '1px solid #1a1a1a' }}>
          <button
            onClick={() => { setTabView('cards'); setSelectedNoteId(null); }}
            style={{
              flex: 1, padding: '8px 10px', fontSize: '11px', fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              background: tabView === 'cards' ? '#1a1a1a' : 'transparent',
              border: 'none', borderBottom: tabView === 'cards' ? '2px solid var(--accent)' : '2px solid transparent',
              color: tabView === 'cards' ? '#d1d5db' : '#666',
              cursor: 'pointer',
            }}
          >
            📇 知识卡片 ({kb.cards.length})
          </button>
          <button
            onClick={() => { setTabView('notes'); ensureNotes(); setSelectedNoteId(null); }}
            style={{
              flex: 1, padding: '8px 10px', fontSize: '11px', fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              background: tabView === 'notes' ? '#1a1a1a' : 'transparent',
              border: 'none', borderBottom: tabView === 'notes' ? '2px solid var(--accent)' : '2px solid transparent',
              color: tabView === 'notes' ? '#d1d5db' : '#666',
              cursor: 'pointer',
            }}
          >
            📝 整理笔记 ({kb.notes.length})
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{
        padding: '8px 16px', borderBottom: '2px solid #1a1a1a',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: '#0a0a0a',
      }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            {tabView === 'cards' ? kb.cards.length + ' 张卡片' : kb.notes.length + ' 条笔记'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {tabView === 'cards' && (
            <>
              <button onClick={() => { setSelectedId(null); setView('form'); }}
                className="btn-premium" style={{ padding: '6px 10px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Plus size={12} /> 新建
              </button>
              <button onClick={() => setView('archive')}
                className="btn-premium btn-secondary" style={{ padding: '6px 10px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Archive size={12} /> 归档
              </button>
              <button onClick={async () => { const s = await kb.fetchSources(); setSources(s); setView('sources'); }}
                className="btn-premium btn-secondary" style={{ padding: '6px 10px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <FileText size={12} /> 源文件
              </button>
            </>
          )}
          <button onClick={() => { if (tabView === 'cards') kb.fetchCards(); else kb.fetchNotes(); }}
            className="btn-premium btn-secondary"
            style={{ padding: '6px 10px', fontSize: '10px' }} title="刷新">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '12px 16px', overflowY: 'auto' }}>
        {/* Cards: Search */}
        {tabView === 'cards' && view === 'list' && (
          <div style={{ marginBottom: '14px', display: 'flex', gap: '8px' }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: '8px',
              backgroundColor: '#000000', border: '2px solid #222222', padding: '8px 12px',
            }}>
              <Search size={14} color="#888" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                placeholder="搜索知识库..."
                style={{
                  flex: 1, background: 'none', border: 'none', color: '#d1d5db',
                  fontSize: '12px', fontFamily: 'var(--font-mono)', outline: 'none',
                }}
              />
            </div>
            <button onClick={() => kb.fetchCards()} className="btn-premium btn-secondary"
              style={{ padding: '8px 12px' }} title="刷新">
              <RefreshCw size={14} />
            </button>
          </div>
        )}

        {/* Cards grid */}
        {tabView === 'cards' && view === 'list' && renderCardGrid(kb.cards)}

        {/* Notes: Search + List */}
        {tabView === 'notes' && !selectedNoteId && (
          <div>
            <div style={{ marginBottom: '12px', display: 'flex', gap: '8px' }}>
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: '8px',
                backgroundColor: '#000000', border: '2px solid #222222', padding: '8px 12px',
              }}>
                <Search size={14} color="#888" />
                <input
                  type="text"
                  value={noteSearchQuery}
                  onChange={e => setNoteSearchQuery(e.target.value)}
                  placeholder="搜索笔记标题或标签..."
                  style={{
                    flex: 1, background: 'none', border: 'none', color: '#d1d5db',
                    fontSize: '12px', fontFamily: 'var(--font-mono)', outline: 'none',
                  }}
                />
              </div>
              <button onClick={() => kb.fetchNotes()} className="btn-premium btn-secondary"
                style={{ padding: '8px 12px' }} title="刷新">
                <RefreshCw size={14} />
              </button>
            </div>
            {renderNotesList()}
          </div>
        )}

        {/* Notes: Detail view */}
        {tabView === 'notes' && selectedNoteId && selectedNote && (
          renderNoteDetail(selectedNote)
        )}

        {view === 'search' && (
          <>
            <p style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: '10px' }}>
              搜索结果: {searchResults.length} 条
            </p>
            {renderCardGrid(searchResults)}
          </>
        )}
        {view === 'detail' && selectedId && (
          <WikiDetailView cardId={selectedId} kb={kb}
            onBack={() => setView('list')}
            onEdit={() => setView('form')}
          />
        )}
        {view === 'form' && (
          <WikiFormView
            cardId={selectedId}
            kb={kb}
            onSaved={() => { setView('list'); setSelectedId(null); }}
            onCancel={() => { setView(selectedId ? 'detail' : 'list'); }}
          />
        )}
        {view === 'archive' && (
          <ArchiveReview kb={kb} onBack={() => setView('list')} />
        )}
        {view === 'sources' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                原始资料（Layer 1）— {sources.length} 个文件
              </span>
            </div>
            {sourceContent ? (
              <div>
                <button onClick={() => setSourceContent(null)}
                  className="btn-premium btn-secondary" style={{ padding: '4px 8px', fontSize: '10px', marginBottom: '10px' }}>
                  返回列表
                </button>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#d1d5db', marginBottom: '8px' }}>{sourceContent.title}</h3>
                <pre style={{
                  backgroundColor: '#000000', padding: '16px', fontSize: '12px',
                  fontFamily: 'var(--font-mono)', color: '#cccccc', whiteSpace: 'pre-wrap',
                  border: '2px solid #222222', maxHeight: '500px', overflow: 'auto'
                }}>
                  {sourceContent.content}
                </pre>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {sources.map(s => (
                  <div key={s.filename}
                    onClick={async () => {
                      const sc = await kb.fetchSource(s.filename);
                      setSourceContent(sc);
                    }}
                    style={{
                      padding: '10px 14px', backgroundColor: '#111111',
                      border: '2px solid #222222', cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#222222'; }}
                  >
                    <div>
                      <span style={{ fontSize: '13px', color: '#d1d5db', fontWeight: 600 }}>{s.title}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '8px', fontFamily: 'var(--font-mono)' }}>
                        {s.filename}
                      </span>
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {(s.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                ))}
                {sources.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '12px' }}>
                    sources/ 目录为空。添加原始资料文件以在此处查看。
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
