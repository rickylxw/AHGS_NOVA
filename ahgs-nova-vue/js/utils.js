/* ============ AHGS NOVA Vue 版 · 工具函数 ============ */
"use strict";

const DEFAULT_API = "http://10.201.186.15:8090";
const LS = {
    token: "ahgs_token",
    user: "ahgs_user",
    api: "nova_api_base",
    theme: "nova_theme"
};

const FW_LABEL = {
    eoh_nseh: "EoH(NSEH)",
    calm: "CALM",
    custom: "自定义框架"
};
const STATUS_LABEL = {
    pending: "排队中",
    running: "运行中",
    paused: "已暂停",
    completed: "已完成",
    stopped: "已停止",
    failed: "失败"
};
const STATUS_ACTIVE = new Set(["pending", "running", "paused"]);
const STATUS_DONE = new Set(["completed", "failed", "stopped"]);
const CP_TASK_LABEL = {
    dataset_builder: "数据集构建脚本",
    evaluator: "评估器",
    example_heuristic: "示例启发式"
};
const EVO_DEFAULTS = {
    population_size: 8,
    num_generations: 10,
    num_mutation: 3,
    num_hybridization: 3,
    num_reflection: 3,
    num_policy_updates: 1
};
const PALETTE = ["#22d3ee", "#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#60a5fa", "#fb7185", "#4ade80"];

function apiBase() {
    return (localStorage.getItem(LS.api) || DEFAULT_API).replace(/\/+$/, "");
}

function getToken() {
    return localStorage.getItem(LS.token) || "";
}

function getStoredUser() {
    try {
        const u = JSON.parse(localStorage.getItem(LS.user) || "null");
        return u && typeof u.id === "number" && typeof u.username === "string" ? u : null;
    } catch {
        return null;
    }
}

function fmtObj(x) {
    return x == null || !isFinite(Number(x)) ? "—" : Number(x).toFixed(4);
}

function fmtTokens(n) {
    if (n == null || isNaN(n)) return "—";
    n = Number(n);
    if (n >= 1e8) return (n / 1e8).toFixed(2) + "亿";
    if (n >= 1e4) return (n / 1e4).toFixed(1) + "万";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
    return String(n);
}
/** 服务器返回不带时区标记的 UTC 时间，补 Z 解析 */
function parseServerTime(iso) {
    if (!iso) return null;
    const s = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + "Z";
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

function fmtTime(iso) {
    const d = parseServerTime(iso);
    if (!d) return iso || "—";
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "刚刚";
    if (diff < 3600) return Math.floor(diff / 60) + " 分钟前";
    if (diff < 86400) return Math.floor(diff / 3600) + " 小时前";
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + " 天前";
    return d.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function fullName(e) {
    return (e && (e.display_name || e.username)) || "—";
}

function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    } [c]));
}

function downloadText(filename, text, mime = "text/csv;charset=utf-8") {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + text], {
        type: mime
    }));
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function copyText(text) {
    navigator.clipboard?.writeText(text).then(() => toast("已复制到剪贴板", "ok"), () => toast("复制失败", "err"));
}

function isAscend(problemKey) {
    const p = (store.problems || []).find(p => p.key === problemKey);
    return !p || p.ascend !== false;
}
