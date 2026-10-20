# KIRA v7 — 真实联网取证、源码变更与交付限制（未提交）

2026-10-18。目标基线是 **Kira-Jump-site/KIRA main `ae1ec9df8ebba263e60fc0f9955450057d64a7fa`**。正确 EdgeOne 项目为 `makers-rayudgbamzqb`。本包是增量补丁，不是完整前端源码，不代表已经部署到 EdgeOne。**GitHub、EdgeOne Blob、D1、本地旧站均未因本次包制作被改动。**

## 真实 HTTP 取证（Vercel 既有 Sandbox，已停机）

用连接的 Vercel Sandbox `kira-recovery-20261017` 的 Node fetch 发起 12 源的公开、只读 API 请求，并用当前 GitHub `main` 的真实 `source-adapters.mjs`（复制到临时镜像路径）运行 discovery，结果如下：

| 来源 | 真实原版适配器发现 | 明确的真实限制/补救 |
|---|---:|---|
| Safebooru | HTTP 200 / 30 件 | Gelbooru 原生 `score` 与普通标签；首件缩略图与预览图 HEAD + GET 字节校验通过 |
| Safedonmai | HTTP 200 / 30 件 | CDN `cdn.donmai.us` 首件缩略、预览均为 403；GET 和带 Referer 的 GET 仍 403。新代码绝不放行未验证媒体，失败隔离；不能宣称可显示 |
| Cosbooru | HTTP 200 / 30 件 | 真实 `score/fav_count/tag_string_artist` 等 Danbooru 字段；首件媒体通过 |
| Konachan | HTTP 403 | `.net` 与 `.com` 都遇到 Cloudflare 挑战页，未获得真实作品；不能宣称本线路已修复 |
| Nekosia | HTTP 200 / 20 件 | 官方返回 `metadata.original` 尺寸、`attribution.artist`、`source.url`，无热度评分；首件媒体通过 |
| E-Shuushuu | HTML HTTP 200 / 12 件 | 原解析器 12 件标签全缺；真实详情 `data-tag-type` 1=general、2=source、3=artist、4=character；真实 uploader username、投票、收藏；首件媒体通过 |
| Pixiv Yuki | HTTP 200 / 4 件 | 公开推荐和单 ID 详情未返回收藏/浏览字段，应 `unrated`；首件媒体通过 |
| Pixiv | HTTP 200 / 4 件 | 使用同一公开推荐；没有源站热度字段，保留作者/标题/翻译标签，标 `unrated` |
| 米游社 Cos | HTTP 200 / 17 件 | 原作者与发帖人必须分开，一帖多图；首件媒体通过；仅 Cosplay 文本过滤不足以自动验证真人，仍须审核 |
| Wallhaven | HTTP 200 / 24 件 | 搜索列表缺少作品标签，详情 `/api/v1/w/id` 公开标签和 uploader、收藏、原始出处；首件媒体通过 |
| Bilibili Opus | 旧接口 412 | 原 `/feed/space` 412；`/opus/feed/space` HTTP 200、code=0、20 条，但数据结构变为 `opus_id,content,cover,stat`；逐 `opus_id` 访问旧 `/detail?id=...` HTTP 200、code=0，获取真正多图与作者/话题/点赞。v7 直接独立实现这条两步采集 |
| Zerochan | 列表 JSON 500 | `/id?json` HTTP 200；`/?p=1&s=fav&t=1` HTML HTTP 200，含 `data-id`；实现 JSON→HTML ID→每帖 JSON 的受限 fallback。`&d=large` HTML 在本测试仍 500，fallback 删除该参数；官方 API 60 次/分钟限制，请控制并发/间隔 |

部分接口可用性可能依地区/时段变化。上述只是本环境下真实 HTTP 证据，不是中国大陆三网或 EdgeOne 云端的可用性保证。

## 已实现的本地增量（本包）

- `lib/tag-ontology-v5.mjs`：45+ 经过明确映射的多语概念组，Pixiv 明确 name/translated_name 配对，保留未映射原始标签并以来源+类型命名空间稳定保存。绝不把普通标签当作者。
- `lib/source-popularity-v5.mjs`：只依据源站真实 `score / 收藏 / 点赞` 在来源和指标维度分别做分位排名；分辨率、完整度、日期 **不加分**。无原生热度则 `unrated`，小样本不足12则 `insufficient_reference`；区分准入门槛、评分和置信度。每源独立库存阈值、目标配额和少量探索位。
- `lib/source-evidence-v6.mjs`：Booru 各引擎评级解码、分开原作者与上传者、Nekosia 单作品数据、B站正文/话题/点赞、E-Shuushuu 上传者和真实评分。
- `lib/source-details-v7.mjs`：Wallhaven 标签/原始出处；Zerochan ID 详情；E-Shuushuu Svelte 结构化标签、原站出处。
- `patches/provider-functions-v7.mjs`：Wallhaven 列表→详情；Zerochan JSON 列表失败→HTML ID→逐件 JSON；Bilibili 真实新 Opus 作者流→逐帖 detail 解析真正多图。全部有并发和单批上限，失败单源隔离。
- `patches/apply-kira-v7.mjs`：严格校验当前主分支六个相关文件的 Git blob SHA；仅在所有锚点匹配后修改目标本地源码，不使用 GitHub API 写操作。防止从旧恢复版误覆盖新版。
- `lib/media-dimensions-v6.mjs`：图片字节头解析尺寸。实时入库阶段校验缩略图和预览图；不通过的候选在元数据存储前拒绝（但可在健康报告中记录失败）。
- 分数历史按 `source:metric` 独立保存，避免把收藏量和 Booru 分数混成同一分位数基线；旧静态作品 ID 不再因 D1 清库而永久阻止 EdgeOne 新索引回收。

## 测试和障碍

`node --test tests/*.test.mjs`：**55/55 离线单元测试通过**（本包里的单元与集成模拟）。真实 HTTP 是上表另外记录的结果，**不能把 55/55 当成云端 API 验收**。

未完成：六个目标源码的补丁执行后完整 Node 回归；EdgeOne Blob 真实读写、库存回填、EdgeOne 网页预览；Konachan 403、Safedonmai CDN 403 问题不应伪造绕过；Zerochan HTML 的稳定性与官方速率限制须压测。**本包没有提交 GitHub，用户要求只有最终一次提交**。

## 使用（仅本地拥有完整 git main 的情况下）

备份原始源码 → 在测试副本中运行 `node patches/apply-kira-v7.mjs /absolute/path/to/project` → 将本包的 `tests` 中新测试加入项目并运行 `node --test tests/*.test.mjs` → EdgeOne Preview 手动检查真实媒体及 Blob 状态。切忌直接在生产/非预期仓库中运行。
