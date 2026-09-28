/* ============ AHGS NOVA Vue 版 · 响应式全局状态 ============ */
"use strict";

const {
    createApp,
    reactive,
    ref,
    computed,
    watch,
    onMounted,
    onUnmounted,
    nextTick
} = Vue;

const store = reactive({
    problems: [],
    theme: localStorage.getItem(LS.theme) || "dark",
    route: {
        name: "dashboard",
        params: new URLSearchParams()
    },
    user: getStoredUser(),
    viewVer: 0,
    /** 抽屉：{ component, props } 或 null */
    drawer: null,
    loginModal: false,
    toasts: [],
});

let toastSeq = 0;

function toast(msg, kind = "") {
    const id = ++toastSeq;
    store.toasts.push({
        id,
        msg,
        kind
    });
    setTimeout(() => {
        const i = store.toasts.findIndex(t => t.id === id);
        if (i >= 0) store.toasts.splice(i, 1);
    }, 2600);
}

function setSession(token, user) {
    if (token) localStorage.setItem(LS.token, token);
    if (user) localStorage.setItem(LS.user, JSON.stringify(user));
}

function clearSession() {
    localStorage.removeItem(LS.token);
    localStorage.removeItem(LS.user);
}

/* ---------- API ---------- */
class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
async function api(path, {
    method = "GET",
    body
} = {}) {
    const headers = {
        "Content-Type": "application/json"
    };
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
    let resp;
    try {
        resp = await fetch(apiBase() + path, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body)
        });
    } catch {
        throw new ApiError(0, "网络错误：无法连接到 " + apiBase() + "（请在右上角设置里检查接口地址）");
    }
    if (!resp.ok) {
        let detail = resp.statusText || String(resp.status);
        try {
            const j = await resp.json();
            detail = j.detail || j.message || JSON.stringify(j);
        } catch {}
        throw new ApiError(resp.status, detail);
    }
    if (resp.status === 204) return null;
    return resp.json();
}

/* ---------- 路由 ---------- */
const ROUTE_COMPS = {}; // name -> component，由各视图文件注册
function getRouteComp(name) {
    return ROUTE_COMPS[name];
}

function parseHash() {
    const h = location.hash.replace(/^#\/?/, "");
    const [name, qs] = h.split("?");
    return {
        name: ROUTE_COMPS[name] ? name : "dashboard",
        params: new URLSearchParams(qs || "")
    };
}

function navHash(name, params) {
    const q = params instanceof URLSearchParams && [...params].length ? "?" + params.toString() : "";
    location.hash = "#/" + name + q;
}
window.addEventListener("hashchange", () => Object.assign(store.route, parseHash()));

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(LS.theme, theme);
}
