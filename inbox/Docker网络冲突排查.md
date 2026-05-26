---
id: inbox-temp-001
title: 2026-05 Docker 网络冲突排查
tags: [#bug, #docker, #transient]
lifecycle: decay_fast
created_at: 2026-05-24T15:30:00
type: note
---

# Docker 网络冲突排查

## 现象
容器 A 无法访问容器 B 的 8080 端口，返回 Connection refused。

## 排查步骤
1. `docker network ls` — 确认两个容器在同一网络
2. `docker inspect <container>` — 检查 IP 地址
3. `docker compose logs` — 目标容器日志无异常

## 根因
容器 B 绑定了 127.0.0.1:8080，而非 0.0.0.0:8080，导致仅宿主机可访问。

## 解决方案
将绑定地址改为 0.0.0.0 或使用容器名直接通信。
