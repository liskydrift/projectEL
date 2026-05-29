import fs from "fs-extra";
import path from "path";

export interface WorkflowNode {
  id: string;
  type:
    | "bash"
    | "llm"
    | "read_file"
    | "write_file"
    | "api_request"
    | "condition"
    | "loop"
    | "subagent"
    | string;
  data: {
    command?: string;
    prompt?: string;
    path?: string;
    content?: string;
    method?: string;
    url?: string;
    headers?: string;
    body?: string;
    expression?: string;
    trueLabel?: string;
    falseLabel?: string;
    iterable?: string;
    maxIterations?: number;
    itemKey?: string;
    agent?: string;
    mode?: string;
    instruction?: string;
    outputKey?: string;
    cwd?: string;
    timeout?: number;
    [key: string]: any;
  };
}

export interface WorkflowEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  label?: string;
  data?: {
    mode?: string;
    note?: string;
    [key: string]: any;
  };
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export async function compileWorkflowToSkill(jsonPath: string, outputPath: string): Promise<void> {
  const workflow: Workflow = await fs.readJson(jsonPath);

  if (!workflow.id || !workflow.name) {
    throw new Error("Invalid workflow: Missing id or name");
  }

  const skillName = workflow.id.toLowerCase().replace(/_/g, "-");
  const orderedNodes = orderNodesByEdges(workflow.nodes, workflow.edges || []);
  const outgoingEdges = groupEdgesBySource(workflow.edges || []);

  let markdown = `---\n`;
  markdown += `name: ${skillName}\n`;
  markdown += `description: >-\n`;
  markdown += `  ${workflow.description || workflow.name}\n`;
  markdown += `---\n\n`;

  markdown += `# ${workflow.name} 运行手册\n\n`;
  markdown += `当你执行此技能时，必须按照画板中的节点和连接关系完成任务。普通连线代表顺序执行；条件、循环和并行连线代表对应的控制流。\n\n`;

  markdown += `## 工作流连接\n\n`;
  if (!workflow.edges || workflow.edges.length === 0) {
    markdown += `- 当前工作流没有显式连线，请按节点列表顺序执行。\n\n`;
  } else {
    workflow.edges.forEach((edge) => {
      markdown += `- ${edge.source} -> ${edge.target}`;
      markdown += ` (${describeEdgeMode(edge)})`;
      if (edge.data?.note) markdown += `：${edge.data.note}`;
      markdown += `\n`;
    });
    markdown += `\n`;
  }

  markdown += `## 执行步骤\n\n`;
  orderedNodes.forEach((node, idx) => {
    markdown += `### 步骤 ${idx + 1}: ${getNodeTitle(node)}\n`;
    markdown += renderNodeInstruction(node);

    const exits = outgoingEdges[node.id] || [];
    if (exits.length > 0) {
      markdown += `- **下一步连接**：\n`;
      exits.forEach((edge) => {
        markdown += `  - ${describeEdgeMode(edge)} -> ${edge.target}`;
        if (edge.data?.note) markdown += `；备注：${edge.data.note}`;
        markdown += `\n`;
      });
      markdown += `\n`;
    }
  });

  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, markdown, "utf-8");
}

function renderNodeInstruction(node: WorkflowNode): string {
  switch (node.type) {
    case "bash":
      return renderBashNode(node);
    case "llm":
      return renderLlmNode(node);
    case "read_file":
      return renderReadFileNode(node);
    case "write_file":
    case "write":
      return renderWriteFileNode(node);
    case "api_request":
      return renderApiRequestNode(node);
    case "condition":
      return renderConditionNode(node);
    case "loop":
      return renderLoopNode(node);
    case "subagent":
      return renderSubagentNode(node);
    default:
      return `- **描述**：执行自定义操作（节点类型：${node.type}）。\n- **配置**：\`${JSON.stringify(node.data)}\`\n\n`;
  }
}

function renderBashNode(node: WorkflowNode): string {
  let markdown = `- **描述**：运行 bash 终端指令进行系统操作。\n`;
  if (node.data.cwd) markdown += `- **工作目录**：\`${node.data.cwd}\`\n`;
  if (node.data.timeout) markdown += `- **超时**：${node.data.timeout} 秒\n`;
  markdown += `- **指令**：使用 \`bash\` 工具执行以下命令：\n\n`;
  markdown += `\`\`\`bash\n${node.data.command || ""}\n\`\`\`\n\n`;
  return markdown;
}

function renderLlmNode(node: WorkflowNode): string {
  let markdown = `- **描述**：调用语言模型进行推理、分析、总结或生成。\n`;
  if (node.data.model) markdown += `- **模型覆盖**：${node.data.model}\n`;
  if (node.data.outputKey) markdown += `- **输出变量**：\`${node.data.outputKey}\`\n`;
  markdown += `- **Prompt**：结合上文与上一步输出执行以下要求：\n\n`;
  markdown += `> ${node.data.prompt || ""}\n\n`;
  return markdown;
}

function renderReadFileNode(node: WorkflowNode): string {
  let markdown = `- **描述**：读取本地文件内容并作为后续节点上下文。\n`;
  markdown += `- **读取路径**：\`${node.data.path || ""}\`\n`;
  if (node.data.outputKey) markdown += `- **输出变量**：\`${node.data.outputKey}\`\n`;
  markdown += `\n`;
  return markdown;
}

function renderWriteFileNode(node: WorkflowNode): string {
  let markdown = `- **描述**：将生成的数据持久化写入文件。\n`;
  markdown += `- **写入路径**：\`${node.data.path || ""}\`\n`;
  markdown += `- **写入模式**：${node.data.mode === "append" ? "追加" : "覆盖"}\n`;
  if (node.data.content) markdown += `- **写入内容来源**：${node.data.content}\n`;
  markdown += `\n`;
  return markdown;
}

function renderApiRequestNode(node: WorkflowNode): string {
  const method = node.data.method || "GET";
  const url = node.data.url || "";
  let curl = `curl -X ${method} "${url}"`;

  if (node.data.headers) {
    node.data.headers
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((header) => {
        curl += ` \\\n  -H "${header.replace(/"/g, '\\"')}"`;
      });
  }

  if (node.data.body && method !== "GET") {
    curl += ` \\\n  -d '${node.data.body.replace(/'/g, "'\\''")}'`;
  }

  let markdown = `- **描述**：发起 HTTP API 请求，并将响应作为后续节点上下文。\n`;
  if (node.data.outputKey) markdown += `- **输出变量**：\`${node.data.outputKey}\`\n`;
  markdown += `- **请求示例**：\n\n`;
  markdown += `\`\`\`bash\n${curl}\n\`\`\`\n\n`;
  return markdown;
}

function renderConditionNode(node: WorkflowNode): string {
  let markdown = `- **描述**：根据表达式选择 true 或 false 分支。\n`;
  markdown += `- **判断条件**：${node.data.expression || ""}\n`;
  markdown += `- **True 分支**：${node.data.trueLabel || "true"}\n`;
  markdown += `- **False 分支**：${node.data.falseLabel || "false"}\n\n`;
  return markdown;
}

function renderLoopNode(node: WorkflowNode): string {
  let markdown = `- **描述**：遍历集合或重复执行循环体分支。\n`;
  markdown += `- **循环对象**：${node.data.iterable || ""}\n`;
  markdown += `- **单项变量**：\`${node.data.itemKey || "item"}\`\n`;
  markdown += `- **最大次数**：${node.data.maxIterations || 1}\n\n`;
  return markdown;
}

function renderSubagentNode(node: WorkflowNode): string {
  let markdown = `- **描述**：调用指定子代理或专门能力模块。v1 中该节点会编译为明确的执行说明，不额外启动独立运行时。\n`;
  markdown += `- **子代理**：${node.data.agent || ""}\n`;
  markdown += `- **编排模式**：${node.data.mode || "chain"}\n`;
  markdown += `- **任务说明**：${node.data.instruction || ""}\n\n`;
  return markdown;
}

function getNodeTitle(node: WorkflowNode): string {
  const titles: Record<string, string> = {
    bash: "Bash 执行节点",
    llm: "LLM 推理节点",
    read_file: "读取文件节点",
    write_file: "写入文件节点",
    write: "写入文件节点",
    api_request: "API 请求节点",
    condition: "条件分支节点",
    loop: "循环节点",
    subagent: "子代理节点"
  };
  return `${titles[node.type] || `${node.type} 节点`} (${node.id})`;
}

function describeEdgeMode(edge: WorkflowEdge): string {
  const mode = edge.data?.mode || getModeFromHandle(edge.sourceHandle);
  const labels: Record<string, string> = {
    sequence: "顺序执行",
    condition_true: "条件 True",
    condition_false: "条件 False",
    loop_body: "循环 Body",
    loop_next: "循环 Next",
    parallel: "并行分支"
  };
  return labels[mode] || edge.label || "顺序执行";
}

function getModeFromHandle(sourceHandle?: string | null): string {
  if (sourceHandle === "true") return "condition_true";
  if (sourceHandle === "false") return "condition_false";
  if (sourceHandle === "body") return "loop_body";
  if (sourceHandle === "next") return "sequence";
  return "sequence";
}

function groupEdgesBySource(edges: WorkflowEdge[]): Record<string, WorkflowEdge[]> {
  return edges.reduce<Record<string, WorkflowEdge[]>>((acc, edge) => {
    if (!acc[edge.source]) acc[edge.source] = [];
    acc[edge.source].push(edge);
    return acc;
  }, {});
}

function orderNodesByEdges(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  if (!edges || edges.length === 0) {
    return nodes;
  }

  const inDegree: Record<string, number> = {};
  const adj: Record<string, string[]> = {};
  const nodeMap: Record<string, WorkflowNode> = {};

  nodes.forEach((node) => {
    inDegree[node.id] = 0;
    adj[node.id] = [];
    nodeMap[node.id] = node;
  });

  edges.forEach((edge) => {
    if (adj[edge.source] && inDegree[edge.target] !== undefined) {
      adj[edge.source].push(edge.target);
      inDegree[edge.target]++;
    }
  });

  const queue: string[] = [];
  nodes.forEach((node) => {
    if (inDegree[node.id] === 0) {
      queue.push(node.id);
    }
  });

  const result: WorkflowNode[] = [];
  while (queue.length > 0) {
    const u = queue.shift()!;
    if (nodeMap[u]) {
      result.push(nodeMap[u]);
    }
    if (adj[u]) {
      adj[u].forEach((v) => {
        inDegree[v]--;
        if (inDegree[v] === 0) {
          queue.push(v);
        }
      });
    }
  }

  const addedIds = new Set(result.map((node) => node.id));
  nodes.forEach((node) => {
    if (!addedIds.has(node.id)) {
      result.push(node);
    }
  });

  return result;
}
