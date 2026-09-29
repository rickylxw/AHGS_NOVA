/* ============ AHGS NOVA · 格式化与通用工具 ============ */
import { store, toast } from "./store";

export function fmtObj(x) {
    return x == null || !isFinite(Number(x)) ? "—" : Number(x).toFixed(4);
}

export function fmtTokens(n) {
    if (n == null || isNaN(n)) return "—";
    n = Number(n);
    if (n >= 1e8) return (n / 1e8).toFixed(2) + "亿";
    if (n >= 1e4) return (n / 1e4).toFixed(1) + "万";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
    return String(n);
}

/** 服务器返回不带时区标记的 UTC 时间，补 Z 解析 */
export function parseServerTime(iso) {
    if (!iso) return null;
    const s = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + "Z";
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

export function fmtTime(iso) {
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
        minute: "2-digit",
    });
}

export function fullName(e) {
    return (e && (e.display_name || e.username)) || "—";
}

export function downloadText(filename, text, mime = "text/csv;charset=utf-8") {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + text], { type: mime }));
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function copyText(text) {
    navigator.clipboard?.writeText(text).then(() => toast("已复制到剪贴板", "ok"), () => toast("复制失败", "err"));
}

export function isAscend(problemKey) {
    const p = (store.problems || []).find(p => p.key === problemKey);
    return !p || p.ascend !== false;
}

/** 完整精度原始数值（悬停提示用）：fmtObj 只显示 4 位小数，这里保留全部有效位 */
export function fullNum(x) {
    const n = Number(x);
    return x == null || x === "" || !isFinite(n) ? "—" : String(n);
}
