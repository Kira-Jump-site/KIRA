# KIRA! JUMP — 原站恢复工程 (2026-10-17)

部署目标：新 GitHub 仓库 Kira-Jump-site/KIRA；原 EdgeOne 项目 makers-l0snbl3rzgnw。禁止连接旧 GitHub 仓库。

## 已恢复
- public/ 是 2026-10-17 EdgeOne 实际响应的 v7.35.0 首页、JS、CSS 和管理页面。文件 SHA-256 与线上一致。
- recovered/cloudflare-v738/ 独立保存 Cloudflare v7.38.0 静态部署资源；未擅自覆盖原 EdgeOne 设计。
- 从 Cloudflare D1 官方 SQL 导出重建：8,745 作品、9,084 图片；99 个目录分片 + 9 个图源 API 索引、一个 manifest。
- Edge Functions 实现可验证的目录分页、稳定随机游标；Safebooru 的实时发现调用上游 API。

## 尚未恢复/不承诺可用
- Konachan 上游当前 403；其他图源动态请求、高清预览还需要实机验证。
- EdgeOne Blob 并未确认完成入库。scripts/migrate-blob.mjs 提供独立迁移 + 强一致哈希核验，须在安全环境配置 Token 后执行。
- 用户身份、多设备同步、持久化刷新、审核/举报写入仍待配置；未配置路由真实返回 503，不伪报成功。
- D1 原始 SQL 含非公开记录，没有放入公开 GitHub 仓库，已在 Cloudflare 私有 KV 和沙盒单独保留。

## 由你在 EdgeOne 一次性构建预览
1. 在原 EdgeOne 项目 makers-l0snbl3rzgnw 重绑本 GitHub main；不要新建 EdgeOne 项目。
2. 项目根目录 /，安装命令 npm install，构建命令 npm run build，输出目录 dist。
3. 检查首页和后台、manifest.json、/api/catalog?source=safebooru&limit=30、/api/discover?source=safebooru&page=1。
4. 检查 GitHub 自动构建联动，避免在手动验收之前触发不必要的正式部署。

## 本地验证
npm run check
npm run build

## Blob 迁移
从安全环境设置 MAKERS_API_TOKEN，运行 node scripts/migrate-blob.mjs。仅写入原项目的独立命名空间 kira-catalog-recovery-20261017，路径前缀 catalog/v1/，会核验每个对象 SHA-256，不删除原 D1，也不更改线上数据通路。
SQL 重新生成目录：设置 KIRA_D1_SQL_FILE=/path/to/database.sql，然后运行 python3 scripts/regenerate-catalog-from-d1.py。
