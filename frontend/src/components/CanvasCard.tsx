import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Background,
  Controls,
  Edge,
  Handle,

  Node,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Copy, FilePlus2, Layers, Save, ShieldCheck, Trash2, X } from 'lucide-react';
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
import { workflowTemplates } from '../workflow/workflowTemplates';

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

function WorkflowNode({ id, data, type }: { id: string; data: Record<string, any>; type?: string }) {
  const { deleteNode } = useCanvas();
  const definition = getNodeDefinition(type);
  const Icon = definition.icon;
  const summary = data?.[definition.summaryField] || definition.description;
  const outputs = definition.outputs.length ? definition.outputs : [{ id: 'next', label: 'next' }];

  return (
    <div className="flow-node active" style={{ borderColor: definition.color }}>
      <div className="flow-node-header">
        <Icon size={14} style={{ color: definition.color }} />
        <span>{definition.label}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteNode(id);
          }}
          className="flow-node-delete-btn"
          title="删除节点"
          type="button"
        >
          <X size={11} />
        </button>
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
  mcp_tool: WorkflowNode,
  condition: WorkflowNode,
  loop: WorkflowNode,
  subagent: WorkflowNode,
  qq_message: WorkflowNode,
  knowledge_write: WorkflowNode,
  socratic: WorkflowNode,
  qq_push: WorkflowNode
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
          <option key={option.value} value={option.value} style={{ backgroundColor: '#0a0a0a', color: '#ededed' }}>
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

// Module-level drag type (avoids DOM attribute quirks)
let _dragType: string | null = null;

function PaletteItem({ definition }: { definition: WorkflowNodeDefinition }) {
  const Icon = definition.icon;

  return (
    <div
      onPointerDown={(e) => {
                _dragType = definition.type;
        document.body.classList.add('is-dragging-from-palette');
      }}
      className="workflow-palette-item"
      title={definition.description}
      style={{ borderColor: definition.color, cursor: 'grab', userSelect: 'none' }}
    >
      <Icon size={15} style={{ color: definition.color, flexShrink: 0 }} />
      <span>{definition.label}</span>
    </div>
  );
}
function CanvasCardInner() {
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const { screenToFlowPosition } = useReactFlow();
  const [isNewWorkflowModalOpen, setIsNewWorkflowModalOpen] = React.useState(false);
  const [isDeleteWorkflowModalOpen, setIsDeleteWorkflowModalOpen] = React.useState(false);
  const [newWorkflowName, setNewWorkflowName] = React.useState('我的学习工作流');
  const {
    nodes,
    edges,
    selectedNode,
    selectedEdge,
    activeTemplateId,
    workflowId,
    workflowName,
    workflowOptions,
    validation,
    setSelectedNode,
    setSelectedEdge,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    deleteNode,
    duplicateNode,
    deleteEdge,
    applyTemplate,
    createBlankWorkflow,
    deleteWorkflow,
    updateSelectedNodeData,
    updateSelectedEdgeData,
    saveAndCompile
  } = useCanvas();

  const { toggleCard } = useWorkspace();
  const { sessionId } = useChat();

  const activeTemplate = workflowTemplates.find((template) => template.id === activeTemplateId) || workflowTemplates[0];
  const currentWorkflowOption = workflowOptions.find((workflow) => workflow.id === workflowId);
  const canDeleteCurrentWorkflow = currentWorkflowOption?.source === 'saved' || currentWorkflowOption?.source === 'draft';
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






  // Drag & drop using Pointer Events with visual ghost feedback
  useEffect(() => {
    const el = reactFlowWrapper.current;
    if (!el) return;

    let ghostEl: HTMLDivElement | null = null;

    const getOrCreateGhost = (type: string): HTMLDivElement => {
      if (ghostEl) return ghostEl;
      const def = getNodeDefinition(type);
      const g = document.createElement('div');
      g.className = 'drag-ghost';
      g.textContent = def.label;
      g.style.cssText = `
        position: fixed;
        pointer-events: none;
        z-index: 9999;
        padding: 8px 14px;
        border-radius: 8px;
        background: rgba(12, 12, 12, 0.95);
        border: 2px solid ${def.color};
        color: #e5e7eb;
        font-family: var(--font-sans, sans-serif);
        font-size: 13px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        opacity: 0.85;
        transform: translate(-50%, -50%);
        white-space: nowrap;
      `;
      document.body.appendChild(g);
      ghostEl = g;
      return g;
    };

    const removeGhost = () => {
      if (ghostEl) {
        ghostEl.remove();
        ghostEl = null;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const type = _dragType;
      if (!type) return;
      const ghost = getOrCreateGhost(type);
      ghost.style.left = e.clientX + 'px';
      ghost.style.top = e.clientY + 'px';
      document.body.style.cursor = 'grabbing';
    };

    const onPointerUp = (e: PointerEvent) => {
      removeGhost();
      document.body.style.cursor = '';
      document.body.classList.remove('is-dragging-from-palette');

      const type = _dragType;
      if (!type) return;
      _dragType = null;

      // Check if pointer is over the flow area
      const rect = el.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom) {
        const position = screenToFlowPosition({
          x: e.clientX,
          y: e.clientY
        });
        addNode(type as WorkflowNodeType, position);
      }
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp, { capture: true });

    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      removeGhost();
    };
  }, [addNode, screenToFlowPosition]);

  // Recalculate error/warning counts
  const errorCount = validation.items.filter((item) => item.level === 'error').length;
  const warningCount = validation.items.filter((item) => item.level === 'warning').length;

  const confirmCreateWorkflow = () => {
    createBlankWorkflow(newWorkflowName);
    setIsNewWorkflowModalOpen(false);
    setNewWorkflowName('我的学习工作流');
  };

  const confirmDeleteWorkflow = async () => {
    await deleteWorkflow(workflowId, sessionId);
    setIsDeleteWorkflowModalOpen(false);
  };

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
              color: '#d1d5db'
            }}
          >
            Skill Canvas Map
          </h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setIsNewWorkflowModalOpen(true)}
            className="btn-premium btn-secondary"
            style={{ padding: '6px 12px', fontSize: '10px', boxShadow: '2px 2px 0px #000000' }}
            type="button"
          >
            <FilePlus2 size={12} /> 新建
          </button>
          <button
            onClick={() => saveAndCompile(sessionId)}
            className="btn-premium"
            style={{ padding: '6px 12px', fontSize: '10px', boxShadow: '2px 2px 0px #000000' }}
            type="button"
          >
            <Save size={12} /> 保存编译
          </button>
          {canDeleteCurrentWorkflow && (
            <button
              onClick={() => setIsDeleteWorkflowModalOpen(true)}
              className="btn-premium btn-secondary"
              style={{ padding: '6px 12px', fontSize: '10px', boxShadow: '2px 2px 0px #000000' }}
              type="button"
            >
              <Trash2 size={12} /> 删除
            </button>
          )}
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

      <div className="workflow-template-bar">
        <div className="workflow-template-copy">
          <span>学习模板</span>
          <strong>{activeTemplate.name}</strong>
          <em>{activeTemplate.tagline}</em>
          <small style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            当前保存为：{workflowName} / {workflowId}
          </small>
        </div>
        <select
          value={workflowId}
          onChange={(event) => applyTemplate(event.target.value)}
          className="input-premium"
          style={{ width: '230px', padding: '7px 10px', fontSize: '11px' }}
        >
          {workflowOptions.map((workflow) => (
            <option key={workflow.id} value={workflow.id} style={{ backgroundColor: '#0a0a0a', color: '#ededed' }}>
              {workflow.source === 'template' ? '' : workflow.source === 'saved' ? '已保存 · ' : '草稿 · '}
              {workflow.name}
            </option>
          ))}
        </select>
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
          style={{ height: '100%' }}
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

            onNodesDelete={(deletedNodes) => {
              deletedNodes.forEach((node) => deleteNode(node.id));
            }}
            onEdgesDelete={(deletedEdges) => {
              deletedEdges.forEach((edge) => deleteEdge(edge.id));
            }}
            fitView
          >

            <Controls />
            <Background color="#000000" gap={16} size={1} />
          </ReactFlow>
        </div>

        <aside className="workflow-inspector">
          <div className="workflow-validation-card">
            <div className="workflow-inspector-header">
              <div>
                <div style={panelTitleStyle}>流程检查</div>
                <p>
                  {validation.ok ? '可以保存' : '需要修复'} · {errorCount} 个错误 · {warningCount} 个提醒
                </p>
              </div>
              <ShieldCheck size={18} style={{ color: validation.ok ? 'var(--success)' : 'var(--error)' }} />
            </div>
            <div className="workflow-validation-list">
              {validation.items.slice(0, 5).map((item, index) => (
                <div key={`${item.message}-${index}`} className={`workflow-validation-item ${item.level}`}>
                  {item.level === 'error' ? '✗' : item.level === 'warning' ? '!' : '✓'} {item.message}
                </div>
              ))}
            </div>
          </div>

          {!selectedNode && !selectedEdge && (
            <div className="workflow-empty-state">
              <div style={panelTitleStyle}>工作流</div>
              <p>{activeTemplate.description}</p>
              <p>保存目标：{workflowName}（{workflowId}）。</p>
              <p>当前节点 {nodes.length} 个，连线 {edges.length} 条。</p>
              <p>用户可以直接使用模板，也可以继续拖拽节点改造成自己的学习自动化流程。</p>
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
                    <option key={option.value} value={option.value} style={{ backgroundColor: '#0a0a0a', color: '#ededed' }}>
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

      {isNewWorkflowModalOpen && (
        <div
          className="workflow-modal-backdrop"
          onClick={() => setIsNewWorkflowModalOpen(false)}
        >
          <div
            className="workflow-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="workflow-modal-header">
              <div>
                <div style={panelTitleStyle}>新建工作流</div>
                <p>创建一个独立保存目标，从空白画板开始搭建。</p>
              </div>
              <button
                className="workflow-icon-button"
                type="button"
                onClick={() => setIsNewWorkflowModalOpen(false)}
                title="关闭"
              >
                <X size={14} />
              </button>
            </div>

            <label className="workflow-field">
              <span>工作流名称</span>
              <input
                className="input-premium"
                style={inputStyle}
                value={newWorkflowName}
                onChange={(event) => setNewWorkflowName(event.target.value)}
                autoFocus
                placeholder="例如：课程群待办提醒"
              />
            </label>

            {(nodes.length > 0 || edges.length > 0) && (
              <div className="workflow-modal-warning">
                当前画板有 {nodes.length} 个节点、{edges.length} 条连线。创建新工作流会清空当前画板，但不会删除已经保存过的技能文件。
              </div>
            )}

            <div className="workflow-modal-actions">
              <button
                className="btn-premium btn-secondary"
                type="button"
                onClick={() => setIsNewWorkflowModalOpen(false)}
              >
                取消
              </button>
              <button
                className="btn-premium"
                type="button"
                disabled={!newWorkflowName.trim()}
                onClick={confirmCreateWorkflow}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {isDeleteWorkflowModalOpen && (
        <div
          className="workflow-modal-backdrop"
          onClick={() => setIsDeleteWorkflowModalOpen(false)}
        >
          <div
            className="workflow-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="workflow-modal-header">
              <div>
                <div style={panelTitleStyle}>删除工作流</div>
                <p>
                  {currentWorkflowOption?.source === 'draft'
                    ? '这个草稿还没有保存，删除后只会从当前画板列表移除。'
                    : '这个已保存工作流会从本地 skills 和 .pi/skills 中删除。'}
                </p>
              </div>
              <button
                className="workflow-icon-button"
                type="button"
                onClick={() => setIsDeleteWorkflowModalOpen(false)}
                title="关闭"
              >
                <X size={14} />
              </button>
            </div>

            <div className="workflow-modal-warning">
              即将删除：{workflowName}
            </div>

            <div className="workflow-modal-actions">
              <button
                className="btn-premium btn-secondary"
                type="button"
                onClick={() => setIsDeleteWorkflowModalOpen(false)}
              >
                取消
              </button>
              <button
                className="btn-premium"
                type="button"
                onClick={confirmDeleteWorkflow}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CanvasCard() {
  return (
    <ReactFlowProvider>
      <CanvasCardInner />
    </ReactFlowProvider>
  );
}
