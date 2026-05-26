import React, { useCallback } from 'react';
import { 
  ReactFlow, 
  MiniMap, 
  Controls, 
  Background, 
  Handle,
  Position,
  Node
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Terminal, Sparkles, FileCode, Layers, Save, X } from 'lucide-react';
import { useCanvas } from '../contexts/CanvasContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useChat } from '../contexts/ChatContext';

// Custom React Flow Nodes
const CustomBashNode = ({ data }: any) => (
  <div className="flow-node node-bash active">
    <div className="flow-node-header">
      <Terminal size={14} style={{ color: 'var(--secondary)' }} />
      <span>BASH 执行</span>
    </div>
    <div className="flow-node-body">
      <code style={{ fontSize: '9px', fontFamily: 'var(--font-mono)' }}>{data.command || '未配置命令'}</code>
    </div>
    <Handle type="target" position={Position.Top} className="flow-node-handle" />
    <Handle type="source" position={Position.Bottom} className="flow-node-handle" />
  </div>
);

const CustomLlmNode = ({ data }: any) => (
  <div className="flow-node node-llm active">
    <div className="flow-node-header">
      <Sparkles size={14} style={{ color: 'var(--primary)' }} />
      <span>AI 思考推理</span>
    </div>
    <div className="flow-node-body" style={{ fontSize: '9px', fontFamily: 'var(--font-mono)' }}>
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
      <span>写出文件</span>
    </div>
    <div className="flow-node-body">
      <code style={{ fontSize: '9px', fontFamily: 'var(--font-mono)' }}>{data.path || '未配置路径'}</code>
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

export default function CanvasCard() {
  const {
    nodes,
    edges,
    selectedNode,
    setSelectedNode,
    onNodesChange,
    onEdgesChange,
    onConnect,
    updateSelectedNodeData,
    saveAndCompile
  } = useCanvas();

  const { toggleCard } = useWorkspace();
  const { sessionId } = useChat();

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, [setSelectedNode]);

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
        position: 'relative',
        transform: 'none' // Disable hover translation in dashboard
      }}
    >
      {/* Header (Drag Handle) */}
      <div 
        className="card-drag-header"
        style={{ 
          padding: '14px 16px', 
          borderBottom: '3px solid #222222', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          backgroundColor: '#000000',
          cursor: 'grab',
          zIndex: 10
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={16} style={{ color: 'var(--primary)' }} />
          <h3 style={{ fontSize: '15px', fontWeight: 900, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: '#ffffff' }}>
            ⚙️ Skill Canvas Map
          </h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button 
            onClick={() => saveAndCompile(sessionId)} 
            className="btn-premium" 
            style={{ padding: '6px 12px', fontSize: '10px', boxShadow: '2px 2px 0px #000000' }}
          >
            <Save size={12} /> 保存编译
          </button>
          <button
            onClick={() => toggleCard('canvas')}
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
            title="隐藏画布窗口"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* React Flow Workspace */}
      <div style={{ flex: 1, position: 'relative' }}>
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
          <MiniMap zoomable pannable />
          <Controls />
          <Background color="#000000" gap={16} size={1} />
        </ReactFlow>
      </div>

      {/* Bottom Floating Node Properties Drawer */}
      {selectedNode && (
        <div 
          style={{ 
            position: 'absolute', 
            bottom: '16px', 
            left: '16px', 
            right: '16px', 
            background: '#0c0c0c',
            border: '3px solid var(--primary)',
            borderRadius: '0px', // Neo brutalist sharp corners
            padding: '16px',
            zIndex: 30,
            boxShadow: '6px 6px 0px #000000',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #222222', paddingBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--primary)', textTransform: 'uppercase' }}>
              节点配置 [{selectedNode.id} - {selectedNode.type}]
            </span>
            <button 
              onClick={() => setSelectedNode(null)} 
              style={{ 
                background: 'transparent', 
                border: 'none', 
                color: 'var(--text-muted)', 
                cursor: 'pointer', 
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 'bold'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              [关闭]
            </button>
          </div>

          {selectedNode.type === 'bash' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>Bash 指令:</label>
              <input 
                type="text" 
                value={selectedNode.data.command as string} 
                onChange={(e) => updateSelectedNodeData('command', e.target.value)}
                className="input-premium"
                style={{ padding: '8px 12px', fontSize: '11px', width: '100%' }}
              />
            </div>
          )}

          {selectedNode.type === 'llm' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>AI 提示词 (Prompt):</label>
              <textarea 
                value={selectedNode.data.prompt as string} 
                onChange={(e) => updateSelectedNodeData('prompt', e.target.value)}
                className="input-premium"
                style={{ padding: '8px 12px', fontSize: '11px', resize: 'none', height: '60px', width: '100%' }}
              />
            </div>
          )}

          {selectedNode.type === 'write_file' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>写出文件路径:</label>
              <input 
                type="text" 
                value={selectedNode.data.path as string} 
                onChange={(e) => updateSelectedNodeData('path', e.target.value)}
                className="input-premium"
                style={{ padding: '8px 12px', fontSize: '11px', width: '100%' }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
