/* ============ Vue 版视图：曲线分析 / 对比 ============ */
"use strict";

/* ==================== 曲线分析 ==================== */
const CurveView = {
    components: {
        EmptyState,
        FwBadge,
        SrcBadge
    },
    props: ["params"],
    template: `
  <div>
    <div class="card">
      <h2>进化曲线分析 <span class="tail">输入提交 ID，或从下拉中选择</span></h2>
      <div class="picker-row">
        <input class="input" v-model="sid" placeholder="提交 ID（如 28）" style="max-width:200px" @keydown.enter="analyze">
        <select class="input" v-model="recentSel" @change="pickRecent" style="max-width:360px">
          <option value="">— 最近提交（全站）—</option>
          <option v-for="s in recentList" :key="s.id" :value="String(s.id)">#{{ s.id }} · {{ fullName(s) }} · {{ s.problem_name || s.problem_key }} · {{ fmtObj(s.objective) }}</option>
        </select>
        <select class="input" v-model="mineSel" @change="pickMine" style="max-width:360px">
          <option value="">— 我的提交 —</option>
          <option v-for="s in mySubs" :key="s.id" :value="String(s.id)">#{{ s.id }} · {{ s.problem_name || s.problem_key }} · {{ fmtObj(s.objective) }} · {{ fmtTime(s.created_at) }}</option>
        </select>
        <button class="btn primary" @click="analyze">分析</button>
      </div>
      <div v-if="!getToken()" class="hint" style="margin-top:8px">登录后这里会多一个「我的提交」下拉，只列你自己的记录。</div>
      <div v-else-if="!mySubs.length" class="hint" style="margin-top:8px">你还没有提交记录。</div>
    </div>

    <div v-if="state === 'idle'" class="card"><EmptyState icon="🧬" desc="选择一个提交，查看它的完整进化过程：每代适应度曲线、种群明细与 token 消耗" /></div>
    <div v-else-if="state === 'loading'" class="card"><div class="loading-row"><span class="spinner"></span>正在拉取进化记录…</div></div>
    <div v-else-if="state === 'err'" class="card">
      <div class="error-banner">{{ errMsg }}</div>
      <div v-if="err401" style="margin-top:8px"><button class="btn primary" @click="store.loginModal = true">登录 / 注册</button></div>
    </div>
    <template v-else-if="rec">
      <div v-if="!rec.instance" class="card">
        <div class="error-banner">该提交未关联进化任务（实例），因此没有种群快照，无法绘制曲线。</div>
        <p class="hint">通常原因：发起这次进化的前端在启动时没有创建实例（AHGS NOVA 旧版本的缺陷，现已修复）。若是历史遗留提交，可在「进化」页打开该 Run，点「💾 保存实例」补建后重新「🏆 提交最优」。</p>
      </div>
      <template v-else>
        <div class="grid cols-4">
          <div class="stat"><div class="k">最终最优适应度</div><div class="v mono">{{ fmtObj(subObjective) }}</div><div class="s">{{ asc ? "越小越好" : "越大越好" }}</div></div>
          <div class="stat"><div class="k">相对首代提升</div><div class="v mono">{{ improve == null ? "—" : improve.toFixed(2) + "%" }}</div><div class="s">{{ firstBest != null ? "首代最优 " + fmtObj(firstBest) : "" }}</div></div>
          <div class="stat"><div class="k">进化代数 / 个体</div><div class="v mono">{{ gens.length }} <small style="font-size:14px;color:var(--text-faint)">代</small> / {{ heurCount }}</div><div class="s">种群快照统计</div></div>
          <div class="stat"><div class="k">总 token</div><div class="v mono">{{ anyTok ? fmtTokens(tokTotal) : "—" }}</div><div class="s">{{ sub.llm_model || "" }}</div></div>
        </div>
        <div class="grid cols-2">
          <div class="card">
            <h2>每代适应度曲线</h2>
            <div class="legend"><span><span class="dot" style="background:#22d3ee"></span>每代最优</span><span><span class="dot" style="background:#a78bfa"></span>每代平均</span></div>
            <div class="chart-box" v-html="mainChart"></div>
          </div>
          <div class="card">
            <h2>提交信息</h2>
            <div class="user-cell" style="margin-bottom:10px"><Avatar :user="sub" />
              <div class="u-name"><span class="u-main">{{ fullName(sub) }}</span><span class="u-sub mono">{{ sub.username ?? "" }}</span></div></div>
            <div class="grid-2">
              <div class="kv"><span class="k">实例名称</span><span>{{ inst.name ?? "—" }}</span></div>
              <div class="kv"><span class="k">框架类型</span><FwBadge :ft="inst.framework_type" /></div>
            </div>
            <div class="grid-2">
              <div class="kv" v-if="inst.framework_type === 'custom'"><span class="k">框架文件</span><span class="mono">{{ cfg.framework_filename || "framework.py" }}</span></div>
              <template v-else>
                <div class="kv"><span class="k">种群容量</span><span class="mono">{{ cfg.population_size ?? "—" }}</span></div>
                <div class="kv"><span class="k">进化代数</span><span class="mono">{{ cfg.num_generations ?? "—" }}</span></div>
                <div class="kv"><span class="k">突变数</span><span class="mono">{{ cfg.num_mutation ?? "—" }}</span></div>
                <div class="kv"><span class="k">杂交数</span><span class="mono">{{ cfg.num_hybridization ?? "—" }}</span></div>
                <div class="kv"><span class="k">反思数</span><span class="mono">{{ cfg.num_reflection ?? "—" }}</span></div>
              </template>
            </div>
            <div class="field" style="margin-top:10px"><label>启发式思想</label><p class="drawer-text">{{ sub.concept ?? "—" }}</p></div>
            <div class="field"><label>关键词组</label><div class="badge-row">
              <span v-for="f in (sub.features ?? [])" :key="f" class="badge feature-badge">{{ f }}</span>
              <span v-if="!(sub.features ?? []).length" class="hint">无</span></div></div>
          </div>
        </div>
        <div v-if="tokSeries.length" class="card"><h2>每代 token 消耗</h2>
          <div class="chart-box" v-html="tokChart"></div></div>
        <div class="card">
          <h2>种群明细 <span class="tail">{{ gens.length }} 代 · 共 {{ heurCount }} 个启发式个体</span></h2>
          <div class="table-wrap"><table>
            <thead><tr><th>代数</th><th class="num">个体数</th><th class="num">最优</th><th class="num">平均</th><th class="num">最差</th><th class="num">token</th></tr></thead>
            <tbody><tr v-for="(s, i) in genStats" :key="i">
              <td class="mono">{{ gens[i].generation ?? i }}</td><td class="num mono">{{ s.n }}</td>
              <td class="num mono">{{ fmtObj(s.best) }}</td><td class="num mono hint">{{ fmtObj(s.avg) }}</td>
              <td class="num mono hint">{{ fmtObj(s.worst) }}</td>
              <td class="num mono">{{ s.tok != null ? fmtTokens(s.tok) : "—" }}</td>
            </tr></tbody>
          </table></div>
          <template v-for="(g, gi) in gensWithHeurs" :key="gi">
            <div class="mine-head"><span class="mine-title">第 {{ g.generation ?? gi }} 代种群</span>
              <span class="hint">{{ g.sorted.length }} 个个体{{ genStats[gi] && genStats[gi].tok != null ? " · " + fmtTokens(genStats[gi].tok) + " tokens" : "" }}</span></div>
            <div class="pop-grid" style="margin-top:6px">
              <div v-for="(h, hi) in g.sorted" :key="hi" class="pop-card static">
                <div class="pop-card-head">
                  <span class="pop-rank">#{{ hi + 1 }}</span>
                  <span class="pop-obj mono">{{ fmtObj(h.objective) }}</span>
                  <span v-if="genStats[gi] && genStats[gi].best != null && Number(h.objective) === genStats[gi].best" class="badge src-local">本代最优</span>
                </div>
                <div class="pop-concept" style="min-height:0">{{ h.concept || "（无描述）" }}</div>
                <div class="pop-tags">
                  <span v-for="f in (h.features ?? [])" :key="f" class="badge feature-badge">{{ f }}</span>
                  <span v-if="!(h.features ?? []).length" class="hint">无关键词</span>
                </div>
                <details v-if="h.algorithm" class="alg-details"><summary>算法代码</summary>
                  <div class="code-container"><button class="btn small copy-btn" @click="copyText(h.algorithm)">复制</button>
                  <pre>{{ h.algorithm }}</pre></div></details>
              </div>
            </div>
          </template>
          <div v-if="customCode" class="field"><label>框架源码（framework.py）</label>
            <div class="code-container"><button class="btn small copy-btn" @click="copyText(customCode)">复制</button>
            <pre>{{ customCode }}</pre></div></div>
        </div>
      </template>
    </template>
  </div>`,
    setup(props) {
        const sid = ref(props.params.get("id") || "");
        const recentList = ref([]),
            mySubs = ref([]);
        const recentSel = ref(""),
            mineSel = ref("");
        const state = ref(sid.value ? "loading" : "idle");
        const rec = ref(null),
            errMsg = ref(""),
            err401 = ref(false);

        onMounted(async () => {
            recentList.value = await api("/api/submissions/recent?limit=50").then(r => r.submissions ?? []).catch(() => []);
            if (getToken()) mySubs.value = await api("/api/submissions/my").then(r => r.submissions ?? []).catch(() => []);
            if (sid.value) analyze();
        });

        const inst = computed(() => rec.value?.instance ?? null);
        const sub = computed(() => rec.value?.submission ?? {});
        const cfg = computed(() => inst.value?.config ?? {});
        const asc = computed(() => cfg.value.ascend !== false);
        const gens = computed(() => ((inst.value?.population_snapshot ?? [])).slice().sort((a, b) => (a.generation ?? 0) - (b.generation ?? 0)));
        const genStats = computed(() => gens.value.map(g => {
            const objs = (g.heuristics ?? []).map(h => Number(h?.objective)).filter(isFinite);
            return {
                n: objs.length,
                best: objs.length ? (asc.value ? Math.min(...objs) : Math.max(...objs)) : null,
                avg: objs.length ? objs.reduce((a, b) => a + b, 0) / objs.length : null,
                worst: objs.length ? (asc.value ? Math.max(...objs) : Math.min(...objs)) : null,
                tok: tokOf(g.token_usage),
            };
        }));

        function tokOf(t) {
            if (t == null) return null;
            if (typeof t === "number") return t;
            if (typeof t === "object") return t.total_tokens ?? t.total ?? t.tokens ?? null;
            return null;
        }
        const gensWithHeurs = computed(() => gens.value.map((g, gi) => ({
            ...g,
            sorted: (g.heuristics ?? []).slice().sort((a, b) => {
                const x = Number(a?.objective),
                    y = Number(b?.objective);
                if (!isFinite(x) && !isFinite(y)) return 0;
                if (!isFinite(x)) return 1;
                if (!isFinite(y)) return -1;
                return asc.value ? x - y : y - x;
            }),
        })));
        const bestPts = computed(() => genStats.value.map((s, i) => ({
            x: gens.value[i].generation ?? i,
            y: s.best,
            label: "第 " + (gens.value[i].generation ?? i) + " 代"
        })).filter(p => p.y != null));
        const avgPts = computed(() => genStats.value.map((s, i) => ({
            x: gens.value[i].generation ?? i,
            y: s.avg,
            label: "第 " + (gens.value[i].generation ?? i) + " 代"
        })).filter(p => p.y != null));
        const mainChart = computed(() => lineChartSVG([{
                name: "每代最优",
                color: "#22d3ee",
                points: bestPts.value
            },
            {
                name: "每代平均",
                color: "#a78bfa",
                dashed: true,
                points: avgPts.value
            },
        ], {
            yLabel: "适应度"
        }));
        const heurCount = computed(() => genStats.value.reduce((a, s) => a + s.n, 0));
        const firstBest = computed(() => bestPts.value[0]?.y ?? null);
        const finalBest = computed(() => bestPts.value.at(-1)?.y ?? null);
        const improve = computed(() => {
            const f = firstBest.value,
                l = finalBest.value;
            if (f == null || l == null || f === 0) return null;
            return (asc.value ? (f - l) / Math.abs(f) : (l - f) / Math.abs(f)) * 100;
        });
        const anyTok = computed(() => genStats.value.some(s => s.tok != null));
        const tokTotal = computed(() => genStats.value.reduce((a, s) => a + (s.tok ?? 0), 0));
        const tokSeries = computed(() => genStats.value.map((s, i) => ({
            label: String(gens.value[i].generation ?? i),
            value: s.tok ?? 0,
            tip: "第 " + (gens.value[i].generation ?? i) + " 代"
        })));
        const tokChart = computed(() => barChartSVG(tokSeries.value));
        const subObjective = computed(() => sub.value.objective ?? finalBest.value);
        const customCode = computed(() => inst.value?.framework_type === "custom" ? (cfg.value.framework_code ?? "") : "");

        function pickRecent() {
            if (recentSel.value) {
                sid.value = recentSel.value;
                analyze();
            }
        }

        function pickMine() {
            if (mineSel.value) {
                sid.value = mineSel.value;
                analyze();
            }
        }
        async function analyze() {
            const id = String(sid.value).trim();
            if (!id) {
                toast("请先填写提交 ID", "err");
                return;
            }
            try {
                history.replaceState(null, "", "#/curve?id=" + encodeURIComponent(id));
            } catch {}
            store.route = {
                name: "curve",
                params: new URLSearchParams({
                    id
                })
            };
            state.value = "loading";
            err401.value = false;
            try {
                rec.value = await api(`/api/submissions/${id}/record`);
                state.value = "done";
            } catch (e) {
                state.value = "err";
                errMsg.value = e.message;
                err401.value = e.status === 401;
            }
        }
        return {
            store,
            getToken,
            sid,
            recentList,
            mySubs,
            recentSel,
            mineSel,
            pickRecent,
            pickMine,
            state,
            rec,
            errMsg,
            err401,
            analyze,
            inst,
            sub,
            cfg,
            asc,
            gens,
            genStats,
            gensWithHeurs,
            mainChart,
            tokChart,
            tokSeries,
            heurCount,
            firstBest,
            improve,
            anyTok,
            tokTotal,
            subObjective,
            customCode,
            fmtObj,
            fmtTokens,
            fmtTime,
            fullName,
            copyText,
            EmptyState,
            FwBadge,
            SrcBadge,
            Avatar
        };
    },
};
ROUTE_COMPS.curve = CurveView;

/* ==================== 双提交对比 ==================== */
const CompareView = {
    components: {
        EmptyState,
        FwBadge,
        SrcBadge,
        Avatar
    },
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
        <div class="card"><h2>🅰 提交 A <span class="mono hint">#{{ A.id }}</span></h2>
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
        <div class="card"><h2>🅱 提交 B <span class="mono hint">#{{ B.id }}</span></h2>
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
        const idA = ref(""),
            idB = ref(""),
            pickA = ref(""),
            pickB = ref("");
        const state = ref("idle"),
            errMsg = ref(""),
            err401 = ref(false);
        const A = ref(null),
            B = ref(null);
        onMounted(() => {
            recent.value = api("/api/submissions/recent?limit=50").then(r => r.submissions ?? []).catch(() => []);
        });
        watch(pickA, v => {
            if (v) idA.value = v;
        });
        watch(pickB, v => {
            if (v) idB.value = v;
        });

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
            return {
                id,
                sub: recData.submission ?? {},
                inst: instData,
                asc,
                gens,
                bests
            };
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
            return lineChartSVG([{
                    name: "A 提升%",
                    color: "#22d3ee",
                    points: improveSeries(A.value)
                },
                {
                    name: "B 提升%",
                    color: "#f472b6",
                    points: improveSeries(B.value)
                },
            ], {
                yLabel: "相对首代提升 %",
                xFormat: x => "第" + Math.round(x) + "代"
            });
        });
        const chartA = computed(() => !A.value ? "" : lineChartSVG([{
            name: "每代最优",
            color: "#22d3ee",
            points: A.value.bests.map((v, i) => ({
                x: i,
                y: v,
                label: "第 " + i + " 代"
            })).filter(p => p.y != null)
        }]));
        const chartB = computed(() => !B.value ? "" : lineChartSVG([{
            name: "每代最优",
            color: "#f472b6",
            points: B.value.bests.map((v, i) => ({
                x: i,
                y: v,
                label: "第 " + i + " 代"
            })).filter(p => p.y != null)
        }]));
        const deltaRows = computed(() => {
            if (!A.value || !B.value) return [];
            const ascend = isAscend(A.value.sub.problem_key || A.value.inst?.problem_key);
            const mk = (label, va, vb, fmt, better) => {
                if (label === "适应度") better = ascend ? "low" : "high";
                const na = va ?? null,
                    nb = vb ?? null;
                const dv = na != null && nb != null ? nb - na : null;
                let cls = "";
                if (dv != null && dv !== 0) cls = (better === "low" ? dv < 0 : dv > 0) ? "delta-up" : "delta-down";
                return {
                    label,
                    va: fmt(na),
                    vb: fmt(nb),
                    dv: dv == null ? "—" : (dv > 0 ? "+" : "") + fmt(dv),
                    cls
                };
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
        return {
            store,
            recent,
            idA,
            idB,
            pickA,
            pickB,
            state,
            errMsg,
            err401,
            A,
            B,
            sameProblem,
            overlayChart,
            chartA,
            chartB,
            deltaRows,
            run,
            fmtObj,
            fmtTokens,
            fullName,
            store: store
        };
    },
};
ROUTE_COMPS.compare = CompareView;
