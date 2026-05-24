---
name: fetch-and-summarize-news
description: >-
  抓取科技新闻并自动整理为学习卡片
---

# 新闻抓取与总结 运行手册

当你执行此技能时，必须按顺序严格执行以下步骤：

### 步骤 1: bash 节点
- **描述**：运行 bash 终端指令进行系统操作。
- **指令**：使用 `bash` 工具执行以下命令：

```bash
curl -s https://news.ycombinator.com/
```

### 步骤 2: llm 节点
- **描述**：调用语言模型进行推理分析。
- **提示词**：结合上下文与上一步输出，执行此 Prompt：

> 从中筛选出5条与AI相关的最热新闻并总结

### 步骤 3: write_file 节点
- **描述**：将生成的数据持久化写入文件。
- **操作**：使用 `write` 写入到以下路径：`./study-cards/ai-news.md`

