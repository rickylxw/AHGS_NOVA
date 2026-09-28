/* ============ Vue 版视图：总览 / 排行榜 / 实时流 ============ */
"use strict";

const FW_CHIPS = [{
    key: "ahg",
    label: "AHG 全部",
    types: ["eoh_nseh", "calm"]
}, {
    key: "eoh_nseh",
    label: "EoH(NSEH)",
    types: ["eoh_nseh"]
}, {
    key: "calm",
    label: "CALM",
    types: ["calm"]
}, {
    key: "custom",
    label: "自定义",
    types: ["custom"]
}, ];
const SRC_CHIPS = [{
    key: "api",
    label: "API"
}, {
    key: "local",
    label: "本地LLM"
}];

/* ==================== 总览 ==================== */
const DashboardView = {
    components: {
        EmptyState,
        UserCell,
        FwBadge
    },
    template: `
  <div>
    <div class="grid cols-4">
      <div class="stat"><div class="k">参赛赛道</div><div class="v">{{ problems.length }}</div><div class="s">{{ trackNames }}</div></div>
      <div class="stat"><div class="k">上榜选手</div><div class="v">{{ userCount }}</div><div class="s">各赛道排行榜去重用户</div></div>
      <div class="stat"><div class="k">近期提交</div><div class="v">{{ recent.length }}</div><div class="s">最近提交流样本</div></div>
      <div class="stat"><div class="k">累计 token</div><div class="v">{{ fmtTokens(sumTokens) }}</div><div class="s">上榜记录 token 之和</div></div>
    </div>
    <div class="card">
      <h2>提交活跃度 <span class="tail">最近 24 小时 · 每小时提交数</span></h2>
      <div class="chart-box" v-html="activitySVG"></div>
    </div>
    <div class="grid cols-2">
      <div class="card"><h2>模型来源分布 <span class="tail">近期提交</span></h2><div class="chart-box" v-html="srcDonut"></div></div>
      <div class="card"><h2>框架分布 <span class="tail">近期提交</span></h2><div class="chart-box" v-html="fwDonut"></div></div>
    </div>
    <div class="card"><h2>各赛道前三 <span class="tail">点击头像查看用户档案</span></h2>
      <div class="grid cols-2">
        <div class="podium-item-card" v-for="r in rankings" :key="r.p.key">
          <div class="mine-head" style="margin:0 0 8px"><span class="mine-title">{{ r.p.name }}</span>
            <a class="hint" :href="'#/leaderboard?problem=' + r.p.key">查看完整榜 →</a></div>
          <div v-if="r.entries.length" class="podium">
            <div v-for="e in r.entries.slice(0, 3)" :key="e.rank" class="podium-item" :class="'p' + e.rank">
              <div class="user-cell" style="min-width:0">
                <span class="link-ish" @click="openUserDrawer(e.user_id)"><Avatar :user="e" /></span>
                <div class="u-name"><span class="u-main" style="font-size:13.5px">{{ fullName(e) }}</span></div>
              </div>
              <div class="obj mono">{{ fmtObj(e.best_objective) }}</div>
              <FwBadge :ft="e.framework_type" />
            </div>
          </div>
          <div v-else class="hint">暂无参赛记录</div>
        </div>
      </div>
    </div>
    <div class="card">
      <h2>最新提交 <a class="tail" href="#/live">进入实时流 →</a></h2>
      <div class="table-wrap"><table>
        <thead><tr><th>用户</th><th>问题</th><th>框架</th><th class="num">适应度</th><th>时间</th></tr></thead>
        <tbody>
          <tr v-for="s in recent.slice(0, 8)" :key="s.id" class="clickable-row" @click="openSubmissionDrawer(s.id)">
            <td><UserCell :user="s" /></td>
            <td>{{ s.problem_name || s.problem_key }}</td>
            <td><FwBadge :ft="s.framework_type" /></td>
            <td class="num mono">{{ fmtObj(s.objective) }}</td>
            <td class="mono hint">{{ fmtTime(s.created_at) }}</td>
          </tr>
        </tbody>
      </table></div>
    </div>
  </div>`,
    setup() {
        const recent = ref([]);
        const rankings = ref([]);
        onMounted(async () => {
            recent.value = await api("/api/submissions/recent?limit=300").then(r => r.submissions ?? []).catch(() => []);
            rankings.value = await Promise.all(store.problems.map(p =>
                api(`/api/ranking/${p.key}`).then(r => ({
                    p,
                    entries: r.entries ?? []
                })).catch(() => ({
                    p,
                    entries: []
                }))));
        });
        const userCount = computed(() => {
            const s = new Set();
            for (const {
                    entries
                }
                of rankings.value)
                for (const e of entries)
                    if (e.user_id != null) s.add(e.user_id);
            return s.size;
        });
        const sumTokens = computed(() =>
            rankings.value.reduce((a, {
                entries
            }) => a + entries.reduce((x, e) => x + (Number(e.total_tokens) || 0), 0), 0));
        const trackNames = computed(() => store.problems.map(p => p.name.split(" ")[0]).join(" / "));
        const activitySVG = computed(() => {
            const now = Date.now();
            const buckets = [];
            for (let i = 23; i >= 0; i--) buckets.push({
                t: new Date(now - i * 3600e3),
                value: 0
            });
            for (const s of recent.value) {
                const d = parseServerTime(s.created_at);
                if (!d) continue;
                const idx = buckets.findIndex(b => d >= b.t && d < new Date(b.t.getTime() + 3600e3));
                if (idx >= 0) buckets[idx].value++;
            }
            return barChartSVG(buckets.map(b => ({
                label: b.t.getHours() + "时",
                value: b.value,
                tip: b.t.toLocaleString("zh-CN", {
                    hour: "2-digit"
                }) + ":00"
            })));
        });
        const srcDonut = computed(() => donutSVG([{
            label: "API 模型",
            value: recent.value.filter(s => s.model_source === "api").length,
            color: "#fbbf24"
        }, {
            label: "本地 LLM",
            value: recent.value.filter(s => s.model_source === "local").length,
            color: "#22d3ee"
        }, ]));
        const fwDonut = computed(() => donutSVG(["eoh_nseh", "calm", "custom"].map((ft, i) => ({
            label: FW_LABEL[ft],
            value: recent.value.filter(s => s.framework_type === ft).length,
            color: PALETTE[i],
        }))));
        return {
            store,
            problems: computed(() => store.problems),
            recent,
            rankings,
            userCount,
            sumTokens,
            trackNames,
            activitySVG,
            srcDonut,
            fwDonut,
            openSubmissionDrawer,
            openUserDrawer,
            fmtObj,
            fmtTokens,
            fmtTime,
            fullName
        };
    },
};
ROUTE_COMPS.dashboard = DashboardView;

/* ==================== 排行榜 ==================== */
const LeaderboardView = {
    components: {
        EmptyState,
        UserCell,
        FwBadge,
        SrcBadge,
        Medal
    },
    template: `
  <div class="card">
    <h2>排行榜 <span class="tail">{{ meta }}</span></h2>
    <div class="toolbar">
      <div class="field" style="min-width:230px"><label>问题情景</label>
        <select v-model="problemKey" @change="load">
          <option v-for="p in store.problems" :key="p.key" :value="p.key">{{ p.name }}</option>
        </select></div>
      <div class="field"><label>框架筛选</label><div class="chip-row">
        <button v-for="c in fwChips" :key="c.key" class="chip" :class="{ on: fw.has(c.key) }" @click="toggleFw(c.key)">{{ c.label }}</button>
      </div></div>
      <div class="field"><label>来源筛选</label><div class="chip-row">
        <button v-for="c in srcChips" :key="c.key" class="chip" :class="{ on: src.has(c.key) }" @click="toggleSrc(c.key)">{{ c.label }}</button>
      </div></div>
      <div class="field" style="min-width:150px"><label>排序</label>
        <select v-model="sortBy">
          <option value="score">按最优适应度</option>
          <option value="time">按最近提交</option>
          <option value="token">按 token 消耗</option>
        </select></div>
      <div class="field" style="min-width:170px"><label>搜索用户</label><input v-model="q" placeholder="昵称 / 一卡通号"></div>
      <div class="field"><label>&nbsp;</label><div class="chip-row">
        <button class="chip" :class="{ on: barView }" @click="barView = !barView">{{ barView ? "📋 表格" : "📊 条形图" }}</button>
        <button class="chip" :class="{ on: auto }" @click="toggleAuto">⟳ 自动刷新</button>
        <button class="chip" @click="exportCsv">⬇ 导出 CSV</button>
      </div></div>
    </div>
    <div v-if="loading" class="loading-row"><span class="spinner"></span>加载中…</div>
    <div v-else-if="err" class="error-banner">{{ err }}</div>
    <div v-else-if="!visible.length"> <EmptyState icon="🏁" desc="暂无参赛记录" /> </div>
    <div v-else-if="barView" v-html="barHtml"></div>
    <div v-else class="table-wrap"><table>
      <thead><tr><th class="num">名次</th><th>用户</th><th>框架</th><th>来源</th><th>模型</th>
        <th class="num">最优适应度</th><th class="num">所耗 token</th><th>最近提交</th><th></th></tr></thead>
      <tbody>
        <tr v-for="e in visible" :key="e.user_id ?? e.username" class="clickable-row" :class="{ 'rank-top3': e.rank <= 3 }" @click="openSubmissionDrawer(e.submission_id)">
          <td class="num"><Medal :rank="e.rank" /></td>
          <td><UserCell :user="e" /></td>
          <td><FwBadge :ft="e.framework_type" /></td>
          <td><SrcBadge :src="e.model_source" /></td>
          <td class="mono hint">{{ e.llm_model || "—" }}</td>
          <td class="num mono">{{ fmtObj(e.best_objective) }}</td>
          <td class="num mono">{{ fmtTokens(e.total_tokens) }}</td>
          <td class="mono hint" :title="e.best_submitted_at || ''">{{ fmtTime(e.best_submitted_at) }}</td>
          <td><button class="btn small" @click.stop="navHash('curve', new URLSearchParams({ id: e.submission_id }))">曲线</button></td>
        </tr>
      </tbody>
    </table></div>
  </div>`,
    setup(props) {
        const fwChips = FW_CHIPS,
            srcChips = SRC_CHIPS;
        const problemKey = ref(props.params.get("problem") || store.problems[0]?.key || "");
        const fw = reactive(new Set()),
            src = reactive(new Set());
        const sortBy = ref("score"),
            q = ref(""),
            barView = ref(false),
            auto = ref(false);
        const entries = ref([]),
            ascend = ref(true),
            loading = ref(true),
            err = ref("");
        let timer = null;

        async function load() {
            loading.value = true;
            err.value = "";
            const qs = new URLSearchParams();
            const types = [...fw].flatMap(k => FW_CHIPS.find(c => c.key === k).types).join(",");
            if (types) qs.set("framework_types", types);
            const srcs = [...src].join(",");
            if (srcs) qs.set("model_sources", srcs);
            try {
                const r = await api(`/api/ranking/${problemKey.value}${qs.toString() ? "?" + qs : ""}`);
                entries.value = r.entries ?? [];
                ascend.value = r.ascend !== false;
            } catch (e) {
                err.value = e.message;
            }
            loading.value = false;
        }
        const visible = computed(() => {
            let list = entries.value;
            const qq = q.value.trim().toLowerCase();
            if (qq) list = list.filter(e => (e.username || "").toLowerCase().includes(qq) || (e.display_name || "").toLowerCase().includes(qq));
            if (sortBy.value === "time") list = [...list].sort((a, b) => (parseServerTime(b.best_submitted_at)?.getTime() ?? 0) - (parseServerTime(a.best_submitted_at)?.getTime() ?? 0));
            else if (sortBy.value === "token") list = [...list].sort((a, b) => (b.total_tokens ?? -1) - (a.total_tokens ?? -1));
            return list;
        });
        const meta = computed(() => `${visible.value.length} 人上榜 · 适应度${ascend.value ? "越小" : "越大"}越好${fw.size || src.size ? " · 已按筛选过滤" : ""}`);
        const barHtml = computed(() => hbarListHTML(visible.value.slice(0, 15).map(e => ({
            rank: e.rank,
            label: fullName(e),
            sub: `${e.username ?? ""} · ${FW_LABEL[e.framework_type] || "AHG"} · ${e.llm_model ?? ""}`,
            value: Number(e.best_objective),
            fmt: fmtObj(e.best_objective),
            submissionId: e.submission_id,
            userId: e.user_id,
        }))));

        function toggleFw(k) {
            fw.has(k) ? fw.delete(k) : fw.add(k);
            load();
        }

        function toggleSrc(k) {
            src.has(k) ? src.delete(k) : src.add(k);
            load();
        }

        function toggleAuto() {
            auto.value = !auto.value;
            if (auto.value) timer = setInterval(load, 10000);
            else {
                clearInterval(timer);
                timer = null;
            }
        }

        function exportCsv() {
            const list = visible.value;
            if (!list.length) {
                toast("没有可导出的数据", "err");
                return;
            }
            const head = "rank,user_id,username,display_name,framework_type,llm_model,model_source,best_objective,total_tokens,best_submitted_at,submission_id";
            const lines = list.map(e => [e.rank, e.user_id, e.username, e.display_name, e.framework_type, e.llm_model, e.model_source, e.best_objective, e.total_tokens ?? "", e.best_submitted_at ?? "", e.submission_id ?? ""]
                .map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
            downloadText(`ranking_${problemKey.value}_${new Date().toISOString().slice(0, 10)}.csv`, [head, ...lines].join("\n"));
            toast(`已导出 ${list.length} 条记录`, "ok");
        }
        watch(barHtml, () => nextTick(() => {
            document.querySelectorAll(".hbar-row").forEach(row => {
                row.style.cursor = "pointer";
                row.onclick = () => {
                    if (row.dataset.sid) openSubmissionDrawer(row.dataset.sid);
                    else if (row.dataset.uid) openUserDrawer(row.dataset.uid);
                };
            });
        }));
        onMounted(load);
        onUnmounted(() => {
            if (timer) clearInterval(timer);
        });
        return {
            store,
            fwChips,
            srcChips,
            problemKey,
            fw,
            src,
            sortBy,
            q,
            barView,
            auto,
            loading,
            err,
            visible,
            meta,
            barHtml,
            load,
            toggleFw,
            toggleSrc,
            toggleAuto,
            exportCsv,
            fmtObj,
            fmtTokens,
            fmtTime,
            fullName,
            navHash,
            openSubmissionDrawer
        };
    },
    props: ["params"],
};
ROUTE_COMPS.leaderboard = LeaderboardView;

/* ==================== 实时流 ==================== */
const LiveView = {
    components: {
        EmptyState,
        UserCell,
        FwBadge,
        SrcBadge
    },
    template: `
  <div class="card">
    <h2>实时提交流 <span class="tail">全赛道 · 全用户 · 每 4 秒自动刷新 ·
      <button class="chip" :class="{ on: !paused }" style="padding:1px 10px" @click="paused = !paused">{{ paused ? "▶ 继续" : "⏸ 暂停" }}</button></span></h2>
    <div class="toolbar">
      <div class="field" style="min-width:230px"><label>问题情景</label>
        <select v-model="problem"><option value="">全部问题</option>
          <option v-for="p in store.problems" :key="p.key" :value="p.key">{{ p.name }}</option></select></div>
      <div class="field"><label>框架筛选</label><div class="chip-row">
        <button v-for="c in fwChips" :key="c.key" class="chip" :class="{ on: fw.has(c.key) }" @click="toggleSet(fw, c.key, load)">{{ c.label }}</button></div></div>
      <div class="field"><label>来源筛选</label><div class="chip-row">
        <button v-for="c in srcChips" :key="c.key" class="chip" :class="{ on: src.has(c.key) }" @click="toggleSet(src, c.key, load)">{{ c.label }}</button></div></div>
      <div class="field" style="min-width:160px"><label>排序</label>
        <select v-model="sortBy">
          <option value="time">按时间（最新）</option>
          <option value="score">按适应度</option>
          <option value="token">按 token 消耗</option>
        </select></div>
    </div>
    <div v-if="err" class="error-banner">{{ err }}</div>
    <div v-if="!subs.length"><EmptyState icon="🛰️" desc="暂无提交记录，去「进化」跑一局吧" /></div>
    <div v-else class="table-wrap"><table>
      <thead><tr><th>用户</th><th>问题</th><th>框架</th><th>来源</th><th>模型</th>
        <th class="num">适应度</th><th class="num">所耗 token</th><th>提交时间</th></tr></thead>
      <tbody>
        <tr v-for="s in sorted" :key="s.id" class="clickable-row" :class="{ 'fresh-row': freshIds.has(s.id) }" @click="openSubmissionDrawer(s.id)">
          <td><UserCell :user="s" /></td>
          <td>{{ s.problem_name || s.problem_key }}</td>
          <td><FwBadge :ft="s.framework_type" /></td>
          <td><SrcBadge :src="s.model_source" /></td>
          <td class="mono hint">{{ s.llm_model || "—" }}</td>
          <td class="num mono">{{ fmtObj(s.objective) }}</td>
          <td class="num mono">{{ fmtTokens(s.total_tokens) }}</td>
          <td class="mono hint" :title="s.created_at || ''">{{ fmtTime(s.created_at) }}</td>
        </tr>
      </tbody>
    </table></div>
  </div>`,
    setup() {
        const fwChips = FW_CHIPS,
            srcChips = SRC_CHIPS;
        const problem = ref(""),
            sortBy = ref("time"),
            paused = ref(false);
        const fw = reactive(new Set()),
            src = reactive(new Set());
        const subs = ref([]),
            err = ref(""),
            freshIds = reactive(new Set());
        async function load() {
            const qs = new URLSearchParams({
                limit: "60"
            });
            if (problem.value) qs.set("problem_key", problem.value);
            const types = [...fw].flatMap(k => FW_CHIPS.find(c => c.key === k).types).join(",");
            if (types) qs.set("framework_types", types);
            const srcs = [...src].join(",");
            if (srcs) qs.set("model_sources", srcs);
            try {
                const list = (await api(`/api/submissions/recent?${qs}`)).submissions ?? [];
                const fresh = new Set(list.map(s => s.id).filter(id => !seen.has(id)));
                fresh.forEach(id => freshIds.add(id));
                subs.value = list;
                if (fresh.size) setTimeout(() => fresh.forEach(id => freshIds.delete(id)), 2500);
                list.forEach(s => seen.add(s.id));
                err.value = "";
            } catch (e) {
                err.value = e.message;
            }
        }
        const seen = new Set();
        const sorted = computed(() => {
            let list = subs.value;
            if (sortBy.value === "score") {
                const asc = problem.value ? isAscend(problem.value) : true;
                list = [...list].sort((a, b) => asc ? Number(a.objective) - Number(b.objective) : Number(b.objective) - Number(a.objective));
            } else if (sortBy.value === "token") list = [...list].sort((a, b) => (b.total_tokens ?? -1) - (a.total_tokens ?? -1));
            return list;
        });

        function toggleSet(set, k, cb) {
            set.has(k) ? set.delete(k) : set.add(k);
            cb();
        }
        let timer = null;
        onMounted(() => {
            load();
            timer = setInterval(() => {
                if (!paused.value) load();
            }, 4000);
        });
        onUnmounted(() => clearInterval(timer));
        return {
            store,
            fwChips,
            srcChips,
            problem,
            sortBy,
            paused,
            fw,
            src,
            subs,
            err,
            freshIds,
            sorted,
            toggleSet,
            openSubmissionDrawer,
            fmtObj,
            fmtTokens,
            fmtTime,
            fullName
        };
    },
};
ROUTE_COMPS.live = LiveView;
