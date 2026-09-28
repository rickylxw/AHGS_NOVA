<script setup>
import { computed, onMounted, ref } from "vue";
import { api } from "../lib/api";
import { store, openSubmissionDrawer, openUserDrawer } from "../lib/store";
import { FW_LABEL, PALETTE } from "../lib/constants";
import { fmtObj, fmtTokens, fmtTime, fullName, parseServerTime } from "../lib/format";
import BarChart from "../charts/BarChart.vue";
import DonutChart from "../charts/DonutChart.vue";
import UserCell from "../components/UserCell.vue";
import FwBadge from "../components/FwBadge.vue";
import Avatar from "../components/Avatar.vue";
import EmptyState from "../components/EmptyState.vue";

const recent = ref([]);
const rankings = ref([]);

onMounted(async () => {
    recent.value = await api("/api/submissions/recent?limit=300")
        .then(r => r.submissions ?? [])
        .catch(() => []);
    rankings.value = await Promise.all(
        store.problems.map(p =>
            api(`/api/ranking/${p.key}`)
                .then(r => ({ p, entries: r.entries ?? [] }))
                .catch(() => ({ p, entries: [] }))
        )
    );
});

const userCount = computed(() => {
    const s = new Set();
    for (const { entries } of rankings.value)
        for (const e of entries) if (e.user_id != null) s.add(e.user_id);
    return s.size;
});
const sumTokens = computed(() =>
    rankings.value.reduce((a, { entries }) => a + entries.reduce((x, e) => x + (Number(e.total_tokens) || 0), 0), 0)
);
const trackNames = computed(() => store.problems.map(p => p.name.split(" ")[0]).join(" / "));

const activityItems = computed(() => {
    const now = Date.now();
    const buckets = [];
    for (let i = 23; i >= 0; i--) buckets.push({ t: new Date(now - i * 3600e3), value: 0 });
    for (const s of recent.value) {
        const d = parseServerTime(s.created_at);
        if (!d) continue;
        const idx = buckets.findIndex(b => d >= b.t && d < new Date(b.t.getTime() + 3600e3));
        if (idx >= 0) buckets[idx].value++;
    }
    return buckets.map(b => ({
        label: b.t.getHours() + "时",
        value: b.value,
        tip: b.t.toLocaleString("zh-CN", { hour: "2-digit" }) + ":00",
    }));
});

const srcSegments = computed(() => [
    { label: "API 模型", value: recent.value.filter(s => s.model_source === "api").length, color: "#fbbf24" },
    { label: "本地 LLM", value: recent.value.filter(s => s.model_source === "local").length, color: "#22d3ee" },
]);
const fwSegments = computed(() =>
    ["eoh_nseh", "calm", "custom"].map((ft, i) => ({
        label: FW_LABEL[ft],
        value: recent.value.filter(s => s.framework_type === ft).length,
        color: PALETTE[i],
    }))
);
</script>

<template>
    <div>
        <div class="grid cols-4">
            <div class="stat">
                <div class="k">参赛赛道</div>
                <div class="v">{{ store.problems.length }}</div>
                <div class="s">{{ trackNames }}</div>
            </div>
            <div class="stat">
                <div class="k">上榜选手</div>
                <div class="v">{{ userCount }}</div>
                <div class="s">各赛道排行榜去重用户</div>
            </div>
            <div class="stat">
                <div class="k">近期提交</div>
                <div class="v">{{ recent.length }}</div>
                <div class="s">最近提交流样本</div>
            </div>
            <div class="stat">
                <div class="k">累计 token</div>
                <div class="v">{{ fmtTokens(sumTokens) }}</div>
                <div class="s">上榜记录 token 之和</div>
            </div>
        </div>
        <div class="card">
            <h2>提交活跃度 <span class="tail">最近 24 小时 · 每小时提交数</span></h2>
            <div class="chart-box">
                <BarChart :items="activityItems" />
            </div>
        </div>
        <div class="grid cols-2">
            <div class="card">
                <h2>模型来源分布 <span class="tail">近期提交</span></h2>
                <div class="chart-box">
                    <DonutChart :segments="srcSegments" />
                </div>
            </div>
            <div class="card">
                <h2>框架分布 <span class="tail">近期提交</span></h2>
                <div class="chart-box">
                    <DonutChart :segments="fwSegments" />
                </div>
            </div>
        </div>
        <div class="card">
            <h2>各赛道前三 <span class="tail">点击头像查看用户档案</span></h2>
            <div class="grid cols-2">
                <div class="podium-item-card" v-for="r in rankings" :key="r.p.key">
                    <div class="mine-head" style="margin: 0 0 8px"><span class="mine-title">{{ r.p.name }}</span>
                        <a class="hint" :href="'#/leaderboard?problem=' + r.p.key">查看完整榜 →</a>
                    </div>
                    <div v-if="r.entries.length" class="podium">
                        <div v-for="e in r.entries.slice(0, 3)" :key="e.rank" class="podium-item" :class="'p' + e.rank">
                            <div class="user-cell" style="min-width: 0">
                                <span class="link-ish" @click="openUserDrawer(e.user_id)"><Avatar :user="e" /></span>
                                <div class="u-name"><span class="u-main" style="font-size: 13.5px">{{ fullName(e)
                                    }}</span></div>
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
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>用户</th>
                            <th>问题</th>
                            <th>框架</th>
                            <th class="num">适应度</th>
                            <th>时间</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="s in recent.slice(0, 8)" :key="s.id" class="clickable-row"
                            @click="openSubmissionDrawer(s.id)">
                            <td><UserCell :user="s" /></td>
                            <td>{{ s.problem_name || s.problem_key }}</td>
                            <td><FwBadge :ft="s.framework_type" /></td>
                            <td class="num mono">{{ fmtObj(s.objective) }}</td>
                            <td class="mono hint">{{ fmtTime(s.created_at) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</template>
