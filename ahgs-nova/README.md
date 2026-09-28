# AHGS NOVA —— AHGS 平台增强版网页前端


> ⚠️ **此版本已归档**：功能由 [`../ahgs-nova-vue`](../ahgs-nova-vue)（Vue 3 版）接管，
> 不再同步更新，仅作参考保留。日常使用请用 Vue 版。
基于 AHGS（自动启发式算法生成系统）平台原有接口构建的独立前端，零依赖、无需构建，
直接用浏览器打开即可使用。

## 启动

```bash
cd ahgs-nova
python server.py        # 打开 http://localhost:8000
```

（任何静态服务器都可以，例如 `python -m http.server`；平台后端已开启 CORS，
页面可直接跨域调用接口。）

- 平台接口地址默认 `http://10.201.186.15:8090`，可在页面右上角 **⚙ 设置** 中修改。

## 功能一览（已覆盖原站全部核心功能）

| 页面 | 说明 |
| --- | --- |
| **总览** | 各赛道前三名榜台、近 24h 提交活跃度、模型来源 / 框架分布环形图、最新提交速览 |
| **排行榜** | 按问题切换；框架（AHG/EoH/CALM/自定义）与来源（API/本地LLM）筛选；用户搜索；三种排序；表格 / 条形图双视图；**CSV 导出**；自动刷新 |
| **实时流** | 最近提交流，4 秒自动刷新可暂停，新记录绿色脉冲高亮 |
| **进化** ⭐ | 对应原站「AHG进化」：发起进化（CALM / EoH(NSEH) / 自定义框架，种群/代数/突变/杂交/反思/策略更新参数，LLM 预设与 api key，高级参数：problem_override / 函数签名 / 训练数据 / 进化方向）；自定义框架上传、校验、加载与开发者运行；**实时监控**（状态轮询、进度条、暂停 / 继续 / 停止、**提交最优到排行榜**、**保存实例配置**、当代种群卡片（思想/关键词/算法代码）、历代最优/均值/方差曲线、每代前三、token 消耗、提示词查看与修改）；我的进化历史一键监控；实例配置载入 |
| **自定义问题** ⭐ | 对应原站「自定义问题」：公开列表、多文件上传、删除；**Agent 自动建题**（描述 → 生成计划 → 执行 → 待审批文件通过 / 拒绝 → 完成建题） |
| **曲线分析** | 输入任意提交 ID，绘制**每代最优 / 平均适应度曲线**、每代 token 消耗、种群明细表、相对首代提升率 |
| **对比** | 任选两次提交：关键指标差值对比 + 进化提升率曲线叠加 + 各自每代最优曲线 |
| **我的** | 对应原站「用户中心」：各赛道名次与提交明细（走势 sparkline）；**个人资料**（昵称 / 邮箱 / 电话 / 头像修改）；**修改密码**；实例保存列表与 AHG 进化记录 |

其他细节：点击排行/流内行查看**最优算法详情**（思想、关键词、可复制代码），
点击头像查看**用户档案**（含其全部提交）；深色 / 浅色主题切换；Esc 关闭弹层。

## 文件结构

```
ahgs-nova/
├── index.html   # 页面骨架
├── style.css    # 主题样式（深/浅色）
├── charts.js    # 手写 SVG 图表（折线 / 柱状 / 环形 / sparkline / 条形榜）
├── app.js       # API 封装、路由、抽屉、登录、设置
├── views.js     # 总览 / 排行榜 / 实时流 / 曲线 / 对比 / 我的
├── views2.js    # 进化 / 自定义问题（原站核心功能）
└── server.py    # 本地静态服务器（仅标准库）
```

## 使用的平台接口

均为原网页端同一套接口：

- `GET /api/problems`、`GET /api/problems/{key}`、`GET /api/llm-presets`、`GET /api/custom-problems`（公开）
- `GET /api/ranking/{problem}?framework_types=&model_sources=`（公开）
- `GET /api/submissions/recent?limit=&problem_key=&framework_types=&model_sources=`（公开）
- `GET /api/users/{id}`、`GET /api/users/{id}/submissions`（公开）
- `POST /api/auth/login`、`POST /api/auth/register`、`GET /api/auth/me`、
  `PATCH /api/auth/me`（资料/头像）、`POST /api/auth/me/password`
- `GET /api/ranking/me`、`GET /api/submissions/my`、`GET /api/submissions/{id}`、
  `GET /api/submissions/{id}/record`、`GET /api/instances`（登录）
- 进化：`POST /api/evolution/start`、`GET /api/evolution/my`、
  `GET /api/evolution/{id}/status|results|population|prompt`、
  `POST /api/evolution/{id}/prompt|pause|resume|stop|submit`（**submit = 提交最优到排行榜**）、
  `POST /api/instances`（保存实例配置）（登录）
- 开发者：`POST /api/developer/upload|validate|run`、`GET /api/developer/templates|minimal-package`（登录）
- 自定义问题：`POST /api/custom-problems/upload`、`DELETE /api/custom-problems/{key}`、
  `POST /api/custom-problems/agent/plan|execute|approve`、`GET /api/custom-problems/agent/runs/{id}`（登录）

登录令牌保存在浏览器 `localStorage`（键 `ahgs_token` / `ahgs_user`），仅存于本机。
