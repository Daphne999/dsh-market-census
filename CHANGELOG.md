# Changelog

## 0.1.0 — 2026-11-23

首个发布版。

- 四个只读工具：`market_census` / `market_find` / `market_dupe` / `market_delta`
- 输入为本地缓存的 awesome-dsh-plugin `plugins.json`；`path` → `DSH_MARKET_FILE` → `$DSH_HOME/market/plugins.json`
- 离线、确定性：无网络、无模型、无写盘；相似度用字符 bigram Jaccard（名称权重 0.65）
- 验证：`node --test` 8/8；真实快照 smoke（12,763 条 / peak=361 / delta 251）；隔离 profile 干净启动
