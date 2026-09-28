<script setup>
import { computed, onMounted, ref } from "vue";
import { api } from "../../lib/api";
import { store, openSubmissionDrawer, closeDrawer } from "../../lib/store";
import { fmtObj, fmtTokens, fmtTime, parseServerTime } from "../../lib/format";
import Avatar from "../Avatar.vue";
import SrcBadge from "../SrcBadge.vue";

const props = defineProps({ uid: { type: [String, Number], required: true } });

const u = ref(null);
const subs = ref([]);
const err = ref("");

const byProblem = computed(() => {
    const m = new Map();
    for (const s of subs.value) {
        if (!m.has(s.problem_key)) m.set(s.problem_key, []);
        m.get(s.problem_key).push(s);
    }
    return m;
});

const sortedByProblem = computed(() => {
    const out = [];
    for (const [key, list] of byProblem.value) {
        out.push([
            key,
            [...list].sort((a, b) =>
                (parseServerTime(b.created_at)?.getTime() ?? 0) - (parseServerTime(a.created_at)?.getTime() ?? 0)),
        ]);
    }
    return out;
});

onMounted(async () => {
    try {
        const [user, list] = await Promise.all([
            api(`/api/users/${props.uid}`),
            api(`/api/users/${props.uid}/submissions`).then(r => r.submissions ?? []).catch(() => []),
        ]);
        u.value = user;
        subs.value = list;
    } catch (e) {
        err.value = e.message;
    }
});
</script>

<template>
    <div>
        <div class="drawer-head">
            <h3>用户档案</h3>
            <button class="drawer-close" @click="closeDrawer()">×</button>
        </div>
        <div v-if="!u && !err" class="loading-row"><span class="spinner"></span>加载中…</div>
        <div v-else-if="err" class="error-banner">加载失败：{{ err }}</div>
        <template v-else>
            <div class="user-cell" style="margin-bottom: 12px">
                <span><Avatar :user="u" /></span>
                <div class="u-name">
                    <span class="u-main">{{ u.display_name || u.username }}</span>
                    <span class="u-sub mono">{{ u.username }}</span>
                </div>
            </div>
            <div class="grid-2">
                <div class="kv"><span class="k">用户 ID</span><span class="mono">{{ u.id }}</span></div>
                <div class="kv"><span class="k">角色</span><span class="badge"
                        :class="u.role === 'admin' ? 'src-api' : 'feature-badge'">{{ u.role === 'admin' ? 'ADMIN' : 'USER'
                        }}</span></div>
                <div class="kv"><span class="k">提交总数</span><span class="mono">{{ subs.length }}</span></div>
                <div class="kv"><span class="k">参与赛道</span><span class="mono">{{ byProblem.size }}</span></div>
            </div>
            <template v-for="[key, list] in sortedByProblem" :key="key">
                <div class="mine-head"><span class="mine-title">{{ (store.problems.find(p => p.key === key) ||
                    {}).name || key }}</span></div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th class="num">适应度</th>
                                <th>模型</th>
                                <th class="num">token</th>
                                <th>时间</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="s in list" :key="s.id" class="clickable-row" @click="openSubmissionDrawer(s.id)">
                                <td class="mono">{{ s.id }}</td>
                                <td class="mono">{{ fmtObj(s.objective) }}</td>
                                <td><SrcBadge :src="s.model_source" /> <span class="mono hint">{{ s.llm_model || ""
                                    }}</span></td>
                                <td class="mono">{{ fmtTokens(s.total_tokens) }}</td>
                                <td class="mono hint">{{ fmtTime(s.created_at) }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </template>
            <div v-if="!byProblem.size" class="empty">
                <div class="ico">🗂️</div>
                该用户暂无公开提交
            </div>
        </template>
    </div>
</template>
