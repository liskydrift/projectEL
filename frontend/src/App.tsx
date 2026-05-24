import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ReactFlow, 
  MiniMap, 
  Controls, 
  Background, 
  useNodesState, 
  useEdgesState, 
  addEdge,
  Handle,
  Position,
  Node,
  Edge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { io, Socket } from 'socket.io-client';
import { 
  Terminal, 
  Sparkles, 
  FileCode, 
  Send, 
  Award, 
  Play, 
  XCircle, 
  Save, 
  RefreshCw, 
  Layers,
  ArrowRight,
  TrendingUp,
  Cpu,
  Settings
} from 'lucide-react';
import confetti from 'canvas-confetti';

// ----------------- React Flow 自定义节点 -----------------

const CustomBashNode = ({ data }: any) => (
  <div className="flow-node node-bash active">
    <div className="flow-node-header">
      <Terminal size={14} style={{ color: 'var(--secondary)' }} />
      <span>Bash 执行节点</span>
    </div>
    <div className="flow-node-body">
      <code style={{ fontSize: '10px' }}>{data.command || '未配置命令'}</code>
    </div>
    <Handle type="target" position={Position.Top} className="flow-node-handle" />
    <Handle type="source" position={Position.Bottom} className="flow-node-handle" />
  </div>
);

const CustomLlmNode = ({ data }: any) => (
  <div className="flow-node node-llm active">
    <div className="flow-node-header">
      <Sparkles size={14} style={{ color: 'var(--primary)' }} />
      <span>AI 思考推理节点</span>
    </div>
    <div className="flow-node-body" style={{ fontSize: '10px' }}>
      {data.prompt || '未配置提示词'}
    </div>
    <Handle type="target" position={Position.Top} className="flow-node-handle" />
    <Handle type="source" position={Position.Bottom} className="flow-node-handle" />
  </div>
);

const CustomWriteNode = ({ data }: any) => (
  <div className="flow-node node-write active">
    <div className="flow-node-header">
      <FileCode size={14} style={{ color: 'var(--accent)' }} />
      <span>写出文件节点</span>
    </div>
    <div className="flow-node-body">
      <code style={{ fontSize: '10px' }}>{data.path || '未配置路径'}</code>
    </div>
    <Handle type="target" position={Position.Top} className="flow-node-handle" />
    <Handle type="source" position={Position.Bottom} className="flow-node-handle" />
  </div>
);

const nodeTypes = {
  bash: CustomBashNode,
  llm: CustomLlmNode,
  write_file: CustomWriteNode
};

// ----------------- App 核心组件 -----------------

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'toolResult' | 'system' | 'toolCall' | string;
  text: string;
  toolName?: string;
  args?: any;
  isError?: boolean;
}

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

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [xp, setXp] = useState(35);
  const [level, setLevel] = useState(2);
  const [activeModel, setActiveModel] = useState<string>('获取中...');
  const [thinkingLevel, setThinkingLevel] = useState<string>('medium');

  // Model Settings Modal 状态
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [providers, setProviders] = useState<any[]>([]);
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [selectedModelProvider, setSelectedModelProvider] = useState<string>('anthropic');
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [tempThinkingLevel, setTempThinkingLevel] = useState<string>('off');
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [baseUrls, setBaseUrls] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const fetchModelConfig = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/models');
      const data = await response.json();
      setProviders(data.providers || []);
      setAvailableModels(data.models || []);
      setActiveModel(data.activeModel || '无');
      setThinkingLevel(data.thinkingLevel || 'off');
      
      // Initialize selected dropdowns
      if (data.activeProvider) setSelectedModelProvider(data.activeProvider);
      if (data.activeModel) setSelectedModelId(data.activeModel);
      if (data.thinkingLevel) setTempThinkingLevel(data.thinkingLevel);

      // Initialize API Keys and Base URLs from backend
      const keys: Record<string, string> = {};
      const urls: Record<string, string> = {};
      const visible: Record<string, boolean> = {};
      
      if (data.providers) {
        data.providers.forEach((p: any) => {
          keys[p.id] = p.configured ? '********' : '';
          urls[p.id] = p.baseUrl || '';
          visible[p.id] = false;
        });
      }
      setApiKeys(keys);
      setBaseUrls(urls);
      setShowKeys(visible);
    } catch (err) {
      console.error('Failed to fetch models config:', err);
    }
  };

  useEffect(() => {
    fetchModelConfig();
  }, []);

  const handleDeepSeekAutoFill = () => {
    setBaseUrls(prev => ({
      ...prev,
      deepseek: 'https://api.deepseek.com/v1'
    }));
  };

  const handleQwenAutoFill = () => {
    setBaseUrls(prev => ({
      ...prev,
      qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    }));
  };

  const handleApiKeyChange = (provider: string, val: string) => {
    setApiKeys(prev => ({
      ...prev,
      [provider]: val
    }));
  };

  const handleBaseUrlChange = (provider: string, val: string) => {
    setBaseUrls(prev => ({
      ...prev,
      [provider]: val
    }));
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      // Save keys and baseUrls for each provider
      for (const p of providers) {
        const keyInput = apiKeys[p.id];
        let keyToSend: string | undefined = undefined;
        if (keyInput !== '********') {
          keyToSend = keyInput;
        }
        
        const urlInput = baseUrls[p.id];
        const isDeepSeek = p.id === 'deepseek';
        const isQwen = p.id === 'qwen';
        
        const keyEdited = keyInput !== '********';
        const prevProvider = providers.find(prov => prov.id === p.id);
        const urlEdited = urlInput !== (prevProvider?.baseUrl || '');
        
        if (keyEdited || urlEdited || (isDeepSeek && urlInput) || (isQwen && urlInput)) {
          const payload: any = {
            provider: p.id,
            apiKey: keyToSend,
            baseUrl: urlInput || undefined
          };
          
          if (isDeepSeek) {
            payload.api = 'openai-responses';
            payload.models = [
              {
                id: 'deepseek-v4-flash',
                name: 'DeepSeek V4 Flash',
                reasoning: false,
                contextWindow: 1000000,
                maxTokens: 16384,
                cost: {
                  input: 0.14,
                  output: 0.28,
                  cacheRead: 0.014,
                  cacheWrite: 0.14
                }
              },
              {
                id: 'deepseek-v4-pro',
                name: 'DeepSeek V4 Pro',
                reasoning: true,
                contextWindow: 1000000,
                maxTokens: 16384,
                cost: {
                  input: 1.74,
                  output: 3.48,
                  cacheRead: 0.174,
                  cacheWrite: 1.74
                }
              }
            ];
          }

          if (isQwen) {
            // DashScope OpenAI-compatible endpoint
            // thinkingFormat: 'qwen' = top-level enable_thinking field
            payload.api = 'openai-completions';
            payload.models = [
              {
                id: 'qwen3.6-flash',
                name: 'Qwen3.6 Flash',
                reasoning: true,
                contextWindow: 1000000,
                maxTokens: 16384,
                cost: { input: 0.19, output: 1.13, cacheRead: 0, cacheWrite: 0 }
              },
              {
                id: 'qwen3.6-plus',
                name: 'Qwen3.6 Plus',
                reasoning: true,
                contextWindow: 1000000,
                maxTokens: 16384,
                cost: { input: 0.33, output: 1.95, cacheRead: 0, cacheWrite: 0 }
              },
              {
                id: 'qwen3.6-max-preview',
                name: 'Qwen3.6 Max Preview',
                reasoning: true,
                contextWindow: 262144,
                maxTokens: 16384,
                cost: { input: 1.04, output: 6.24, cacheRead: 0, cacheWrite: 0 }
              },
              {
                id: 'qwen3.7-max',
                name: 'Qwen3.7 Max',
                reasoning: true,
                contextWindow: 1000000,
                maxTokens: 16384,
                cost: { input: 2.5, output: 7.5, cacheRead: 0, cacheWrite: 0 }
              }
            ];
          }
          
          await fetch('http://localhost:3000/api/models/configure', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }
      }

      // Select the active model & thinking level
      const selectResponse = await fetch('http://localhost:3000/api/models/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedModelProvider,
          modelId: selectedModelId,
          thinkingLevel: tempThinkingLevel
        })
      });
      const selectData = await selectResponse.json();

      if (selectData.success) {
        setActiveModel(selectData.activeModel);
        setThinkingLevel(selectData.thinkingLevel);
        setIsSettingsOpen(false);
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.8 },
          colors: ['#00f2fe', '#4facfe', '#6e44ff']
        });
      } else {
        alert(`Error selecting model: ${selectData.error}`);
      }
      
      await fetchModelConfig();
    } catch (err: any) {
      alert(`保存配置失败: ${err.message}`);
    } finally {
      setIsSavingSettings(false);
    }
  };

  // React Flow 状态
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // ----------------- React Flow 辅助函数 -----------------

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

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

  // ----------------- API / Socket 通信 -----------------

  useEffect(() => {
    // 建立 Socket.io 实时连接
    const socket = io('http://localhost:3000');
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to Backend Socket');
    });

    socket.on('session-state', (data: { model?: string; thinkingLevel?: string; messages: any[] }) => {
      if (data.model) setActiveModel(data.model);
      if (data.thinkingLevel) setThinkingLevel(data.thinkingLevel);
      
      // 映射历史消息
      const history: ChatMessage[] = data.messages.map((m: any, idx: number) => {
        let text = '';
        if (typeof m.content === 'string') text = m.content;
        else if (Array.isArray(m.content)) {
          text = m.content.map((c: any) => c.text || '').join('');
        }
        return {
          id: m.id || String(idx),
          role: m.role,
          text
        };
      });
      setMessages(history);
    });

    // 实时监听来自 Pi 的核心事件
    socket.on('pi-event', (event: any) => {
      if (event.type === 'agent_start') {
        setIsStreaming(true);
      } else if (event.type === 'agent_end') {
        setIsStreaming(false);
      } else if (event.type === 'message_start') {
        // 创建空骨架消息
        setMessages((prev) => [
          ...prev,
          {
            id: event.message.id || String(Date.now()),
            role: event.message.role,
            text: ''
          }
        ]);
      } else if (event.type === 'message_update') {
        // 增量渲染 LLM streaming Token
        if (event.assistantMessageEvent?.type === 'text_delta') {
          const delta = event.assistantMessageEvent.delta;
          setMessages((prev) => {
            const list = [...prev];
            const last = list[list.length - 1];
            if (last && last.role === 'assistant') {
              last.text += delta;
            }
            return list;
          });
        }
      } else if (event.type === 'tool_execution_start') {
        // 展示 tool 正在运行
        setMessages((prev) => [
          ...prev,
          {
            id: event.toolCallId,
            role: 'toolCall',
            toolName: event.toolName,
            args: event.args,
            text: `[运行工具] 正在执行 ${event.toolName}...`
          }
        ]);
      } else if (event.type === 'tool_execution_end') {
        // 完成工具调用，给出回执
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

        // 趣味交互：工具执行成功 +15 XP！
        if (!event.isError) {
          setXp((prevXp) => {
            const nextXp = prevXp + 15;
            if (nextXp >= 100) {
              setLevel((lvl) => lvl + 1);
              setTimeout(() => {
                // 撒花庆祝升级！
                confetti({
                  particleCount: 150,
                  spread: 80,
                  origin: { y: 0.6 },
                  colors: ['#6e44ff', '#00f2fe', '#e056fd', '#10b981']
                });
              }, 100);
              return nextXp - 100;
            }
            return nextXp;
          });
        }
      }
    });

    socket.on('pi-error', (data: { message: string }) => {
      alert(`Pi Core Error: ${data.message}`);
      setIsStreaming(false);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    // 聊天自动滚动到底部
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !socketRef.current) return;

    // 前端本地立即加入 user 气泡
    setMessages((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        role: 'user',
        text: inputText
      }
    ]);

    socketRef.current.emit('send-message', { text: inputText });
    setInputText('');
  };

  const handleAbort = () => {
    if (socketRef.current) {
      socketRef.current.emit('abort');
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
        // 升级特效触发
        confetti({
          particleCount: 40,
          angle: 60,
          spread: 55,
          origin: { x: 0 }
        });
        confetti({
          particleCount: 40,
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

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', padding: '16px', gap: '16px' }}>
      
      {/* ================= 左侧聊天区域 ================= */}
      <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        {/* Chat 头部 */}
        <div style={{ padding: '20px', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="gradient-text" style={{ fontSize: '20px', fontWeight: '700' }}>Socrates Learning Room</h2>
            <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
              <span>模型: <strong style={{ color: 'var(--secondary)' }}>{activeModel}</strong></span>
              <span>思考模式: <strong style={{ color: 'var(--accent)' }}>{thinkingLevel}</strong></span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isStreaming ? (
              <button onClick={handleAbort} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--error)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                <XCircle size={16} /> 中断
              </button>
            ) : (
              <button 
                onClick={() => {
                  fetchModelConfig(); // Refresh configs on open
                  setIsSettingsOpen(true);
                }} 
                className="btn-premium" 
                style={{ 
                  padding: '6px 10px', 
                  fontSize: '11px', 
                  background: 'rgba(255, 255, 255, 0.03)', 
                  border: '1px solid var(--panel-border)',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Settings size={14} /> 设置
              </button>
            )}
          </div>
        </div>

        {/* 聊天气泡记录 */}
        <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {messages.length === 0 && (
            <div style={{ margin: 'auto', textAlign: 'center', maxWidth: '300px', color: 'var(--text-muted)', fontSize: '13px' }}>
              <Cpu size={32} style={{ color: 'var(--primary)', marginBottom: '12px', animation: 'pulse-glow 2s infinite' }} />
              <p>这里是与 Pi Agent 内核相连的辅助学习聊天室。您可以让它帮您“运行新闻抓取与总结技能”，或是协助您编译新技能。</p>
            </div>
          )}
          {messages.map((m) => {
            const isUser = m.role === 'user';
            const isTool = m.role === 'toolCall' || m.role === 'toolResult';
            
            return (
              <div 
                key={m.id} 
                style={{ 
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* 气泡标签 */}
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', textAlign: isUser ? 'right' : 'left' }}>
                  {m.role === 'user' ? '您' : m.role === 'assistant' ? 'Pi Learning Assistant' : '系统内核'}
                </span>
                
                {/* 气泡主体 */}
                <div 
                  style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    fontSize: '13px',
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap',
                    background: isUser 
                      ? 'linear-gradient(135deg, var(--primary) 0%, rgba(110, 68, 255, 0.4) 100%)'
                      : isTool 
                        ? 'rgba(255, 255, 255, 0.02)'
                        : 'rgba(255, 255, 255, 0.05)',
                    border: isUser 
                      ? '1px solid rgba(110, 68, 255, 0.3)'
                      : isTool 
                        ? '1px dashed var(--panel-border)'
                        : '1px solid var(--panel-border)',
                    color: isTool 
                      ? (m.isError ? 'var(--error)' : 'var(--secondary)')
                      : 'var(--text-main)'
                  }}
                >
                  {m.text}
                  {isStreaming && !isUser && m.role === 'assistant' && <span className="typing-cursor"></span>}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* 聊天输入框 */}
        <form onSubmit={handleSendMessage} style={{ padding: '16px', borderTop: '1px solid var(--panel-border)', display: 'flex', gap: '10px' }}>
          <input 
            type="text" 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isStreaming}
            placeholder={isStreaming ? "AI 思考中，请稍候..." : "向您的学习助手提问，如: '执行新闻抓取与总结'"}
            className="input-premium"
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={isStreaming} className="btn-premium">
            <Send size={16} />
          </button>
        </form>
      </div>

      {/* ================= 右侧面板（XP看板 + React Flow） ================= */}
      <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'hidden' }}>
        
        {/* 1. XP 学分看板 */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div className="pulse" style={{ background: 'rgba(110, 68, 255, 0.1)', border: '1px solid var(--primary)', borderRadius: '50%', padding: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <Award size={32} style={{ color: 'var(--secondary)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'baseline' }}>
              <span style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'var(--font-display)' }}>
                学习等级: <strong style={{ color: 'var(--secondary)', fontSize: '22px' }}>Lv.{level}</strong>
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>经验值: {xp} / 100</span>
            </div>
            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: `${xp}%` }} />
            </div>
            <div style={{ display: 'flex', gap: '16px', marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><TrendingUp size={12} /> 工具调用 +15 XP</span>
              <span>•</span>
              <span>继续加油以解锁下一级！</span>
            </div>
          </div>
        </div>

        {/* 2. React Flow 可视化工作流画布 */}
        <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          
          {/* 画布控制条 */}
          <div style={{ padding: '16px', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10, background: 'rgba(13, 20, 35, 0.9)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={18} style={{ color: 'var(--secondary)' }} />
              <h3 style={{ fontSize: '15px', fontWeight: '600', fontFamily: 'var(--font-display)' }}>技能画布: 新闻抓取与总结</h3>
            </div>
            <button onClick={handleSaveAndCompile} className="btn-premium" style={{ padding: '8px 14px', fontSize: '12px' }}>
              <Save size={14} /> 保存并编译热载
            </button>
          </div>

          {/* React Flow 画布主体 */}
          <div style={{ flex: 1 }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              onNodeClick={onNodeClick}
              fitView
            >
              <Controls />
              <MiniMap zoomable pannable />
              <Background color="#1e293b" gap={12} size={1} />
            </ReactFlow>
          </div>

          {/* 底部悬浮节点属性编辑器 */}
          {selectedNode && (
            <div 
              style={{ 
                position: 'absolute', 
                bottom: '16px', 
                left: '16px', 
                right: '16px', 
                background: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid var(--primary)',
                borderRadius: '12px',
                padding: '16px',
                zIndex: 20,
                boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.5)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--secondary)' }}>
                  节点属性编辑 ({selectedNode.id} - {selectedNode.type})
                </span>
                <button onClick={() => setSelectedNode(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px' }}>
                  关闭
                </button>
              </div>

              {selectedNode.type === 'bash' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Bash 指令:</label>
                  <input 
                    type="text" 
                    value={selectedNode.data.command as string} 
                    onChange={(e) => updateSelectedNodeData('command', e.target.value)}
                    className="input-premium"
                    style={{ padding: '8px 12px', fontSize: '12px' }}
                  />
                </div>
              )}

              {selectedNode.type === 'llm' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>AI 提示词 (Prompt):</label>
                  <textarea 
                    value={selectedNode.data.prompt as string} 
                    onChange={(e) => updateSelectedNodeData('prompt', e.target.value)}
                    className="input-premium"
                    style={{ padding: '8px 12px', fontSize: '12px', resize: 'none', height: '60px' }}
                  />
                </div>
              )}

              {selectedNode.type === 'write_file' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>写出文件路径:</label>
                  <input 
                    type="text" 
                    value={selectedNode.data.path as string} 
                    onChange={(e) => updateSelectedNodeData('path', e.target.value)}
                    className="input-premium"
                    style={{ padding: '8px 12px', fontSize: '12px' }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ================= Model & API Settings Modal ================= */}
      {isSettingsOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(5, 8, 16, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="glass-panel" style={{
            width: '600px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '28px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(110, 68, 255, 0.15)',
            border: '1px solid rgba(110, 68, 255, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', paddingBottom: '16px' }}>
              <h2 className="gradient-text" style={{ fontSize: '20px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={22} style={{ color: 'var(--secondary)' }} />
                Model & API Configuration
              </h2>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Model and Thinking Select */}
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Active Model Provider</label>
                  <select
                    value={selectedModelProvider}
                    onChange={(e) => {
                      const prov = e.target.value;
                      setSelectedModelProvider(prov);
                      const firstMod = availableModels.find(m => m.provider === prov);
                      if (firstMod) setSelectedModelId(firstMod.id);
                    }}
                    className="input-premium"
                    style={{ width: '100%' }}
                  >
                    {providers.map(p => (
                      <option key={p.id} value={p.id}>{p.name} {p.configured ? '✓' : '(未配置)'}</option>
                    ))}
                  </select>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Active Model</label>
                  <select
                    value={selectedModelId}
                    onChange={(e) => setSelectedModelId(e.target.value)}
                    className="input-premium"
                    style={{ width: '100%' }}
                  >
                    {availableModels
                      .filter(m => m.provider === selectedModelProvider)
                      .map(m => (
                        <option key={m.id} value={m.id}>{m.name} {m.reasoning ? '(Reasoning)' : ''}</option>
                      ))
                    }
                    {availableModels.filter(m => m.provider === selectedModelProvider).length === 0 && (
                      <option value="">(请先在该 Provider 下添加模型)</option>
                    )}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Thinking Level (思考等级)</label>
                <select
                  value={tempThinkingLevel}
                  onChange={(e) => setTempThinkingLevel(e.target.value)}
                  className="input-premium"
                  style={{ width: '100%' }}
                >
                  <option value="off">Off (关闭思考，常规响应)</option>
                  <option value="minimal">Minimal (极简思考)</option>
                  <option value="low">Low (低度思考)</option>
                  <option value="medium">Medium (中度思考)</option>
                  <option value="high">High (深度思考)</option>
                  <option value="xhigh">X-High (极限深度思考)</option>
                </select>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--panel-border)', margin: '8px 0' }} />

              {/* API Credentials Management */}
              <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-main)' }}>Configure Providers</h3>
              
              {providers.map(p => (
                <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '10px', border: '1px solid var(--panel-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--secondary)' }}>{p.name} Settings</span>
                    {p.id === 'deepseek' && (
                      <button 
                        type="button"
                        onClick={() => handleDeepSeekAutoFill()}
                        style={{ fontSize: '11px', background: 'rgba(0, 242, 254, 0.1)', border: '1px solid var(--secondary)', color: 'var(--secondary)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        一键填充官方参数
                      </button>
                    )}
                    {p.id === 'qwen' && (
                      <button 
                        type="button"
                        onClick={() => handleQwenAutoFill()}
                        style={{ fontSize: '11px', background: 'rgba(110, 68, 255, 0.1)', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        一键填充官方参数
                      </button>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>API Key</label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                          type={showKeys[p.id] ? 'text' : 'password'}
                          value={apiKeys[p.id] || ''}
                          onChange={(e) => handleApiKeyChange(p.id, e.target.value)}
                          placeholder={p.configured ? '已配置，输入新 Key 覆盖，或留空清空' : '请输入 API Key'}
                          className="input-premium"
                          style={{ width: '100%', paddingRight: '40px' }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowKeys(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                          style={{ position: 'absolute', right: '10px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                        >
                          {showKeys[p.id] ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </div>

                    <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Base URL (端点)</label>
                      <input
                        type="text"
                        value={baseUrls[p.id] || ''}
                        onChange={(e) => handleBaseUrlChange(p.id, e.target.value)}
                        placeholder="默认: 官方默认端点"
                        className="input-premium"
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                </div>
              ))}

            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--panel-border)', paddingTop: '16px', marginTop: '10px' }}>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="btn-premium"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)', border: '1px solid var(--panel-border)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="btn-premium"
              >
                {isSavingSettings ? 'Saving...' : 'Save & Apply'}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
