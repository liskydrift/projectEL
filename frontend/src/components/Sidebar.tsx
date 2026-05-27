import { MessageSquare, Layers, BookOpen, Settings, Cpu, Bot } from 'lucide-react';
import { useWorkspace } from '../contexts/WorkspaceContext';

export default function Sidebar() {
  const { activeCards, toggleCard, setActiveDrawer } = useWorkspace();

  const cards = [
    { id: 'chat', label: '聊天', icon: MessageSquare, color: 'var(--secondary)' },
    { id: 'canvas', label: '画布', icon: Layers, color: 'var(--primary)' },
    { id: 'knowledge', label: '知识库', icon: BookOpen, color: 'var(--accent)' },
    { id: 'qqbot', label: 'QQ Bot', icon: Bot, color: 'var(--accent)' }
  ];

  return (
    <div 
      style={{
        width: '72px',
        height: '100%',
        backgroundColor: '#0c0c0c',
        borderRight: '3px solid #222222',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '20px 0',
        gap: '24px',
        flexShrink: 0,
        zIndex: 100
      }}
    >
      {/* Top Logo */}
      <div 
        style={{
          width: '42px',
          height: '42px',
          backgroundColor: '#000000',
          border: '2px solid #ffffff',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          color: '#ffffff',
          fontWeight: 900,
          fontFamily: 'var(--font-mono)',
          fontSize: '16px',
          boxShadow: '2px 2px 0px #000000',
          cursor: 'default',
          marginBottom: '12px'
        }}
        title="Socrates Learning Workspace"
      >
        <Cpu size={20} style={{ color: 'var(--primary)' }} />
      </div>

      {/* Middle Card Toggles */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, justifyContent: 'center' }}>
        {cards.map((c) => {
          const isActive = activeCards.includes(c.id);
          const Icon = c.icon;

          return (
            <button
              key={c.id}
              onClick={() => toggleCard(c.id)}
              style={{
                width: '46px',
                height: '46px',
                backgroundColor: isActive ? '#000000' : 'transparent',
                border: isActive ? `2px solid ${c.color}` : '2px solid #222222',
                color: isActive ? c.color : '#555555',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                cursor: 'pointer',
                position: 'relative',
                transition: 'all 0.15s ease',
                boxShadow: isActive ? `3px 3px 0px ${c.color}` : 'none',
                transform: isActive ? 'translate(-2px, -2px)' : 'none'
              }}
              title={`${isActive ? '隐藏' : '显示'} ${c.label}卡片`}
            >
              <Icon size={20} />
              {/* Active dot */}
              {isActive && (
                <div 
                  style={{
                    position: 'absolute',
                    top: '-3px',
                    right: '-3px',
                    width: '8px',
                    height: '8px',
                    backgroundColor: c.color,
                    border: '1px solid #000000'
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Global Settings Toggle */}
      <button
        onClick={() => setActiveDrawer('settings')}
        style={{
          width: '46px',
          height: '46px',
          backgroundColor: '#000000',
          border: '2px solid #ffffff',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          cursor: 'pointer',
          boxShadow: '3px 3px 0px #000000',
          transition: 'all 0.15s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translate(-2px, -2px)';
          e.currentTarget.style.boxShadow = '5px 5px 0px #000000';
          e.currentTarget.style.borderColor = 'var(--secondary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.boxShadow = '3px 3px 0px #000000';
          e.currentTarget.style.borderColor = '#ffffff';
        }}
        title="模型与 API 配置"
      >
        <Settings size={20} />
      </button>
    </div>
  );
}
