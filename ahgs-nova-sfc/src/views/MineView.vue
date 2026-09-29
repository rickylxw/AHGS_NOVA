<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { api, getToken, getStoredUser } from "../lib/api";
import { STATUS_LABEL } from "../lib/constants";
import { store, toast, setSession, openSubmissionDrawer } from "../lib/store";
import { navToCurve } from "../lib/router";
import { fmtObj, fmtTokens, fmtTime, fullName, parseServerTime } from "../lib/format";
import Sparkline from "../charts/Sparkline.vue";
import FwBadge from "../components/FwBadge.vue";
import SrcBadge from "../components/SrcBadge.vue";
import Avatar from "../components/Avatar.vue";
import EmptyState from "../components/EmptyState.vue";

const props = defineProps({ params: { type: URLSearchParams, default: () => new URLSearchParams() } });

const TABS = ["records", "instances", "profile"];
const tab = ref(TABS.includes(props.params.get("tab")) ? props.params.get("tab") : "records");
const recordsLoading = ref(true);
const instLoading = ref(true);
const profileLoading = ref(true);
const ranks = ref([]);
const mySubs = ref([]);
const top1Map = ref(new Map()); // problem_key -> 第一名 entry
const instances = ref([]);
const runs = ref([]);
const me = ref({});
const pf = reactive({ displayName: "", email: "", phone: "" });
const pfMsg = ref("");
const pfOk = ref(false);
const pfBusy = ref(false);
const pw = reactive({ old: "", nw: "", cfm: "" });
const pwMsg = ref("");
const pwOk = ref(false);
const pwBusy = ref(false);
const avatarIn = ref(null);

const rankMap = computed(() => new Map(ranks.value.map(e => [e.problem_key, e])));
const subsByProblem = computed(() => {
    const m = {};
    for (const s of mySubs.value) {
        (m[s.problem_key] ??= []).push(s);
    }
    return m;
});
const problemKeys = computed(() => [...new Set([...rankMap.value.keys(), ...Object.keys(subsByProblem.value)])]);
const trackCards = computed(() =>
    store.problems.map(p => {
        const rank = rankMap.value.get(p.key);
        const subs = (subsByProblem.value[p.key] ?? [])
            .slice()
            .sort((a, b) => (parseServerTime(a.created_at)?.getTime() ?? 0) - (parseServerTime(b.created_at)?.getTime() ?? 0));
        const objs = subs.map(x => Number(x.objective)).filter(isFinite);
        const asc = p.ascend !== false;
        const best = objs.length ? (asc ? Math.min(...objs) : Math.max(...objs)) : null;
        const bestSub = best != null ? subs.find(x => Number(x.objective) === best) : null;
        const tokens = subs.reduce((a, x) => a + (Number(x.total_tokens) || 0), 0);
        const top1 = top1Map.value.get(p.key) ?? null;
        const top1Me = !!(top1 && store.user && top1.user_id === store.user.id);
        let top1GapText = "";
        if (top1 && best != null) {
            const t = Number(top1.best_objective);
            if (isFinite(t)) {
                const worse = asc ? (best - t) / Math.abs(t || 1) * 100 : (t - best) / Math.abs(t || 1) * 100;
                if (top1Me) top1GapText = "（就是你）";
                else if (worse > 0.005) top1GapText = "（差 " + worse.toFixed(1) + "%）";
            }
        }
        return {
            key: p.key,
            name: p.name.split(" ")[0],
            fullName: p.name,
            asc,
            rank: rank?.rank ?? null,
            best,
            bestId: bestSub?.id ?? null,
            fw: bestSub?.framework_type ?? null,
            model: bestSub?.llm_model ?? null,
            tokens,
            count: subs.length,
            lastAt: subs.at(-1)?.created_at ?? null,
            spark: objs,
            participated: subs.length > 0 || !!rank,
            top1: top1 ? { name: top1.display_name || top1.username, best: Number(top1.best_objective) } : null,
            top1Me,
            top1GapText,
        };
    })
);
const participatedCount = computed(() => trackCards.value.filter(c => c.participated).length);
const TIERS = [
    { key: "1", label: "第 1 名", test: r => r === 1 },
    { key: "2", label: "第 2 名", test: r => r === 2 },
    { key: "3", label: "第 3 名", test: r => r === 3 },
    { key: "46", label: "第 4~6 名", test: r => r >= 4 && r <= 6 },
    { key: "710", label: "第 7~10 名", test: r => r >= 7 && r <= 10 },
    { key: "1120", label: "第 11~20 名", test: r => r >= 11 && r <= 20 },
    { key: "2150", label: "第 21~50 名", test: r => r >= 21 && r <= 50 },
    { key: "50p", label: "50 名开外 / 未上榜", test: r => r == null || r > 50 },
    { key: "none", label: "未参加", test: r => r === "none" },
];
const tierGroups = computed(() =>
    TIERS.map(t => ({
        key: t.key,
        label: t.label,
        items: trackCards.value.filter(c => t.test(c.participated ? c.rank ?? null : "none")),
    })).filter(g => g.items.length)
);
const meta = computed(
    () => `${fullName(store.user)} · 共 ${mySubs.value.length} 次提交 · ${problemKeys.value.length} 个赛道`
);

function jumpTo(key) {
    if (key === "__summary__") {
        // 回到页面顶部：完整露出「我的空间」标题、页签与速览区
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
    }
    document.getElementById("sec-" + key)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
    });
}

function sortedSubs(key) {
    return (subsByProblem.value[key] ?? [])
        .slice()
        .sort((a, b) => (parseServerTime(b.created_at)?.getTime() ?? 0) - (parseServerTime(a.created_at)?.getTime() ?? 0));
}

function probName(key) {
    return (store.problems.find(p => p.key === key) || {}).name || key;
}

/** 我的提交适应度走势（时间序） */
function subSpark(key) {
    return (subsByProblem.value[key] ?? [])
        .slice()
        .sort((a, b) => (parseServerTime(a.created_at)?.getTime() ?? 0) - (parseServerTime(b.created_at)?.getTime() ?? 0))
        .map(s => Number(s.objective))
        .filter(isFinite);
}

function statusName(s) {
    return STATUS_LABEL[s] ?? s ?? "—";
}

onMounted(() => {
    if (tab.value === "instances") loadInstances();
    else if (tab.value === "profile") loadProfile();
    else loadRecords();
});
watch(tab, t => {
    try {
        window.history.replaceState(null, "", "#/mine?tab=" + t);
    } catch { /* ignore */ }
    if (t === "instances") loadInstances();
    else if (t === "profile") loadProfile();
});
watch(
    () => props.params.get("tab"),
    t => {
        if (t && TABS.includes(t) && t !== tab.value) tab.value = t;
    }
);

async function loadRecords() {
    recordsLoading.value = true;
    const [r1, r2] = await Promise.all([
        api("/api/ranking/me").then(r => r.entries ?? []).catch(() => []),
        api("/api/submissions/my").then(r => r.submissions ?? []).catch(() => []),
    ]);
    ranks.value = r1;
    mySubs.value = r2;
    // 各赛道第一名（用于速览行展示榜首成绩与差距）
    const rankings = await Promise.all(
        store.problems.map(p => api("/api/ranking/" + p.key).then(r => r.entries ?? []).catch(() => []))
    );
    const m = new Map();
    store.problems.forEach((p, i) => {
        const top = (rankings[i] ?? []).find(e => e.rank === 1);
        if (top) m.set(p.key, top);
    });
    top1Map.value = m;
    recordsLoading.value = false;
}

async function loadInstances() {
    instLoading.value = true;
    const [i, r] = await Promise.all([
        api("/api/instances").then(r => r.instances ?? []).catch(() => []),
        api("/api/evolution/my").then(r => r.runs ?? []).catch(() => []),
    ]);
    instances.value = i;
    runs.value = r;
    instLoading.value = false;
}

async function loadProfile() {
    profileLoading.value = true;
    try {
        me.value = await api("/api/auth/me");
        setSession(null, me.value);
        pf.displayName = me.value.display_name ?? "";
        pf.email = me.value.email ?? "";
        pf.phone = me.value.phone ?? "";
    } catch {
        me.value = getStoredUser() ?? {};
    }
    profileLoading.value = false;
}

function uploadAvatar(ev) {
    const f = ev.target.files?.[0];
    ev.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
        toast("请选择图片文件", "err");
        return;
    }
    const rd = new FileReader();
    rd.onload = async () => {
        try {
            const u = await api("/api/auth/me", { method: "PATCH", body: { avatar: rd.result } });
            setSession(null, u);
            toast("头像已更新", "ok");
            loadProfile();
        } catch (e) {
            toast("头像更新失败：" + e.message, "err");
        }
    };
    rd.readAsDataURL(f);
}

async function saveProfile() {
    pfMsg.value = "";
    pfBusy.value = true;
    try {
        const u = await api("/api/auth/me", {
            method: "PATCH",
            body: {
                display_name: pf.displayName.trim(),
                email: pf.email.trim(),
                phone: pf.phone.trim(),
            },
        });
        setSession(null, u);
        pfOk.value = true;
        pfMsg.value = "已保存";
        toast("资料已保存", "ok");
    } catch (e) {
        pfOk.value = false;
        pfMsg.value = e.message;
    } finally {
        pfBusy.value = false;
    }
}

async function savePassword() {
    pwMsg.value = "";
    if (!pw.old || !pw.nw || !pw.cfm) {
        pwMsg.value = "请填写完整的密码信息";
        return;
    }
    if (pw.nw !== pw.cfm) {
        pwMsg.value = "两次输入的新密码不一致";
        return;
    }
    pwBusy.value = true;
    try {
        await api("/api/auth/me/password", {
            method: "POST",
            body: {
                old_password: pw.old,
                new_password: pw.nw,
                confirm_password: pw.cfm,
            },
        });
        pwOk.value = true;
        pwMsg.value = "密码修改成功";
        pw.old = pw.nw = pw.cfm = "";
        toast("密码已修改", "ok");
    } catch (e) {
        pwOk.value = false;
        pwMsg.value = e.message;
    } finally {
        pwBusy.value = false;
    }
}
</script>

<template>
    <div v-if="!getToken() || !store.user" class="card">
        <EmptyState icon="🔐" desc="登录后可查看自己在各赛道的名次与全部提交记录" />
        <div style="text-align: center"><button class="btn primary" @click="store.loginModal = true">登录 / 注册</button>
        </div>
    </div>
    <div v-else class="card">
        <h2>我的空间 <span class="tail">{{ meta }}</span></h2>
        <div class="chip-row" style="margin-bottom: 14px">
            <button class="chip" :class="{ on: tab === 'records' }" @click="tab = 'records'">名次与提交</button>
            <button class="chip" :class="{ on: tab === 'instances' }" @click="tab = 'instances'">实例与进化记录</button>
            <button class="chip" :class="{ on: tab === 'profile' }" @click="tab = 'profile'">个人资料</button>
        </div>

        <!-- 名次与提交 -->
        <div v-if="tab === 'records'">
            <div v-if="recordsLoading" class="loading-row"><span class="spinner"></span>加载中…</div>
            <template v-else>
                <div id="sec-summary" class="records-block">
                    <div class="mine-head"><span class="mine-title">📊 各赛道速览</span>
                        <span class="hint">共 {{ trackCards.length }} 个赛道 · {{ participatedCount }} 个已参与 ·
                            按名次分组，点击行跳到下方详情</span>
                    </div>
                    <details v-for="g in tierGroups" :key="g.key" class="tier"
                        :class="{ 'tier-dim': g.key === 'none' }">
                    <summary>
                        <span class="tier-name">{{ g.label }}</span>
                        <span class="tier-count">{{ g.items.length }} 个赛道</span>
                        <span class="tier-preview">{{ g.items.map(i => i.name).join("、") }}</span>
                    </summary>
                    <div class="tier-body">
                        <div v-for="c in g.items" :key="c.key" class="tier-row" :title="c.fullName" @click="jumpTo(c.key)">
                            <span class="tier-track">{{ c.name }}</span>
                            <span class="tier-rank mono">{{ c.rank ? "第" + c.rank + "名" : "—" }}</span>
                            <span class="tier-best mono">{{ c.best != null ? fmtObj(c.best) : "—" }}</span>
                            <span class="tier-top1" :class="{ me: c.top1Me }"
                                :title="c.top1 ? '第一名：' + c.top1.name : '暂无第一名'">
                                <template v-if="c.top1">🥇 {{ c.top1.name }} · {{ fmtObj(c.top1.best) }}{{ c.top1GapText }}</template>
                                <template v-else>—</template>
                            </span>
                            <span v-if="c.fw" class="tier-fw"><FwBadge :ft="c.fw" /></span>
                            <span class="tier-model mono" :title="c.model ?? ''">{{ c.model || "—" }}</span>
                            <span class="tier-tok mono" title="累计 token">{{ c.tokens ? "Σ" + fmtTokens(c.tokens) : "—"
                            }}</span>
                            <span class="tier-meta">{{ c.count }} 次<template v-if="c.lastAt"> · {{ fmtTime(c.lastAt)
                            }}</template></span>
                            <span v-if="c.spark.length > 1" class="tier-spark"><Sparkline :values="c.spark" /></span>
                            <button class="btn small"
                                @click.stop="navToCurve(c.bestId)" :disabled="!c.bestId">分析</button>
                        </div>
                    </div>
                </details>
                </div>

                <div class="records-block">
                    <div class="mine-head"><span class="mine-title">📋 详细提交记录</span>
                        <span class="hint">每个赛道一张表 · 点击行查看提交详情</span>
                    </div>
                    <div v-if="!problemKeys.length" class="hint" style="padding: 6px 0">暂无提交记录</div>
                </div>
                <div v-for="key in problemKeys" :key="key" :id="'sec-' + key" class="track-section">
                    <div class="mine-head">
                        <span class="mine-title">{{ rankMap.get(key)?.problem_name || probName(key) }}</span>
                        <span v-if="rankMap.get(key)" class="mine-rank">
                            <template v-if="rankMap.get(key).rank <= 3">{{ ["🥇", "🥈", "🥉"][rankMap.get(key).rank - 1]
                            }}</template>
                            第 <b class="mono">{{ rankMap.get(key).rank }}</b> 名 · 最优 <b class="mono">{{
                                fmtObj(rankMap.get(key).best_objective) }}</b>
                        </span>
                        <span v-else class="hint">暂无名次</span>
                        <span v-if="(subsByProblem[key] || []).length > 1" title="我的提交适应度走势（时间序）">
                            <span><Sparkline :values="subSpark(key)" /></span></span>
                        <button class="btn small" style="margin-left: auto" title="回到各赛道速览"
                            @click="jumpTo('__summary__')">↑ 速览</button>
                    </div>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>框架</th>
                                    <th>模型</th>
                                    <th class="num">适应度</th>
                                    <th class="num">token</th>
                                    <th>提交时间</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="s in sortedSubs(key)" :key="s.id" class="clickable-row"
                                    @click="openSubmissionDrawer(s.id)">
                                    <td class="mono">{{ s.id }}</td>
                                    <td><FwBadge :ft="s.framework_type" /></td>
                                    <td><SrcBadge :src="s.model_source" /> <span class="mono hint">{{ s.llm_model || ""
                                        }}</span></td>
                                    <td class="num mono">{{ fmtObj(s.objective) }}</td>
                                    <td class="num mono">{{ fmtTokens(s.total_tokens) }}</td>
                                    <td class="mono hint">{{ fmtTime(s.created_at) }}</td>
                                    <td><button class="btn small" @click.stop="navToCurve(s.id)">曲线</button></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                <EmptyState v-if="!problemKeys.length" icon="🗂️" desc="你还没有参赛记录，去「进化」发起一次吧" />
            </template>
        </div>

        <!-- 实例与进化记录 -->
        <div v-else-if="tab === 'instances'">
            <div class="loading-row" v-if="instLoading"><span class="spinner"></span>加载中…</div>
            <template v-else>
                <div class="mine-head"><span class="mine-title">实例保存</span><span class="hint">点击「载入」把实例配置带到进化页</span>
                </div>
                <div v-if="!instances.length" class="hint">暂无保存的实例，可在进化页发起后保存。</div>
                <div v-else class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>名称</th>
                                <th>框架类型</th>
                                <th>模型</th>
                                <th>问题</th>
                                <th>更新时间</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="i in instances" :key="i.id">
                                <td><b>{{ i.name }}</b></td>
                                <td><FwBadge :ft="i.framework_type" /></td>
                                <td class="mono hint">{{ i.config?.llm_model ?? "—" }}</td>
                                <td class="mono">{{ i.problem_key ?? "—" }}</td>
                                <td class="mono hint">{{ i.updated_at ? fmtTime(i.updated_at) : "—" }}</td>
                                <td><a class="btn small" href="#/evo">载入 →</a></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div class="mine-head"><span class="mine-title">AHG 进化记录</span></div>
                <div v-if="!runs.length" class="hint">暂无进化记录。</div>
                <div v-else class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th class="num">ID</th>
                                <th>问题</th>
                                <th>状态</th>
                                <th class="num">最优适应度</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="r in runs" :key="r.run_id">
                                <td class="num mono">{{ r.run_id }}</td>
                                <td class="mono">{{ r.problem_key ?? "—" }}</td>
                                <td><span class="badge" :class="'evo-st-' + r.status">{{ statusName(r.status) }}</span></td>
                                <td class="num mono">{{ fmtObj(r.best_objective) }}</td>
                                <td><a class="btn small" :href="'#/curve?run=' + r.run_id">监控 →</a></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </template>
        </div>

        <!-- 个人资料 -->
        <div v-else>
            <div class="loading-row" v-if="profileLoading"><span class="spinner"></span>加载中…</div>
            <div v-else class="grid cols-2">
                <div>
                    <div class="mine-head"><span class="mine-title">基本信息</span></div>
                    <div class="user-cell" style="margin-bottom: 12px">
                        <span class="link-ish" title="点击更换头像" @click="avatarIn.click()"><Avatar :user="me" /></span>
                        <div class="u-name"><span class="u-main">{{ me.display_name || me.username }}</span><span
                                class="u-sub mono">{{ me.username }}</span></div>
                        <span class="badge" :class="me.role === 'admin' ? 'src-api' : 'feature-badge'">{{ me.role ===
                            'admin' ? 'ADMIN' : 'USER' }}</span>
                    </div>
                    <input type="file" ref="avatarIn" accept="image/*" style="display: none" @change="uploadAvatar" />
                    <div class="grid cols-2">
                        <div class="field">
                            <label>用户 ID</label>
                            <div class="mono" style="padding: 6px 0">{{ me.id }}</div>
                        </div>
                        <div class="field">
                            <label>一卡通号</label>
                            <div class="mono" style="padding: 6px 0">{{ me.username }}</div>
                        </div>
                    </div>
                    <div class="field">
                        <label>昵称 display_name</label>
                        <input v-model="pf.displayName" />
                    </div>
                    <div class="grid cols-2">
                        <div class="field">
                            <label>邮箱 email</label>
                            <input v-model="pf.email" />
                        </div>
                        <div class="field">
                            <label>电话 phone</label>
                            <input v-model="pf.phone" />
                        </div>
                    </div>
                    <div class="error-banner" v-if="pfMsg" :class="{ ok: pfOk }">{{ pfMsg }}</div>
                    <button class="btn primary" :disabled="pfBusy" @click="saveProfile">保存资料</button>
                </div>
                <div>
                    <div class="mine-head"><span class="mine-title">修改密码</span></div>
                    <div class="field">
                        <label>原密码</label>
                        <input type="password" v-model="pw.old" autocomplete="current-password" />
                    </div>
                    <div class="field">
                        <label>新密码</label>
                        <input type="password" v-model="pw.nw" autocomplete="new-password" />
                    </div>
                    <div class="field">
                        <label>确认新密码</label>
                        <input type="password" v-model="pw.cfm" autocomplete="new-password" />
                    </div>
                    <div class="error-banner" v-if="pwMsg" :class="{ ok: pwOk }">{{ pwMsg }}</div>
                    <button class="btn primary" :disabled="pwBusy" @click="savePassword">修改密码</button>
                </div>
            </div>
        </div>
    </div>
</template>
