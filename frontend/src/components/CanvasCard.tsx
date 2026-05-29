import React, { DragEvent, useCallback, useMemo, useRef } from 'react';
import {
  Background,
  Controls,
  Edge,
  Handle,
  MiniMap,
  Node,
  Position,
  ReactFlow,
  ReactFlowInstance
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Copy,
  Layers,
  Save,
  Trash2,
  X
} from 'lucide-react';
import { useCanvas } from '../contexts/CanvasContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useChat } from '../contexts/ChatContext';
import {
  edgeModeOptions,
  getNodeDefinition,
  groupedWorkflowNodes,
  WorkflowFieldDefinition,
  WorkflowNodeDefinition,
  WorkflowNodeType
} from '../workflow/nodeRegistry';

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: '11px',
  width: '100%',
  minWidth: 0
};

const panelTitleStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 900,
  fontFamily: 'var(--font-mono)',
  color: 'var(--primary)',
  textTransform: 'uppercase'
};

function WorkflowNode({ data, type }: { data: Record<string, any>; type?: string }) {
  const definition = getNodeDefinition(type);
  const Icon = definition.icon;
  const summary = data?.[definition.summaryField] || definition.description;
  const outputs = definition.outputs.length ? definition.outputs : [{ id: 'next', label: 'next' }];

  return (
    <div className="flow-node active" style={{ borderColor: definition.color }}>
      <div className="flow-node-header">
        <Icon size={14} style={{ color: definition.color }} />
        <span>{definition.label}</span>
      </div>
      <div className="flow-node-body">
        <code style={{ fontSize: '9px', fontFamily: 'var(--font-mono)' }}>
          {String(summary || '').slice(0, 120)}
        </code>
      </div>
      <Handle type="target" position={Position.Top} className="flow-node-handle" />
      {outputs.map((output, index) => {
        const left = outputs.length === 1 ? 50 : ((index + 1) * 100) / (outputs.length + 1);
        return (
          <Handle
            key={output.id}
            id={output.id}
            type="source"
            position={Position.Bottom}
            className="flow-node-handle"
            style={{ left: `${left}%`, background: definition.color }}
          >
            <span className="flow-handle-label">{output.label}</span>
          </Handle>
        );
      })}
    </div>
  );
}

const nodeTypes = {
  bash: WorkflowNode,
  llm: WorkflowNode,
  read_file: WorkflowNode,
  write_file: WorkflowNode,
  api_request: WorkflowNode,
  condition: WorkflowNode,
  loop: WorkflowNode,
  subagent: WorkflowNode
};

function FieldEditor({
  field,
  value,
  onChange
}: {
  field: WorkflowFieldDefinition;
  value: string | number | undefined;
  onChange: (value: string | number) => void;
}) {
  if (field.type === 'textarea') {
    return (
      <textarea
        value={String(value ?? '')}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        className="input-premium"
        style={{ ...inputStyle, resize: 'vertical', minHeight: '74px' }}
      />
    );
  }

  if (field.type === 'select') {
    return (
      <select
        value={String(value ?? '')}
        onChange={(event) => onChange(event.target.value)}
        className="input-premium"
        style={inputStyle}
      >
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      type={field.type === 'number' ? 'number' : 'text'}
      value={String(value ?? '')}
      onChange={(event) =>
        onChange(field.type === 'number' ? Number(event.target.value) : event.target.value)
      }
      placeholder={field.placeholder}
      className="input-premium"
      style={inputStyle}
    />
  );
}

function PaletteItem({ definition }: { definition: WorkflowNodeDefinition }) {
  const Icon = definition.icon;

  const onDragStart = (event: DragEvent<HTMLButtonElement>) => {
    event.dataTransfer.setData('application/reactflow', definition.type);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <button
      draggable
      onDragStart={onDragStart}
      className="workflow-palette-item"
      title={definition.description}
      type="button"
      style={{ borderColor: definition.color }}
    >
      <Icon size={15} style={{ color: definition.color, flexShrink: 0 }} />
      <span>{definition.label}</span>
    </button>
  );
}

export default function CanvasCard() {
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = React.useState<ReactFlowInstance | null>(null);
  const {
    nodes,
    edges,
    selectedNode,
    selectedEdge,
    setSelectedNode,
    setSelectedEdge,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    deleteNode,
    duplicateNode,
    deleteEdge,
    updateSelectedNodeData,
    updateSelectedEdgeData,
    saveAndCompile
  } = useCanvas();

  const { toggleCard } = useWorkspace();
  const { sessionId } = useChat();

  const selectedDefinition = useMemo(
    () => (selectedNode ? getNodeDefinition(selectedNode.type || undefined) : null),
    [selectedNode]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNode(node);
    },
    [setSelectedNode]
  );

  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      setSelectedEdge(edge);
    },
    [setSelectedEdge]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, [setSelectedNode, setSelectedEdge]);

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow') as WorkflowNodeType;
      if (!type || !reactFlowInstance) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      });
      addNode(type, position);
    },
    [addNode, reactFlowInstance]
  );

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
        transform: 'none'
      }}
    >
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
          <h3
            style={{
              fontSize: '15px',
              fontWeight: 900,
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              color: '#ffffff'
            }}
          >
            Skill Canvas Map
          </h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => saveAndCompile(sessionId)}
            className="btn-premium"
            style={{ padding: '6px 12px', fontSize: '10px', boxShadow: '2px 2px 0px #000000' }}
            type="button"
          >
            <Save size={12} /> 保存编译
          </button>
          <button
            onClick={() => toggleCard('canvas')}
            className="workflow-icon-button"
            title="隐藏画布窗口"
            type="button"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="workflow-builder">
        <aside className="workflow-palette">
          <div style={panelTitleStyle}>节点库</div>
          {Object.entries(groupedWorkflowNodes).map(([group, definitions]) => (
            <div key={group} className="workflow-palette-group">
              <div className="workflow-group-label">{group}</div>
              {definitions.map((definition) => (
                <PaletteItem key={definition.type} definition={definition} />
              ))}
            </div>
          ))}
        </aside>

        <div
          ref={reactFlowWrapper}
          className="workflow-flow-area"
          onDrop={onDrop}
          onDragOver={onDragOver}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onInit={setReactFlowInstance}
            fitView
          >
            <MiniMap zoomable pannable />
            <Controls />
            <Background color="#000000" gap={16} size={1} />
          </ReactFlow>
        </div>

        <aside className="workflow-inspector">
          {!selectedNode && !selectedEdge && (
            <div className="workflow-empty-state">
              <div style={panelTitleStyle}>工作流</div>
              <p>从左侧拖拽节点到画布，连接节点后点击保存编译。</p>
              <p>当前节点 {nodes.length} 个，连线 {edges.length} 条。</p>
            </div>
          )}

          {selectedNode && selectedDefinition && (
            <div className="workflow-inspector-section">
              <div className="workflow-inspector-header">
                <div>
                  <div style={panelTitleStyle}>{selectedDefinition.label}</div>
                  <p>{selectedDefinition.description}</p>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className="workflow-icon-button"
                    title="复制节点"
                    type="button"
                    onClick={() => duplicateNode(selectedNode.id)}
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    className="workflow-icon-button danger"
                    title="删除节点"
                    type="button"
                    onClick={() => deleteNode(selectedNode.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {selectedDefinition.fields.map((field) => (
                <label key={field.key} className="workflow-field">
                  <span>{field.label}</span>
                  <FieldEditor
                    field={field}
                    value={selectedNode.data?.[field.key] as string | number | undefined}
                    onChange={(value) => updateSelectedNodeData(field.key, value)}
                  />
                </label>
              ))}
            </div>
          )}

          {selectedEdge && (
            <div className="workflow-inspector-section">
              <div className="workflow-inspector-header">
                <div>
                  <div style={panelTitleStyle}>连接配置</div>
                  <p>
                    {selectedEdge.source} → {selectedEdge.target}
                  </p>
                </div>
                <button
                  className="workflow-icon-button danger"
                  title="删除连线"
                  type="button"
                  onClick={() => deleteEdge(selectedEdge.id)}
                >
                  <Trash2 size={13} />
                </button>
              </div>

              <label className="workflow-field">
                <span>连接方式</span>
                <select
                  value={String(selectedEdge.data?.mode || 'sequence')}
                  onChange={(event) => updateSelectedEdgeData('mode', event.target.value)}
                  className="input-premium"
                  style={inputStyle}
                >
                  {edgeModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="workflow-field">
                <span>备注</span>
                <textarea
                  value={String(selectedEdge.data?.note || '')}
                  onChange={(event) => updateSelectedEdgeData('note', event.target.value)}
                  className="input-premium"
                  style={{ ...inputStyle, resize: 'vertical', minHeight: '72px' }}
                  placeholder="例如：命中条件后进入此分支"
                />
              </label>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
