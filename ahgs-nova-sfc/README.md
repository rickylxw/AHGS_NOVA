# AHGS NOVA Vue SFC 版

AHGS 平台增强版前端的 **Vue 3 单文件组件（SFC）原生重写版**。与 `../ahgs-nova-vue`（全局构建 + 字符串模板版）功能完全一致，
区别是全部使用标准 `.vue` 单文件组件 + Vite 构建，不再内置任何运行时 JS/HTML。

## 与旧 Vue 版的差异

| | 旧版 `ahgs-nova-vue` | SFC 版 `ahgs-nova-sfc` |
| --- | --- | --- |
| 组织方式 | 全局 Vue 运行时 + JS 字符串模板 | **`.vue` 单文件组件**（`<script setup>`） |
| 构建 | 无（内置 `vue.global.prod.js`） | Vite（`npm run dev` / `npm run build`） |
| 图表 | JS 拼 SVG 字符串 + `v-html` | 声明式图表组件（`LineChart` / `BarChart` / `DonutChart` / `Sparkline` / `HbarList`），无 `v-html` |
| 路由 | `ROUTE_COMPS` 全局注册表 | `src/lib/router.js` 集中管理 hash 路由 |
| 状态 | 全局 `store` + `globalProperties` | `src/lib/store.js` 导出 reactive store，各组件显式 import |
| 启动方式 | `python server.py` | `npm run dev`（开发）/ `npm run build` + 任意静态服务器 |

功能完全一致：总览仪表盘、增强排行榜（筛选/搜索/排序/条形图/CSV）、实时流、
进化（AHG + 自定义框架、实时监控、暂停/继续/停止、提交最优、保存实例、提示词修改、进化历史）、
自定义问题（列表/上传/Agent 建题）、曲线分析（含每代种群个体明细、关键词洞察）、双提交对比、我的空间（资料/改密码）。
登录令牌同样保存在 `localStorage`（`ahgs_token` / `ahgs_user`）。

## 启动

```bash
cd ahgs-nova-sfc
npm install
npm run dev        # 开发模式，默认 http://localhost:8925
```

生产构建与预览：

```bash
npm run build      # 产物输出到 dist/
npm run preview    # 本地预览构建产物（或用任意静态服务器托管 dist/）
```

接口地址默认为 `src/lib/constants.js` 中的 `DEFAULT_API`，可在页面右上角 ⚙ 修改（存于 localStorage）。

## 文件结构

```
ahgs-nova-sfc/
├── index.html                  # Vite 入口（仅挂载点）
├── vite.config.js
├── package.json
└── src/
    ├── main.js                 # 创建应用、初始化路由、引入主题样式
    ├── App.vue                 # 根组件：顶栏 / 路由出口 / 设置 / 抽屉 / Toast
    ├── styles/style.css        # 主题（与旧版同一套）
    ├── lib/
    │   ├── constants.js        # 常量（框架/状态标签、默认参数、调色板）
    │   ├── api.js              # fetch 封装（token / 错误处理）
    │   ├── store.js            # reactive 全局状态 + 全局动作（toast/抽屉/会话）
    │   ├── format.js           # 格式化 / 时间解析 / 复制下载
    │   └── router.js           # hash 路由（视图注册表 + navHash）
    ├── charts/                 # 声明式 SVG 图表组件
    │   ├── ticks.js            # 坐标刻度计算
    │   ├── LineChart.vue       # 折线图
    │   ├── BarChart.vue        # 柱状图
    │   ├── DonutChart.vue      # 环形图
    │   ├── Sparkline.vue       # 迷你走势线
    │   └── HbarList.vue        # 排行榜条形列表
    ├── components/
    │   ├── FwBadge.vue / SrcBadge.vue / Medal.vue / Avatar.vue
    │   ├── UserCell.vue / EmptyState.vue / CodeBlock.vue
    │   ├── KeywordInsight.vue  # 关键词洞察卡片（Run / 提交两模式复用）
    │   ├── LoginModal.vue      # 登录 / 注册弹窗
    │   └── drawers/            # 右侧抽屉（提交详情 / 用户档案 / 种群个体）+ DrawerHost
    └── views/
        ├── DashboardView.vue   # 总览
        ├── LeaderboardView.vue # 排行榜
        ├── LiveView.vue        # 实时流
        ├── EvoView.vue         # 进化（发起 / 记录）
        ├── CprobView.vue       # 自定义问题（上传 / Agent 建题）
        ├── CurveView.vue       # 进化分析（Run 实时监控 + 提交种群明细）
        ├── CompareView.vue     # 双提交对比
        └── MineView.vue        # 我的空间（名次 / 实例 / 资料）
```

## 顺手修复的旧版问题

- `MineView` 中"各赛道明细"区块的 `v-for` 容器意外嵌套重复（旧模板缺陷），本版已修正。
- `CurveView` 的 `loadSource` 内 `history.replaceState` 会被同名计算属性遮蔽导致切换 Run 时报错，本版显式使用 `window.history`。
