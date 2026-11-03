/* ============ AHGS NOVA · HTTP API ============ */
import { DEFAULT_API, PLATFORM_API, LS } from "./constants";

// 官方平台 2026-10 收紧 CORS 后，早期在设置里保存过的官方直连地址跨源必被浏览器拦截。
// 启动时自动清掉这个已失效的旧值，回落到同源默认，免去逐个浏览器手动「恢复默认」。
// （须在组件读取 apiBase() 之前执行，故放在模块顶层；重复执行无副作用。）
const LEGACY_DIRECT_API = "http://10.201.186.15:8090";
const savedApi = localStorage.getItem(LS.api);
if (savedApi && savedApi.replace(/\/+$/, "") === LEGACY_DIRECT_API) {
    localStorage.removeItem(LS.api);
}

export function apiBase() {
    const base = localStorage.getItem(LS.api) || DEFAULT_API;
    // 平台 2026-10-23 起关闭跨域访问（CORS 预检一律 400），浏览器无法直连默认接口。
    // 开发服务器（npm run dev）下默认地址改走 vite.config.js 的 /api 同源代理；
    // 显式配置的其它接口地址（自建 mock 等）不受影响。
    if (import.meta.env.DEV && base === DEFAULT_API) return "";
    return base.replace(/\/+$/, "");
}

/** 展示用接口地址：apiBase() 为空字符串（同源模式）时，
 *  页脚链接 / 设置输入框 / 错误提示等展示处回退显示平台地址 */
export function displayApiBase() {
    return apiBase() || PLATFORM_API;
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
        throw new ApiError(0, "网络错误：无法连接到 " + (apiBase() || "同源接口（开发代理）") + "（请在右上角设置里检查接口地址）");
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

/** 下载需登录的文件（官方 2026-10-23 起 /api/developer/minimal-package 返回 ZIP）。
 *  与 api() 一致地附带 Authorization 与错误处理，返回 { blob, filename }
 *  （filename 优先取 Content-Disposition，缺省用 fallbackName）。 */
export async function downloadFile(path, fallbackName = "download.bin") {
    const headers = {};
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
    let resp;
    try {
        resp = await fetch(apiBase() + path, { headers });
    } catch {
        throw new ApiError(0, "网络错误：无法连接到 " + (apiBase() || "同源接口（开发代理）") + "（请在右上角设置里检查接口地址）");
    }
    if (!resp.ok) {
        let detail = resp.statusText || String(resp.status);
        try {
            const j = await resp.json();
            detail = j.detail || j.message || JSON.stringify(j);
        } catch { /* keep statusText */ }
        if (resp.status === 401 && getToken()) {
            try {
                window.dispatchEvent(new CustomEvent("ahgs:session-expired"));
            } catch { /* ignore */ }
        }
        throw new ApiError(resp.status, detail);
    }
    const blob = await resp.blob();
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(resp.headers.get("Content-Disposition") || "");
    return { blob, filename: m ? decodeURIComponent(m[1]) : fallbackName };
}

/** 官方 2026-11 起提交流全量分页：{page,pageSize,sort,snapshot} →
 *  {submissions,total,page,pageSize,snapshot}。snapshot 为服务端一致性快照游标：
 *  首次加载/切换筛选时不传（服务端下发新快照），翻页与轮询时原样回传，避免翻页跳动。
 *  archived=true 改用 /api/submissions/archived/recent（已归档/撤回记录，需登录）。
 *  旧 limit=N 参数已弃用（仍兼容，但只返回裸 submissions，无 total/snapshot）。 */
export async function fetchRecentSubmissions({
    page = 1,
    pageSize = 20,
    sort = "time",
    snapshot = null,
    problemKey = "",
    frameworkTypes = "",
    modelSources = "",
    archived = false,
} = {}) {
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort });
    if (snapshot != null) qs.set("snapshot", String(snapshot));
    if (problemKey) qs.set("problem_key", problemKey);
    if (frameworkTypes) qs.set("framework_types", frameworkTypes);
    if (modelSources) qs.set("model_sources", modelSources);
    const path = archived ? "/api/submissions/archived/recent" : "/api/submissions/recent";
    return api(`${path}?${qs}`);
}

/** 官方 2026-10 起 /api/instances 分页（{instances,total,has_more}）；跟随翻页取全量，
 *  旧结构（直接返回全量 instances）自动兼容。上限 20×50=1000 条，防异常死循环。 */
export async function fetchInstances() {
    const out = [];
    for (let page = 1; page <= 20; page++) {
        const j = await api(`/api/instances?page=${page}&page_size=50`);
        if (Array.isArray(j)) return j;
        out.push(...(j.instances ?? []));
        if (!j.has_more) break;
    }
    return out;
}
