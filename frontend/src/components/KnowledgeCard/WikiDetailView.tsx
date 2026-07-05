import React, { useEffect, useState } from 'react';
import type { WikiCard, useKnowledgeBase } from '../../hooks/useKnowledgeBase';
import ConfidenceBadge from './ConfidenceBadge';
import { ArrowLeft, Edit3, FileText, Trash2, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

interface Props {
  cardId: string;
  kb: ReturnType<typeof useKnowledgeBase>;
  onBack: () => void;
  onEdit: () => void;
}

export default function WikiDetailView({ cardId, kb, onBack, onEdit }: Props) {
  const [card, setCard] = useState<WikiCard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    kb.fetchCard(cardId).then(c => { setCard(c); setLoading(false); }).catch(() => setLoading(false));
  }, [cardId]);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>加载中...</div>;
  }
  if (!card) {
    return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--error)' }}>卡片未找到</div>;
  }

  const handleBoost = async () => {
    const newScore = await kb.boostCard(card.id);
    if (newScore !== null) {
      setCard({ ...card, confidence_score: newScore, effective_confidence: newScore });
    }
  };

  const lifecycleLabel: Record<string, string> = { immortal: '永生', standard: '标准', decay_fast: '快速衰减' };

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        <button onClick={onBack} className="btn-premium btn-secondary" style={{ padding: '6px 10px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ArrowLeft size={12} /> 返回
        </button>
        <button onClick={onEdit} className="btn-premium btn-secondary" style={{ padding: '6px 10px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Edit3 size={12} /> 编辑
        </button>
        <button onClick={handleBoost} className="btn-premium" style={{ padding: '6px 10px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Zap size={12} /> 提升置信度
        </button>
        <button
          onClick={async () => {
            if (!confirm('确定将这张知识卡片转为整理笔记？笔记将出现在「整理笔记」标签页中。')) return;
            try {
              await kb.createNote({
                title: card.title,
                body: card.body,
                tags: card.tags,
                lifecycle: card.lifecycle,
              });
              alert('已转为整理笔记！');
            } catch (e: any) {
              alert('转换失败：' + e.message);
            }
          }}
          className="btn-premium btn-secondary"
          style={{ padding: '6px 10px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <FileText size={12} /> 转为笔记
        </button>
        <button
          onClick={async () => {
            if (!confirm('确定要删除「' + card.title + '」？此操作不可撤销。')) return;
            try {
              await kb.deleteCard(card.id);
              onBack();
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

      {/* Metadata */}
      <div style={{
        padding: '14px', backgroundColor: '#000000', border: '2px solid #222222', marginBottom: '14px',
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#d1d5db', margin: '0 0 10px 0' }}>{card.title}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
          <div><span style={{ color: 'var(--text-muted)' }}>生命周期:</span> <span style={{ color: 'var(--secondary)' }}>{lifecycleLabel[card.lifecycle] || card.lifecycle}</span></div>
          <div><span style={{ color: 'var(--text-muted)' }}>衰减率:</span> <span style={{ color: '#d1d5db' }}>{card.decay_rate}</span></div>
          <div><span style={{ color: 'var(--text-muted)' }}>创建时间:</span> <span style={{ color: '#d1d5db' }}>{new Date(card.created_at).toLocaleDateString()}</span></div>
          <div><span style={{ color: 'var(--text-muted)' }}>最近交互:</span> <span style={{ color: '#d1d5db' }}>{new Date(card.last_interacted).toLocaleDateString()}</span></div>
        </div>
        <div style={{ marginTop: '10px' }}>
          <ConfidenceBadge score={card.effective_confidence} />
        </div>
      </div>

      {/* Body */}
      <div className="wiki-markdown" style={{
        padding: '14px', backgroundColor: '#000000', border: '2px solid #222222',
        color: '#ddd',
      }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
          {card.body}
        </ReactMarkdown>
      </div>
    </div>
  );
}
