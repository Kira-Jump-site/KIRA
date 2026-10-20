# KIRA 统一元数据 & 真实来源优先 v6（未提交）

**目标**：只针对 `Kira-Jump-site/KIRA` 当前 `main` 的 `ae1ec9d`。当前只在本地生成代码与文档，未更新 GitHub、未部署 EdgeOne、未修改已清空的 D1。项目正确 EdgeOne ID：`makers-rayudgbamzqb`。

## 这次实际新增

- `lib/source-evidence-v6.mjs`: Booru 结构化 artist/uploader; 官方 Nekosia singleton `metadata.original`, `source.url`, `attribution.artist`; B站 module_author/module_stat；E-Shuushuu 网页详情评分、投票数、收藏和上传者；Zerochan 官方 `s=fav`、`t`、`d`、标签路径。缺失的原始标题不生成假原标题。
- `lib/media-dimensions-v6.mjs`: 真实图片头 PNG/JPEG/GIF/WebP 几何信息，且在整体接入补丁中与 GET 媒体探测及低质量硬门槛联动。
- `lib/source-popularity-v5.mjs`: 沿用来源站真实人气指标、来源内分位；本轮将 E-Shuushuu 真实收藏数置于主指标。**分辨率、发布时间、媒体可用性和作者完整度都不计入人气分**。
- `lib/tag-ontology-v5.mjs`: 保留 45+ 组手工核实同义词，多语言原文与分类标签；未知词生成 stable ID 但分类可信度标注为未确认，并非声称自动知道翻译。原始 tags 不丢失。
- `patches/apply-kira-v6.mjs`: 六个源文件的真实 SHA1 Git Blob 内容校验 + 各具体锚点预检，任何失败不写文件；只覆盖源码采集层，不修改前端或数据库。
- `scripts/probe-12-live.mjs`: 供具备外网权限的**同一完整工程**运行的只读 12 源采样，不进行数据库写入；每源至少检测真实 JSON 和若干媒体返回并生成证据 JSON。当前环境无法执行联网检测，明确标注未运行。

## 使用（完整原仓库检出后）

```bash
node patches/apply-kira-v6.mjs /absolute/path/to/KIRA
# 复制 patches 的源文件、单元测试、scripts/probe-12-live.mjs 到完整 KIRA 仓库对应位置
cd /absolute/path/to/KIRA
node --test tests/*.test.mjs
npm run check
npm run build
node scripts/probe-12-live.mjs kira-live-probe-results.json
```

`apply-kira-v6.mjs` 需要在本代码包内执行，以便找到 `../lib` 源模块；它自身会复制四个新模块到完整仓库。probe 脚本请另行复制到 KIRA 的 `scripts/`。`tests/*-v6.test.mjs` 请复制到 `tests/`。

**重要限制**：这套代码目前为有来源证据的**未提交集成补丁**，不是“已发布、12 源线上全绿”证明。需要在目标 EdgeOne Maker `makers-rayudgbamzqb` 预览环境做真实 HTTP、图片、Blob 验收，然后才允许最终一次 GitHub 提交。不可将 D1 清空视为 Blob 清空。旧静态 catalog 仍会通过 legacy fallback 读取，要在新 Blob 验收后切换索引，不能提前误删。

详见 `evidence/SOURCE_AUDIT_2026-10-18.md` 的来源文档/历史数据/未验证事实分类。

## 明确修复的危险错误

旧 `source-adapters.mjs` 将 Danbooru `rating='s'` 错误地当成 safe；正确是 sensitive，而 Gel/Moebooru 的 `rating='s'` 才是 safe。v6 按引擎协议分别转换，新增回归测试。

HTTP API 级联网探测仍未通过——Cloudflare 连接器的执行沙盒拒绝访问源域名，且容器 DNS 失效。**本轮只能将零散来源的官方页面可用性、旧仓库真实记录和离线测试视为已验证，不承诺线上 12 源可采集。**
