<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { api, getToken, getStoredUser } from "../lib/api";
import { FW_LABEL, STATUS_LABEL } from "../lib/constants";
import { store, toast, setSession, openSubmissionDrawer } from "../lib/store";
import { navToCurve } from "../lib/router";
import { downloadBlob, fmtObj, fmtTokens, fmtTime, fullName, parseServerTime, isAscend, fullNum } from "../lib/format";
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
const runTop1Map = ref(new Map());  // run 涉及问题 -> 第一名 entry
const runMyBestMap = ref(new Map()); // run 涉及问题 -> 我的名次 entry
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
        // 平台重评后的成绩体系：ranking_score 是当前排名用分；ranking_legacy=true 表示沿用旧成绩
        const rankScore = rank ? (rank.ranking_score ?? rank.best_objective) : null;
        const trainObj = rank ? (rank.train_objective ?? null) : null;
        // 有效性 = 有排名分（ranking_score）；为 null 即新评估未通过（holdout 未过）→ 记为未参与
        const legacy = rank ? rank.ranking_legacy === true : false;
        const score = rank ? (rank.ranking_score ?? null) : null;
        const hasValidRank = !!rank && score != null && isFinite(Number(score));
        let top1GapText = "";
        if (top1 && hasValidRank && rankScore != null && isFinite(Number(rankScore))) {
            const t = Number(top1.ranking_score ?? top1.best_objective);
            if (isFinite(t)) {
                const worse = asc ? (Number(rankScore) - t) / Math.abs(t || 1) * 100 : (t - Number(rankScore)) / Math.abs(t || 1) * 100;
                if (top1Me) top1GapText = "（就是你）";
                else if (worse > 0.005) top1GapText = "（差 " + worse.toFixed(1) + "%）";
            }
        }
        return {
            key: p.key,
            name: p.name.split(" ")[0],
            fullName: p.name,
            asc,
            rank: hasValidRank ? rank.rank : null,
            best: hasValidRank ? score : null,
            failed: !!rank && score == null,
            legacy,
            trainObj,
            bestId: bestSub?.id ?? null,
            fw: bestSub?.framework_type ?? null,
            model: bestSub?.llm_model ?? null,
            tokens,
            count: subs.length,
            lastAt: subs.at(-1)?.created_at ?? null,
            spark: objs,
            participated: hasValidRank,
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

/* ---------- 成绩海报导出（Canvas 手绘，无第三方依赖；配色跟随当前明暗主题） ---------- */
const imgBusy = ref(false);

function hexToRgba(hex, a) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
}

/* 24 单位线性小图标（与顶栏/名次卡列头同款风格），Path2D 直接复用 SVG 路径 */
const COL_ICONS = {
    rank: ["M15.477 12.89 17 22l-5-3-5 3 1.523-9.11", "M12 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z"],
    track: ["M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z", "M4 22v-7"],
    gap: ["M22 7l-8.5 8.5-5-5L2 17", "M16 7h6v6"],
    tok: ["M3 5v14a9 3 0 0 0 18 0V5", "M3 5a9 3 0 0 0 18 0", "M3 12a9 3 0 0 0 18 0"],
    send: ["M22 2 15 22l-4-9-9-4Z", "M22 2 11 13"],
    clock: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z", "M12 6v6l4 2"],
    target: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z", "M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z", "M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"],
};

function drawIcon(ctx, key, x, y, size, color) {
    const paths = COL_ICONS[key];
    if (!paths) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 24, size / 24);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const d of paths) ctx.stroke(new Path2D(d));
    ctx.restore();
}

/** 按像素宽截断文本（超出补「…」），需先设置好 ctx.font */
function fitText(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
    return t + "…";
}

async function exportScoreCard() {
    if (imgBusy.value) return;
    imgBusy.value = true;
    try {
        const cards = [...trackCards.value].sort((a, b) => {
            if (a.participated !== b.participated) return a.participated ? -1 : 1;
            return (a.rank ?? 999) - (b.rank ?? 999);
        });
        const now = new Date();

        // 主题配色：直接读取页面 CSS 变量，导出图与当前明暗主题一致
        const cs = getComputedStyle(document.documentElement);
        const v = n => cs.getPropertyValue(n).trim();
        const P = {
            text: v("--text") || "#e8eeff",
            dim: v("--text-dim") || "#93a1c4",
            faint: v("--text-faint") || "#5e6c92",
            accent: v("--accent") || "#22d3ee",
            good: v("--good") || "#34d399",
            bad: v("--bad") || "#fb7185",
            gold: v("--gold") || "#fbbf24",
            silver: v("--silver") || "#c7d5f0",
            bronze: v("--bronze") || "#e8a06c",
            border: v("--border-strong") || "rgba(148,178,255,.30)",
            card: v("--card") || "#0e1730",
            bgTop: v("--bg") || "#070b17",
            bgBottom: v("--bg-soft") || v("--bg") || "#101a36",
        };
        const dark = (document.documentElement.getAttribute("data-theme") || store.theme || "dark") !== "light";
        const glowColor = dark ? "rgba(34,211,238,.16)" : "rgba(8,145,178,.10)";
        // 名次徽章底色（与名次卡 rank-pill 同款）
        const pillBg = {
            1: "rgba(251,191,36,.16)", 2: "rgba(199,213,240,.14)", 3: "rgba(232,160,108,.14)",
            def: dark ? "rgba(34,211,238,.09)" : "rgba(8,145,178,.08)",
        };
        // 框架徽章配色（与 FwBadge 同款；浅色主题下换深色文字保证对比度）
        const fwTheme = dark
            ? { custom: ["#6ee7b7", "rgba(52,211,153,.14)"], ahg: ["#c4b5fd", "rgba(167,139,250,.14)"] }
            : { custom: ["#059669", "rgba(5,150,105,.12)"], ahg: ["#7c3aed", "rgba(124,58,237,.10)"] };

        const sans = '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif';
        const mono = '"JetBrains Mono",Consolas,monospace';
        // 弹窗同款字号
        const F = {
            title: `700 19px ${sans}`, user: `600 13.5px ${sans}`,
            meta: `500 12.5px ${sans}`, clock: `500 12.5px ${mono}`,
            head: `600 11.5px ${sans}`,
            name: `600 16px ${sans}`, sub: `500 12.5px ${sans}`, model: `400 12.5px ${mono}`,
            pill: `700 13px ${sans}`, gap: `500 13.5px ${sans}`, num: `500 13.5px ${mono}`,
            last: `400 13.5px ${mono}`, score: `600 15px ${mono}`, badge: `600 10.5px ${sans}`,
            foot: `400 12px ${sans}`,
        };

        // 行数据与列宽都按内容测量（与名次卡弹窗一致的自适应宽度）
        const rows = cards.map(c => {
            const legacy = c.ranking_legacy === true;
            const scoreTxt = c.failed || c.best == null ? "—" : fmtObj(c.best);
            return {
                c,
                dim: !c.participated,
                legacy,
                rankText: c.failed ? "🚫 未过" : (c.participated && c.rank != null ? `第 ${c.rank} 名` : "未参加"),
                name: c.name,
                fw: c.fw ? (FW_LABEL[c.fw] || "AHG") : "",
                model: c.model || "",
                gap: c.top1Me ? "已是榜首" : (c.top1GapText || "").replace(/[（）]/g, ""),
                tok: c.tokens ? fmtTokens(c.tokens) : "—",
                cnt: c.count ? String(c.count) : "—",
                last: c.lastAt ? fmtTime(c.lastAt) : "—",
                score: scoreTxt,
            };
        });

        const mc = document.createElement("canvas").getContext("2d");
        const mw = (text, font) => { mc.font = font; return mc.measureText(text).width; };
        const CONT_GAP = 14;
        const pillW = Math.max(...rows.map(r => mw(r.rankText, F.pill)), mw("第 99 名", F.pill)) + 26;
        const nameNat = Math.max(220, ...rows.map(r =>
            mw(r.name, F.name) + (r.fw ? 12 + mw(r.fw, F.sub) + 18 : 0) + (r.model ? 10 + mw(r.model, F.model) : 0)));
        const gapW = Math.max(...rows.map(r => mw(r.gap || "—", F.gap)), 70) + 8;
        const tokW = Math.max(...rows.map(r => mw(r.tok, F.num)), 56) + 8;
        const cntW = Math.max(...rows.map(r => mw(r.cnt, F.num)), 30) + 8;
        const lastW = Math.max(...rows.map(r => mw(r.last, F.last)), 90) + 14;
        const scoreW = Math.max(...rows.map(r =>
            mw(r.score, F.score) + (r.legacy ? 6 + mw("旧评估", F.badge) + 14 : 0)), 60) + 8;
        const CARD_PAD_X = 20;
        const contentW = 88 + nameNat + gapW + tokW + cntW + lastW + scoreW + CONT_GAP * 6;
        const cardW = Math.round(Math.min(1720, Math.max(760, contentW + CARD_PAD_X * 2)));
        const nameW = cardW - CARD_PAD_X * 2 - 88 - (gapW + tokW + cntW + lastW + scoreW) - CONT_GAP * 6;
        const ROW_H = 32;
        const cardH = Math.round(
            16 /*上内边距*/ + 26 /*标题*/ + 8 + 18 /*摘要*/ + 10 + 27 /*列头*/ +
            rows.length * ROW_H + 8 + 1 + 22 /*页脚*/ + 12 /*下内边距*/);
        const M = 28; // 卡片四周留一点遮罩底色，呈现弹窗悬浮观感
        const W = cardW + M * 2;
        const H = cardH + M * 2;
        const dpr = 2; // 固定 2 倍超采样，导出图清晰
        const cv = document.createElement("canvas");
        cv.width = W * dpr;
        cv.height = H * dpr;
        const ctx = cv.getContext("2d");
        ctx.scale(dpr, dpr);

        // 背景：弹窗遮罩（页面底色 + 轻微压暗），卡片居中悬浮
        ctx.fillStyle = P.bgTop;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = dark ? "rgba(3,7,18,.35)" : "rgba(31,51,110,.08)";
        ctx.fillRect(0, 0, W, H);
        const cardX = M, cardY = M;
        ctx.save();
        ctx.shadowColor = dark ? "rgba(0,0,0,.5)" : "rgba(38,56,118,.20)";
        ctx.shadowBlur = 40;
        ctx.shadowOffsetY = 12;
        rr(ctx, cardX, cardY, cardW, cardH, 16);
        ctx.fillStyle = P.card;
        ctx.fill();
        ctx.restore();
        rr(ctx, cardX, cardY, cardW, cardH, 16);
        ctx.strokeStyle = P.border;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.textBaseline = "middle"; // 卡片内所有文字按行高中线定位（与 CSS 垂直居中一致）

        // 列位置：名次/赛道左对齐，其余按内容宽从右往左排（右对齐）
        const cx0 = cardX + CARD_PAD_X;
        const nameX = cx0 + 88;
        const scoreR = cardX + cardW - CARD_PAD_X, lastR = scoreR - scoreW - CONT_GAP;
        const cntR = lastR - lastW - CONT_GAP, tokR = cntR - cntW - CONT_GAP;
        const gapR = tokR - tokW - CONT_GAP;

        // 头部：🏆 各赛道名次 + 昵称（与名次卡弹窗头部同款）
        const headCY = cardY + 16 + 13;
        ctx.font = F.title;
        ctx.fillStyle = P.text;
        ctx.fillText("🏆", cx0, headCY);
        const trophyW = mw("🏆", F.title);
        ctx.fillText("各赛道名次", cx0 + trophyW + 8, headCY);
        ctx.font = F.user;
        ctx.fillStyle = P.dim;
        ctx.fillText(fullName(store.user), cx0 + trophyW + 8 + mw("各赛道名次", F.title) + 12, headCY);

        // 摘要行 + 实时时钟（秒级）
        const metaCY = headCY + 13 + 8 + 9;
        const top3 = cards.filter(c => c.rank != null && c.rank <= 3).length;
        const totalSubs = cards.reduce((a, c) => a + c.count, 0);
        ctx.font = F.meta;
        ctx.fillStyle = P.dim;
        const metaText = `参与 ${participatedCount.value}/${cards.length} 赛道 · 前三 ${top3} · 累计提交 ${totalSubs} 条`;
        ctx.fillText(metaText, cx0, metaCY);
        const clockText = `${now.toLocaleDateString("zh-CN")} ${now.toLocaleTimeString("zh-CN", { hour12: false })}`;
        const metaW = mw(metaText, F.meta);
        const clockW = mw(clockText, F.clock);
        ctx.strokeStyle = P.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx0 + metaW + 10, metaCY - 8);
        ctx.lineTo(cx0 + metaW + 10, metaCY + 8);
        ctx.stroke();
        ctx.font = F.clock;
        ctx.fillStyle = P.dim;
        ctx.fillText(clockText, cx0 + metaW + 20, metaCY);

        // 列头（带小图标，底部描边）
        const colHeadCY = metaCY + 9 + 10 + 13;
        ctx.font = F.head;
        ctx.fillStyle = P.faint;
        drawIcon(ctx, "rank", cx0, colHeadCY - 6.5, 13, P.faint);
        ctx.fillText("名次", cx0 + 18, colHeadCY);
        drawIcon(ctx, "track", nameX, colHeadCY - 6.5, 13, P.faint);
        ctx.fillText("赛道", nameX + 18, colHeadCY);
        const headCell = (label, icon, R) => {
            const lw = mw(label, F.head);
            drawIcon(ctx, icon, R - lw - 4 - 13, colHeadCY - 6.5, 13, P.faint);
            ctx.fillText(label, R - lw, colHeadCY);
        };
        headCell("与榜首", "gap", gapR);
        headCell("Σtoken", "tok", tokR);
        headCell("提交", "send", cntR);
        headCell("最近提交", "clock", lastR);
        headCell("最好成绩", "target", scoreR);
        ctx.strokeStyle = P.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx0, colHeadCY + 13);
        ctx.lineTo(cardX + cardW - CARD_PAD_X, colHeadCY + 13);
        ctx.stroke();

        // 各赛道行（已参与按名次在前，未参与置底置灰）
        const rowsTop = colHeadCY + 13;
        let y = rowsTop;
        for (const r of rows) {
            const c = r.c, dim = r.dim;
            const rowCY = y + ROW_H / 2;

            // 名次（圆角徽章，与名次卡 rank-pill 同款；未过为红色文字，未参加为灰徽章）
            ctx.font = F.pill;
            if (c.failed) {
                ctx.fillStyle = P.bad;
                ctx.fillText(r.rankText, cx0, rowCY);
            } else if (dim) {
                rr(ctx, cx0, rowCY - 12, 64, 24, 12);
                ctx.fillStyle = dark ? "rgba(34,211,238,.07)" : "rgba(8,145,178,.07)";
                ctx.fill();
                ctx.fillStyle = P.faint;
                ctx.fillText(r.rankText, cx0 + (64 - mw(r.rankText, F.pill)) / 2, rowCY);
            } else {
                const rc = c.rank === 1 ? P.gold : c.rank === 2 ? P.silver : c.rank === 3 ? P.bronze : P.accent;
                rr(ctx, cx0, rowCY - 12, pillW, 24, 12);
                ctx.fillStyle = pillBg[c.rank] || pillBg.def;
                ctx.fill();
                ctx.strokeStyle = hexToRgba(rc.startsWith("#") ? rc : "#94b2ff", .4);
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.fillStyle = rc;
                ctx.fillText(r.rankText, cx0 + (pillW - mw(r.rankText, F.pill)) / 2, rowCY);
            }

            // 赛道名 + 框架徽章 + 模型（无框架信息的未参与行只画名字）
            ctx.font = F.name;
            ctx.fillStyle = dim ? P.faint : P.text;
            ctx.fillText(r.name, nameX, rowCY);
            let bx = nameX + mw(r.name, F.name) + 12;
            if (r.fw) {
                const [fwT, fwB] = fwTheme[c.fw === "custom" ? "custom" : "ahg"];
                const fwW = mw(r.fw, F.sub) + 16;
                rr(ctx, bx, rowCY - 9, fwW, 18, 9);
                ctx.fillStyle = fwB;
                ctx.fill();
                ctx.font = F.sub;
                ctx.fillStyle = dim ? P.faint : fwT;
                ctx.fillText(r.fw, bx + 8, rowCY);
                if (r.model) {
                    ctx.font = F.model;
                    ctx.fillStyle = dim ? P.faint : P.dim;
                    ctx.fillText(fitText(ctx, r.model, Math.max(40, nameX + nameW - (bx + fwW + 10))), bx + fwW + 10, rowCY);
                }
            }

            // 与榜首
            ctx.font = F.gap;
            ctx.fillStyle = dim ? P.faint : (c.top1Me ? P.good : P.dim);
            ctx.fillText(r.gap || "—", gapR - mw(r.gap || "—", F.gap), rowCY);

            // 数值列（右对齐）
            ctx.font = F.num;
            ctx.fillStyle = dim ? P.faint : P.text;
            ctx.fillText(r.tok, tokR - mw(r.tok, F.num), rowCY);
            ctx.fillText(r.cnt, cntR - mw(r.cnt, F.num), rowCY);
            ctx.font = F.last;
            ctx.fillStyle = dim ? P.faint : P.dim;
            ctx.fillText(r.last, lastR - mw(r.last, F.last), rowCY);

            // 最好成绩（旧评估附小徽章）
            ctx.font = F.score;
            ctx.fillStyle = dim ? P.faint : P.text;
            if (r.legacy && !dim && !c.failed) {
                const badgeW = mw("旧评估", F.badge) + 14;
                rr(ctx, scoreR - badgeW, rowCY - 8, badgeW, 16, 8);
                ctx.fillStyle = dark ? "rgba(148,178,255,.10)" : "rgba(31,51,110,.07)";
                ctx.fill();
                ctx.font = F.badge;
                ctx.fillStyle = P.dim;
                ctx.fillText("旧评估", scoreR - badgeW + 7, rowCY);
                ctx.font = F.score;
                ctx.fillStyle = dim ? P.faint : P.text;
                ctx.fillText(r.score, scoreR - badgeW - 6 - mw(r.score, F.score), rowCY);
            } else {
                ctx.fillText(r.score, scoreR - mw(r.score, F.score), rowCY);
            }

            y += ROW_H;
        }

        // 页脚（与弹窗页脚提示同款 + 生成署名）
        const footDivider = y + 8;
        ctx.strokeStyle = P.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx0, footDivider);
        ctx.lineTo(cardX + cardW - CARD_PAD_X, footDivider);
        ctx.stroke();
        const footCY = footDivider + 15;
        ctx.font = F.foot;
        ctx.fillStyle = P.faint;
        ctx.fillText("成绩为当前排名用分（ranking_score），越小越好 · 悬停数值可查看完整精度", cx0, footCY);
        const ts = `${now.toLocaleDateString("zh-CN")} ${now.toLocaleTimeString("zh-CN", { hour12: false })} 生成`;
        const brand = "AHGS NOVA · Vue SFC 生成";
        ctx.fillText(ts, cardX + cardW - CARD_PAD_X - mw(brand, F.foot) - 12 - mw(ts, F.foot), footCY);
        ctx.fillText(brand, cardX + cardW - CARD_PAD_X - mw(brand, F.foot), footCY);

        const blob = await new Promise(res => cv.toBlob(res, "image/png"));
        if (!blob) throw new Error("画布导出失败");
        const name = (store.user?.display_name || store.user?.username || "me").replace(/[\\/:*?"<>| ]/g, "_");
        downloadBlob(`NOVA成绩单_${name}_${now.toISOString().slice(0, 10)}.png`, blob);
        toast("成绩图已导出", "ok");
    } catch (e) {
        toast(e.message || "导出失败", "err");
    } finally {
        imgBusy.value = false;
    }
}

function sortedSubs(key) {
    return (subsByProblem.value[key] ?? [])
        .slice()
        .sort((a, b) => (parseServerTime(b.created_at)?.getTime() ?? 0) - (parseServerTime(a.created_at)?.getTime() ?? 0));
}

/** 详细提交记录默认只展开最近 3 条，更早的折叠（可展开/收起） */
const SUB_PREVIEW = 3;
const expandedTracks = ref(new Set());
function isExpanded(key) {
    return expandedTracks.value.has(key);
}
function toggleTrack(key) {
    const s = new Set(expandedTracks.value);
    s.has(key) ? s.delete(key) : s.add(key);
    expandedTracks.value = s;
}
function visibleSubs(key) {
    const all = sortedSubs(key);
    return isExpanded(key) || all.length <= SUB_PREVIEW ? all : all.slice(0, SUB_PREVIEW);
}

/** 实例 / 进化记录列表同样默认只显示最近 5 条，其余折叠（可展开/收起），避免页面过长 */
const LIST_PREVIEW = 5;
const instExpanded = ref(false);
const runsExpanded = ref(false);
const visibleInstances = computed(() =>
    instExpanded.value || instances.value.length <= LIST_PREVIEW ? instances.value : instances.value.slice(0, LIST_PREVIEW)
);
const visibleRuns = computed(() =>
    runsExpanded.value || runs.value.length <= LIST_PREVIEW ? runs.value : runs.value.slice(0, LIST_PREVIEW)
);

/* ---------- 名次卡弹窗：各赛道名次一览（与成绩海报同口径） ---------- */
const rankCardOpen = ref(false);
const rankCardLoading = ref(false);
const rankEntries = ref([]);

/** 弹窗内实时时钟（秒级精度，仅在弹窗打开期间走表） */
const nowTick = ref(new Date());
let clockTimer = null;
const clockText = computed(() =>
    nowTick.value.toLocaleDateString("zh-CN") + " " +
    nowTick.value.toLocaleTimeString("zh-CN", { hour12: false })
);

async function openRankCard() {
    rankCardOpen.value = true;
    rankCardLoading.value = true;
    nowTick.value = new Date();
    if (!clockTimer) clockTimer = setInterval(() => (nowTick.value = new Date()), 1000);
    try {
        rankEntries.value = (await api("/api/ranking/me")).entries ?? [];
    } catch {
        rankEntries.value = [];
    }
    rankCardLoading.value = false;
    // 与榜差距等汇总需要 records 数据（trackCards）；未加载过则补一次
    if (!ranks.value.length && !recordsLoading.value) loadRecords();
}

function closeRankCard() {
    rankCardOpen.value = false;
    if (clockTimer) {
        clearInterval(clockTimer);
        clockTimer = null;
    }
}

onUnmounted(() => {
    if (clockTimer) clearInterval(clockTimer);
});

const rankCardBusy = computed(() => rankCardLoading.value || recordsLoading.value);

/** 内建赛道在前、自定义赛道补后；已参与按名次升序在前，未参加沉底（同海报排序） */
const rankRows = computed(() => {
    const cardByKey = new Map(trackCards.value.map(c => [c.key, c]));
    const byKey = new Map(rankEntries.value.map(e => [e.problem_key, e]));
    const shortName = n => (n || "").split("(")[0].trim() || n;
    const rows = [];
    for (const p of store.problems) {
        rows.push({ key: p.key, name: shortName(p.name), full: p.name, e: byKey.get(p.key) ?? null, card: cardByKey.get(p.key) ?? null });
        byKey.delete(p.key);
    }
    for (const e of byKey.values())
        rows.push({
            key: e.problem_key,
            name: shortName(e.problem_name || e.problem_key),
            full: e.problem_name || e.problem_key,
            e,
            card: cardByKey.get(e.problem_key) ?? null,
        });
    return rows.sort((a, b) => {
        const pa = a.e ? 0 : 1, pb = b.e ? 0 : 1;
        if (pa !== pb) return pa - pb;
        if (!pa) return (a.e.rank ?? 9e3) - (b.e.rank ?? 9e3);
        return 0;
    });
});

const rankCardMeta = computed(() => {
    const cards = rankRows.value.map(r => r.card).filter(Boolean);
    const top3 = cards.filter(c => c.rank != null && c.rank <= 3).length;
    const totalSubs = cards.reduce((a, c) => a + c.count, 0);
    return `参与 ${participatedCount.value}/${rankRows.value.length} 赛道 · 前三 ${top3} · 累计提交 ${totalSubs} 条`;
});

/** 名次卡展示分：当前排名用分（ranking_score）；为 null 即 holdout 未过 */
function cardScore(e) {
    if (!e) return null;
    const s = Number(e.ranking_score);
    return e.ranking_score != null && isFinite(s) ? s : null;
}

/** 与榜首差距文本（同海报口径：去括号；本人榜首显示「已是榜首」） */
function cardGap(row) {
    const c = row.card;
    if (!c || !c.participated) return "";
    if (c.top1Me) return "已是榜首";
    return (c.top1GapText || "").replace(/[（）]/g, "");
}

function scoreTitle(e) {
    if (!e) return "";
    const parts = [];
    if (e.ranking_score != null) parts.push("完整值：" + fullNum(e.ranking_score));
    if (e.train_objective != null) parts.push("新训练集成绩：" + fullNum(e.train_objective));
    if (e.best_objective != null) parts.push("原始最优：" + fullNum(e.best_objective));
    if (e.best_submitted_at) parts.push("提交于 " + e.best_submitted_at);
    return parts.join("；");
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

/** 名次底色：前三名金/银/铜，其余为主题色 */
function rankCls(r) {
    return r === 1 ? "rp1" : r === 2 ? "rp2" : r === 3 ? "rp3" : "rpn";
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
    const t0 = Date.now();
    const probe = await Promise.race([
        Promise.all([
            api("/api/ranking/me").then(r => "rank OK " + r.entries.length).catch(e => "rank FAIL " + e.status + " " + e.message.slice(0, 40)),
            api("/api/submissions/my").then(r => "subs OK " + r.submissions.length).catch(e => "subs FAIL " + e.status + " " + e.message.slice(0, 40)),
        ]),
        new Promise(res => setTimeout(() => res("HANG>5s"), 5000)),
    ]);
    document.documentElement.setAttribute("data-probe", String(probe) + " @" + (Date.now() - t0) + "ms");
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
    // 涉及问题的第一名与我的名次（用于进化记录表的对比列）；自定义问题没有排行榜，跳过避免 404
    const builtIn = new Set(store.problems.map(p => p.key));
    const pkeys = [...new Set(runs.value.map(x => x.problem_key).filter(Boolean))].filter(k => builtIn.has(k));
    if (pkeys.length) {
        const [rankLists, myRanks] = await Promise.all([
            Promise.all(pkeys.map(k => api("/api/ranking/" + k).then(x => x.entries ?? []).catch(() => []))),
            api("/api/ranking/me").then(x => x.entries ?? []).catch(() => []),
        ]);
        const t1 = new Map();
        const mb = new Map();
        pkeys.forEach((k, idx) => {
            const top = (rankLists[idx] ?? []).find(e => e.rank === 1);
            if (top) t1.set(k, top);
            const mine = myRanks.find(e => e.problem_key === k);
            if (mine) mb.set(k, mine);
        });
        runTop1Map.value = t1;
        runMyBestMap.value = mb;
    }
    instLoading.value = false;
}

/** 进化记录行：与我最优的差距文本（ascend-aware） */
function runGapText(r) {
    const mine = runMyBestMap.value.get(r.problem_key);
    const best = Number(r.best_objective);
    if (!mine || !isFinite(best)) return "";
    const myBest = Number(mine.best_objective);
    const asc = isAscend(r.problem_key);
    const worse = asc ? (best - myBest) / Math.abs(myBest || 1) * 100 : (myBest - best) / Math.abs(myBest || 1) * 100;
    if (worse <= 0.005) return "🏆 即个人最优";
    return "距个人最优 +" + worse.toFixed(1) + "%";
}

function runTop1Text(r) {
    const top = runTop1Map.value.get(r.problem_key);
    if (!top) return "";
    return "🥇 " + (top.display_name || top.username) + " · " + fmtObj(top.best_objective);
}

async function loadProfile() {
    profileLoading.value = true;
    try {
        me.value = await api("/api/auth/me");
        const cached = getStoredUser();
        // 数据与缓存一致时不重复写会话，避免触发 store.user 相关的响应式链
        if (!cached || JSON.stringify(cached) !== JSON.stringify(me.value)) {
            setSession(null, me.value);
        }
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
        <h2>我的空间 <span class="tail">{{ meta }}
                <button class="btn small" style="margin-left: 8px" title="各赛道名次一览"
                    @click="openRankCard">🏆 名次总览</button></span></h2>
        <div class="chip-row" style="margin-bottom: 14px">
            <button class="chip" :class="{ on: tab === 'records' }" @click="tab = 'records'">名次与提交</button>
            <button class="chip" :class="{ on: tab === 'instances' }" @click="tab = 'instances'">进化记录与实例</button>
            <button class="chip" :class="{ on: tab === 'profile' }" @click="tab = 'profile'">个人资料</button>
        </div>

        <!-- 名次与提交 -->
        <div v-if="tab === 'records'">
            <div v-if="recordsLoading" class="loading-row"><span class="spinner"></span>加载中…</div>
            <template v-else>
                <div id="sec-summary" class="records-block">
                    <div class="mine-head"><span class="mine-title">📊 各赛道速览</span>
                        <button class="btn small" style="margin-left: 12px" :disabled="imgBusy"
                            title="把各赛道名次与成绩导出为一张图片" @click="exportScoreCard">{{
                            imgBusy ? "⏳ 生成中…" : "📤 导出成绩图" }}</button>
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
                            <span v-if="c.rank" class="rank-pill tier-rank" :class="rankCls(c.rank)">第{{
                                c.rank }}名</span>
                            <span v-else class="tier-rank mono">—</span>
                            <span class="tier-best mono"
                                :title="(c.legacy ? '旧版评估成绩（未通过新复核）' : '当前排名用分') + (c.trainObj != null ? '；新训练集成绩：' + fullNum(c.trainObj) : '') + (c.best != null ? '；完整值：' + fullNum(c.best) : '')">{{ c.failed ? "🚫 holdout 未过" : c.best != null ? fmtObj(c.best) : "—" }}<span v-if="c.legacy" class="badge feature-badge"
                                :title="'该成绩来自旧一轮评估；新训练集成绩：' + fullNum(c.trainObj ?? null)">旧评估</span></span>
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
                        <span v-if="rankMap.get(key)?.ranking_legacy" class="mine-rank">
                            <span class="badge feature-badge">旧成绩未通过复核</span>
                        </span>
                        <span v-else-if="rankMap.get(key)" class="mine-rank">
                            <span class="rank-pill" :class="rankCls(rankMap.get(key).rank)"><template
                                    v-if="rankMap.get(key).rank <= 3">{{ ["🥇", "🥈", "🥉"][rankMap.get(key).rank - 1]
                                    }}</template>第 <b class="mono">{{ rankMap.get(key).rank }}</b> 名</span>
                            · 最优 <b class="mono" :title="'完整值：' + fullNum(rankMap.get(key).best_objective)">{{ fmtObj(rankMap.get(key).best_objective) }}</b>
                        </span>
                        <span v-else class="hint">暂无名次</span>
                        <span v-if="(subsByProblem[key] || []).length > 1" class="head-spark"
                            title="我的提交适应度走势（时间序）">
                            <span><Sparkline :values="subSpark(key)" /></span></span>
                        <a class="btn small" style="margin-left: auto" :href="'#/leaderboard?problem=' + key"
                            title="查看该赛道完整排行榜">完整榜 →</a>
                        <button class="btn small" title="回到各赛道速览"
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
                                <tr v-for="s in visibleSubs(key)" :key="s.id" class="clickable-row"
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
                                <tr v-if="(subsByProblem[key] ?? []).length > SUB_PREVIEW" class="fold-row">
                                    <td :colspan="7">
                                        <button class="btn small fold-btn" @click="toggleTrack(key)"
                                            :title="isExpanded(key) ? '收起较早的提交' : '默认仅显示最近 3 条提交'">
                                            {{ isExpanded(key) ? "收起" : "展开其余 " + ((subsByProblem[key] ??
                                                []).length - SUB_PREVIEW) + " 条" }}
                                            <span class="fold-arrow">{{ isExpanded(key) ? "▴" : "▾" }}</span>
                                        </button>
                                    </td>
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
                <div class="mine-head"><span class="mine-title">AHG 进化记录</span><span class="hint">默认仅显示最近
                        {{ LIST_PREVIEW }} 条</span></div>
                <div v-if="!runs.length" class="hint">暂无进化记录。</div>
                <div v-else class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th class="num">ID</th>
                                <th>问题</th>
                                <th>状态</th>
                                <th class="num">最优适应度</th>
                                <th>赛道第一名</th>
                                <th>与我最优</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="r in visibleRuns" :key="r.run_id">
                                <td class="num mono">{{ r.run_id }}</td>
                                <td class="mono">{{ r.problem_key ?? "—" }}</td>
                                <td><span class="badge" :class="'evo-st-' + r.status">{{ statusName(r.status) }}</span></td>
                                <td class="num mono">{{ fmtObj(r.best_objective) }}</td>
                                <td class="tier-top1" :title="runTop1Text(r)">{{ runTop1Text(r) || "—" }}</td>
                                <td class="mono">{{ runGapText(r) || "—" }}</td>
                                <td><a class="btn small" :href="'#/curve?run=' + r.run_id">监控 →</a></td>
                            </tr>
                            <tr v-if="runs.length > LIST_PREVIEW" class="fold-row">
                                <td :colspan="7">
                                    <button class="btn small fold-btn" @click="runsExpanded = !runsExpanded"
                                        :title="runsExpanded ? '收起较早的进化记录' : '默认仅显示最近 5 条进化记录'">{{
                                        runsExpanded ? "收起" : "展开其余 " + (runs.length - LIST_PREVIEW) + " 条" }}
                                        <span class="fold-arrow">{{ runsExpanded ? "▴" : "▾" }}</span></button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div class="mine-head" style="margin-top: 18px"><span class="mine-title">实例保存</span><span class="hint">默认仅显示最近
                        {{ LIST_PREVIEW }} 条 · 点击「载入」把实例配置带到进化页</span></div>
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
                            <tr v-for="i in visibleInstances" :key="i.id">
                                <td><b>{{ i.name }}</b></td>
                                <td><FwBadge :ft="i.framework_type" /></td>
                                <td class="mono hint">{{ i.config?.llm_model ?? "—" }}</td>
                                <td class="mono">{{ i.problem_key ?? "—" }}</td>
                                <td class="mono hint">{{ i.updated_at ? fmtTime(i.updated_at) : "—" }}</td>
                                <td><a class="btn small" href="#/evo">载入 →</a></td>
                            </tr>
                            <tr v-if="instances.length > LIST_PREVIEW" class="fold-row">
                                <td :colspan="6">
                                    <button class="btn small fold-btn" @click="instExpanded = !instExpanded"
                                        :title="instExpanded ? '收起较早的实例' : '默认仅显示最近 5 条实例'">{{
                                        instExpanded ? "收起" : "展开其余 " + (instances.length - LIST_PREVIEW) + " 条" }}
                                        <span class="fold-arrow">{{ instExpanded ? "▴" : "▾" }}</span></button>
                                </td>
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

    <!-- 名次卡弹窗 -->
    <div v-if="rankCardOpen" class="modal-mask" @click.self="closeRankCard">
        <div class="modal rank-card">
            <div class="rank-card-head">
                <h3>🏆 各赛道名次<span class="rank-card-user">{{ fullName(store.user) }}</span></h3>
                <button class="drawer-close" aria-label="关闭" @click="closeRankCard">×</button>
            </div>
            <div class="rank-card-meta hint">{{ rankCardMeta }}<span class="mono rank-card-clock">{{ clockText
                }}</span></div>
            <div class="rank-card-body">
                <div class="rank-card-cols">
                <span title="名次">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"
                        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                        <circle cx="12" cy="8" r="6" />
                        <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
                    </svg>名次</span>
                <span title="赛道">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"
                        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                        <line x1="4" x2="4" y1="22" y2="15" />
                    </svg>赛道</span>
                <span title="与榜首差距">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"
                        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                        <path d="M22 7l-8.5 8.5-5-5L2 17" />
                        <path d="M16 7h6v6" />
                    </svg>与榜首</span>
                <span class="num col-tok" title="该赛道累计 token 消耗">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"
                        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                        <ellipse cx="12" cy="5" rx="9" ry="3" />
                        <path d="M3 5v14A9 3 0 0 0 21 19V5" />
                        <path d="M3 12A9 3 0 0 0 21 12" />
                    </svg>Σtoken</span>
                <span class="num col-cnt" title="提交次数">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"
                        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                        <path d="m22 2-7 20-4-9-9-4Z" />
                        <path d="M22 2 11 13" />
                    </svg>提交</span>
                <span class="num col-last" title="最近一次提交时间">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"
                        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                    </svg>最近提交</span>
                <span class="num" title="当前排名用分（越小越好）">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"
                        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                        <circle cx="12" cy="12" r="10" />
                        <circle cx="12" cy="12" r="6" />
                        <circle cx="12" cy="12" r="2" />
                    </svg>最好成绩</span>
                </div>
                <div v-if="rankCardBusy && !rankRows.length" class="loading-row"><span class="spinner"></span>加载中…</div>
                <a v-else v-for="r in rankRows" :key="r.key" class="rank-row" :class="{ dim: !r.e }" :title="r.full"
                    :href="'#/leaderboard?problem=' + r.key" @click="closeRankCard">
                    <span class="rank-cell"><span v-if="r.e && r.e.rank" class="rank-pill"
                            :class="rankCls(r.e.rank)">第{{ r.e.rank }}名</span><span v-else
                            class="rank-pill rpn">未参加</span></span>
                    <span class="rank-name"><span class="rank-problem">{{ r.name }}</span><span v-if="r.e"
                            class="rank-sub"><FwBadge :ft="r.e.framework_type" /><span class="mono">{{ r.e.llm_model
                                || "—" }}</span></span><span v-else class="rank-sub hint">尚无提交记录</span></span>
                    <span class="rank-gap"><template v-if="r.e && r.e.rank"><template v-if="cardGap(r)"><span
                                    :class="{ me: r.card && r.card.top1Me }">{{ cardGap(r) }}</span></template><template
                                v-else><span class="hint">—</span></template></template><template v-else><span
                                class="hint">—</span></template></span>
                    <span class="rank-tok mono">{{ r.card && r.card.tokens ? fmtTokens(r.card.tokens) : "—" }}</span>
                    <span class="rank-cnt mono">{{ r.card && r.card.count ? r.card.count : "—" }}</span>
                    <span class="rank-last mono hint" :title="r.card && r.card.lastAt || ''">{{ r.card && r.card.lastAt
                        ? fmtTime(r.card.lastAt) : "—" }}</span>
                    <span class="rank-score"><template v-if="!r.e"><span class="mono hint">—</span></template><template
                            v-else-if="cardScore(r.e) != null"><span class="mono"
                                :title="scoreTitle(r.e)">{{ fmtObj(cardScore(r.e)) }}</span><span
                                v-if="r.e.ranking_legacy" class="badge feature-badge score-badge"
                                title="该成绩来自旧一轮评估">旧评估</span></template><template v-else><span class="hint fail"
                                title="holdout 留出段评估未通过，暂无排名分">🚫 未过</span></template></span>
                </a>
            </div>
            <div class="rank-card-foot hint">成绩为当前排名用分（ranking_score），越小越好 · 点击行打开该赛道完整排行榜 · 悬停查看完整精度</div>
        </div>
    </div>
</template>
