import React from 'react';

interface Props {
  score: number;
}

export default function ConfidenceBadge({ score }: Props) {
  const pct = Math.round(score * 100);
  let color: string;
  let label: string;

  if (score >= 0.7) {
    color = 'var(--success)';
    label = `${pct}% 置信度`;
  } else if (score >= 0.3) {
    color = 'var(--secondary)';
    label = `${pct}% 置信度`;
  } else {
    color = 'var(--error)';
    label = `${pct}% - 待归档`;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div
        style={{
          width: '100px',
          height: '10px',
          backgroundColor: '#111111',
          border: '1px solid #222222',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            backgroundColor: color,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: color }}>
        {label}
      </span>
    </div>
  );
}
