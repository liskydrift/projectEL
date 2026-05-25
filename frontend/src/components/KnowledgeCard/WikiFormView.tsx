import React, { useEffect, useState } from 'react';
import type { useKnowledgeBase } from '../../hooks/useKnowledgeBase';
import { Save, X } from 'lucide-react';

interface Props {
  cardId: string | null;
  kb: ReturnType<typeof useKnowledgeBase>;
  onSaved: () => void;
  onCancel: () => void;
}

export default function WikiFormView({ cardId, kb, onSaved, onCancel }: Props) {
  const isEdit = cardId !== null;
  const [title, setTitle] = useState('');
  const [lifecycle, setLifecycle] = useState<'immortal' | 'standard' | 'decay_fast'>('standard');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEdit && cardId) {
      kb.fetchCard(cardId).then(card => {
        setTitle(card.title);
        setLifecycle(card.lifecycle);
        setBody(card.body);
        setTags(card.tags.join(', '));
      }).catch(() => {});
    }
  }, [cardId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) { setError('标题和内容不能为空'); return; }
    setSaving(true);
    setError(null);

    try {
      const tagArray = tags.split(',').map(t => t.trim()).filter(Boolean);
      if (isEdit && cardId) {
        await kb.updateCard(cardId, { title: title.trim(), lifecycle, body: body.trim(), tags: tagArray });
      } else {
        await kb.createCard({ title: title.trim(), lifecycle, body: body.trim(), tags: tagArray });
      }
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: '14px', display: 'flex', gap: '8px' }}>
        <button type="submit" disabled={saving} className="btn-premium" style={{ padding: '6px 10px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Save size={12} /> {saving ? '保存中...' : '保存'}
        </button>
        <button type="button" onClick={onCancel} className="btn-premium btn-secondary" style={{ padding: '6px 10px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <X size={12} /> 取消
        </button>
      </div>

      {error && (
        <div style={{ padding: '8px 12px', backgroundColor: '#000', border: '2px solid var(--error)', marginBottom: '14px', fontSize: '11px', color: 'var(--error)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <label style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>标题</label>
          <input
            type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="知识卡片标题"
            className="input-premium"
            style={{ width: '100%', fontSize: '12px', padding: '8px 10px' }}
          />
        </div>

        <div>
          <label style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>生命周期</label>
          <select
            value={lifecycle}
            onChange={e => setLifecycle(e.target.value as any)}
            className="input-premium"
            style={{ width: '100%', fontSize: '12px', padding: '8px 10px', color: '#fff', backgroundColor: '#000' }}
          >
            <option value="immortal">永生 (永不衰减)</option>
            <option value="standard">标准 (半衰期 180天)</option>
            <option value="decay_fast">快速衰减 (半衰期 14天)</option>
          </select>
        </div>

        <div>
          <label style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>标签 (逗号分隔)</label>
          <input
            type="text" value={tags} onChange={e => setTags(e.target.value)}
            placeholder="#数学, #概率论"
            className="input-premium"
            style={{ width: '100%', fontSize: '12px', padding: '8px 10px' }}
          />
        </div>

        <div>
          <label style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>内容 (Markdown)</label>
          <textarea
            value={body} onChange={e => setBody(e.target.value)}
            placeholder="# 标题\n\n知识内容..."
            className="input-premium"
            style={{ width: '100%', minHeight: '200px', fontSize: '12px', padding: '8px 10px', resize: 'vertical', fontFamily: 'var(--font-mono)' }}
          />
        </div>
      </div>
    </form>
  );
}
