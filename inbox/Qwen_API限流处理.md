---
id: inbox-temp-002
title: Qwen API 限流处理笔记
tags: [#api, #qwen, #transient]
lifecycle: decay_fast
created_at: 2026-05-25T11:00:00
type: note
---

# Qwen API 限流处理

## 错误码
HTTP 429 Too Many Requests

## 限流策略
- 标准版: 100 RPM
- 增强版: 300 RPM

## 处理方案
- 实现指数退避重试
- 请求队列 + 令牌桶
- 监控剩余配额（响应头 X-RateLimit-Remaining）
