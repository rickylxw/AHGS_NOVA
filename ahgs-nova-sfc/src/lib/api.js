/* ============ AHGS NOVA · HTTP API ============ */
import { DEFAULT_API, LS } from "./constants";

export function apiBase() {
    return (localStorage.getItem(LS.api) || DEFAULT_API).replace(/\/+$/, "");
}

export function getToken() {
    return localStorage.getItem(LS.token) || "";
}

/** 解析 JWT payload 中的 exp（毫秒时间戳）；非 JWT / 无 exp 返回 null */
export function getTokenExpiry() {
    const part = getToken().split(".")[1];
    if (!part) return null;
    try {
        let b64 = part.replace(/-/g, "+").replace(/_/g, "/");
        while (b64.length % 4) b64 += "=";
        const payload = JSON.parse(atob(b64));
        return typeof payload.exp === "number" ? payload.exp * 1000 : null;
    } catch {
        return null;
    }
}

/** 本地保存的 token 是否已过期（仅对带 exp 的 JWT 有效） */
export function isTokenExpired() {
    const exp = getTokenExpiry();
    return exp != null && Date.now() >= exp;
}

export function getStoredUser() {
    try {
        const u = JSON.parse(localStorage.getItem(LS.user) || "null");
        return u && typeof u.id === "number" && typeof u.username === "string" ? u : null;
    } catch {
        return null;
    }
}

export class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

export async function api(path, { method = "GET", body } = {}) {
    const headers = { "Content-Type": "application/json" };
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
    let resp;
    try {
        resp = await fetch(apiBase() + path, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch {
        throw new ApiError(0, "网络错误：无法连接到 " + apiBase() + "（请在右上角设置里检查接口地址）");
    }
    if (!resp.ok) {
        let detail = resp.statusText || String(resp.status);
        try {
            const j = await resp.json();
            detail = j.detail || j.message || JSON.stringify(j);
        } catch { /* keep statusText */ }
        // 带 token 仍返回 401 = 会话过期：广播全局事件，由 App 自动登出（避免 api ↔ store 循环依赖）
        if (resp.status === 401 && getToken()) {
            try {
                window.dispatchEvent(new CustomEvent("ahgs:session-expired"));
            } catch { /* ignore */ }
        }
        throw new ApiError(resp.status, detail);
    }
    if (resp.status === 204) return null;
    return resp.json();
}
