import React, { createContext, useContext, useState, useCallback } from 'react';
import { 
  useNodesState, 
  useEdgesState, 
  addEdge,
  Node,
  Edge
} from '@xyflow/react';
import confetti from 'canvas-confetti';

interface CanvasContextProps {
  nodes: Node[];
  edges: Edge[];
  selectedNode: Node | null;
  setSelectedNode: (node: Node | null) => void;
  onNodesChange: any;
  onEdgesChange: any;
  onConnect: (params: any) => void;
  updateSelectedNodeData: (field: string, value: string) => void;
  saveAndCompile: (sessionId?: string) => Promise<void>;
  setNodes: any;
  setEdges: any;
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

const CanvasContext = createContext<CanvasContextProps | undefined>(undefined);

export const CanvasProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

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

  const saveAndCompile = async (sessionId?: string) => {
    try {
      const response = await fetch('http://localhost:3000/api/workflow/fetch-and-summarize-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '新闻抓取与总结',
          description: '抓取科技新闻并自动整理为学习卡片',
          nodes: nodes.map((n) => ({ id: n.id, type: n.type, data: n.data })),
          edges: edges.map((e) => ({ source: e.source, target: e.target })),
          sessionId
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

  return (
    <CanvasContext.Provider value={{
      nodes,
      edges,
      selectedNode,
      setSelectedNode,
      onNodesChange,
      onEdgesChange,
      onConnect,
      updateSelectedNodeData,
      saveAndCompile,
      setNodes,
      setEdges
    }}>
      {children}
    </CanvasContext.Provider>
  );
};

export const useCanvas = () => {
  const context = useContext(CanvasContext);
  if (!context) throw new Error('useCanvas must be used within a CanvasProvider');
  return context;
};
