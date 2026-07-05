import React, { useEffect, useState, useCallback } from 'react';
import { Bot, Wifi, WifiOff, BookOpen, RefreshCw, Play, Square } from 'lucide-react';

const API_BASE = 'http://localhost:3000/api/qq';

interface QQAccount {
  selfId: number;
  nickname: string;
  connectedAt: number;
  online: boolean;
}

interface QQStatus {
  initialized: boolean;
  running: boolean;
  accounts: QQAccount[];
}

interface WeeklyReport {
  generatedAt: string;
  weakestConcepts: { title: string; confidence: number }[];
}

export default function QQBotCard() {
  const [status, setStatus] = useState<QQStatus | null>(null);
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
 const [actionLoading, setActionLoading] = useState(false);
 const [actionError, setActionError] = useState<string | null>(null);
 const [qrcodeImg, setQrcodeImg] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [statusRes, reportRes] = await Promise.all([
        fetch(`${API_BASE}/status`),
        fetch(`${API_BASE}/report/weekly`),
      ]);
      if (statusRes.ok) setStatus(await statusRes.json());
      if (reportRes.ok) setReport(await reportRes.json());
      setLoading(false);
    } catch {
      setError('获取 QQ Bot 数据失败');
      setLoading(false);
    }
  }, []);

  const startService = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE}/start`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setStatus((prev) => prev ? { ...prev, running: true } : null);
        setActionError(null);
      } else {
        const msg = data.hint
          ? `${data.error}\n\nFix: ${data.hint}`
          : (data.error || '启动失败');
        setActionError(msg);
      }
    } catch {
      setActionError('无法连接到后端 (localhost:3000)\n请确认后端已启动: npx tsx backend/src/server.ts');
    }
    setActionLoading(false);
    fetchData();
  };

  const stopService = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`${API_BASE}/stop`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setStatus((prev) => prev ? { ...prev, running: false, accounts: [] } : null);
        setActionError(null);
      } else {
        setActionError(data.error || '停止失败');
      }
    } catch {
      setActionError('无法连接到后端 (localhost:3000)');
    }
    setActionLoading(false);
   fetchData();
 };

const fetchQRCode = useCallback(async () => {
  try {
    const res = await fetch(`${API_BASE}/qrcode?t=${Date.now()}`);
    setQrcodeImg(res.ok ? `${API_BASE}/qrcode?t=${Date.now()}` : null);
  } catch {
    setQrcodeImg(null);
  }
}, []);

 const isRunning = status?.running;
 const hasOnlineAccount = status?.accounts?.some((a) => a.online);
 const waitingForLogin = isRunning && !hasOnlineAccount;

 useEffect(() => {
   fetchData();
   const interval = setInterval(fetchData, 30000);
   return () => clearInterval(interval);
 }, [fetchData]);

 useEffect(() => {
   if (waitingForLogin) {
     fetchQRCode();
    const interval = setInterval(fetchQRCode, 1000);
    return () => {
       clearInterval(interval);
       setQrcodeImg(null);
     };
   } else {
     setQrcodeImg(null);
   }
 }, [waitingForLogin, fetchQRCode]);

  const toggleSection = (section: string) => {
    setExpanded((prev) => (prev === section ? null : section));
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0c0c0c',
        border: '3px solid #222222',
        boxShadow: '4px 4px 0px #000000',
        fontFamily: 'var(--font-mono), monospace',
        fontSize: '12px',
        color: '#cccccc',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '2px solid #222222',
          backgroundColor: '#000000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bot size={16} style={{ color: 'var(--accent)' }} />
          <span style={{ color: '#d1d5db', fontWeight: 700, fontSize: '13px' }}>
            QQ Bot 监控
          </span>
          {hasOnlineAccount && (
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#22c55e',
                display: 'inline-block',
              }}
            />
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {isRunning ? (
            <button
              onClick={stopService}
              disabled={actionLoading}
              style={{
                background: 'none',
                border: '1px solid #ef4444',
                color: '#ef4444',
                cursor: actionLoading ? 'not-allowed' : 'pointer',
                padding: '2px 8px',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                opacity: actionLoading ? 0.5 : 1,
              }}
              title="停止 QQ 服务"
            >
              <Square size={10} fill="#ef4444" /> 停止
            </button>
          ) : (
            <button
              onClick={startService}
              disabled={actionLoading}
              style={{
                background: 'none',
                border: '1px solid #22c55e',
                color: '#22c55e',
                cursor: actionLoading ? 'not-allowed' : 'pointer',
                padding: '2px 8px',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                opacity: actionLoading ? 0.5 : 1,
              }}
              title="启动 QQ 服务"
            >
              <Play size={10} fill="#22c55e" /> 启动
            </button>
          )}
          <button
            onClick={fetchData}
            style={{
              background: 'none',
              border: '1px solid #333333',
              color: '#888888',
              cursor: 'pointer',
              padding: '2px 6px',
            }}
            title="刷新"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '20px', color: '#666666' }}>
            加载中...
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '10px',
              backgroundColor: 'rgba(255,0,0,0.1)',
              border: '1px solid #ff3333',
              color: '#ff6666',
              marginBottom: '10px',
            }}
          >
            {error}
          </div>
        )}

        {actionError && (
          <div
            style={{
              padding: '10px',
              backgroundColor: 'rgba(255,165,0,0.1)',
              border: '1px solid #ff9933',
              color: '#ff9933',
              marginBottom: '10px',
              fontSize: '11px',
              whiteSpace: 'pre-wrap',
            }}
          >
            {actionError}
          </div>
        )}

       {waitingForLogin && (
         <div
           style={{
             padding: '14px',
             backgroundColor: 'rgba(34,197,94,0.08)',
             border: '1px solid #22c55e',
             color: '#22c55e',
             marginBottom: '10px',
             textAlign: 'center',
           }}
         >
           {qrcodeImg ? (
             <>
               <img
                 src={qrcodeImg}
                 alt="QQ 登录二维码"
                 style={{
                   width: '200px',
                   height: '200px',
                   imageRendering: 'pixelated',
                   display: 'block',
                   margin: '0 auto 10px',
                 }}
               />
               <div style={{ fontSize: '11px', color: '#22c55e' }}>
                 请使用手机 QQ 扫描上方二维码登录
               </div>
             </>
           ) : (
             <div style={{ fontSize: '11px' }}>
               正在等待二维码...
             </div>
           )}
         </div>
       )}

        {/* Connection Status */}
        <SectionHeader
          icon={<Wifi size={12} />}
          label="连接状态"
          expanded={expanded === 'status'}
          onToggle={() => toggleSection('status')}
        />
        {expanded === 'status' && (
          <div style={{ marginBottom: '10px' }}>
            {!status?.accounts?.length ? (
              <div style={{ color: '#666666', padding: '6px 0' }}>无已配置的 QQ 账号连接</div>
            ) : (
              status.accounts.map((acc) => (
                <div
                  key={acc.selfId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 0',
                    borderBottom: '1px solid #1a1a1a',
                  }}
                >
                  {acc.online ? (
                    <Wifi size={12} style={{ color: '#22c55e' }} />
                  ) : (
                    <WifiOff size={12} style={{ color: '#ef4444' }} />
                  )}
                  <span style={{ color: '#d1d5db' }}>{acc.selfId}</span>
                  <span style={{ fontSize: '10px', color: acc.online ? '#22c55e' : '#ef4444' }}>
                    {acc.online ? '在线' : '离线'}
                  </span>
                  {acc.nickname && (
                    <span style={{ fontSize: '10px', color: '#888888' }}>({acc.nickname})</span>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Weak Concepts */}
        <SectionHeader
          icon={<BookOpen size={12} />}
          label="薄弱知识点"
          expanded={expanded === 'weak'}
          onToggle={() => toggleSection('weak')}
        />
        {expanded === 'weak' && (
          <div style={{ marginBottom: '10px' }}>
            {!report || report.weakestConcepts.length === 0 ? (
              <div style={{ color: '#666666', padding: '6px 0' }}>暂无数据</div>
            ) : (
              report.weakestConcepts.map((c) => (
                <div
                  key={c.title}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '3px 0',
                    borderBottom: '1px solid #1a1a1a',
                    fontSize: '11px',
                  }}
                >
                  <span style={{ color: '#dddddd' }}>{c.title}</span>
                  <span style={{ color: '#ff9955' }}>置信度 {c.confidence.toFixed(2)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '8px 14px',
          borderTop: '2px solid #222222',
          fontSize: '10px',
          color: '#555555',
          display: 'flex',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span>自动刷新 (30s)</span>
        {report && <span>更新于 {new Date(report.generatedAt).toLocaleTimeString()}</span>}
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  label,
  expanded,
  onToggle,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  expanded: boolean;
  onToggle: () => void;
  badge?: string;
}) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 4px',
        cursor: 'pointer',
        borderBottom: expanded ? '1px solid var(--accent)' : '1px solid transparent',
        marginBottom: expanded ? '4px' : '0',
        transition: 'border-color 0.15s',
      }}
    >
      <span style={{ color: '#888888', transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'none' }}>
        ▸
      </span>
      <span style={{ color: '#aaaaaa' }}>{icon}</span>
      <span style={{ color: '#cccccc', fontWeight: 600 }}>{label}</span>
      {badge && <span style={{ fontSize: '10px', color: '#888888', marginLeft: 'auto' }}>{badge}</span>}
    </div>
  );
}
