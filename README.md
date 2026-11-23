# dsh-market-census · 插件市场普查

> 在写插件之前，先知道这个方向有多少人做过。

`dsh-market-census` 是 DeepSeek Harness（DSH）的 Host-only 插件：读一份**本地缓存的** awesome-dsh-plugin 快照，离线回答四个问题——市场多大、谁已经做了、这个名字是不是重复、今天新增了什么。只读、确定性、不联网、不调模型。

---

## 为什么做这个

每日插件流水线的渠道 A 要求「按关键词/类别统计已有实现，写清为什么是缺口而不是重复」。过去这件事靠临时脚本：`_gap_analysis.py`、`_gap2.py`、`_gap3.py`、一串 `node -e` 统计——同一个动作重复了十几次，每次口径还不一样。

市场里已有市场**浏览**（官方插件页、dshmarket 侧栏、排行榜），但没有面向作者的**普查/查重**工具。这个插件补的就是这一块：把「数竞品」变成一次工具调用，结果可复现。

## 它怎么工作

```
plugins.json（本地缓存快照）
   │
   ├─ 归一化 name/category/zh/en/stars/added/url
   ├─ census：类别计数 + 指定关键词命中数
   ├─ find：按名称+中英描述做排序竞品检索
   ├─ dupe：字符 bigram Jaccard（名称权重 0.65）→ taken / crowded / clear
   └─ delta：按 added 日期筛新增，按类别分组
```

没有网络请求：快照由外部（每日流水线）下载，插件只读文件。

## 四个工具

| 工具 | 干什么 |
|---|---|
| `market_census({ path?, keywords?, top? })` | 总数、updated、类别 Top N、关键词命中数 |
| `market_find({ query, path?, limit? })` | 竞品检索：名称完全匹配 > 名称包含 > 描述包含，按星数排序 |
| `market_dupe({ name, description?, path?, threshold?, limit? })` | 查重：`taken`（同名）/`crowded`（近重复 ≥ 阈值）/`clear` |
| `market_delta({ since, path?, top? })` | 某日期之后的新增数量、类别分布、样本名 |

`path` 省略时依次取：`DSH_MARKET_FILE` 环境变量 → `$DSH_HOME/market/plugins.json`。

## 拿快照

```bash
curl -sL https://awesome-dsh-plugin.com/plugins.json -o "$DSH_HOME/market/plugins.json"
```

（每日流水线本来就会下载同一份文件，可直接指向 `_daily/market-YYYY-MM-DD.json`。）

## 边界与不做什么

- **不联网**：不会自己去拉市场、不调官方 registry；快照由你给。
- **不调模型**：相似度是 bigram Jaccard，确定性可复现；不判断「这个想法好不好」。
- **不写盘**：只读 JSON，不建索引、不改快照。
- **不是市场浏览器**：不做 UI、不安装/更新插件；看市场请用官方页面或 dshmarket。
- 快照是某一时刻的截面；`delta` 只对快照里的 `added` 字段负责，不代表实时。

## 验证记录

**2026-11-23**（runtime node v24.21.0）：

- `node --test --test-isolation=none test/*.test.mjs` — **8/8 pass**（加载/归一化、bigram 对称性、census 计数、find 排序、dupe 三态、delta 过滤、工具注册、输出无 null）
- `node scripts/smoke.mjs`（真实快照 12,763 条）：
  - census total 12763，top 类别 ui 2544
  - keywords: peak=361 · error=262 · 会话日志=212
  - find "offpeak" → 5 个候选
  - dupe 同名 `taken`、假名 `clear`
  - delta since 2026-11-22 → 251 个新增
- 隔离 profile（`dsh-base` + `dsh-web-app` + 本插件）真实启动：日志 1 行 URL，无激活错误

## 安装

```bash
dsh plugin --profile desktop add https://github.com/Daphne999/dsh-market-census
```

装完重启 DSH，配好 `DSH_MARKET_FILE`（或在调用时传 `path`）。

## 许可

MIT
