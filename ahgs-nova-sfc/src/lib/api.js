/* ============ AHGS NOVA · HTTP API ============ */
import { DEFAULT_API, LS } from "./constants";

export function apiBase() {
    return (localStorage.getItem(LS.api) || DEFAULT_API).replace(/\/+$/, "");
}

export function getToken() {
    return localStorage.getItem(LS.token) || "";
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
        throw new ApiError(resp.status, detail);
    }
    if (resp.status === 204) return null;
    return resp.json();
}
