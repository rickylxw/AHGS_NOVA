<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { api } from "../lib/api";
import { store, toast, openSubmissionDrawer, openUserDrawer } from "../lib/store";
import { navToCurve } from "../lib/router";
import { FW_LABEL } from "../lib/constants";
import { fmtObj, fmtTokens, fmtTime, fullName, parseServerTime, downloadText } from "../lib/format";
import HbarList from "../charts/HbarList.vue";
import UserCell from "../components/UserCell.vue";
import FwBadge from "../components/FwBadge.vue";
import SrcBadge from "../components/SrcBadge.vue";
import Medal from "../components/Medal.vue";
import EmptyState from "../components/EmptyState.vue";

const props = defineProps({ params: { type: URLSearchParams, default: () => new URLSearchParams() } });

const FW_CHIPS = [
    { key: "ahg", label: "AHG 全部", types: ["eoh_nseh", "calm"] },
    { key: "eoh_nseh", label: "EoH(NSEH)", types: ["eoh_nseh"] },
    { key: "calm", label: "CALM", types: ["calm"] },
    { key: "custom", label: "自定义", types: ["custom"] },
];
const SRC_CHIPS = [
    { key: "api", label: "API" },
    { key: "local", label: "本地LLM" },
];

const problemKey = ref(props.params.get("problem") || store.problems[0]?.key || "");
const fw = reactive(new Set());
const src = reactive(new Set());
const sortBy = ref("score");
const q = ref("");
const barView = ref(false);
const auto = ref(false);
const entries = ref([]);
const ascend = ref(true);
const cohort = ref("current"); // current = 主榜（新版评估标准）· legacy = 旧版排行榜
const legacyAvailable = ref(false);
const loading = ref(true);
const err = ref("");
let timer = null;

async function load() {
    loading.value = true;
    err.value = "";
    const qs = new URLSearchParams();
    const types = [...fw].flatMap(k => FW_CHIPS.find(c => c.key === k).types).join(",");
    if (types) qs.set("framework_types", types);
    const srcs = [...src].join(",");
    if (srcs) qs.set("model_sources", srcs);
    if (cohort.value === "legacy") qs.set("cohort", "legacy");
    try {
        const r = await api(`/api/ranking/${problemKey.value}${qs.toString() ? "?" + qs : ""}`);
        entries.value = r.entries ?? [];
        ascend.value = r.ascend !== false;
        legacyAvailable.value = r.legacy_available === true;
    } catch (e) {
        err.value = e.message;
    }
    loading.value = false;
}

function toggleCohort() {
    cohort.value = cohort.value === "current" ? "legacy" : "current";
    load();
}

/* 与官方站一致的展示口径：
   有 ranking_score（已按新版标准评分）→ 显示 best_objective；
   否则有训练分 → 回退显示 train_objective（此时标「holdout 未过」）；
   否则显示 best_objective。ranking_legacy = 旧评估标准下的成绩。 */
function isLegacyEntry(e) {
    return e.ranking_legacy === true;
}

function isHoldoutPending(e) {
    return (
        !isLegacyEntry(e) && e.ranking_score == null && e.train_objective != null && Number.isFinite(e.train_objective)
    );
}

function displayObjective(e) {
    if (e.ranking_score != null && Number.isFinite(e.ranking_score)) return e.best_objective ?? null;
    if (e.train_objective != null && Number.isFinite(e.train_objective)) return e.train_objective;
    return e.best_objective ?? null;
}

function entryObjTitle(e) {
    if (isLegacyEntry(e)) return "旧评估标准";
    if (isHoldoutPending(e)) return "holdout 留出段评估未通过，回退显示训练分";
    return "";
}

const visible = computed(() => {
    let list = entries.value;
    const qq = q.value.trim().toLowerCase();
    if (qq)
        list = list.filter(
            e => (e.username || "").toLowerCase().includes(qq) || (e.display_name || "").toLowerCase().includes(qq)
        );
    if (sortBy.value === "time")
        list = [...list].sort(
            (a, b) =>
                (parseServerTime(b.best_submitted_at)?.getTime() ?? 0) -
                (parseServerTime(a.best_submitted_at)?.getTime() ?? 0)
        );
    else if (sortBy.value === "token") list = [...list].sort((a, b) => (b.total_tokens ?? -1) - (a.total_tokens ?? -1));
    return list;
});

const meta = computed(
    () =>
        `${visible.value.length} 人上榜 · 适应度${ascend.value ? "越小" : "越大"}越好${
            cohort.value === "legacy" ? " · 旧版评估标准" : ""
        }${fw.size || src.size ? " · 已按筛选过滤" : ""}`
);

/** 所选题目的数据集/评估器版本（官方 2026-10 起 /api/problems 携带） */
const problemMeta = computed(() => store.problems.find(p => p.key === problemKey.value) ?? null);

const barRows = computed(() =>
    visible.value.slice(0, 15).map(e => ({
        rank: e.rank,
        label: fullName(e),
        sub:
            `${e.username ?? ""} · ${FW_LABEL[e.framework_type] || "AHG"} · ${e.llm_model ?? ""}` +
            (isLegacyEntry(e) ? " · 旧评估标准" : isHoldoutPending(e) ? " · holdout 未过（训练分）" : ""),
        value: Number(displayObjective(e)),
        fmt: fmtObj(displayObjective(e)),
        submissionId: e.submission_id,
        userId: e.user_id,
    }))
);

function onBarOpen(row) {
    if (row.submissionId && isOwnSubmission(row.userId)) openSubmissionDrawer(row.submissionId);
    else if (row.userId) openUserDrawer(row.userId);
}

/** 与官方站一致：仅自己的提交（或 admin）可打开详情抽屉，他人的行打开用户卡片抽屉 */
function isOwnSubmission(userId) {
    return store.user?.role === "admin" || (store.user != null && userId != null && store.user.id === userId);
}

function onRowClick(e) {
    if (isOwnSubmission(e.user_id)) {
        if (e.submission_id) openSubmissionDrawer(e.submission_id);
        else if (e.user_id != null) openUserDrawer(e.user_id);
    } else if (e.user_id != null) openUserDrawer(e.user_id);
}

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
    const head =
        "rank,user_id,username,display_name,framework_type,llm_model,model_source,best_objective,train_objective,ranking_score,scoring_cohort,total_tokens,best_submitted_at,submission_id";
    const lines = list
        .map(e =>
            [
                e.rank,
                e.user_id,
                e.username,
                e.display_name,
                e.framework_type,
                e.llm_model,
                e.model_source,
                e.best_objective,
                e.train_objective ?? "",
                e.ranking_score ?? "",
                e.scoring_cohort ?? "",
                e.total_tokens ?? "",
                e.best_submitted_at ?? "",
                e.submission_id ?? "",
            ]
                .map(v => `"${String(v ?? "").replace(/"/g, '""')}"`)
                .join(",")
        );
    downloadText(
        `ranking_${problemKey.value}_${new Date().toISOString().slice(0, 10)}.csv`,
        [head, ...lines].join("\n")
    );
    toast(`已导出 ${list.length} 条记录`, "ok");
}

onMounted(load);
onUnmounted(() => {
    if (timer) clearInterval(timer);
});
</script>

<template>
    <div class="card">
        <h2>排行榜
            <span v-if="problemMeta?.dataset_version" class="badge feature-badge" title="该赛道当前数据集版本">📦 数据集 {{ problemMeta.dataset_version }}</span>
            <span v-if="problemMeta?.evaluator_version" class="badge src-local" title="该赛道当前评估器版本">🧮 评估器 {{ problemMeta.evaluator_version }}</span>
            <span class="tail">{{ meta }}</span>
        </h2>
        <div class="toolbar">
            <div class="field" style="min-width: 230px">
                <label>问题情景</label>
                <select v-model="problemKey" @change="load">
                    <option v-for="p in store.problems" :key="p.key" :value="p.key">{{ p.name }}</option>
                </select>
            </div>
            <div class="field">
                <label>框架筛选</label>
                <div class="chip-row">
                    <button v-for="c in FW_CHIPS" :key="c.key" class="chip" :class="{ on: fw.has(c.key) }"
                        @click="toggleFw(c.key)">{{ c.label }}</button>
                </div>
            </div>
            <div class="field">
                <label>来源筛选</label>
                <div class="chip-row">
                    <button v-for="c in SRC_CHIPS" :key="c.key" class="chip" :class="{ on: src.has(c.key) }"
                        @click="toggleSrc(c.key)">{{ c.label }}</button>
                </div>
            </div>
            <div class="field" style="min-width: 150px">
                <label>排序</label>
                <select v-model="sortBy">
                    <option value="score">按最优适应度</option>
                    <option value="time">按最近提交</option>
                    <option value="token">按 token 消耗</option>
                </select>
            </div>
            <div class="field" style="min-width: 170px">
                <label>搜索用户</label>
                <input v-model="q" placeholder="昵称 / 一卡通号" />
            </div>
            <div class="field">
                <label>&nbsp;</label>
                <div class="chip-row">
                    <button class="chip" :class="{ on: barView }" @click="barView = !barView">{{ barView ? "📋 表格" :
                        "📊 条形图" }}</button>
                    <button class="chip" :class="{ on: auto }" @click="toggleAuto">⟳ 自动刷新</button>
                    <button class="chip" @click="exportCsv">⬇ 导出 CSV</button>
                    <button v-if="cohort === 'legacy'" class="chip on" title="回到按当前评估标准计分的主榜"
                        @click="toggleCohort">↩ 返回主榜</button>
                    <button v-else-if="legacyAvailable" class="chip" title="按旧评估标准计分的排行"
                        @click="toggleCohort">🗂 查看旧版排行榜</button>
                </div>
            </div>
        </div>
        <div v-if="loading" class="loading-row"><span class="spinner"></span>加载中…</div>
        <div v-else-if="err" class="error-banner">{{ err }}</div>
        <div v-else-if="!visible.length">
            <EmptyState icon="🏁" desc="暂无参赛记录" />
        </div>
        <HbarList v-else-if="barView" :rows="barRows" @open="onBarOpen" />
        <div v-else class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th class="num">名次</th>
                        <th>用户</th>
                        <th>框架</th>
                        <th>来源</th>
                        <th>模型</th>
                        <th class="num">适应度</th>
                        <th class="num">所耗 token</th>
                        <th>最近提交</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="e in visible" :key="e.user_id ?? e.username" class="clickable-row"
                        :class="{ 'rank-top3': e.rank <= 3 }" @click="onRowClick(e)">
                        <td class="num"><Medal :rank="e.rank" /></td>
                        <td><UserCell :user="e" /></td>
                        <td><FwBadge :ft="e.framework_type" /></td>
                        <td><SrcBadge :src="e.model_source" /></td>
                        <td class="mono hint">{{ e.llm_model || "—" }}</td>
                        <td class="num mono"><span :class="{ 'legacy-score': isLegacyEntry(e) }"
                                :title="entryObjTitle(e)">{{ fmtObj(displayObjective(e)) }}</span><span
                                v-if="isHoldoutPending(e)" class="badge rk-holdout" style="margin-left: 6px">holdout
                                未过</span></td>
                        <td class="num mono">{{ fmtTokens(e.total_tokens) }}</td>
                        <td class="mono hint" :title="e.best_submitted_at || ''">{{ fmtTime(e.best_submitted_at) }}</td>
                        <td><button class="btn small" @click.stop="navToCurve(e.submission_id)">曲线</button></td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
