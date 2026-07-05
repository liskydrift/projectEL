import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'toolCall' | 'toolResult' | string;
  text: string;
  images?: { type: string; data: string; mimeType: string }[];
  attachments?: ChatAttachment[];
  toolName?: string;
  args?: any;
  isError?: boolean;
  customType?: string;
}

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'text' | 'file';
  data?: string;
  text?: string;
  previewUrl?: string;
}

interface KnowledgeReference {
  id: string;
  title: string;
  tags: string[];
  sourceType: 'card' | 'note';
  directory?: string;
  confidence: number;
}

export interface AgentPreset {
  id: string;
  name: string;
  description: string;
  modelConfig: { provider: string; modelId: string; thinkingLevel: string };
  systemPrompt: string;
  temperature: number;
  linkedSkills: string[];
  contextDocs: string[];
}

interface ChatContextProps {
  messages: ChatMessage[];
  inputText: string;
  setInputText: (text: string) => void;
  isStreaming: boolean;
  activeModel: string;
  availableModels: any[];
  providers: any[];
  thinkingLevel: string;
  selectedImages: ChatAttachment[];
  selectedAttachments: ChatAttachment[];
  sessionId: string;
  sessions: any[];
  presets: AgentPreset[];
  activePresetId: string | null;
  sendMessage: (e: React.FormEvent) => void;
  abort: () => void;
  clearSession: () => void;
  uploadAttachment: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploadImage: (e: React.ChangeEvent<HTMLInputElement>) => void;
  removeImage: (index: number) => void;
  removeAttachment: (index: number) => void;
  switchSession: (sessionId: string) => Promise<void>;
  createSession: (name?: string, presetId?: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, name: string) => Promise<void>;
  selectModel: (provider: string, modelId: string, thinkingLevel?: string) => Promise<void>;
  fetchActiveModelConfig: () => Promise<void>;
  fetchSessions: () => Promise<void>;
  fetchPresets: () => Promise<void>;
}

const ChatContext = createContext<ChatContextProps | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeModel, setActiveModel] = useState('获取中...');
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [thinkingLevel, setThinkingLevel] = useState('medium');
  const [selectedAttachments, setSelectedAttachments] = useState<ChatAttachment[]>([]);
  const [sessionId, setSessionId] = useState('default-session');
  const [sessions, setSessions] = useState<any[]>([]);
  const [presets, setPresets] = useState<AgentPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const selectedImages = selectedAttachments.filter(
    (attachment): attachment is ChatAttachment & { kind: 'image'; data: string } =>
      attachment.kind === 'image' && Boolean(attachment.data)
  );

  const socketRef = useRef<Socket | null>(null);
  const mountedRef = useRef(true);
  const sessionIdRef = useRef(sessionId);
  const prevSessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = sessionId;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchActiveModelConfig = async (overrideSessionId?: string) => {
    const sid = overrideSessionId || sessionId;
    try {
      const response = await fetch(`http://localhost:3000/api/models?sessionId=${sid}`);
      const data = await response.json();
      if (data.activeModel) setActiveModel(data.activeModel);
      if (data.thinkingLevel) setThinkingLevel(data.thinkingLevel);
      if (data.models) setAvailableModels(data.models);
      if (data.providers) setProviders(data.providers);
    } catch (err) {
      console.error('Failed to fetch models config:', err);
    }
  };

  const fetchSessions = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/sessions');
      const data = await response.json();
      if (data.sessions) {
        setSessions(data.sessions);
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    }
  };

  const fetchPresets = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/agents');
      const data = await response.json();
      if (data.presets) {
        setPresets(data.presets);
      }
    } catch (err) {
      console.error('Failed to fetch presets:', err);
    }
  };

  // 初始加载
  useEffect(() => {
    fetchSessions();
    fetchPresets();
  }, []);

  // 监听会话变更，更新当前会话模型配置与可用模型列表
  useEffect(() => {
    fetchActiveModelConfig();
  }, [sessionId]);

  // 连接 Socket.io 并监听事件
  useEffect(() => {
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    const socket = io('http://localhost:3000', {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to Backend Socket:', socket.id);
      socket.emit('join-session', { sessionId: sessionIdRef.current });
    });

    socket.on('session-state', (data: { model?: string; thinkingLevel?: string; messages: any[] }) => {
      if (!mountedRef.current) return;
      if (data.model) setActiveModel(data.model);
      if (data.thinkingLevel) setThinkingLevel(data.thinkingLevel);
      
      const history: ChatMessage[] = data.messages.map((m: any, idx: number) => {
        let text = '';
        if (typeof m.content === 'string') text = m.content;
        else if (Array.isArray(m.content)) {
          text = m.content.map((c: any) => c.text || '').join('');
        }
        return {
          id: m.id || String(idx),
          role: m.role,
          text,
          customType: m.customType
        };
      });
      setMessages(history);
    });

    socket.on('pi-event', (event: any) => {
      if (!mountedRef.current) return;

      if (event.type === 'agent_start') {
        setIsStreaming(true);
      } else if (event.type === 'agent_end') {
        setIsStreaming(false);
        // 回合结束后，刷新会话列表获取最新内容/摘要
        fetchSessions();
      } else if (event.type === 'message_start') {
        if (event.message.role === 'toolResult') return;

        const newId = event.message.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        setMessages((prev) => {
          if (prev.some(m => m.id === newId)) return prev;

          if (event.message.role === 'user') {
            const lastUserIdx = [...prev].reverse().findIndex(m => m.role === 'user');
            if (lastUserIdx !== -1) {
              const idx = prev.length - 1 - lastUserIdx;
              return prev.map((m, i) => i === idx ? { ...m, id: newId } : m);
            }
          }

          return [
            ...prev,
            {
              id: newId,
              role: event.message.role,
              text: '',
              customType: event.message.customType
            }
          ];
        });
      } else if (event.type === 'message_end') {
        const msg = event.message;
        if (msg.role === 'user') return;
        if (msg.role === 'toolResult') return;

        if (msg.role === 'assistant') {
          let text = '';
          if (typeof msg.content === 'string') {
            text = msg.content;
          } else if (Array.isArray(msg.content)) {
            text = msg.content.map((c: any) => c.text || '').join('');
          }
          setMessages((prev) => {
            const lastIdx = [...prev].reverse().findIndex(m => m.role === 'assistant');
            if (lastIdx === -1) return prev;
            const idx = prev.length - 1 - lastIdx;
            return prev.map((m, i) => i === idx ? { ...m, text, role: msg.role, customType: msg.customType } : m);
          });
        }
      } else if (event.type === 'message_update') {
        if (event.assistantMessageEvent?.type === 'text_delta') {
          const delta = event.assistantMessageEvent.delta;
          setMessages((prev) => {
            // 找到最后一条assistant消息，不受中间toolCall消息干扰，保证打字机效果
            const lastIdx = [...prev].reverse().findIndex(m => m.role === 'assistant');
            if (lastIdx === -1) return prev;
            const idx = prev.length - 1 - lastIdx;
            return prev.map((m, i) => i === idx ? { ...m, text: m.text + delta } : m);
          });
        }
      } else if (event.type === 'tool_execution_start') {
        setMessages((prev) => {
          if (prev.some(m => m.id === event.toolCallId)) return prev;
          return [
            ...prev,
            {
              id: event.toolCallId,
              role: 'toolCall',
              toolName: event.toolName,
              args: event.args,
              text: `[运行工具] 正在执行 ${event.toolName}...`
            }
          ];
        });
      } else if (event.type === 'tool_execution_end') {
        setMessages((prev) => {
          return prev.map((m) => {
            if (m.id === event.toolCallId) {
              return {
                ...m,
                isError: event.isError,
                text: event.isError 
                  ? `[工具失败] ${m.toolName} 执行出错。`
                  : `[工具成功] ${m.toolName} 执行完毕。`
              };
            }
            return m;
          });
        });
      }
    });

    socket.on('knowledge:context-used', (data: { sessionId: string; references: KnowledgeReference[] }) => {
      if (!mountedRef.current) return;
      if (data.sessionId !== sessionIdRef.current) return;
      if (!data.references?.length) return;

      const titles = data.references
        .slice(0, 5)
        .map((ref, index) => `${index + 1}. ${ref.title}`)
        .join('\n');

      setMessages((prev) => [
        ...prev,
        {
          id: `kb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          role: 'system',
          text: `已检索并注入 ${data.references.length} 条知识库上下文：\n${titles}`,
          customType: 'knowledge-context'
        }
      ]);
    });

    socket.on('pi-error', (data: { message: string }) => {
      if (!mountedRef.current) return;
      alert(`Pi Core Error: ${data.message}`);
      setIsStreaming(false);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, []);

  // SessionId change: emit room join/leave on the existing socket connection
  useEffect(() => {
    const socket = socketRef.current;
    if (socket?.connected) {
      const prev = prevSessionIdRef.current;
      if (prev && prev !== sessionId) {
        socket.emit('leave-session', { sessionId: prev });
      }
      socket.emit('join-session', { sessionId });
    }
    prevSessionIdRef.current = sessionId;
  }, [sessionId]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && selectedAttachments.length === 0) return;
    if (!socketRef.current) return;

    const imagesPayload = selectedImages.map(img => ({
      type: "image",
      data: img.data,
      mimeType: img.mimeType
    }));
    const fileAttachments = selectedAttachments.filter((attachment) => attachment.kind !== 'image');
    const attachmentContext = fileAttachments
      .map((attachment, index) => {
        const header = `[附件 ${index + 1}] ${attachment.name} (${attachment.mimeType || 'unknown'}, ${attachment.size} bytes)`;
        if (attachment.text) {
          return `${header}\n\`\`\`\n${attachment.text}\n\`\`\``;
        }
        return `${header}\n该文件不是可直接读取的文本文件，请根据文件名和类型判断是否需要用户补充内容。`;
      })
      .join('\n\n');
    const outgoingText = attachmentContext
      ? `${inputText.trim() || '请阅读并分析附件。'}\n\n${attachmentContext}`
      : inputText;

    setMessages((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        role: 'user',
        text: inputText,
        images: imagesPayload.length > 0 ? imagesPayload : undefined,
        attachments: fileAttachments.length > 0 ? fileAttachments : undefined
      }
    ]);

    socketRef.current.emit('send-message', { 
      text: outgoingText,
      images: imagesPayload.length > 0 ? imagesPayload : undefined,
      sessionId
    });
    setInputText('');
    setSelectedAttachments(prev => {
      prev.forEach(attachment => { if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl); });
      return [];
    });
  };

  const abort = () => {
    if (socketRef.current) {
      socketRef.current.emit('abort', { sessionId });
    }
  };

  const clearSession = () => {
    if (socketRef.current) {
      socketRef.current.emit('clear-session', { sessionId });
      setMessages([]);
      setSelectedAttachments(prev => {
        prev.forEach(attachment => { if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl); });
        return [];
      });
    }
  };

  const isReadableTextFile = (file: File) => {
    if (file.type.startsWith('text/')) return true;
    const readableExtensions = [
      '.md',
      '.txt',
      '.json',
      '.csv',
      '.tsv',
      '.js',
      '.jsx',
      '.ts',
      '.tsx',
      '.py',
      '.java',
      '.c',
      '.cpp',
      '.h',
      '.hpp',
      '.css',
      '.html',
      '.xml',
      '.yaml',
      '.yml',
      '.toml',
      '.ini',
      '.log'
    ];
    const lowerName = file.name.toLowerCase();
    return readableExtensions.some((extension) => lowerName.endsWith(extension));
  };

  const uploadAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    
    files.forEach(file => {
      const id = `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const mimeType = file.type || 'application/octet-stream';

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const commaIndex = result.indexOf(',');
          const data = result.slice(commaIndex + 1);

          setSelectedAttachments(prev => [
            ...prev,
            {
              id,
              name: file.name,
              size: file.size,
              kind: 'image',
              data,
              mimeType,
              previewUrl: URL.createObjectURL(file)
            }
          ]);
        };
        reader.readAsDataURL(file);
        return;
      }

      if (isReadableTextFile(file) && file.size <= 1024 * 1024) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setSelectedAttachments(prev => [
            ...prev,
            {
              id,
              name: file.name,
              size: file.size,
              kind: 'text',
              text: String(reader.result || ''),
              mimeType
            }
          ]);
        };
        reader.readAsText(file);
        return;
      }

      setSelectedAttachments(prev => [
        ...prev,
        {
          id,
          name: file.name,
          size: file.size,
          kind: 'file',
          mimeType
        }
      ]);
    });
    e.target.value = '';
  };

  const uploadImage = uploadAttachment;

  const removeAttachment = (index: number) => {
    setSelectedAttachments(prev => {
      const updated = [...prev];
      const removed = updated.splice(index, 1)[0];
      if (removed && removed.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return updated;
    });
  };

  const removeImage = removeAttachment;

  const switchSession = async (sId: string) => {
    try {
      const response = await fetch('http://localhost:3000/api/sessions/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sId })
      });
      const data = await response.json();
      if (data.success) {
        setSessionId(sId);
        const activeSession = sessions.find(s => s.id === sId);
        setActivePresetId(activeSession?.preset?.id || null);
        if (data.thinkingLevel) setThinkingLevel(data.thinkingLevel);
        if (data.model) setActiveModel(data.model);
      }
    } catch (err) {
      console.error('Failed to switch session:', err);
      alert('切换会话失败，请检查网络连接或后端服务是否正常。');
    }
  };

  const createSession = async (name?: string, presetId?: string) => {
    try {
      const newSessionId = `session-${Date.now()}`;
      const body: any = { sessionId: newSessionId, presetId };
      if (name && name.trim()) {
        body.name = name.trim();
      }
      const response = await fetch('http://localhost:3000/api/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (data.success) {
        await fetchSessions();
        setSessionId(newSessionId);
        setActivePresetId(presetId || null);
        if (data.thinkingLevel) setThinkingLevel(data.thinkingLevel);
        if (data.model) setActiveModel(data.model);
      }
    } catch (err) {
      console.error('Failed to create session:', err);
      alert('创建会话失败，请检查网络连接或后端服务是否正常。');
    }
  };

  const deleteSession = async (sId: string) => {
    try {
      const response = await fetch(`http://localhost:3000/api/sessions/${sId}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.success) {
        await fetchSessions();
        if (sessionId === sId) {
          // 如果删除了当前 session，切换回默认会话
          setSessionId('default-session');
          setActivePresetId(null);
        }
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
      alert('删除会话失败，请检查网络连接或后端服务是否正常。');
    }
  };

  const renameSession = async (sId: string, name: string) => {
    if (!name.trim()) return;
    try {
      const response = await fetch(`http://localhost:3000/api/sessions/${sId}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() })
      });
      const data = await response.json();
      if (data.success) {
        await fetchSessions();
      } else {
        alert(data.error || '重命名失败');
      }
    } catch (err) {
      console.error('Failed to rename session:', err);
      alert('重命名会话失败，请检查网络连接或后端服务是否正常。');
    }
  };

  const selectModel = async (provider: string, modelId: string, level?: string) => {
    try {
      const response = await fetch('http://localhost:3000/api/models/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, modelId, thinkingLevel: level, sessionId })
      });
      const data = await response.json();
      if (data.success) {
        if (data.activeModel) setActiveModel(data.activeModel);
        if (data.thinkingLevel) setThinkingLevel(data.thinkingLevel);
      }
    } catch (err) {
      console.error('Failed to select model:', err);
    }
  };

  return (
    <ChatContext.Provider value={{
      messages,
      inputText,
      setInputText,
      isStreaming,
      activeModel,
      availableModels,
      providers,
      thinkingLevel,
      selectedImages,
      selectedAttachments,
      sessionId,
      sessions,
      presets,
      activePresetId,
      sendMessage,
      abort,
      clearSession,
      uploadAttachment,
      uploadImage,
      removeImage,
      removeAttachment,
      switchSession,
      createSession,
      deleteSession,
      renameSession,
      selectModel,
      fetchActiveModelConfig,
      fetchSessions,
      fetchPresets
    }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat must be used within a ChatProvider');
  return context;
};
