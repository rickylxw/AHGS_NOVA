<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { fetchRecentSubmissions } from "../lib/api";
import { store, openSubmissionDrawer, openUserDrawer } from "../lib/store";
import { fmtObj, fmtTokens, fmtTime } from "../lib/format";
import UserCell from "../components/UserCell.vue";
import FwBadge from "../components/FwBadge.vue";
import SrcBadge from "../components/SrcBadge.vue";
import EmptyState from "../components/EmptyState.vue";

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

/* 官方 2026-11 起提交流改为全量分页契约：page/pageSize/sort/snapshot → {submissions,total,snapshot}。
 * snapshot 为服务端一致性快照：筛选变化时置 null 重新取快照，翻页与轮询时原样回传。 */
const PAGE_SIZE = 20;
const tab = ref("current"); // current = 实时流（4 秒轮询）· archived = 已归档/撤回流（需登录，不轮询）
const page = ref(1);
const total = ref(0);
const snapshot = ref(null);

const problem = ref("");
const sortBy = ref("time"); // time/score 服务端排序；token 为当前页客户端排序
const paused = ref(false);
const q = ref("");
const mineOnly = ref(false);
const fw = reactive(new Set());
const src = reactive(new Set());
const subs = ref([]);
const err = ref("");
const freshIds = reactive(new Set());
const seen = new Set();
let timer = null;

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));

async function load() {
    try {
        const r = await fetchRecentSubmissions({
            page: page.value,
            pageSize: PAGE_SIZE,
            sort: sortBy.value === "token" ? "time" : sortBy.value,
            snapshot: snapshot.value,
            problemKey: problem.value,
            frameworkTypes: [...fw].flatMap(k => FW_CHIPS.find(c => c.key === k).types).join(","),
            modelSources: [...src].join(","),
            archived: tab.value === "archived",
        });
        if (Number.isInteger(r.total)) total.value = r.total;
        if (Number.isInteger(r.snapshot)) snapshot.value = r.snapshot;
        const list = r.submissions ?? [];
        if (tab.value === "current") {
            const fresh = new Set(list.map(s => s.id).filter(id => !seen.has(id)));
            fresh.forEach(id => freshIds.add(id));
            if (fresh.size) setTimeout(() => fresh.forEach(id => freshIds.delete(id)), 2500);
            list.forEach(s => seen.add(s.id));
        }
        subs.value = list;
        err.value = "";
    } catch (e) {
        // 失败时清空列表，避免上一流的数据被误戴上当前流的状态标签
        subs.value = [];
        err.value = e.message;
    }
}

/** 筛选/问题/流变化：重置分页并重新取快照（与官方一致） */
function refilter() {
    page.value = 1;
    snapshot.value = null;
    load();
}

function setPage(p) {
    page.value = Math.min(Math.max(1, p), pageCount.value);
    load();
}

function setTab(t) {
    if (tab.value === t) return;
    tab.value = t;
    refilter();
}

const sorted = computed(() => {
    let list = subs.value;
    if (mineOnly.value && store.user) list = list.filter(s => s.user_id === store.user.id);
    const qq = q.value.trim().toLowerCase();
    if (qq)
        list = list.filter(s => (s.display_name || "").toLowerCase().includes(qq));
    if (sortBy.value === "token")
        list = [...list].sort((a, b) => (b.total_tokens ?? -1) - (a.total_tokens ?? -1));
    return list;
});

function toggleSet(set, k) {
    set.has(k) ? set.delete(k) : set.add(k);
    refilter();
}

/** 「只看我的」与按用户过滤互斥：开启时清空并禁用用户输入框 */
function toggleMine() {
    mineOnly.value = !mineOnly.value;
    if (mineOnly.value) q.value = "";
}

/** 已归档/撤回记录的状态标签（官方 2026-11：review_flag 违规撤榜 / archived 归档） */
function archTag(s) {
    const flag = (s.review_flag ?? "").trim();
    if (flag === "violation" || flag === "suspected_injection")
        return { label: "违规，已撤回", cls: "src-api", title: (s.review_reason ?? "").trim() || "违规记录已从排行榜撤回" };
    if ((s.ranking_legacy ?? s.scoring_cohort) === "legacy" || s.scoring_cohort === "legacy")
        return { label: "旧版归档", cls: "feature-badge", title: "旧评估标准下的归档记录" };
    return { label: "已归档", cls: "feature-badge", title: "该记录已归档或撤回，成绩保留但不参与排名" };
}

/** 与官方站一致：仅自己的提交（或 admin）可打开详情抽屉，他人的行打开用户卡片抽屉 */
function isOwnSubmission(userId) {
    return store.user?.role === "admin" || (store.user != null && userId != null && store.user.id === userId);
}

function onRowClick(s) {
    if (isOwnSubmission(s.user_id)) openSubmissionDrawer(s.id);
    else if (s.user_id != null) openUserDrawer(s.user_id);
}

onMounted(() => {
    load();
    timer = setInterval(() => {
        if (!paused.value && tab.value === "current") load();
    }, 4000);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
    <div class="card">
        <h2>实时提交流 <span class="tail">全赛道 · 全用户 ·
                <template v-if="tab === 'current'">每 4 秒自动刷新 · </template>
                <button class="chip" :class="{ on: !paused }" style="padding: 1px 10px"
                    :disabled="tab === 'archived'" :title="tab === 'archived' ? '归档流不轮询' : ''"
                    @click="paused = !paused">{{ paused ? "▶ 继续" : "⏸ 暂停" }}</button>
                <span v-if="q || mineOnly" class="badge feature-badge" style="margin-left: 6px">筛选后 {{ sorted.length
                }} 条</span></span></h2>
        <div class="toolbar">
            <div class="field" style="min-width: 170px">
                <label>提交流</label>
                <div class="chip-row">
                    <button class="chip" :class="{ on: tab === 'current' }" @click="setTab('current')">📡 当前提交</button>
                    <button class="chip" :class="{ on: tab === 'archived' }"
                        :disabled="store.user?.role !== 'admin'"
                        :title="store.user?.role === 'admin' ? '已归档 / 撤回的提交记录' : '查看已归档记录需要管理员权限'"
                        @click="setTab('archived')">🗄 已归档</button>
                </div>
            </div>
            <div class="field" style="min-width: 230px">
                <label>问题情景</label>
                <select v-model="problem" @change="refilter">
                    <option value="">全部问题</option>
                    <option v-for="p in store.problems" :key="p.key" :value="p.key">{{ p.name }}</option>
                </select>
            </div>
            <div class="field">
                <label>框架筛选</label>
                <div class="chip-row">
                    <button v-for="c in FW_CHIPS" :key="c.key" class="chip" :class="{ on: fw.has(c.key) }"
                        @click="toggleSet(fw, c.key)">{{ c.label }}</button>
                </div>
            </div>
            <div class="field">
                <label>来源筛选</label>
                <div class="chip-row">
                    <button v-for="c in SRC_CHIPS" :key="c.key" class="chip" :class="{ on: src.has(c.key) }"
                        @click="toggleSet(src, c.key)">{{ c.label }}</button>
                </div>
            </div>
            <div class="field" style="min-width: 150px">
                <label>按用户过滤</label>
                <input v-model="q" :disabled="mineOnly" :placeholder="mineOnly ? '「只看我的」已开启' : '昵称'" />
            </div>
            <div class="field">
                <label>&nbsp;</label>
                <div class="chip-row">
                    <button class="chip" :class="{ on: mineOnly }" :disabled="!store.user"
                        :title="store.user ? '只看我的提交' : '登录后可用'" @click="toggleMine">🙋 只看我的</button>
                </div>
            </div>
            <div class="field" style="min-width: 160px">
                <label>排序</label>
                <select v-model="sortBy" @change="load">
                    <option value="time">按时间（最新）</option>
                    <option value="score">按得分（服务端）</option>
                    <option value="token">按 token 消耗（当前页）</option>
                </select>
            </div>
        </div>
        <div v-if="err" class="error-banner">{{ err }}</div>
        <div v-if="total" class="chip-row" style="margin: 8px 0">
            <button class="chip" :disabled="page <= 1" @click="setPage(page - 1)">← 上一页</button>
            <span class="hint">第 <b class="mono">{{ page }}</b> / {{ pageCount }} 页 · 共 {{ total }} 条</span>
            <button class="chip" :disabled="page >= pageCount" @click="setPage(page + 1)">下一页 →</button>
        </div>
        <EmptyState v-if="!subs.length" icon="🛰️"
            :desc="tab === 'archived' ? '暂无已归档的提交记录' : '暂无提交记录，去「进化」跑一局吧'" />
        <EmptyState v-else-if="!sorted.length" icon="🔍" desc="没有匹配当前筛选的提交" />
        <div v-else class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>用户</th>
                        <th>问题</th>
                        <th>框架</th>
                        <th>来源</th>
                        <th>模型</th>
                        <th class="num">适应度</th>
                        <th class="num">所耗 token</th>
                        <th>提交时间</th>
                        <th v-if="tab === 'archived'">状态</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="s in sorted" :key="s.id" class="clickable-row" :class="{ 'fresh-row': freshIds.has(s.id) }"
                        @click="onRowClick(s)">
                        <td><UserCell :user="s" /></td>
                        <td>{{ s.problem_name || s.problem_key }}</td>
                        <td><FwBadge :ft="s.framework_type" /></td>
                        <td><SrcBadge :src="s.model_source" /></td>
                        <td class="mono hint">{{ s.llm_model || "—" }}</td>
                        <td class="num mono">{{ fmtObj(s.objective) }}</td>
                        <td class="num mono">{{ fmtTokens(s.total_tokens) }}</td>
                        <td class="mono hint" :title="s.created_at || ''">{{ fmtTime(s.created_at) }}</td>
                        <td v-if="tab === 'archived'"><span class="badge" :class="archTag(s).cls"
                                :title="archTag(s).title">{{ archTag(s).label }}</span></td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>
