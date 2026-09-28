/* ============ Vue 版视图：双提交对比 ============ */
"use strict";

const CompareView = {
  components: { EmptyState, FwBadge, SrcBadge, Avatar },
  props: ["params"],
  template: `
  <div>
    <div class="card">
      <h2>双提交对比 <span class="tail">对比两次提交的进化过程与最终成绩</span></h2>
      <div class="vs-grid">
        <div class="field"><label>提交 A</label>
          <div class="picker-row">
            <input class="input" v-model="idA" placeholder="提交 ID" style="max-width:110px">
            <select class="input" v-model="pickA" style="flex:1">
              <option value="">— 从最近提交选择 —</option>
              <option v-for="s in recent" :key="s.id" :value="String(s.id)">#{{ s.id }} · {{ fullName(s) }} · {{ s.problem_name || s.problem_key }} · {{ fmtObj(s.objective) }}</option>
            </select>
          </div>
        </div>
        <div class="vs-mid">VS</div>
        <div class="field"><label>提交 B</label>
          <div class="picker-row">
            <input class="input" v-model="idB" placeholder="提交 ID" style="max-width:110px">
            <select class="input" v-model="pickB" style="flex:1">
              <option value="">— 从最近提交选择 —</option>
              <option v-for="s in recent" :key="s.id" :value="String(s.id)">#{{ s.id }} · {{ fullName(s) }} · {{ s.problem_name || s.problem_key }} · {{ fmtObj(s.objective) }}</option>
            </select>
          </div>
        </div>
      </div>
      <div style="margin-top:12px"><button class="btn primary" @click="run">开始对比</button>
        <span class="hint" style="margin-left:10px">提示：在排行榜 / 实时流的详情抽屉里可以快速跳转曲线分析</span></div>
    </div>

    <div v-if="state === 'loading'" class="card"><div class="loading-row"><span class="spinner"></span>对比数据加载中…</div></div>
    <div v-else-if="state === 'err'" class="card">
      <div class="error-banner">{{ errMsg }}</div>
      <div v-if="err401" style="margin-top:8px"><button class="btn primary" @click="store.loginModal = true">登录 / 注册</button></div>
    </div>
    <div v-else-if="state === 'done' && A && B">
      <div v-if="!sameProblem" class="card"><div class="error-banner">⚠️ 两次提交分属不同问题，适应度不可直接比较，仅对比进化过程。</div></div>
      <div class="vs-grid">
        <div class="card">
          <h2>🅰 提交 A <span class="mono hint">#{{ A.id }}</span></h2>
          <div class="user-cell" style="margin-bottom:8px"><Avatar :user="A.sub" />
            <div class="u-name"><span class="u-main">{{ fullName(A.sub) }}</span><span class="u-sub mono">{{ A.sub.username ?? "" }}</span></div></div>
          <div class="grid-2">
            <div class="kv"><span class="k">问题</span><span>{{ A.sub.problem_name || A.sub.problem_key || A.inst?.name || "—" }}</span></div>
            <div class="kv"><span class="k">框架</span><FwBadge :ft="A.sub.framework_type ?? A.inst?.framework_type" /></div>
            <div class="kv"><span class="k">适应度</span><span class="mono">{{ fmtObj(A.sub.objective) }}</span></div>
            <div class="kv"><span class="k">token</span><span class="mono">{{ fmtTokens(A.sub.total_tokens) }}</span></div>
            <div class="kv"><span class="k">模型</span><span class="mono">{{ A.sub.llm_model || "—" }}</span></div>
            <div class="kv"><span class="k">代数</span><span class="mono">{{ A.gens.length }}</span></div>
          </div>
          <div class="field" style="margin-top:8px"><label>启发式思想</label><p class="drawer-text">{{ A.sub.concept ?? "—" }}</p></div>
        </div>
        <div class="vs-mid">VS</div>
        <div class="card">
          <h2>🅱 提交 B <span class="mono hint">#{{ B.id }}</span></h2>
          <div class="user-cell" style="margin-bottom:8px"><Avatar :user="B.sub" />
            <div class="u-name"><span class="u-main">{{ fullName(B.sub) }}</span><span class="u-sub mono">{{ B.sub.username ?? "" }}</span></div></div>
          <div class="grid-2">
            <div class="kv"><span class="k">问题</span><span>{{ B.sub.problem_name || B.sub.problem_key || B.inst?.name || "—" }}</span></div>
            <div class="kv"><span class="k">框架</span><FwBadge :ft="B.sub.framework_type ?? B.inst?.framework_type" /></div>
            <div class="kv"><span class="k">适应度</span><span class="mono">{{ fmtObj(B.sub.objective) }}</span></div>
            <div class="kv"><span class="k">token</span><span class="mono">{{ fmtTokens(B.sub.total_tokens) }}</span></div>
            <div class="kv"><span class="k">模型</span><span class="mono">{{ B.sub.llm_model || "—" }}</span></div>
            <div class="kv"><span class="k">代数</span><span class="mono">{{ B.gens.length }}</span></div>
          </div>
          <div class="field" style="margin-top:8px"><label>启发式思想</label><p class="drawer-text">{{ B.sub.concept ?? "—" }}</p></div>
        </div>
      </div>
      <div class="card">
        <h2>关键指标对比 <span class="tail">左 A · 中差值（绿色=B 更优）· 右 B</span></h2>
        <div v-for="row in deltaRows" :key="row.label" class="kv">
          <span class="k">{{ row.label }}</span>
          <span class="mono">{{ row.va }}</span>
          <span :class="row.cls">{{ row.dv }}</span>
          <span class="mono">{{ row.vb }}</span>
        </div>
      </div>
      <div class="card"><h2>进化提升率对比</h2>
        <div class="legend"><span><span class="dot" style="background:#22d3ee"></span>提交 A</span><span><span class="dot" style="background:#f472b6"></span>提交 B</span></div>
        <div class="chart-box" v-html="overlayChart"></div>
        <p class="hint" style="margin-bottom:0">纵轴 = 相对各自首代最优的提升百分比，横轴为代数。</p>
      </div>
      <div class="grid cols-2">
        <div class="card"><h2>#{{ A.id }} 每代最优</h2><div class="chart-box" v-html="chartA"></div></div>
        <div class="card"><h2>#{{ B.id }} 每代最优</h2><div class="chart-box" v-html="chartB"></div></div>
      </div>
    </div>
    <div v-else class="card"><EmptyState icon="⚔️" desc="选择两个提交开始对比" /></div>
  </div>`,
  setup() {
    const recent = ref([]);
    const idA = ref(""), idB = ref(""), pickA = ref(""), pickB = ref("");
    const state = ref("idle"), errMsg = ref(""), err401 = ref(false);
    const A = ref(null), B = ref(null);
    onMounted(() => {
      recent.value = api("/api/submissions/recent?limit=50").then(r => r.submissions ?? []).catch(() => []);
    });
    watch(pickA, v => { if (v) idA.value = v; });
    watch(pickB, v => { if (v) idB.value = v; });

    async function fetchOne(id) {
      if (!id) throw new Error("请填写两侧的提交 ID");
      const recData = await api(`/api/submissions/${id}/record`);
      const instData = recData.instance;
      const cfg = instData?.config ?? {};
      const asc = cfg.ascend !== false;
      const gens = ((instData?.population_snapshot ?? [])).slice().sort((a, b) => (a.generation ?? 0) - (b.generation ?? 0));
      const bests = gens.map(g => {
        const objs = (g.heuristics ?? []).map(h => Number(h?.objective)).filter(isFinite);
        return objs.length ? (asc ? Math.min(...objs) : Math.max(...objs)) : null;
      });
      return { id, sub: recData.submission ?? {}, inst: instData, asc, gens, bests };
    }
    const sameProblem = computed(() => A.value && B.value && (A.value.sub.problem_key || A.value.inst?.problem_key) === (B.value.sub.problem_key || B.value.inst?.problem_key));

    function improveSeries(d) {
      const first = d.bests.find(isFinite);
      if (first == null || first === 0) return [];
      return d.bests.map((v, i) => isFinite(v) ? {
        x: i,
        y: d.asc ? (first - v) / Math.abs(first) * 100 : (v - first) / Math.abs(first) * 100,
        label: `#${d.id} 第 ${i} 代`,
      } : null).filter(Boolean);
    }
    const overlayChart = computed(() => {
      if (!A.value || !B.value) return "";
      return lineChartSVG([
        { name: "A 提升%", color: "#22d3ee", points: improveSeries(A.value) },
        { name: "B 提升%", color: "#f472b6", points: improveSeries(B.value) },
      ], { yLabel: "相对首代提升 %", xFormat: x => "第" + Math.round(x) + "代" });
    });
    const chartA = computed(() => !A.value ? "" : lineChartSVG([{ name: "每代最优", color: "#22d3ee", points: A.value.bests.map((v, i) => ({ x: i, y: v, label: "第 " + i + " 代" })).filter(p => p.y != null) }]));
    const chartB = computed(() => !B.value ? "" : lineChartSVG([{ name: "每代最优", color: "#f472b6", points: B.value.bests.map((v, i) => ({ x: i, y: v, label: "第 " + i + " 代" })).filter(p => p.y != null) }]));
    const deltaRows = computed(() => {
      if (!A.value || !B.value) return [];
      const ascend = isAscend(A.value.sub.problem_key || A.value.inst?.problem_key);
      const mk = (label, va, vb, fmt, better) => {
        if (label === "适应度") better = ascend ? "low" : "high";
        const dv = va != null && vb != null ? vb - va : null;
        let cls = "";
        if (dv != null && dv !== 0) cls = (better === "low" ? dv < 0 : dv > 0) ? "delta-up" : "delta-down";
        return { label, va: fmt(va), vb: fmt(vb), dv: dv == null ? "—" : (dv > 0 ? "+" : "") + fmt(dv), cls };
      };
      const heurN = d => d.gens.reduce((a, g) => a + (g.heuristics?.length ?? 0), 0);
      return [
        mk("适应度", A.value.sub.objective, B.value.sub.objective, fmtObj, "low"),
        mk("所耗 token", A.value.sub.total_tokens, B.value.sub.total_tokens, fmtTokens, "low"),
        mk("进化代数", A.value.gens.length, B.value.gens.length, v => String(v ?? "—"), "low"),
        mk("种群个体总数", heurN(A.value), heurN(B.value), v => String(v ?? "—"), "low"),
      ];
    });
    async function run() {
      state.value = "loading";
      err401.value = false;
      try {
        const [a, b] = await Promise.all([fetchOne(String(idA.value).trim()), fetchOne(String(idB.value).trim())]);
        A.value = a;
        B.value = b;
        state.value = "done";
      } catch (e) {
        state.value = "err";
        errMsg.value = e.message;
        err401.value = e.status === 401;
      }
    }
    return { store, recent, idA, idB, pickA, pickB, state, errMsg, err401, A, B, sameProblem, overlayChart, chartA, chartB, deltaRows, run, fmtObj, fmtTokens, fullName };
  },
};
ROUTE_COMPS.compare = CompareView;
