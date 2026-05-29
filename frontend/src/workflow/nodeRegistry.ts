import {
  Bot,
  Code2,
  FileCode,
  FileText,
  GitBranch,
  Globe2,
  LucideIcon,
  Repeat2,
  Sparkles,
  Terminal
} from 'lucide-react';

export type WorkflowNodeType =
  | 'bash'
  | 'llm'
  | 'read_file'
  | 'write_file'
  | 'api_request'
  | 'condition'
  | 'loop'
  | 'subagent';

export type WorkflowFieldType = 'text' | 'textarea' | 'select' | 'number';

export interface WorkflowFieldDefinition {
  key: string;
  label: string;
  type: WorkflowFieldType;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface WorkflowHandleDefinition {
  id: string;
  label: string;
}

export interface WorkflowNodeDefinition {
  type: WorkflowNodeType;
  label: string;
  group: string;
  description: string;
  color: string;
  icon: LucideIcon;
  defaultData: Record<string, string | number>;
  summaryField: string;
  fields: WorkflowFieldDefinition[];
  outputs: WorkflowHandleDefinition[];
}

export const workflowNodeDefinitions: WorkflowNodeDefinition[] = [
  {
    type: 'bash',
    label: 'Bash',
    group: '基础执行',
    description: '运行终端命令或脚本',
    color: 'var(--secondary)',
    icon: Terminal,
    defaultData: {
      command: 'curl -s https://news.ycombinator.com/',
      cwd: '',
      timeout: 60
    },
    summaryField: 'command',
    fields: [
      { key: 'command', label: 'Bash 指令', type: 'textarea', placeholder: 'npm run build' },
      { key: 'cwd', label: '工作目录', type: 'text', placeholder: './' },
      { key: 'timeout', label: '超时秒数', type: 'number', placeholder: '60' }
    ],
    outputs: [{ id: 'next', label: 'next' }]
  },
  {
    type: 'llm',
    label: 'LLM',
    group: 'AI',
    description: '调用模型进行分析、生成或总结',
    color: 'var(--primary)',
    icon: Sparkles,
    defaultData: {
      prompt: '从上一步输出中筛选出 5 条与 AI 相关的重点内容并总结。',
      model: '',
      outputKey: 'llm_result'
    },
    summaryField: 'prompt',
    fields: [
      { key: 'prompt', label: 'Prompt', type: 'textarea', placeholder: '结合上下文完成分析...' },
      { key: 'model', label: '模型覆盖', type: 'text', placeholder: '留空使用当前激活模型' },
      { key: 'outputKey', label: '输出变量', type: 'text', placeholder: 'llm_result' }
    ],
    outputs: [{ id: 'next', label: 'next' }]
  },
  {
    type: 'read_file',
    label: 'Read File',
    group: '文件',
    description: '读取本地文件作为上下文',
    color: '#8b5cf6',
    icon: FileText,
    defaultData: {
      path: './README.md',
      outputKey: 'file_content'
    },
    summaryField: 'path',
    fields: [
      { key: 'path', label: '读取路径', type: 'text', placeholder: './README.md' },
      { key: 'outputKey', label: '输出变量', type: 'text', placeholder: 'file_content' }
    ],
    outputs: [{ id: 'next', label: 'next' }]
  },
  {
    type: 'write_file',
    label: 'Write File',
    group: '文件',
    description: '把结果写入目标文件',
    color: 'var(--accent)',
    icon: FileCode,
    defaultData: {
      path: './study-cards/ai-news.md',
      content: '使用上一步输出',
      mode: 'overwrite'
    },
    summaryField: 'path',
    fields: [
      { key: 'path', label: '写入路径', type: 'text', placeholder: './output.md' },
      { key: 'content', label: '写入内容', type: 'textarea', placeholder: '使用上一步输出' },
      {
        key: 'mode',
        label: '写入模式',
        type: 'select',
        options: [
          { label: '覆盖', value: 'overwrite' },
          { label: '追加', value: 'append' }
        ]
      }
    ],
    outputs: [{ id: 'next', label: 'next' }]
  },
  {
    type: 'api_request',
    label: 'API Request',
    group: '网络',
    description: '发起 HTTP 请求并保存响应',
    color: '#22c55e',
    icon: Globe2,
    defaultData: {
      method: 'GET',
      url: 'https://api.example.com/data',
      headers: '',
      body: '',
      outputKey: 'api_response'
    },
    summaryField: 'url',
    fields: [
      {
        key: 'method',
        label: 'Method',
        type: 'select',
        options: [
          { label: 'GET', value: 'GET' },
          { label: 'POST', value: 'POST' },
          { label: 'PUT', value: 'PUT' },
          { label: 'PATCH', value: 'PATCH' },
          { label: 'DELETE', value: 'DELETE' }
        ]
      },
      { key: 'url', label: 'URL', type: 'text', placeholder: 'https://api.example.com/data' },
      { key: 'headers', label: 'Headers', type: 'textarea', placeholder: 'Authorization: Bearer ...' },
      { key: 'body', label: 'Body', type: 'textarea', placeholder: '{"query":"..."}' },
      { key: 'outputKey', label: '输出变量', type: 'text', placeholder: 'api_response' }
    ],
    outputs: [{ id: 'next', label: 'next' }]
  },
  {
    type: 'condition',
    label: 'Condition',
    group: '流程控制',
    description: '根据表达式进入 true/false 分支',
    color: '#f59e0b',
    icon: GitBranch,
    defaultData: {
      expression: '上一节点输出包含 AI',
      trueLabel: '匹配',
      falseLabel: '不匹配'
    },
    summaryField: 'expression',
    fields: [
      { key: 'expression', label: '判断条件', type: 'textarea', placeholder: '如果上一步输出包含...' },
      { key: 'trueLabel', label: 'True 分支名', type: 'text', placeholder: '匹配' },
      { key: 'falseLabel', label: 'False 分支名', type: 'text', placeholder: '不匹配' }
    ],
    outputs: [
      { id: 'true', label: 'true' },
      { id: 'false', label: 'false' }
    ]
  },
  {
    type: 'loop',
    label: 'Loop',
    group: '流程控制',
    description: '遍历列表或重复执行子流程',
    color: '#06b6d4',
    icon: Repeat2,
    defaultData: {
      iterable: '上一节点输出列表',
      maxIterations: 5,
      itemKey: 'item'
    },
    summaryField: 'iterable',
    fields: [
      { key: 'iterable', label: '循环对象', type: 'text', placeholder: '上一节点输出列表' },
      { key: 'maxIterations', label: '最大次数', type: 'number', placeholder: '5' },
      { key: 'itemKey', label: '单项变量', type: 'text', placeholder: 'item' }
    ],
    outputs: [
      { id: 'body', label: 'body' },
      { id: 'next', label: 'next' }
    ]
  },
  {
    type: 'subagent',
    label: 'SubAgent',
    group: 'Agent',
    description: '调用一个专门能力的子代理',
    color: '#ec4899',
    icon: Bot,
    defaultData: {
      agent: 'code-review',
      mode: 'chain',
      instruction: '让子代理处理当前上下文，并返回结构化结果。'
    },
    summaryField: 'instruction',
    fields: [
      { key: 'agent', label: '子代理', type: 'text', placeholder: 'code-review' },
      {
        key: 'mode',
        label: '编排模式',
        type: 'select',
        options: [
          { label: 'Chain', value: 'chain' },
          { label: 'Parallel', value: 'parallel' },
          { label: 'Supervisor', value: 'supervisor' }
        ]
      },
      { key: 'instruction', label: '任务说明', type: 'textarea', placeholder: '交给子代理完成...' }
    ],
    outputs: [{ id: 'next', label: 'next' }]
  }
];

export const workflowNodeRegistry = workflowNodeDefinitions.reduce(
  (acc, definition) => {
    acc[definition.type] = definition;
    return acc;
  },
  {} as Record<WorkflowNodeType, WorkflowNodeDefinition>
);

export const groupedWorkflowNodes = workflowNodeDefinitions.reduce(
  (acc, definition) => {
    if (!acc[definition.group]) acc[definition.group] = [];
    acc[definition.group].push(definition);
    return acc;
  },
  {} as Record<string, WorkflowNodeDefinition[]>
);

export const getNodeDefinition = (type?: string) => {
  return workflowNodeRegistry[type as WorkflowNodeType] || workflowNodeRegistry.bash;
};

export const getDefaultNodeData = (type: WorkflowNodeType) => {
  return { ...workflowNodeRegistry[type].defaultData };
};

export const edgeModeOptions = [
  { label: '顺序执行', value: 'sequence' },
  { label: '条件 True', value: 'condition_true' },
  { label: '条件 False', value: 'condition_false' },
  { label: '循环 Body', value: 'loop_body' },
  { label: '循环 Next', value: 'loop_next' },
  { label: '并行分支', value: 'parallel' }
];
