# AHGS NOVA Vue 版

AHGS 平台增强版前端的 **Vue 3 重写版**。与 `../ahgs-nova`（原生 JS 版）功能完全一致，
区别是使用了 Vue 3 响应式框架组织代码。

## 与原生版的差异

| | 原生版 `ahgs-nova` | Vue 版 `ahgs-nova-vue` |
| --- | --- | --- |
| 框架 | 无（原生 JS + 字符串模板） | **Vue 3.4**（全局构建版） |
| 构建 | 无 | 无（`vue.global.prod.js` 已内置到本目录，约 144KB，无需 npm） |
| 状态管理 | 手动 DOM 更新 | `reactive` 全局 store，声明式模板自动渲染 |
| XSS | 手工 `esc()` 转义 | 模板插值自动转义（仅图表 SVG 走 `v-html`） |
| 定时器 | 手动清理 | `onMounted` / `onUnmounted` 自动管理 |
| 启动方式 | `python server.py` | 相同 |

## 启动

```bash
cd ahgs-nova-vue
python server.py 8924    # 打开 http://localhost:8924
```

## 文件结构

```
ahgs-nova-vue/
├── index.html            # 挂载点 + 脚本引入
├── style.css             # 与原生版同一套主题
├── vue.global.prod.js    # Vue 3.4 运行时（本地内置，离线可用）
└── js/
    ├── utils.js          # 格式化 / 时间解析 / 常量
    ├── store.js          # reactive 全局状态 + API 封装 + hash 路由
    ├── charts.js         # 手写 SVG 图表（与原生版共用）
    ├── components.js     # 徽章/头像/抽屉（提交详情、用户档案、种群个体）/登录弹窗
    ├── views-rank.js     # 总览 / 排行榜 / 实时流
    ├── views-curve.js    # 曲线分析 / 对比
    ├── views-evo.js      # 进化（发起/监控/提交最优/保存实例/提示词）/ 自定义问题
    ├── views-mine.js     # 我的空间（名次/实例/资料）
    └── app.js            # 根组件（顶栏/路由/设置）+ 全局注册
```

## 功能

与原生版完全一致：总览仪表盘、增强排行榜（筛选/搜索/排序/条形图/CSV）、实时流、
进化（AHG + 自定义框架、实时监控、暂停/继续/停止、**提交最优**、**启动时自动创建实例**、
保存实例、提示词修改、进化历史）、自定义问题（列表/上传/Agent 建题）、
曲线分析（含每代种群个体明细、"我的提交"下拉）、双提交对比、我的空间（资料/改密码）。

登录令牌同样保存在 `localStorage`（`ahgs_token` / `ahgs_user`），与平台接口约定一致。
