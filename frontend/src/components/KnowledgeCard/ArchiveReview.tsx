import React, { useEffect, useState } from 'react';
import { useKnowledgeBase } from '../../hooks/useKnowledgeBase';
import { Archive, AlertTriangle, Shield, RefreshCw } from 'lucide-react';

interface Props {
  kb: ReturnType<typeof useKnowledgeBase>;
  onBack: () => void;
}

export default function ArchiveReview({ kb, onBack }: Props) {
  const [reviewContent, setReviewContent] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Array<{ filename: string; title: string; confidence: number }>>([]);
  const [vetoList, setVetoList] = useState<Set<string>>(new Set());
  const [executing, setExecuting] = useState(false);
  const [linting, setLinting] = useState(false);
  const [result, setResult] = useState<{ moved: number; linksRewritten: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLint = async () => {
    setLinting(true);
    setError(null);
    try {
      const review = await kb.runArchiveLint();
      setCandidates(review.candidates);
      setReviewContent(review.raw_markdown);
      const saved = review.candidates.map(c => c.filename);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLinting(false);
    }
  };

  const loadReview = async () => {
    const content = await kb.fetchArchiveReview();
    setReviewContent(content);
  };

  useEffect(() => { loadReview(); }, []);

  const toggleVeto = (filename: string) => {
    setVetoList(prev => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  };

  const handleExecute = async () => {
    setExecuting(true);
    setError(null);
    try {
      const vetoArray = Array.from(vetoList);
      const res = await kb.executeArchive(vetoArray.length > 0 ? vetoArray : undefined);
      setResult(res);
      setCandidates([]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        <button onClick={onBack} className="btn-premium btn-secondary" style={{ padding: '6px 10px', fontSize: '10px' }}>返回</button>
        <button onClick={handleLint} disabled={linting} className="btn-premium" style={{ padding: '6px 10px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <RefreshCw size={12} /> {linting ? '扫描中...' : '运行归档扫描'}
        </button>
        {candidates.length > 0 && (
          <button onClick={handleExecute} disabled={executing} className="btn-premium btn-secondary" style={{ padding: '6px 10px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', borderColor: 'var(--error)', color: 'var(--error)' }}>
            <Archive size={12} /> {executing ? '执行中...' : `归档 ${candidates.length - vetoList.size} 项`}
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: '8px 12px', backgroundColor: '#000', border: '2px solid var(--error)', marginBottom: '14px', fontSize: '11px', color: 'var(--error)' }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{
          padding: '14px', backgroundColor: '#000', border: '2px solid var(--success)', marginBottom: '14px',
          fontSize: '12px', color: 'var(--success)',
        }}>
          <Shield size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
          归档完成: 移动了 {result.moved} 个文件, 重写了 {result.linksRewritten} 个链接
        </div>
      )}

      {!candidates.length && !reviewContent && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '12px' }}>
          <AlertTriangle size={24} style={{ marginBottom: '10px', color: '#555' }} />
          <p>尚未运行归档扫描。点击"运行归档扫描"检查需要归档的知识卡片。</p>
        </div>
      )}

      {!candidates.length && reviewContent && (
        <div style={{
          padding: '14px', backgroundColor: '#000', border: '2px solid #222',
          fontSize: '12px', lineHeight: '1.7', whiteSpace: 'pre-wrap', color: '#888',
          fontFamily: 'var(--font-mono)',
        }}>
          {reviewContent}
        </div>
      )}

      {candidates.length > 0 && (
        <div>
          <p style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: '10px' }}>
            勾选 = 否决归档 (保留卡片)。未勾选的卡片将移入 archive/ 目录。
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {candidates.map(c => (
              <label key={c.filename} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', backgroundColor: '#111111', border: '2px solid #222',
                cursor: 'pointer', fontSize: '12px',
              }}>
                <input
                  type="checkbox"
                  checked={vetoList.has(c.filename)}
                  onChange={() => toggleVeto(c.filename)}
                  style={{ accentColor: 'var(--secondary)' }}
                />
                <span style={{ flex: 1, color: '#fff' }}>{c.title}</span>
                <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--error)' }}>
                  置信度: {c.confidence.toFixed(2)}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
