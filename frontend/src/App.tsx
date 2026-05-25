import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  useNodesState, 
  useEdgesState, 
  addEdge,
  Node,
  Edge
} from '@xyflow/react';
import { io, Socket } from 'socket.io-client';
import confetti from 'canvas-confetti';

// Import Modular Components
import Sidebar from './components/Sidebar';
import Workspace, { CardLayout } from './components/Workspace';
import SlideDrawer from './components/SlideDrawer';
import SettingsPanel from './components/SettingsPanel';
import ChatCard, { ChatMessage } from './components/ChatCard';
import CanvasCard from './components/CanvasCard';

const initialNodes: Node[] = [
  { 
    id: 'node-1', 
    type: 'bash', 
    position: { x: 100, y: 50 }, 
    data: { command: 'curl -s https://news.ycombinator.com/' } 
  },
  { 
    id: 'node-2', 
    type: 'llm', 
    position: { x: 100, y: 180 }, 
    data: { prompt: '从中筛选出5条与AI相关的最热新闻并总结' } 
  },
  { 
    id: 'node-3', 
    type: 'write_file', 
    position: { x: 100, y: 310 }, 
    data: { path: './study-cards/ai-news.md' } 
  }
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: 'node-1', target: 'node-2' },
  { id: 'e2-3', source: 'node-2', target: 'node-3' }
];

const defaultCardLayout: CardLayout[] = [
  { id: 'chat', column: 0, order: 0 },
  { id: 'canvas', column: 1, order: 0 }
];

export default function App() {
  // --- Workspace & Card Layout state ---
  const [activeCards, setActiveCards] = useState<string[]>(['chat', 'canvas']);
  const [cardLayout, setCardLayout] = useState<CardLayout[]>(defaultCardLayout);
  const [activeDrawer, setActiveDrawer] = useState<'settings' | null>(null);

  // --- Socrates Core state ---
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeModel, setActiveModel] = useState<string>('获取中...');
  const [thinkingLevel, setThinkingLevel] = useState<string>('medium');

  // --- Upload Images state ---
  const [selectedImages, setSelectedImages] = useState<{ data: string; mimeType: string; previewUrl: string }[]>([]);

  // --- React Flow state ---
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  // --- Refs ---
  const socketRef = useRef<Socket | null>(null);

  // --- Fetch configs ---
  const fetchActiveModelConfig = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/models');
      const data = await response.json();
      setActiveModel(data.activeModel || '无');
      setThinkingLevel(data.thinkingLevel || 'off');
    } catch (err) {
      console.error('Failed to fetch models config:', err);
    }
  };

  useEffect(() => {
    fetchActiveModelConfig();
  }, []);

  // --- Workspace Layout updates ---
  const handleToggleCard = (cardId: string) => {
    setActiveCards((prev) => {
      if (prev.includes(cardId)) {
        return prev.filter((id) => id !== cardId);
      } else {
        return [...prev, cardId];
      }
    });
  };

  const handleUpdateLayout = (newLayout: CardLayout[]) => {
    setCardLayout(newLayout);
  };

  // --- Upload images handlers ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const commaIndex = result.indexOf(',');
        const mimeType = file.type || 'image/png';
        const data = result.slice(commaIndex + 1);
        
        setSelectedImages(prev => [
          ...prev,
          {
            data,
            mimeType,
            previewUrl: URL.createObjectURL(file)
          }
        ]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeSelectedImage = (index: number) => {
    setSelectedImages(prev => {
      const updated = [...prev];
      const removed = updated.splice(index, 1)[0];
      if (removed && removed.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return updated;
    });
  };

  // --- React Flow Node handlers ---
  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const updateSelectedNodeData = (field: string, value: string) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === selectedNode.id) {
          return {
            ...n,
            data: {
              ...n.data,
              [field]: value
            }
          };
        }
        return n;
      })
    );
    setSelectedNode((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        data: {
          ...prev.data,
          [field]: value
        }
      };
    });
  };

  // --- Sockets and APIs ---
  // 使用 mountedRef 防止组件卸载后仍然更新状态
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    // 防止重复创建连接：如果 socketRef 已有活跃连接，先断开
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    const socket = io('http://localhost:3000', {
      // 防止自动重连导致多个连接并存
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      // 确保 transport 升级时不会创建多余连接
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to Backend Socket:', socket.id);
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
      } else if (event.type === 'message_start') {
        const newId = event.message.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        setMessages((prev) => {
          // 幂等性检查：如果已存在相同 ID 的消息，跳过添加
          if (prev.some(m => m.id === newId)) return prev;

          // 关键点：如果是用户消息，尝试找到最近一条本地生成的未匹配 ID 的用户消息，
          // 将其 ID 更新为后端分配的真实 ID，从而避免生成两个重复的用户消息气泡
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
        let text = '';
        if (typeof msg.content === 'string') {
          text = msg.content;
        } else if (Array.isArray(msg.content)) {
          text = msg.content.map((c: any) => c.text || '').join('');
        }
        setMessages((prev) => {
          const exists = prev.some(m => m.id === msg.id);
          if (exists) {
            // 使用完整的不可变更新替换匹配的消息
            return prev.map(m => m.id === msg.id ? { ...m, text, role: msg.role, customType: msg.customType } : m);
          } else {
            return [...prev, { id: msg.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, role: msg.role, text, customType: msg.customType }];
          }
        });
      } else if (event.type === 'message_update') {
        if (event.assistantMessageEvent?.type === 'text_delta') {
          const delta = event.assistantMessageEvent.delta;
          setMessages((prev) => {
            // 🔧 关键修复：使用完全不可变的状态更新
            // 之前的代码 `last.text += delta` 直接修改了 React 状态对象的引用，
            // 在 React 18 并发模式下会导致同一个 delta 被追加多次（口吃的直接原因）。
            // 正确做法：创建新的消息对象，永远不修改原始引用。
            const lastIndex = prev.length - 1;
            if (lastIndex < 0) return prev;
            const last = prev[lastIndex];
            if (last.role !== 'assistant') return prev;
            
            // 创建全新的数组和全新的消息对象
            const updated = prev.slice(0, lastIndex);
            updated.push({
              ...last,
              text: last.text + delta  // 新字符串，不修改原对象
            });
            return updated;
          });
        }
      } else if (event.type === 'tool_execution_start') {
        setMessages((prev) => {
          // 幂等性检查：防止重复添加工具消息
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

    socket.on('pi-error', (data: { message: string }) => {
      if (!mountedRef.current) return;
      alert(`Pi Core Error: ${data.message}`);
      setIsStreaming(false);
    });

    return () => {
      // 彻底清理 Socket 连接，防止幽灵连接继续接收事件
      socket.removeAllListeners();
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, []);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && selectedImages.length === 0) return;
    if (!socketRef.current) return;

    const imagesPayload = selectedImages.map(img => ({
      type: "image",
      data: img.data,
      mimeType: img.mimeType
    }));

    setMessages((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        role: 'user',
        text: inputText,
        images: imagesPayload.length > 0 ? imagesPayload : undefined
      }
    ]);

    socketRef.current.emit('send-message', { 
      text: inputText,
      images: imagesPayload.length > 0 ? imagesPayload : undefined
    });
    setInputText('');
    setSelectedImages([]);
  };

  const handleAbort = () => {
    if (socketRef.current) {
      socketRef.current.emit('abort');
    }
  };

  const handleClearSession = () => {
    if (socketRef.current) {
      socketRef.current.emit('clear-session');
      setMessages([]);
    }
  };

  const handleSaveAndCompile = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/workflow/fetch-and-summarize-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '新闻抓取与总结',
          description: '抓取科技新闻并自动整理为学习卡片',
          nodes: nodes.map((n) => ({ id: n.id, type: n.type, data: n.data })),
          edges: edges.map((e) => ({ source: e.source, target: e.target }))
        })
      });
      const resData = await response.json();
      if (resData.success) {
        confetti({
          particleCount: 50,
          angle: 60,
          spread: 55,
          origin: { x: 0 }
        });
        confetti({
          particleCount: 50,
          angle: 120,
          spread: 55,
          origin: { x: 1 }
        });
        alert('工作流保存成功，且技能 SKILL.md 已重新编译并热载入 Pi 内核！');
      } else {
        alert(`保存失败: ${resData.error}`);
      }
    } catch (err: any) {
      alert(`通信错误: ${err.message}`);
    }
  };

  // --- Dynamic card rendering factory ---
  const renderCard = (cardId: string, onClose: () => void) => {
    switch (cardId) {
      case 'chat':
        return (
          <ChatCard
            messages={messages}
            inputText={inputText}
            setInputText={setInputText}
            isStreaming={isStreaming}
            activeModel={activeModel}
            thinkingLevel={thinkingLevel}
            selectedImages={selectedImages}
            onUploadImage={handleImageUpload}
            onRemoveImage={removeSelectedImage}
            onSendMessage={handleSendMessage}
            onAbort={handleAbort}
            onClear={handleClearSession}
            onClose={onClose}
          />
        );
      case 'canvas':
        return (
          <CanvasCard
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSaveAndCompile={handleSaveAndCompile}
            onClose={onClose}
            selectedNode={selectedNode}
            setSelectedNode={setSelectedNode}
            updateSelectedNodeData={updateSelectedNodeData}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      
      {/* 1. Left Sidebar Navigation */}
      <Sidebar
        activeCards={activeCards}
        onToggleCard={handleToggleCard}
        onOpenSettings={() => setActiveDrawer('settings')}
      />

      {/* 2. Main Flex Workspace */}
      <div style={{ flex: 1, height: '100%', overflow: 'hidden' }}>
        <Workspace
          activeCards={activeCards}
          cardLayout={cardLayout}
          onUpdateLayout={handleUpdateLayout}
          renderCard={(cardId, onClose) => renderCard(cardId, () => {
            handleToggleCard(cardId);
            onClose();
          })}
        />
      </div>

      {/* 3. Global Slide Drawers */}
      <SlideDrawer
        isOpen={activeDrawer === 'settings'}
        onClose={() => setActiveDrawer(null)}
        title="模型与 API 凭证配置"
      >
        <SettingsPanel
          onSaveComplete={(model, level) => {
            setActiveModel(model);
            setThinkingLevel(level);
          }}
          onClose={() => setActiveDrawer(null)}
        />
      </SlideDrawer>

    </div>
  );
}
