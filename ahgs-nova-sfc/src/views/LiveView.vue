<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { api } from "../lib/api";
import { store, openSubmissionDrawer } from "../lib/store";
import { fmtObj, fmtTokens, fmtTime, isAscend } from "../lib/format";
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

const problem = ref("");
const sortBy = ref("time");
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

async function load() {
    const qs = new URLSearchParams({ limit: "60" });
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

const sorted = computed(() => {
    let list = subs.value;
    if (mineOnly.value && store.user) list = list.filter(s => s.user_id === store.user.id);
    const qq = q.value.trim().toLowerCase();
    if (qq)
        list = list.filter(
            s => (s.username || "").toLowerCase().includes(qq) || (s.display_name || "").toLowerCase().includes(qq)
        );
    if (sortBy.value === "score") {
        const asc = problem.value ? isAscend(problem.value) : true;
        list = [...list].sort((a, b) =>
            asc ? Number(a.objective) - Number(b.objective) : Number(b.objective) - Number(a.objective)
        );
    } else if (sortBy.value === "token")
        list = [...list].sort((a, b) => (b.total_tokens ?? -1) - (a.total_tokens ?? -1));
    return list;
});

function toggleSet(set, k) {
    set.has(k) ? set.delete(k) : set.add(k);
    load();
}

onMounted(() => {
    load();
    timer = setInterval(() => {
        if (!paused.value) load();
    }, 4000);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
    <div class="card">
        <h2>实时提交流 <span class="tail">全赛道 · 全用户 · 每 4 秒自动刷新 ·
                <button class="chip" :class="{ on: !paused }" style="padding: 1px 10px" @click="paused = !paused">{{
                    paused ? "▶ 继续" : "⏸ 暂停" }}</button>
                <span v-if="q || mineOnly" class="badge feature-badge" style="margin-left: 6px">筛选后 {{ sorted.length
                }} 条</span></span></h2>
        <div class="toolbar">
            <div class="field" style="min-width: 230px">
                <label>问题情景</label>
                <select v-model="problem">
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
                <input v-model="q" placeholder="用户名 / 昵称" />
            </div>
            <div class="field">
                <label>&nbsp;</label>
                <div class="chip-row">
                    <button class="chip" :class="{ on: mineOnly }" :disabled="!store.user"
                        :title="store.user ? '只看我的提交' : '登录后可用'" @click="mineOnly = !mineOnly">🙋 只看我的</button>
                </div>
            </div>
            <div class="field" style="min-width: 160px">
                <label>排序</label>
                <select v-model="sortBy">
                    <option value="time">按时间（最新）</option>
                    <option value="score">按适应度</option>
                    <option value="token">按 token 消耗</option>
                </select>
            </div>
        </div>
        <div v-if="err" class="error-banner">{{ err }}</div>
        <EmptyState v-if="!subs.length" icon="🛰️" desc="暂无提交记录，去「进化」跑一局吧" />
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
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="s in sorted" :key="s.id" class="clickable-row" :class="{ 'fresh-row': freshIds.has(s.id) }"
                        @click="openSubmissionDrawer(s.id)">
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
            </table>
        </div>
    </div>
</template>
