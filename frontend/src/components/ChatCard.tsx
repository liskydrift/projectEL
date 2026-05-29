import React, { useRef, useEffect } from 'react';
import { Cpu, Send, Paperclip, XCircle, X, Trash2, Plus } from 'lucide-react';
import { useChat } from '../contexts/ChatContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import MarkdownMessage from './MarkdownMessage';

export default function ChatCard() {
  const {
    messages,
    inputText,
    setInputText,
    isStreaming,
    activeModel,
    thinkingLevel,
    selectedImages,
    sessionId,
    sessions,
    presets,
    activePresetId,
    sendMessage,
    abort,
    clearSession,
    uploadImage,
    removeImage,
    switchSession,
    createSession,
    deleteSession
  } = useChat();

  const { toggleCard } = useWorkspace();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div 
      className="glass-panel" 
      style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        overflow: 'hidden',
        height: '100%',
        backgroundColor: '#0c0c0c',
        border: '3px solid #222222',
        boxShadow: '4px 4px 0px #000000',
        transform: 'none' // Override hover translation for the full workspace layout stability
      }}
    >
      {/* Card Header (Drag Handle) */}
      <div 
        className="card-drag-header"
        style={{ 
          padding: '12px 16px', 
          borderBottom: '3px solid #222222', 
          backgroundColor: '#000000',
          cursor: 'grab'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '14px', fontWeight: 900, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: '#ffffff' }}>
              💬 Socrates Learning Console
            </h2>
            <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              <span>模型: <strong style={{ color: 'var(--secondary)' }}>{activeModel}</strong></span>
              <span>思考: <strong style={{ color: 'var(--primary)' }}>{thinkingLevel}</strong></span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={clearSession}
              disabled={isStreaming}
              style={{
                width: '24px',
                height: '24px',
                backgroundColor: '#000000',
                border: '2px solid #222222',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                cursor: isStreaming ? 'not-allowed' : 'pointer',
                opacity: isStreaming ? 0.5 : 1,
                transition: 'all 0.1s ease'
              }}
              onMouseEnter={(e) => {
                if (!isStreaming) {
                  e.currentTarget.style.borderColor = 'var(--secondary)';
                  e.currentTarget.style.color = 'var(--secondary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isStreaming) {
                  e.currentTarget.style.borderColor = '#222222';
                  e.currentTarget.style.color = '#ffffff';
                }
              }}
              title="清空当前对话历史"
            >
              <Trash2 size={14} />
            </button>
            {isStreaming ? (
              <button 
                onClick={abort} 
                style={{ 
                  background: 'transparent', 
                  border: 'none', 
                  cursor: 'pointer', 
                  color: 'var(--error)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '4px', 
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 'bold'
                }}
              >
                <XCircle size={14} /> 中断
              </button>
            ) : (
              <button
                onClick={() => toggleCard('chat')}
                style={{
                  width: '24px',
                  height: '24px',
                  backgroundColor: '#000000',
                  border: '2px solid #222222',
                  color: '#ffffff',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.1s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--error)';
                  e.currentTarget.style.color = 'var(--error)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#222222';
                  e.currentTarget.style.color = '#ffffff';
                }}
                title="隐藏聊天窗口"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Multi-Session & Presets Controls */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
          {/* Preset Selector */}
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>预设:</span>
          <select 
            value={activePresetId || ''} 
            onChange={(e) => {
              const val = e.target.value;
              createSession(val || undefined);
            }}
            style={{
              backgroundColor: '#000000',
              border: '2px solid #333333',
              color: '#ffffff',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              padding: '2px 4px',
              borderRadius: '0',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="">(无预设)</option>
            {presets.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          
          {/* Session Switcher */}
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>会话:</span>
          <select 
            value={sessionId} 
            onChange={(e) => switchSession(e.target.value)}
            style={{
              backgroundColor: '#000000',
              border: '2px solid #333333',
              color: '#ffffff',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              padding: '2px 4px',
              borderRadius: '0',
              outline: 'none',
              cursor: 'pointer',
              maxWidth: '150px'
            }}
          >
            {sessions.map(s => (
              <option key={s.id} value={s.id}>{s.name || s.id}</option>
            ))}
          </select>

          {/* New Session Button */}
          <button
            onClick={() => createSession(activePresetId || undefined)}
            style={{
              backgroundColor: '#000000',
              border: '2px solid #333333',
              color: '#ffffff',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              padding: '2px 6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              boxShadow: '1px 1px 0px #ffffff'
            }}
            title="新建当前预设会话"
          >
            <Plus size={10} /> 新建
          </button>

          {/* Delete Session Button */}
          {sessions.length > 1 && sessionId !== 'default-session' && (
            <button
              onClick={() => deleteSession(sessionId)}
              style={{
                backgroundColor: '#000000',
                border: '2px solid var(--error)',
                color: 'var(--error)',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                padding: '2px 6px',
                cursor: 'pointer',
                boxShadow: '1px 1px 0px var(--error)'
              }}
              title="删除当前会话"
            >
              删除
            </button>
          )}
        </div>
      </div>

      {/* Messages List */}
      <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {messages.length === 0 && (
          <div style={{ margin: 'auto', textAlign: 'center', maxWidth: '340px', color: 'var(--text-muted)', padding: '20px' }}>
            <Cpu size={32} style={{ color: 'var(--primary)', marginBottom: '12px' }} />
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', lineHeight: '1.6' }}>
              欢迎来到 AI 学习控制台！您在此处可以同 Socrates 智能体直接对话。上传图像将触发 Qwen 识图子智能体进行前端细节识别，之后主模型会据此作出解答。
            </p>
          </div>
        )}
        {messages.map((m) => {
          const isUser = m.role === 'user';
          const isTool = m.role === 'toolCall' || m.role === 'toolResult';
          const isSubagent = m.role === 'custom' && m.customType && m.customType.startsWith('subagent-');

          if (isSubagent) {
            const status = m.customType === 'subagent-status' ? 'working' : m.customType === 'subagent-result' ? 'done' : 'error';
            const color = status === 'working' ? 'var(--secondary)' : status === 'done' ? 'var(--success)' : 'var(--error)';
            
            return (
              <div key={m.id} style={{ alignSelf: 'flex-start', maxWidth: '90%', display: 'flex', flexDirection: 'column', margin: '6px 0' }}>
                <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  🤖 子智能体 (QWEN VISION AGENT)
                </span>
                <div 
                  style={{
                    padding: '12px',
                    backgroundColor: '#000000',
                    border: `2px solid ${color}`,
                    boxShadow: `3px 3px 0px ${color}`,
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap',
                    color: '#ffffff'
                  }}
                >
                  {m.text}
                </div>
              </div>
            );
          }

          return (
            <div 
              key={m.id} 
              style={{ 
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '90%',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              {/* Message Header */}
              <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: '4px', textAlign: isUser ? 'right' : 'left' }}>
                {m.role === 'user' ? 'YOU' : m.role === 'assistant' ? 'SOCRATES AGENT' : 'SYSTEM'}
              </span>
              
              {/* Message Content */}
              <div 
                style={{
                  padding: '12px 14px',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                  backgroundColor: isUser ? '#000000' : '#111111',
                  border: isUser 
                    ? '2px solid var(--secondary)' 
                    : isTool 
                      ? '2px dashed #333333'
                      : '2px solid #222222',
                  boxShadow: isUser 
                    ? '3px 3px 0px var(--secondary)' 
                    : isTool 
                      ? 'none'
                      : '3px 3px 0px #000000',
                  color: isTool 
                    ? (m.isError ? 'var(--error)' : 'var(--secondary)')
                    : 'var(--text-main)'
                }}
              >
                {m.role === 'assistant' ? <MarkdownMessage text={m.text} /> : m.text}
                {isStreaming && !isUser && m.role === 'assistant' && <span className="typing-cursor"></span>}
                
                {/* User Attachment Images */}
                {isUser && m.images && m.images.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                    {m.images.map((img, idx) => (
                      <img 
                        key={idx} 
                        src={`data:${img.mimeType};base64,${img.data}`} 
                        alt="uploaded" 
                        style={{ 
                          maxWidth: '100%', 
                          maxHeight: '140px', 
                          border: '2px solid #222222',
                          boxShadow: '3px 3px 0px #000000' 
                        }} 
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Section */}
      <div 
        style={{ 
          borderTop: '3px solid #222222', 
          padding: '14px 16px', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '8px',
          backgroundColor: '#000000'
        }}
      >
        {/* Upload previews */}
        {selectedImages.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingBottom: '6px' }}>
            {selectedImages.map((img, idx) => (
              <div key={idx} style={{ position: 'relative', display: 'inline-block' }}>
                <img 
                  src={img.previewUrl} 
                  alt="preview" 
                  style={{ width: '48px', height: '48px', objectFit: 'cover', border: '2px solid #222222' }} 
                />
                <button 
                  type="button"
                  onClick={() => removeImage(idx)}
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-6px',
                    background: 'var(--error)',
                    border: '1px solid #000000',
                    width: '16px',
                    height: '16px',
                    color: '#000000',
                    fontSize: '10px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={sendMessage} style={{ display: 'flex', gap: '8px', width: '100%' }}>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={uploadImage} 
            accept="image/*" 
            multiple 
            style={{ display: 'none' }} 
          />

          {/* Paperclip Button */}
          <button 
            type="button" 
            onClick={() => fileInputRef.current?.click()}
            className="btn-premium btn-secondary" 
            style={{ 
              padding: '12px', 
              boxShadow: 'none',
              border: '2px solid #222222'
            }}
          >
            <Paperclip size={16} />
          </button>

          {/* Text Input */}
          <input 
            type="text" 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isStreaming}
            placeholder={isStreaming ? "正在推理分析中..." : "向智能体提问（可附加图片）..."}
            className="input-premium"
            style={{ flex: 1, fontSize: '12px' }}
          />

          {/* Send Button */}
          <button type="submit" disabled={isStreaming} className="btn-premium">
            <Send size={14} />
          </button>
        </form>
      </div>
    </div>
  );
}
