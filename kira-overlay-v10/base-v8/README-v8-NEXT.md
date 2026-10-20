# KIRA v8 | 统一标签与真实源评分（未提交增量）

## 权威基线、纪律

- 唯一仓库 `Kira-Jump-site/KIRA`，`main=ae1ec9df8ebba263e60fc0f9955450057d64a7fa`。
- 2026-10-18 已从 GitHub 插件核对六个受影响文件 Git Blob SHA，均与 `patches/apply-kira-v8.mjs` 白名单严格一致。
- 正确 EdgeOne `makers-rayudgbamzqb`，Blob `kira-catalog-recovery-20261017`。本包绝不运行云端数据库、GitHub 写入、部署。
- 本包只是增量（旧 v7 包加新的 v8 修补），**不是完整仓库、不是已在正式源码集成通过的发布版**。

## 真实新发现

2026-10-18 Vercel 原有 KIRA 临时沙盒执行纯只读 `GET https://api.nekosia.cat/api/v1/tags`：HTTP 200；实际 JSON 有 `status`, `success`, `tags`, `anime`, `characters`，其中普通标签 **1,373**、作品/系列 **15**、角色 **56**，合计 1,444 条真实原生术语。详情见 Nekosia 官方 API 文档 /tags（来源类型不能混用）。临时沙盒已停止。

以前只有 45+ 条人工跨语别名，不足以支持全部图源。现在 `source-tag-registry-v8.mjs` 自动从 **实际来源公开词表** 构建来源原生索引，并区分 `general/ip/character`；可生成稳定标准 ID 和查询语法。只有“已知跨语别名”与“上游原生翻译配对”才被合并；未知词保留来源+类型 ID，不伪造翻译。

`patches/apply-kira-v8.mjs` 将 Nekosia `additionalTags` 构建改为：仅当用户明确传定向标签时获取官方 `/tags`、对照已知原生词表、未知标签拒绝而非宽松拼接。质量排序侧还增加了 `canonicalTag()` 解析，支持用户用“初音未来”命中来源原始 `hatsune_miku`，不再因语言不同筛掉真正相关作品。一般补库时不额外请求词表。未来若要加缓存，可对这个已验证 JSON 做安全的 EdgeOne Blob TTL 缓存，不需要改标签数据模型。

## 真实高分优先缺陷修复

v7 的 `evaluateSourcePool()` 对样本小于 12 时按最新上传时间排序，这使源站分数较高的作品在补库时反而落后。v8 改为：

- 真正的来源评分/收藏/点赞信号按同一个来源、**同一个实际指标**比较，不混入分辨率、时间或资料完整度。
- 样本达到 12 时给出分位 `quality_score`，不够 12 时仍按上游实际分数排序，但 `quality_score=null`、状态 `insufficient_reference`，绝不虚构百分位。
- 历史基线过小时先与当前候选批合并，防止历史记录 1 条导致 30 条本批全部“分位未知”。
- 上游自带推荐次序（Pixiv Yuki、Nekosia 等不公开热度的源）不再被“发布时间更新”意外覆盖，保持 `unrated`。
- E-Shuushuu 收藏=0 且至少 5 票时，允许使用贝叶斯平滑的真实评分作为另一个独立指标；1 票高分不可冒充高质量。

## 逐源真实状态（延续 v7）

- 新发现：Nekosia 官方完整词表已联网实测可读，支持 `additionalTags`、`blacklistedTags`；主 API 暂无真实热度，不打假分。
- Safebooru / Cosbooru / E-Shuushuu / Wallhaven / Pixiv Yuki / 米游社等上一轮都成功取到作品与首件媒体字节。B站 `/opus/feed/space` + `/detail` 双阶段结构已验证；Zerochan 用 HTML 热门列表 + ID 详情 fallback。**这些仍要在真正 EdgeOne runtime 做复测。**
- Konachan 两个公开 API 域名均是 Cloudflare 403，Safedonmai 图片 CDN 为 403，仍然失败隔离，没有在 v8 中伪造绕过。

## 测试

`node --test tests/*.test.mjs` 本地 65/65 通过：原 v7 的 55 项 + v8 新增 10 项，覆盖样本不足的来源原分排序、分指标统计、Pixiv 推荐次序、E-Shuushuu 有票评分、真实词表分类与查询、不存在的 native tag 拒绝。

## 集成方法与剩余验收

在**完整**新仓库 `main=ae1ec9d` 的备份副本中：

```bash
node patches/apply-kira-v8.mjs /absolute/path/to/KIRA
# 只运行在受影响 Git Blob SHA 完全匹配的工程副本
node --test tests/*.test.mjs
npm run build
```

本轮仅完成独立增量测试和六个源文件 SHA 只读校验；上述“整仓补丁套用、完整 Node 回归、EdgeOne Blob 读写、EdgeOne Preview、最终 GitHub 唯一提交”尚**未完成，不能冒称**。KIRA 原站前端、Firefly、Cloudflare D1 均未变动。
