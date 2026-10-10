# AHGS NOVA

AHGS（自动启发式算法生成系统）平台的增强版网页前端，包含两个实现：

| 目录 | 说明 |
| --- | --- |
| [`ahgs-nova/`](ahgs-nova/) | 原生 JavaScript 版（**已归档**，功能与 Vue 版一致，不再更新） |
| [`ahgs-nova-vue/`](ahgs-nova-vue/) | Vue 3 版（运行时已内置，无需 npm） |
| [`ahgs-nova-sfc/`](ahgs-nova-sfc/) | Vue 3 单文件组件（SFC）原生版（Vite 构建，`.vue` 文件组织，功能一致） |

> **Next 版前端（ahgs-nova-next）与自建后端（ahgs-nova-be）已于 2026-10-09 / 2026-10-10 先后迁出**
> 到独立 monorepo [ahgs-nova-next](https://github.com/rickylxw/ahgs-nova-next)（be+next 同仓）。
> 两者迁出前均未在本仓库提交过，无 git 历史可迁移；`ARENA_GAMES.md`、`BACKEND_PLAN.md` 已随迁。

**日常使用与后续维护以 SFC 版（`ahgs-nova-sfc/`）为准**。三个版本功能一致：排行榜、实时提交流、进化（发起 / 监控 / 提交最优 / 保存实例 / 提示词）、
自定义问题（上传 / Agent 建题）、进化曲线分析（含每代种群明细）、双提交对比、个人中心。
均基于平台原有 HTTP 接口，登录令牌保存在浏览器 localStorage。

启动方式见各自目录内的 README.md（SFC 版 `npm run dev`，其余 `python server.py` 即可）。
