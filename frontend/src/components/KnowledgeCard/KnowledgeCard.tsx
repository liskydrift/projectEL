import React, { useEffect, useRef, useState } from 'react';
import type { WikiCard } from '../../hooks/useKnowledgeBase';
import { useKnowledgeBase } from '../../hooks/useKnowledgeBase';
import ConfidenceBadge from './ConfidenceBadge';
import WikiDetailView from './WikiDetailView';
import WikiFormView from './WikiFormView';
import ArchiveReview from './ArchiveReview';
import { Search, Plus, Archive, RefreshCw, BookOpen } from 'lucide-react';

type View = 'list' | 'detail' | 'form' | 'archive' | 'search';

export default function KnowledgeCard({ onClose }: { onClose: () => void }) {
  const kb = useKnowledgeBase();
  const [view, setView] = useState<View>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<WikiCard[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { kb.fetchCards(); }, []);

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
            <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', margin: 0, fontFamily: 'var(--font-sans)' }}>
              {card.title}
            </h3>
            <span style={{
              fontSize: '9px',
              fontFamily: 'var(--font-mono)',
              color: lifecycleColor(card.lifecycle),
              padding: '2px 6px',
              border: `1px solid ${lifecycleColor(card.lifecycle)}`,
            }}>
              {lifecycleLabel(card.lifecycle)}
            </span>
          </div>
          <ConfidenceBadge score={card.effective_confidence} />
        </div>
      ))}
      {items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '12px' }}>
          知识库为空。点击 "+ 新建" 创建第一条知识卡片。
        </div>
      )}
    </div>
  );

  return (
    <div className="glass-panel" style={{
      flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%',
      backgroundColor: '#0c0c0c', border: '3px solid #222222', boxShadow: '4px 4px 0px #000000',
    }}>
      {/* Header */}
      <div className="card-drag-header" style={{
        padding: '14px 16px', borderBottom: '3px solid #222222',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        backgroundColor: '#000000', cursor: 'grab',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BookOpen size={16} color="var(--accent)" />
          <h2 style={{ fontSize: '15px', fontWeight: 900, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: '#ffffff', margin: 0 }}>
            知识库
          </h2>
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            {kb.cards.length} 卡片
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {view !== 'list' && (
            <button onClick={() => { setView('list'); setSearchQuery(''); setSearchResults([]); }}
              className="btn-premium btn-secondary" style={{ padding: '6px 10px', fontSize: '10px' }}>
              返回
            </button>
          )}
          <button onClick={() => { setSelectedId(null); setView('form'); }}
            className="btn-premium" style={{ padding: '6px 10px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Plus size={12} /> 新建
          </button>
          <button onClick={() => setView('archive')}
            className="btn-premium btn-secondary" style={{ padding: '6px 10px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Archive size={12} /> 归档
          </button>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px' }}>
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
        {/* Search */}
        {view === 'list' && (
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
                  flex: 1, background: 'none', border: 'none', color: '#fff',
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

        {view === 'list' && renderCardGrid(kb.cards)}
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
      </div>
    </div>
  );
}
