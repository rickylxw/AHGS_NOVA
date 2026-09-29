<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { api, getToken } from "../lib/api";
import { STATUS_ACTIVE, STATUS_LABEL } from "../lib/constants";
import { store, toast, openHeurDrawer } from "../lib/store";
import { fmtObj, fmtTokens, fmtTime, fullName, isAscend } from "../lib/format";
import LineChart from "../charts/LineChart.vue";
import BarChart from "../charts/BarChart.vue";
import KeywordInsight from "../components/KeywordInsight.vue";
import CodeBlock from "../components/CodeBlock.vue";
import Avatar from "../components/Avatar.vue";
import FwBadge from "../components/FwBadge.vue";
import EmptyState from "../components/EmptyState.vue";

const props = defineProps({ params: { type: URLSearchParams, default: () => new URLSearchParams() } });

/* 数据来源两种：
   - run:  /api/evolution/{id}/status + /results + /population（实时、可控、自动刷新）
   - submission: /api/submissions/{id} + /record（静态、含每代个体明细）
   路由名保持 curve，兼容旧链接 #/curve?id=xx */
const runs = ref([]);
const mySubs = ref([]);
const recent = ref([]);
const runSel = ref("");
const mineSel = ref("");
const recentSel = ref("");
const manualType = ref("submission");
const manualId = ref("");
const source = ref(null); // {type:'run'|'submission', id}
const state = ref("idle");
const loadErr = ref("");
const err401 = ref(false);

// run 模式
const status = ref({});
const results = ref(null);
const pop = ref(null);
const ctrlBusy = ref(false);
const ctrlErr = ref("");
const promptOpen = ref(false);
const promptText = ref("");
const promptIsCode = ref(false);
const promptState = ref("");
const monitorKeyOverride = ref(null);
let pollTimer = null;

// submission 模式
const rec = ref(null);

// 我在各赛道的名次（用于“与自己最优对比”）
const myRanks = ref([]);

onMounted(async () => {
    runs.value = await api("/api/evolution/my").then(r => r.runs ?? []).catch(() => []);
    mySubs.value = getToken()
        ? await api("/api/submissions/my").then(r => r.submissions ?? []).catch(() => [])
        : [];
    recent.value = await api("/api/submissions/recent?limit=50").then(r => r.submissions ?? []).catch(() => []);
    if (getToken()) {
        myRanks.value = await api("/api/ranking/me").then(r => r.entries ?? []).catch(() => []);
    }
    const runP = props.params.get("run");
    const idP = props.params.get("id");
    if (runP) {
        source.value = { type: "run", id: Number(runP) };
        runSel.value = runP;
        loadRun();
    } else if (idP) {
        source.value = { type: "submission", id: idP };
        loadSubmission(idP);
    }
});
onUnmounted(() => {
    if (pollTimer) clearInterval(pollTimer);
});

function pickRun() {
    if (runSel.value) {
        mineSel.value = recentSel.value = "";
        loadSource("run", Number(runSel.value));
    }
}

function pickMine() {
    if (mineSel.value) {
        runSel.value = recentSel.value = "";
        loadSource("submission", mineSel.value);
    }
}

function pickRecent() {
    if (recentSel.value) {
        runSel.value = mineSel.value = "";
        loadSource("submission", recentSel.value);
    }
}

function goManual() {
    const id = String(manualId.value).trim();
    if (!id) {
        toast("请输入 ID", "err");
        return;
    }
    runSel.value = mineSel.value = recentSel.value = "";
    loadSource(manualType.value, manualType.value === "run" ? Number(id) : id);
}

function loadSource(type, id) {
    source.value = { type, id };
    state.value = "loading";
    loadErr.value = "";
    err401.value = false;
    results.value = null;
    pop.value = null;
    rec.value = null;
    status.value = {};
    try {
        // 注意用 window.history：模板作用域内有同名 history 计算属性
        window.history.replaceState(null, "", type === "run" ? `#/curve?run=${id}` : `#/curve?id=${id}`);
    } catch { /* ignore */ }
    if (type === "run") loadRun();
    else loadSubmission(id);
}

/* ---------- run 模式 ---------- */
const isRunMode = computed(() => source.value?.type === "run");
const runProblemKey = computed(() => {
    const fromList = runs.value.find(r => r.run_id === source.value?.id)?.problem_key;
    return monitorKeyOverride.value ?? fromList ?? null;
});

async function loadRun() {
    try {
        status.value = await api(`/api/evolution/${source.value.id}/status`);
        await loadRunResults();
        state.value = "done";
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(async () => {
            if (!source.value || source.value.type !== "run") return;
            try {
                const st = await api(`/api/evolution/${source.value.id}/status`);
                status.value = st;
                await loadRunResults();
                if (!STATUS_ACTIVE.has(st.status) && pollTimer) {
                    clearInterval(pollTimer);
                    pollTimer = null;
                }
            } catch { /* ignore */ }
        }, 3000);
    } catch (e) {
        state.value = "idle";
        loadErr.value = e.message;
        err401.value = e.status === 401;
    }
}

async function loadRunResults() {
    try {
        results.value = await api(`/api/evolution/${source.value.id}/results`);
    } catch { /* ignore */ }
    try {
        pop.value = await api(`/api/evolution/${source.value.id}/population`);
    } catch { /* ignore */ }
}

const history = computed(() => results.value?.history ?? []);
const lastHistory = computed(() => history.value.at(-1) ?? {});
const hasVariance = computed(() => history.value.some(h => h.variance != null));
const bestHeur = computed(() => results.value?.best_heuristic ?? null);
const top3 = computed(() => lastHistory.value.top3 ?? []);
const tokenHistory = computed(() => results.value?.token_history ?? []);
const lastTok = computed(() => tokenHistory.value.at(-1) ?? {});
const popAsc = computed(() => isAscend(runProblemKey.value));
const popHeurs = computed(() =>
    (pop.value?.heuristics ?? []).slice().sort((a, b) => {
        const x = Number(a?.objective);
        const y = Number(b?.objective);
        if (!isFinite(x) && !isFinite(y)) return 0;
        if (!isFinite(x)) return 1;
        if (!isFinite(y)) return -1;
        return popAsc.value ? x - y : y - x;
    })
);
const popBest = computed(() => {
    const objs = popHeurs.value.map(h => Number(h?.objective)).filter(isFinite);
    return objs.length ? (popAsc.value ? Math.min(...objs) : Math.max(...objs)) : null;
});
const popBarItems = computed(() =>
    popHeurs.value.map((h, i) => ({
        label: String(i + 1),
        value: Number(h?.objective ?? 0),
        tip: h?.concept || `个体 ${i + 1}`,
    }))
);
const top3BarItems = computed(() =>
    top3.value.map((t, i) => ({
        label: "#" + (i + 1),
        value: Number(t.objective),
        tip: t.concept || `#${i + 1}`,
    }))
);
const genXFormat = x => "第" + Math.round(x) + "代";
const pt = (h, i, key) => ({
    x: h.generation ?? i,
    y: h[key],
    label: "第 " + (h.generation ?? i) + " 代",
});
// 方差数量级常远大于最优/均值，拆到独立坐标的单独图，避免压扁主曲线
const histSeries = computed(() => [
    { name: "最优", color: "#22d3ee", points: history.value.map((h, i) => pt(h, i, "best_objective")).filter(p => p.y != null) },
    { name: "均值", color: "#a78bfa", points: history.value.map((h, i) => pt(h, i, "avg_objective")).filter(p => p.y != null) },
]);
const varianceSeries = computed(() => [
    {
        name: "方差",
        color: "#fb7185",
        points: history.value.map((h, i) => pt(h, i, "variance")).filter(p => p.y != null),
    },
]);
const tokDeltaItems = computed(() =>
    tokenHistory.value.map((t, i) => ({
        label: String(t.generation ?? i),
        value: Math.max(0, (t.total_tokens ?? 0) - (i > 0 ? tokenHistory.value[i - 1].total_tokens ?? 0 : 0)),
        tip: `第 ${t.generation ?? i} 代消耗`,
    }))
);
const isActive = computed(() => STATUS_ACTIVE.has(status.value.status));

const CTRL_MSG = {
    stop: "已停止",
    pause: "已暂停",
    resume: "已继续",
    submit: "当前最优已提交到排行榜",
};

async function ctrl(action) {
    if (!source.value) return;
    ctrlErr.value = "";
    ctrlBusy.value = true;
    try {
        await api(`/api/evolution/${source.value.id}/${action}`, { method: "POST" });
        toast(CTRL_MSG[action] ?? "操作成功", "ok");
        try {
            status.value = await api(`/api/evolution/${source.value.id}/status`);
        } catch { /* ignore */ }
        loadRunResults();
    } catch (e) {
        ctrlErr.value = (action === "submit" ? "提交失败：" : "操作失败：") + e.message;
        toast(ctrlErr.value, "err");
    } finally {
        ctrlBusy.value = false;
    }
}

async function saveInstance() {
    ctrlErr.value = "";
    ctrlBusy.value = true;
    try {
        const snapshot = pop.value?.heuristics
            ? [{
                generation: pop.value.generation ?? 0,
                heuristics: (pop.value.heuristics ?? []).map(h => {
                    const feats = h.features ?? h.feature ?? [];
                    return {
                        concept: h.concept,
                        algorithm: h.algorithm,
                        features: feats,
                        feature: feats,
                        objective: h.objective == null || h.objective === Infinity ? null : h.objective,
                    };
                }),
                memory: pop.value.memory ?? { positive_features: [], negative_features: [] },
            }]
            : [];
        const name = `实例_${runProblemKey.value ?? "unknown"}_${new Date().toLocaleString("zh-CN").replace(/[/: ]/g, "-")}`;
        await api("/api/instances", {
            method: "POST",
            body: {
                name,
                framework_type: "custom",
                problem_key: runProblemKey.value,
                config: { note: "从进化分析页保存" },
                run_id: source.value.id,
                population_snapshot: snapshot,
            },
        });
        toast(`实例已保存：${name}`, "ok");
    } catch (e) {
        ctrlErr.value = e.message;
    } finally {
        ctrlBusy.value = false;
    }
}

watch(promptOpen, async open => {
    if (!open || !source.value) return;
    promptState.value = "";
    try {
        const p = await api(`/api/evolution/${source.value.id}/prompt`);
        promptIsCode.value = p.framework_code != null;
        promptText.value = promptIsCode.value ? p.framework_code : JSON.stringify(p.components ?? {}, null, 2);
    } catch (e) {
        promptText.value = "加载失败：" + e.message;
    }
});

async function savePrompt() {
    try {
        const body = promptIsCode.value
            ? { framework_code: promptText.value }
            : { components: JSON.parse(promptText.value) };
        await api(`/api/evolution/${source.value.id}/prompt`, { method: "POST", body });
        promptState.value = "✔ 已保存";
        toast("提示词已保存", "ok");
    } catch (e) {
        promptState.value = "✘ " + e.message;
    }
}

function showHeur(h, i) {
    openHeurDrawer(h, pop.value?.generation ?? "?", i);
}

/* ---------- submission 模式 ---------- */
const inst = computed(() => rec.value?.instance ?? null);
const sub = computed(() => rec.value?.submission ?? {});
const cfg = computed(() => inst.value?.config ?? {});
const asc = computed(() => cfg.value.ascend !== false);
const gens = computed(() =>
    (inst.value?.population_snapshot ?? [])
        .slice()
        .sort((a, b) => (a.generation ?? 0) - (b.generation ?? 0))
        .map(g => ({
            ...g,
            heuristics: (g.heuristics ?? []).map(h => ({
                ...h,
                features: h.features ?? h.feature ?? [],
            })),
        }))
);
const genStats = computed(() =>
    gens.value.map(g => {
        const objs = (g.heuristics ?? []).map(h => Number(h?.objective)).filter(isFinite);
        return {
            n: objs.length,
            best: objs.length ? (asc.value ? Math.min(...objs) : Math.max(...objs)) : null,
            avg: objs.length ? objs.reduce((a, b) => a + b, 0) / objs.length : null,
            worst: objs.length ? (asc.value ? Math.max(...objs) : Math.min(...objs)) : null,
            tok: tokOf(g.token_usage),
        };
    })
);

function tokOf(t) {
    if (t == null) return null;
    if (typeof t === "number") return t;
    if (typeof t === "object") return t.total_tokens ?? t.total ?? t.tokens ?? null;
    return null;
}

const gensWithHeurs = computed(() =>
    gens.value.map((g, gi) => ({
        ...g,
        sorted: (g.heuristics ?? []).slice().sort((a, b) => {
            const x = Number(a?.objective);
            const y = Number(b?.objective);
            if (!isFinite(x) && !isFinite(y)) return 0;
            if (!isFinite(x)) return 1;
            if (!isFinite(y)) return -1;
            return asc.value ? x - y : y - x;
        }),
        _gi: gi,
    }))
);
const mainSeries = computed(() => [
    { name: "每代最优", color: "#22d3ee", points: bestPts.value },
    { name: "每代平均", color: "#a78bfa", dashed: true, points: avgPts.value },
]);
const bestPts = computed(() =>
    genStats.value
        .map((s, i) => ({
            x: gens.value[i].generation ?? i,
            y: s.best,
            label: "第 " + (gens.value[i].generation ?? i) + " 代",
        }))
        .filter(p => p.y != null)
);
const avgPts = computed(() =>
    genStats.value
        .map((s, i) => ({
            x: gens.value[i].generation ?? i,
            y: s.avg,
            label: "第 " + (gens.value[i].generation ?? i) + " 代",
        }))
        .filter(p => p.y != null)
);
const heurCount = computed(() => genStats.value.reduce((a, s) => a + s.n, 0));
const firstBest = computed(() => bestPts.value[0]?.y ?? null);
const finalBest = computed(() => bestPts.value.at(-1)?.y ?? null);
const improve = computed(() => {
    const f = firstBest.value;
    const l = finalBest.value;
    if (f == null || l == null || f === 0) return null;
    return ((asc.value ? (f - l) / Math.abs(f) : (l - f) / Math.abs(f)) * 100);
});
const anyTok = computed(() => genStats.value.some(s => s.tok != null));
const tokTotal = computed(() => genStats.value.reduce((a, s) => a + (s.tok ?? 0), 0));
const tokBarItems = computed(() =>
    genStats.value.map((s, i) => ({
        label: String(gens.value[i].generation ?? i),
        value: s.tok ?? 0,
        tip: "第 " + (gens.value[i].generation ?? i) + " 代",
    }))
);
const subObjective = computed(() => sub.value.objective ?? finalBest.value);
const customCode = computed(() =>
    inst.value?.framework_type === "custom" ? (cfg.value.framework_code ?? "") : ""
);
const bestInd = computed(() => {
    const last = gensWithHeurs.value.at(-1);
    return last?.sorted?.[0] ? { ...last.sorted[0], generation: last.generation } : null;
});

async function loadSubmission(id) {
    try {
        rec.value = await api(`/api/submissions/${id}/record`);
        state.value = "done";
    } catch (e) {
        state.value = "idle";
        loadErr.value = e.message;
        err401.value = e.status === 401;
    }
}

/* ---------- 关键词洞察：features 与适应度的相关性 ---------- */
const kwIndividuals = computed(() => {
    if (!source.value) return [];
    if (source.value.type === "run") {
        return popHeurs.value
            .filter(h => h && isFinite(Number(h.objective)))
            .map(h => ({ objective: Number(h.objective), features: h.features ?? [] }));
    }
    return gensWithHeurs.value.flatMap(g =>
        g.sorted
            .filter(h => h && isFinite(Number(h.objective)))
            .map(h => ({ objective: Number(h.objective), features: h.features ?? [] }))
    );
});
const kwScope = computed(() => {
    if (source.value && source.value.type === "run") {
        return "当前代（第 " + (pop.value ? pop.value.generation : "?") + " 代 · " + kwIndividuals.value.length + " 个个体）";
    }
    return "全部 " + gens.value.length + " 代 · " + kwIndividuals.value.length + " 个个体";
});
const kwInsight = computed(() => {
    const inds = kwIndividuals.value.filter(x => (x.features ?? []).length > 0);
    if (inds.length < 3) return null;
    const overall = inds.reduce((a, x) => a + x.objective, 0) / inds.length;
    const kwAsc = source.value.type === "run" ? popAsc.value : asc.value;
    const map = new Map();
    for (const x of inds) {
        for (const f of new Set(x.features ?? [])) {
            if (!map.has(f)) map.set(f, { n: 0, sum: 0, best: null });
            const e = map.get(f);
            e.n += 1;
            e.sum += x.objective;
            if (e.best == null || (kwAsc ? x.objective < e.best : x.objective > e.best)) e.best = x.objective;
        }
    }
    const entries = [...map.entries()]
        .filter(([, e]) => e.n >= 2)
        .map(([name, e]) => {
            const avg = e.sum / e.n;
            const delta = kwAsc
                ? ((overall - avg) / Math.abs(overall || 1)) * 100
                : ((avg - overall) / Math.abs(overall || 1)) * 100;
            return { name, n: e.n, avg, best: e.best, overall, delta };
        });
    const good = entries.filter(e => e.delta >= 5).sort((a, b) => b.delta - a.delta).slice(0, 12);
    const bad = entries.filter(e => e.delta <= -5).sort((a, b) => a.delta - b.delta).slice(0, 12);
    return { good, bad };
});

// ===== 与个人最优对比 =====
const compareProblemKey = computed(() => {
    if (source.value?.type === "run") return runProblemKey.value;
    return sub.value.problem_key || inst.value?.problem_key || null;
});
const myRankEntry = computed(() => myRanks.value.find(e => e.problem_key === compareProblemKey.value) ?? null);
const curObjective = computed(() => {
    if (source.value?.type === "run") {
        return status.value.best_objective ?? bestHeur.value?.objective ?? null;
    }
    return subObjective.value;
});
const mineCompare = computed(() => {
    const cur = curObjective.value;
    const entry = myRankEntry.value;
    if (cur == null || !isFinite(Number(cur)) || !entry) return null;
    const myBest = Number(entry.best_objective);
    if (!isFinite(myBest) || myBest === 0) return null;
    const asc = isAscend(compareProblemKey.value);
    const deltaPct = asc
        ? (Number(cur) - myBest) / Math.abs(myBest) * 100
        : (myBest - Number(cur)) / Math.abs(myBest) * 100;
    return {
        myBest,
        rank: entry.rank,
        cur: Number(cur),
        deltaPct,
        atBest: deltaPct <= 0.005,
    };
});

const problemLabel = computed(() => {
    if (source.value?.type === "run") return runProblemKey.value ?? "—";
    const pk = sub.value.problem_key || inst.value?.problem_key;
    return (store.problems.find(p => p.key === pk) || {}).name || pk || "—";
});

function statusName(s) {
    return STATUS_LABEL[s] ?? s ?? "—";
}

function genHint(g, gi) {
    const tok = genStats.value[gi]?.tok;
    return g.sorted.length + " 个个体" + (tok != null ? " · " + fmtTokens(tok) + " tokens" : "");
}
</script>

<template>
    <div>
        <div class="card">
            <h2>进化分析 <span class="tail">Run = 一次进化（实时监控）；提交 = 一次最优上报（含种群明细）</span></h2>
            <div class="picker-row">
                <select class="input" v-model="runSel" style="max-width: 300px" @change="pickRun">
                    <option value="">— 我的 Run（实时监控）—</option>
                    <option v-for="r in runs" :key="r.run_id" :value="String(r.run_id)">
                        Run #{{ r.run_id }} · {{ r.problem_key ?? "?" }} · {{ statusName(r.status) }} · {{
                            fmtObj(r.best_objective) }}
                    </option>
                </select>
                <select class="input" v-model="mineSel" style="max-width: 330px" @change="pickMine">
                    <option value="">— 我的提交 —</option>
                    <option v-for="s in mySubs" :key="s.id" :value="String(s.id)">#{{ s.id }} · {{ s.problem_name ||
                        s.problem_key }} · {{ fmtObj(s.objective) }} · {{ fmtTime(s.created_at) }}</option>
                </select>
                <select class="input" v-model="recentSel" style="max-width: 300px" @change="pickRecent">
                    <option value="">— 最近提交（全站）—</option>
                    <option v-for="s in recent" :key="s.id" :value="String(s.id)">#{{ s.id }} · {{ fullName(s) }} · {{
                        s.problem_name || s.problem_key }} · {{ fmtObj(s.objective) }}</option>
                </select>
            </div>
            <div class="picker-row" style="margin-top: 8px">
                <select class="input" v-model="manualType" style="max-width: 130px">
                    <option value="submission">提交 ID</option>
                    <option value="run">Run ID</option>
                </select>
                <input class="input" v-model="manualId" placeholder="输入 ID" style="max-width: 180px"
                    @keydown.enter="goManual" />
                <button class="btn primary" @click="goManual">分析</button>
                <span v-if="source" class="badge feature-badge">{{ source.type === 'run' ? 'Run #' + source.id + '（实时监控）'
                    : '提交 #' + source.id }}</span>
                <button v-if="isRunMode" class="btn small" style="margin-left: auto" @click="saveInstance">💾 保存实例</button>
            </div>
            <div class="error-banner" v-if="loadErr">{{ loadErr }}
                <div v-if="err401" style="margin-top: 8px"><button class="btn primary"
                        @click="store.loginModal = true">登录 / 注册</button></div>
            </div>
        </div>

        <div v-if="state === 'loading'" class="card">
            <div class="loading-row"><span class="spinner"></span>加载中…</div>
        </div>
        <div v-else-if="state === 'idle'" class="card">
            <EmptyState icon="🧬" desc="选择一个 Run 实时监控，或选择一个提交查看完整进化过程" />
        </div>

        <!-- ==================== Run 模式 ==================== -->
        <template v-else-if="isRunMode">
            <div class="card">
                <div class="picker-row">
                    <h2 style="margin: 0">实时监控 <span class="tail">Run #{{ source.id }}</span></h2>
                    <span class="badge" :class="'evo-st-' + status.status" style="margin-left: 12px">{{
                        statusName(status.status) }}</span>
                    <span class="chip-row" style="margin-left: auto">
                        <button class="btn small" :disabled="ctrlBusy || !isActive" @click="ctrl('pause')">⏸ 暂停</button>
                        <button class="btn small" :disabled="ctrlBusy || status.status !== 'paused'"
                            @click="ctrl('resume')">▶ 继续</button>
                        <button class="btn small danger" :disabled="ctrlBusy || !isActive" @click="ctrl('stop')">⏹
                            停止</button>
                        <button class="btn small" :disabled="ctrlBusy" @click="ctrl('submit')">🏆 提交最优</button>
                        <button class="btn small" @click="promptOpen = !promptOpen">📝 提示词</button>
                    </span>
                </div>
                <div class="error-banner" v-if="ctrlErr" style="margin-top: 8px">{{ ctrlErr }}</div>
                <div class="grid cols-4" style="margin-top: 10px">
                    <div class="stat">
                        <div class="k">最优适应度</div>
                        <div class="v mono">{{ fmtObj(status.best_objective) }}</div>
                        <div class="s">{{ popAsc ? "越小越好" : "越大越好" }} · {{ problemLabel }}</div>
                    </div>
                    <div class="stat">
                        <div class="k">代数</div>
                        <div class="v mono">{{ status.current_generation ?? 0 }} / {{ status.total_generations ?? "—"
                            }}</div>
                        <div class="s">共 {{ history.length }} 代进化记录</div>
                    </div>
                    <div class="stat">
                        <div class="k">种群均值</div>
                        <div class="v mono">{{ fmtObj(lastHistory?.avg_objective) }}</div>
                        <div class="s">第 {{ lastHistory?.generation ?? "—" }} 代</div>
                    </div>
                    <div class="stat">
                        <div class="k">进度 {{ status.progress != null ? Math.round(status.progress * 100) + "%" : ""
                            }}</div>
                        <div class="progress-track" style="margin-top: 10px">
                            <div class="progress-fill"
                                :style="{ width: (status.progress != null ? Math.round(status.progress * 100) : 0) + '%' }">
                            </div>
                        </div>
                    </div>
                </div>
                <div v-if="mineCompare" class="card vs-mine-card">
                    <span class="vs-mine-ico">🎯</span>
                    <span>与个人最优：</span>
                    <span class="mono" style="font-weight: 800">{{ fmtObj(mineCompare.cur) }}</span>
                    <span class="hint">vs 我的最好</span>
                    <span class="mono">{{ fmtObj(mineCompare.myBest) }}</span>
                    <span v-if="mineCompare.atBest" class="delta-up">🏆 已达个人最优（当前第 {{ mineCompare.rank }} 名）</span>
                    <span v-else class="delta-down">距个人最优 +{{ mineCompare.deltaPct.toFixed(2) }}%（当前第 {{ mineCompare.rank }} 名）</span>
                </div>
                <div v-if="promptOpen" style="margin-top: 12px">
                    <div class="field">
                        <label>{{ promptIsCode ? "框架代码（framework_code）" : "提示词组件（components JSON）" }}</label>
                        <textarea v-model="promptText" spellcheck="false" class="input mono" rows="8"></textarea>
                    </div>
                    <button class="btn small primary" @click="savePrompt">保存提示词</button>
                    <span class="hint" style="margin-left: 8px">{{ promptState || "修改将注入下一代的进化提示" }}</span>
                </div>
            </div>

            <KeywordInsight v-if="kwInsight" :insight="kwInsight" :scope="kwScope" :ascend="popAsc" />
            <div v-if="bestHeur" class="card">
                <h2>最优算法 <span class="tail">第 {{ bestHeur.generation ?? "?" }} 代 · 适应度 {{ fmtObj(bestHeur.objective)
                    }}</span></h2>
                <p class="drawer-text" style="margin-bottom: 8px">{{ bestHeur.concept || "（无描述）" }}</p>
                <CodeBlock v-if="bestHeur.algorithm" :code="bestHeur.algorithm" max-height="320px" />
            </div>

            <div v-if="popHeurs.length" class="card">
                <h2>当代种群 <span class="tail">第 {{ pop?.generation ?? "?" }} 代 · {{ popHeurs.length }} 个个体</span></h2>
                <div class="chart-box">
                    <BarChart :items="popBarItems" :height="140" />
                </div>
                <div class="pop-grid">
                    <button v-for="(h, i) in popHeurs" :key="i" class="pop-card" @click="showHeur(h, i)">
                        <span class="pop-rank">{{ i + 1 }}</span>
                        <span class="pop-obj mono">{{ fmtObj(h.objective) }}</span>
                        <span v-if="popBest != null && Number(h.objective) === popBest" class="badge src-local">本代最优</span>
                        <span class="pop-concept">{{ (h.concept || "").slice(0, 48) || "（无描述）" }}</span>
                        <span class="pop-tags"><span v-for="f in (h.features ?? []).slice(0, 3)" :key="f"
                                class="badge feature-badge">{{ f }}</span></span>
                    </button>
                </div>
                <div v-if="pop && pop.memory" class="grid cols-2" style="margin-top: 10px">
                    <div class="field">
                        <label>CALM 正向记忆</label>
                        <div class="badge-row">
                            <span v-for="f in pop.memory.positive_features ?? []" :key="f" class="badge src-local">{{ f
                            }}</span>
                            <span v-if="!(pop.memory.positive_features ?? []).length" class="hint">无</span>
                        </div>
                    </div>
                    <div class="field">
                        <label>CALM 负向记忆</label>
                        <div class="badge-row">
                            <span v-for="f in pop.memory.negative_features ?? []" :key="f" class="badge src-api">{{ f
                            }}</span>
                            <span v-if="!(pop.memory.negative_features ?? []).length" class="hint">无</span>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="top3.length" class="card">
                <h2>前三算法适应度 <span class="tail">第 {{ lastHistory?.generation ?? "?" }} 代</span></h2>
                <div class="chart-box">
                    <BarChart :items="top3BarItems" />
                </div>
            </div>

            <div class="card">
                <h2>历代最优 / 均值</h2>
                <div class="legend">
                    <span><span class="dot" style="background: #22d3ee"></span>最优</span>
                    <span><span class="dot" style="background: #a78bfa"></span>均值</span>
                </div>
                <div class="chart-box">
                    <LineChart :series="histSeries" y-label="适应度" :x-format="genXFormat" />
                </div>
            </div>

            <div v-if="hasVariance" class="card">
                <h2>历代方差 <span class="tail">独立坐标 · 方差数量级大，与上图分开看</span></h2>
                <div class="legend">
                    <span><span class="dot" style="background: #fb7185"></span>方差</span>
                </div>
                <div class="chart-box">
                    <LineChart :series="varianceSeries" y-label="方差" :x-format="genXFormat" />
                </div>
            </div>

            <div v-if="tokenHistory.length" class="card">
                <h2>Token 消耗</h2>
                <div class="grid cols-3">
                    <div class="stat">
                        <div class="k">累计输入</div>
                        <div class="v mono" style="font-size: 18px">{{ fmtTokens(lastTok.prompt_tokens) }}</div>
                    </div>
                    <div class="stat">
                        <div class="k">累计输出</div>
                        <div class="v mono" style="font-size: 18px">{{ fmtTokens(lastTok.completion_tokens) }}</div>
                    </div>
                    <div class="stat">
                        <div class="k">累计总量</div>
                        <div class="v mono" style="font-size: 18px">{{ fmtTokens(lastTok.total_tokens) }}</div>
                    </div>
                </div>
                <div class="chart-box" style="margin-top: 10px">
                    <BarChart :items="tokDeltaItems" />
                </div>
            </div>
            <div v-else class="card">
                <div class="hint">暂无 token 用量数据（新进化接入 LLM usage 后生成）。</div>
            </div>
        </template>

        <!-- ==================== 提交模式 ==================== -->
        <template v-else-if="rec">
            <div v-if="!rec.instance" class="card">
                <div class="error-banner">该提交未关联进化任务（实例），因此没有种群快照，无法绘制曲线。</div>
                <p class="hint">通常原因：发起这次进化的前端在启动时没有创建实例（旧版缺陷，现已修复）。历史遗留提交可在「进化」页打开对应 Run，点「保存实例」补建后重新提交。</p>
            </div>
            <template v-else>
                <div class="grid cols-4">
                    <div class="stat">
                        <div class="k">最终最优适应度</div>
                        <div class="v mono">{{ fmtObj(subObjective) }}</div>
                        <div class="s">{{ asc ? "越小越好" : "越大越好" }} · {{ problemLabel }}</div>
                    </div>
                    <div class="stat">
                        <div class="k">相对首代提升</div>
                        <div class="v mono">{{ improve == null ? "—" : improve.toFixed(2) + "%" }}</div>
                        <div class="s">{{ firstBest != null ? "首代最优 " + fmtObj(firstBest) : "" }}</div>
                    </div>
                    <div class="stat">
                        <div class="k">进化代数 / 个体</div>
                        <div class="v mono">{{ gens.length }} <small
                                style="font-size: 14px; color: var(--text-faint)">代</small> / {{ heurCount }}</div>
                        <div class="s">种群快照统计</div>
                    </div>
                    <div class="stat">
                        <div class="k">总 token</div>
                        <div class="v mono">{{ anyTok ? fmtTokens(tokTotal) : "—" }}</div>
                        <div class="s">{{ sub.llm_model || "" }}</div>
                    </div>
                </div>
                <div class="grid cols-2">
                    <div class="card">
                        <h2>每代适应度曲线</h2>
                        <div class="legend"><span><span class="dot" style="background: #22d3ee"></span>每代最优</span><span><span
                                class="dot" style="background: #a78bfa"></span>每代平均</span></div>
                        <div class="chart-box">
                            <LineChart :series="mainSeries" y-label="适应度" />
                        </div>
                    </div>
                    <div v-if="mineCompare" class="card vs-mine-card">
                        <span class="vs-mine-ico">🎯</span>
                        <span>与个人最优：</span>
                        <span class="mono" style="font-weight: 800">{{ fmtObj(mineCompare.cur) }}</span>
                        <span class="hint">vs 我的最好</span>
                        <span class="mono">{{ fmtObj(mineCompare.myBest) }}</span>
                        <span v-if="mineCompare.atBest" class="delta-up">🏆 已达个人最优（当前第 {{ mineCompare.rank }} 名）</span>
                        <span v-else class="delta-down">距个人最优 +{{ mineCompare.deltaPct.toFixed(2) }}%（当前第 {{ mineCompare.rank }} 名）</span>
                    </div>
                    <div class="card">
                        <h2>提交信息</h2>
                        <div class="user-cell" style="margin-bottom: 10px"><Avatar :user="sub" />
                            <div class="u-name"><span class="u-main">{{ fullName(sub) }}</span><span class="u-sub mono">{{
                                sub.username ?? "" }}</span></div>
                        </div>
                        <div class="grid-2">
                            <div class="kv"><span class="k">实例名称</span><span>{{ inst.name ?? "—" }}</span></div>
                            <div class="kv"><span class="k">框架类型</span><FwBadge :ft="inst.framework_type" /></div>
                        </div>
                        <div class="grid-2">
                            <div class="kv" v-if="inst.framework_type === 'custom'"><span class="k">框架文件</span><span
                                    class="mono">{{ cfg.framework_filename || "framework.py" }}</span></div>
                            <template v-else>
                                <div class="kv"><span class="k">种群容量</span><span class="mono">{{ cfg.population_size ??
                                    "—" }}</span></div>
                                <div class="kv"><span class="k">进化代数</span><span class="mono">{{ cfg.num_generations ?? "—"
                                    }}</span></div>
                                <div class="kv"><span class="k">突变数</span><span class="mono">{{ cfg.num_mutation ?? "—"
                                    }}</span></div>
                                <div class="kv"><span class="k">杂交数</span><span class="mono">{{ cfg.num_hybridization ?? "—"
                                    }}</span></div>
                                <div class="kv"><span class="k">反思数</span><span class="mono">{{ cfg.num_reflection ?? "—"
                                    }}</span></div>
                            </template>
                        </div>
                        <div class="field" style="margin-top: 10px">
                            <label>启发式思想</label>
                            <p class="drawer-text">{{ sub.concept ?? "—" }}</p>
                        </div>
                        <div class="field">
                            <label>关键词组</label>
                            <div class="badge-row">
                                <span v-for="f in sub.features ?? []" :key="f" class="badge feature-badge">{{ f }}</span>
                                <span v-if="!(sub.features ?? []).length" class="hint">无</span>
                            </div>
                        </div>
                    </div>
                </div>
                <KeywordInsight v-if="kwInsight" :insight="kwInsight" :scope="kwScope" :ascend="asc" />
                <div v-if="bestInd" class="card">
                    <h2>最优算法 <span class="tail">第 {{ bestInd.generation ?? "?" }} 代 · 适应度 {{ fmtObj(bestInd.objective)
                        }}</span></h2>
                    <p class="drawer-text" style="margin-bottom: 8px">{{ bestInd.concept || "（无描述）" }}</p>
                    <CodeBlock v-if="bestInd.algorithm" :code="bestInd.algorithm" max-height="320px" />
                </div>
                <div v-if="tokBarItems.length" class="card">
                    <h2>每代 token 消耗</h2>
                    <div class="chart-box">
                        <BarChart :items="tokBarItems" />
                    </div>
                </div>
                <div class="card">
                    <h2>种群明细 <span class="tail">{{ gens.length }} 代 · 共 {{ heurCount }} 个启发式个体</span></h2>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>代数</th>
                                    <th class="num">个体数</th>
                                    <th class="num">最优</th>
                                    <th class="num">平均</th>
                                    <th class="num">最差</th>
                                    <th class="num">token</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="(s, i) in genStats" :key="i">
                                    <td class="mono">{{ gens[i].generation ?? i }}</td>
                                    <td class="num mono">{{ s.n }}</td>
                                    <td class="num mono">{{ fmtObj(s.best) }}</td>
                                    <td class="num mono hint">{{ fmtObj(s.avg) }}</td>
                                    <td class="num mono hint">{{ fmtObj(s.worst) }}</td>
                                    <td class="num mono">{{ s.tok != null ? fmtTokens(s.tok) : "—" }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <template v-for="(g, gi) in gensWithHeurs" :key="gi">
                        <div class="mine-head"><span class="mine-title">第 {{ g.generation ?? gi }} 代种群</span>
                            <span class="hint">{{ genHint(g, gi) }}</span></div>
                        <div class="pop-grid" style="margin-top: 6px">
                            <div v-for="(h, hi) in g.sorted" :key="hi" class="pop-card static">
                                <div class="pop-card-head">
                                    <span class="pop-rank">#{{ hi + 1 }}</span>
                                    <span class="pop-obj mono">{{ fmtObj(h.objective) }}</span>
                                    <span v-if="genStats[gi] && genStats[gi].best != null && Number(h.objective) === genStats[gi].best" class="badge src-local">本代最优</span>
                                </div>
                                <div class="pop-concept" style="min-height: 0">{{ h.concept || "（无描述）" }}</div>
                                <div class="pop-tags">
                                    <span v-for="f in h.features ?? []" :key="f" class="badge feature-badge">{{ f }}</span>
                                    <span v-if="!(h.features ?? []).length" class="hint">无关键词</span>
                                </div>
                                <details v-if="h.algorithm" class="alg-details">
                                    <summary>算法代码</summary>
                                    <CodeBlock :code="h.algorithm" />
                                </details>
                            </div>
                        </div>
                    </template>
                    <div v-if="customCode" class="field">
                        <label>框架源码（framework.py）</label>
                        <CodeBlock :code="customCode" />
                    </div>
                </div>
            </template>
        </template>
    </div>
</template>
