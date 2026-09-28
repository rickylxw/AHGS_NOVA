# AHGS NOVA

AHGS（自动启发式算法生成系统）平台的增强版网页前端，包含两个实现：

| 目录 | 说明 |
| --- | --- |
| [`ahgs-nova/`](ahgs-nova/) | 原生 JavaScript 版（**已归档**，功能与 Vue 版一致，不再更新） |
| [`ahgs-nova-vue/`](ahgs-nova-vue/) | Vue 3 版（运行时已内置，无需 npm） |

**日常使用与后续维护以 Vue 版为准**。两者功能一致：排行榜、实时提交流、进化（发起 / 监控 / 提交最优 / 保存实例 / 提示词）、
自定义问题（上传 / Agent 建题）、进化曲线分析（含每代种群明细）、双提交对比、个人中心。
均基于平台原有 HTTP 接口，登录令牌保存在浏览器 localStorage。

启动方式见各自目录内的 README.md（`python server.py` 即可）。
