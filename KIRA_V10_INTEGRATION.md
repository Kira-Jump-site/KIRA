# KIRA! JUMP v10 采集、标签与双队列审核集成

**当前 repo 版本**：整合 v8→v9→v10 未提交源码，GitHub 基线 `ae1ec9df8ebba263e60fc0f9955450057d64a7fa`。所有内容保持为一个主分支提交。

## 工作通路

每源计划任务（目标 120 组合格待审作品/天，非保证）→ 上游真实元数据与来源内人气衡量 → 媒体 URL/尺寸/缩略图及预览核验 → 质量门槛过滤 → EdgeOne Blob pending → `/review.html` 默认全选/可反选/逐件剔除 → 管理员安全评级+媒体确认 → revisioned event → 仅批准的作品进入公开图库。每日无足够符合质量门槛的新作品时记录 shortfall，不用低质图凑数。

独立 `/reports.html`：匿名举报进入 Blob 独立队列，不自动下架；管理员确认后保留/下架或进一步调查。历史静态作品举报可收集，但涉及历史数据的下架尚需独立迁移，遇到不能下架的记录会报错而不是假成功。

审核网格默认每页 **100 组**，**仅请求缩略图**；点击卡片打开详情时才请求当前高画质预览，关闭即清空地址；支持全选/全不选/反选、批量拒绝与单件处理。作品中的多图不拆分。

## 一次性版本集成实现

GitHub 仓库保存真实 v8-v10 源码与守卫式合并器在 `kira-overlay-v10/`，`npm run build`/`npm test` 会通过 `scripts/prepare-kira-v10.mjs` **在干净的构建工作树中**将原始代码更新至 v10，再继续原本 EdgeOne 构建。这是过渡式离线可审计版本整合：源文件在构建工作树中修改，GitHub 提交存放补丁与源模块，没有预先改写主仓库每个原始文件。它对固定原始 SHA 做核对，拒绝不符合的文件，不触碰远端数据库。不要把它视为已经完成 EdgeOne 真机验收。

若需要直接编辑集成后的工作源码：在该仓库运行 `npm run check` 一次后，使用改写后的根目录 `lib`、`cloud-functions`、`edge-functions` 与 `public` 进行开发；重复运行检查会跳过已应用步骤。

## 命令与部署

```
npm install
npm run check
npm run build
```

**管理员配置**：EdgeOne Functions 设置 `KIRA_ADMIN_PASSWORD`（至少 12 字符）和 `KIRA_REPORT_SALT`（至少 16 字符）。不可将真实值提交或写在文档里。管理员两个页面独立，密钥经 `Authorization: Bearer` 发送，未配置时拒绝访问。EdgeOne Blob 使用原有 `kira-catalog-recovery-20261017`；勿更改 D1 历史数据或生产 DNS。

**功能验收**：在正确 EdgeOne 项目 `makers-rayudgbamzqb` 预览确认 Functions 路由、绑定、Blob 写读、12 个来源采集状态、100 张缩略图分页、高清按需加载、审批公开、生效后的分页与举报处理。Vercel 或本地 Node 测试不代表 EdgeOne Blob 验证。

**已知风险**：云端 Blob 不提供可依赖的原子 CAS 时，强并发审批/库存租约只能尽力防冲突，正式上线需进一步验证 EdgeOne 原子原语；旧静态历史目录的举报下架未贯通；上游 403/412 可能使每日目标无法达成。
