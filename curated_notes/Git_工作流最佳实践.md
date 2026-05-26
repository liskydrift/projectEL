---
id: curated-git-001
title: Git 工作流最佳实践
tags: [#devops, #git]
lifecycle: standard
next_review: 2026-06-10T09:00:00
stability: 14
difficulty: 2
reps: 3
created_at: 2026-05-15T14:00:00
type: note
---

# Git 工作流最佳实践

## 分支策略
- main: 生产分支，只接受 PR merge
- develop: 开发主分支
- feature/*: 特性分支，从 develop 切出
- fix/*: 修复分支

## Commit 规范
使用 Conventional Commits：
- feat: 新功能
- fix: 修复
- refactor: 重构
- docs: 文档
- test: 测试

## 合并策略
- 特性分支 → develop: Squash merge
- develop → main: 普通 merge 保留历史
