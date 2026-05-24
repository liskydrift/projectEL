import fs from "fs-extra";
import path from "path";

export interface WorkflowNode {
  id: string;
  type: "bash" | "llm" | "write_file" | string;
  data: {
    command?: string;
    prompt?: string;
    path?: string;
    [key: string]: any;
  };
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: Array<{ source: string; target: string }>;
}

export async function compileWorkflowToSkill(jsonPath: string, outputPath: string): Promise<void> {
  const workflow: Workflow = await fs.readJson(jsonPath);

  // 验证基本参数
  if (!workflow.id || !workflow.name) {
    throw new Error("Invalid workflow: Missing id or name");
  }

  const skillName = workflow.id.toLowerCase().replace(/_/g, "-");

  // 1. 生成 SKILL.md Frontmatter 描述段 (符合 Pi 规范)
  let markdown = `---\n`;
  markdown += `name: ${skillName}\n`;
  markdown += `description: >-\n`;
  markdown += `  ${workflow.description || workflow.name}\n`;
  markdown += `---\n\n`;

  markdown += `# ${workflow.name} 运行手册\n\n`;
  markdown += `当你执行此技能时，必须按顺序严格执行以下步骤：\n\n`;

  // 2. 根据拓扑排序重排节点
  const orderedNodes = orderNodesByEdges(workflow.nodes, workflow.edges);

  orderedNodes.forEach((node, idx) => {
    markdown += `### 步骤 ${idx + 1}: ${node.type} 节点\n`;
    if (node.type === "bash") {
      markdown += `- **描述**：运行 bash 终端指令进行系统操作。\n`;
      markdown += `- **指令**：使用 \`bash\` 工具执行以下命令：\n\n`;
      markdown += `\`\`\`bash\n${node.data.command || ""}\n\`\`\`\n\n`;
    } else if (node.type === "llm") {
      markdown += `- **描述**：调用语言模型进行推理分析。\n`;
      markdown += `- **提示词**：结合上下文与上一步输出，执行此 Prompt：\n\n`;
      markdown += `> ${node.data.prompt || ""}\n\n`;
    } else if (node.type === "write_file" || node.type === "write") {
      markdown += `- **描述**：将生成的数据持久化写入文件。\n`;
      markdown += `- **操作**：使用 \`write\` 写入到以下路径：\`${node.data.path || ""}\`\n\n`;
    } else {
      markdown += `- **描述**：执行自定义操作（节点类型：${node.type}）。\n`;
      markdown += `- **配置**：${JSON.stringify(node.data)}\n\n`;
    }
  });

  // 确保父目录存在
  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, markdown, "utf-8");
}

function orderNodesByEdges(nodes: WorkflowNode[], edges: Array<{ source: string; target: string }>): WorkflowNode[] {
  if (!edges || edges.length === 0) {
    return nodes;
  }

  const inDegree: Record<string, number> = {};
  const adj: Record<string, string[]> = {};
  const nodeMap: Record<string, WorkflowNode> = {};

  nodes.forEach(node => {
    inDegree[node.id] = 0;
    adj[node.id] = [];
    nodeMap[node.id] = node;
  });

  edges.forEach(edge => {
    if (adj[edge.source] && inDegree[edge.target] !== undefined) {
      adj[edge.source].push(edge.target);
      inDegree[edge.target]++;
    }
  });

  const queue: string[] = [];
  nodes.forEach(node => {
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
      adj[u].forEach(v => {
        inDegree[v]--;
        if (inDegree[v] === 0) {
          queue.push(v);
        }
      });
    }
  }

  // 补充循环依赖或孤立节点
  const addedIds = new Set(result.map(n => n.id));
  nodes.forEach(node => {
    if (!addedIds.has(node.id)) {
      result.push(node);
    }
  });

  return result;
}
