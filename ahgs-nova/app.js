/* ============ AHGS NOVA 核心：接口 / 路由 / 通用组件 ============ */
"use strict";

/* ---------- 配置与状态 ---------- */
const DEFAULT_API = "http://10.201.186.15:8090";
const LS = {
    token: "ahgs_token",
    user: "ahgs_user",
    api: "nova_api_base",
    theme: "nova_theme"
};

const state = {
    problems: [], // {key,name,ascend,category,description}
    problemMap: new Map(),
    route: {
        name: "dashboard",
        params: new URLSearchParams()
    },
    timers: [], // 当前视图的轮询 timer
};

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

function setSession(token, user) {
    if (token) localStorage.setItem(LS.token, token);
    if (user) localStorage.setItem(LS.user, JSON.stringify(user));
    renderUserSlot();
}

function clearSession() {
    localStorage.removeItem(LS.token);
    localStorage.removeItem(LS.user);
    renderUserSlot();
}

function isAscend(problemKey) {
    const p = state.problemMap.get(problemKey);
    return !p || p.ascend !== false;
}

/* ---------- API 封装 ---------- */
class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
async function api(path, {
    method = "GET",
    body,
    raw = false
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
    return raw ? resp : resp.json();
}

/* ---------- 工具 ---------- */
function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    } [c]));
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
/** 服务器返回的是不带时区标记的 UTC 时间，必须补 Z 否则会按本地时区解析（差 8 小时） */
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
    return e.display_name || e.username || "—";
}

const FW_LABEL = {
    eoh_nseh: "EoH(NSEH)",
    calm: "CALM",
    custom: "自定义框架"
};

function fwBadge(ft) {
    const label = FW_LABEL[ft] || "AHG";
    const cls = ft === "custom" ? "fw-custom" : "fw-ahg";
    return `<span class="badge ${cls}">${esc(label)}</span>`;
}

function srcBadge(src) {
    if (src === "local") return `<span class="badge src-local">本地LLM</span>`;
    return `<span class="badge src-api">API</span>`;
}

function medalHTML(rank) {
    if (rank > 3) return `<span class="rank-val mono">${rank}</span>`;
    return `<span class="medal r${rank}">${["🥇", "🥈", "🥉"][rank - 1]}</span>`;
}

function avatarHTML(e, extra = "") {
    const name = fullName(e);
    const ch = esc((name[0] || "?").toUpperCase());
    if (e.avatar) return `<span class="avatar ${extra}" data-initial="${ch}"><img src="${esc(e.avatar)}" alt="" referrerpolicy="no-referrer"></span>`;
    return `<span class="avatar ${extra}">${ch}</span>`;
}

function userCellHTML(e, opts = {}) {
    const uid = e.user_id != null ? `data-uid="${e.user_id}"` : "";
    return `<div class="user-cell"><span class="link-ish" ${uid} data-action="open-user">${avatarHTML(e)}</span>` +
        `<div class="u-name"><span class="u-main">${esc(fullName(e))}</span>` +
        (e.display_name && e.username && e.display_name !== e.username ? `<span class="u-sub mono">${esc(e.username)}</span>` : "") +
        `</div></div>`;
}

function toast(msg, kind = "") {
    const el = document.createElement("div");
    el.className = "toast " + kind;
    el.textContent = msg;
    document.getElementById("toast-root").appendChild(el);
    setTimeout(() => {
        el.style.opacity = "0";
        el.style.transition = "opacity .3s";
        setTimeout(() => el.remove(), 320);
    }, 2600);
}

function addTimer(id) {
    state.timers.push(id);
}

function clearTimers() {
    state.timers.forEach(clearInterval);
    state.timers = [];
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

/* ---------- 主题 ---------- */
function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(LS.theme, theme);
    const ico = document.getElementById("theme-ico");
    if (ico) ico.innerHTML = theme === "dark" ?
        `<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>` :
        `<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>`;
}

function needLoginHTML(msg) {
    return `<div class="error-banner">🔐 ${esc(msg || "此内容需要登录后查看")}</div>
    <div style="text-align:center;margin-top:10px"><button class="btn primary" data-action="open-login">登录 / 注册</button></div>`;
}

/* ---------- 抽屉 ---------- */
function openDrawer(html) {
    const d = document.getElementById("drawer");
    const m = document.getElementById("drawer-mask");
    d.innerHTML = html;
    d.hidden = false;
    m.hidden = false;
}

function closeDrawer() {
    document.getElementById("drawer").hidden = true;
    document.getElementById("drawer-mask").hidden = true;
}

/** 提交详情抽屉（/api/submissions/{id}） */
async function openSubmissionDrawer(id, {
    showCurveBtn = true
} = {}) {
    openDrawer(`<div class="drawer-head"><h3>最优算法详情</h3><button class="drawer-close" data-action="close-drawer">×</button></div>
    <div class="loading-row"><span class="spinner"></span>加载中…</div>`);
    let d;
    try {
        d = await api(`/api/submissions/${id}`);
    } catch (e) {
        openDrawer(`<div class="drawer-head"><h3>最优算法详情</h3><button class="drawer-close" data-action="close-drawer">×</button></div>
      ${e.status === 401 ? needLoginHTML() : `<div class="error-banner">加载失败：${esc(e.message)}</div>`}`);
        return;
    }
    const features = (d.features ?? []).map(f => `<span class="badge feature-badge">${esc(f)}</span>`).join("") || `<span class="hint">无</span>`;
    openDrawer(`
    <div class="drawer-head"><h3>最优算法详情 <span class="mono hint">#${esc(d.id ?? id)}</span></h3>
      <button class="drawer-close" data-action="close-drawer">×</button></div>
    <div class="user-cell" style="margin-bottom:12px">${avatarHTML(d)}<div class="u-name">
      <span class="u-main">${esc(fullName(d))}</span>
      ${d.display_name && d.username && d.display_name !== d.username ? `<span class="u-sub mono">${esc(d.username)}</span>` : ""}</div></div>
    <div class="grid-2">
      <div class="kv"><span class="k">适应度</span><span class="mono">${fmtObj(d.objective)}</span></div>
      <div class="kv"><span class="k">所耗 token</span><span class="mono">${fmtTokens(d.total_tokens)}</span></div>
      <div class="kv"><span class="k">来源</span>${srcBadge(d.model_source)}</div>
      <div class="kv"><span class="k">框架</span>${fwBadge(d.framework_type)}</div>
    </div>
    <div class="field"><label>使用模型</label><div class="mono">${esc(d.llm_model || "—")}</div></div>
    <div class="field"><label>启发式思想</label><p class="drawer-text">${esc(d.concept ?? "—")}</p></div>
    <div class="field"><label>关键词组</label><div class="badge-row">${features}</div></div>
    <div class="field"><label>算法代码</label>
      <div class="code-container"><button class="btn small copy-btn" data-action="copy" data-code="submission-${id}">复制</button>
      <pre data-codeblock="submission-${id}">${esc(d.algorithm ?? "")}</pre></div></div>
    ${showCurveBtn ? `<button class="btn primary" style="width:100%;margin-top:8px" data-action="goto-curve" data-sid="${esc(d.id ?? id)}">📈 查看进化曲线分析</button>` : ""}
  `);
}

/** 用户档案抽屉（/api/users/{id} + /submissions） */
async function openUserDrawer(uid) {
    openDrawer(`<div class="drawer-head"><h3>用户档案</h3><button class="drawer-close" data-action="close-drawer">×</button></div>
    <div class="loading-row"><span class="spinner"></span>加载中…</div>`);
    let u, subs = [];
    try {
        [u, subs] = await Promise.all([
            api(`/api/users/${uid}`),
            api(`/api/users/${uid}/submissions`).then(r => r.submissions ?? []).catch(() => []),
        ]);
    } catch (e) {
        openDrawer(`<div class="drawer-head"><h3>用户档案</h3><button class="drawer-close" data-action="close-drawer">×</button></div><div class="error-banner">加载失败：${esc(e.message)}</div>`);
        return;
    }
    const byProblem = new Map();
    for (const s of subs) {
        if (!byProblem.has(s.problem_key)) byProblem.set(s.problem_key, []);
        byProblem.get(s.problem_key).push(s);
    }
    const problemSections = [...byProblem.entries()].map(([key, list]) => {
        const p = state.problemMap.get(key);
        const asc = p ? p.ascend !== false : true;
        const objs = list.map(s => Number(s.objective)).filter(isFinite);
        const best = objs.length ? (asc ? Math.min(...objs) : Math.max(...objs)) : null;
        const rows = list.slice().sort((a, b) => (parseServerTime(b.created_at)?.getTime() ?? 0) - (parseServerTime(a.created_at)?.getTime() ?? 0)).map(s => `
      <tr class="clickable-row" data-action="open-sub" data-sid="${esc(s.id)}">
        <td class="mono">${esc(s.id)}</td>
        <td class="mono">${fmtObj(s.objective)}</td>
        <td>${srcBadge(s.model_source)} <span class="mono hint">${esc(s.llm_model || "")}</span></td>
        <td class="mono">${fmtTokens(s.total_tokens)}</td>
        <td class="mono hint">${fmtTime(s.created_at)}</td>
      </tr>`).join("");
        return `<div class="mine-head"><span class="mine-title">${esc(p?.name || key)}</span>
      ${best != null ? `<span class="mine-rank">个人最优 <b class="mono">${fmtObj(best)}</b></span>` : ""}</div>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th class="num">适应度</th><th>模型</th><th class="num">token</th><th>时间</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
    }).join("") || `<div class="empty"><div class="ico">🗂️</div>该用户暂无公开提交</div>`;
    openDrawer(`
    <div class="drawer-head"><h3>用户档案</h3><button class="drawer-close" data-action="close-drawer">×</button></div>
    <div class="user-cell" style="margin-bottom:12px">${avatarHTML(u)}
      <div class="u-name"><span class="u-main">${esc(u.display_name || u.username)}</span>
      <span class="u-sub mono">${esc(u.username)}</span></div></div>
    <div class="grid-2">
      <div class="kv"><span class="k">用户 ID</span><span class="mono">${esc(u.id)}</span></div>
      <div class="kv"><span class="k">角色</span><span class="badge ${u.role === "admin" ? "src-api" : "feature-badge"}">${u.role === "admin" ? "ADMIN" : "USER"}</span></div>
      <div class="kv"><span class="k">提交总数</span><span class="mono">${subs.length}</span></div>
      <div class="kv"><span class="k">参与赛道</span><span class="mono">${byProblem.size}</span></div>
    </div>
    ${problemSections}
  `);
}

/* ---------- 登录 / 注册弹窗 ---------- */
function openLoginModal() {
    const root = document.getElementById("modal-root");
    root.innerHTML = `
  <div class="modal-mask" data-action="modal-mask">
    <div class="modal" data-stop>
      <h3>登录 AHGS 平台</h3>
      <div class="tabs">
        <button class="chip on" data-tab="login">登录</button>
        <button class="chip" data-tab="register">注册</button>
      </div>
      <form id="login-form">
        <div class="field"><label>一卡通号 / 用户名</label><input name="username" autocomplete="username" required></div>
        <div class="field" id="dn-field" style="display:none"><label>昵称（display_name）</label><input name="display_name" autocomplete="nickname"></div>
        <div class="field"><label>密码</label><input name="password" type="password" autocomplete="current-password" required></div>
        <div class="field" id="cf-field" style="display:none"><label>确认密码</label><input name="confirm_password" type="password" autocomplete="new-password"></div>
        <label class="check-row"><input type="checkbox" name="agree" checked>我已阅读并同意平台《用户须知》</label>
        <div class="error-banner" id="login-err" style="display:none"></div>
        <button class="btn primary" style="width:100%" type="submit" id="login-submit">登录</button>
      </form>
    </div>
  </div>`;
    let mode = "login";
    root.querySelectorAll(".tabs .chip").forEach(btn => btn.addEventListener("click", () => {
        mode = btn.dataset.tab;
        root.querySelectorAll(".tabs .chip").forEach(b => b.classList.toggle("on", b === btn));
        document.getElementById("dn-field").style.display = mode === "register" ? "" : "none";
        document.getElementById("cf-field").style.display = mode === "register" ? "" : "none";
        document.getElementById("login-submit").textContent = mode === "register" ? "注册并登录" : "登录";
    }));
    document.getElementById("login-form").addEventListener("submit", async ev => {
        ev.preventDefault();
        const errEl = document.getElementById("login-err");
        errEl.style.display = "none";
        const f = ev.target;
        const username = f.username.value.trim(),
            password = f.password.value;
        if (!f.agree.checked) {
            errEl.textContent = "请先阅读并同意《用户须知》";
            errEl.style.display = "";
            return;
        }
        const btn = document.getElementById("login-submit");
        btn.disabled = true;
        try {
            if (mode === "register") {
                if (password !== f.confirm_password.value) throw new Error("两次输入的密码不一致");
                await api("/api/auth/register", {
                    method: "POST",
                    body: {
                        username,
                        display_name: f.display_name.value.trim(),
                        password,
                        confirm_password: f.confirm_password.value,
                        agree_terms: true
                    }
                });
            }
            const r = await api("/api/auth/login", {
                method: "POST",
                body: {
                    username,
                    password,
                    agree_terms: true
                }
            });
            setSession(r.access_token, r.user);
            root.innerHTML = "";
            toast(`欢迎，${fullName(r.user || {})}`, "ok");
            render(); // 刷新当前视图（如“我的”页）
        } catch (e) {
            errEl.textContent = e.message;
            errEl.style.display = "";
        } finally {
            btn.disabled = false;
        }
    });
}

/* ---------- 设置气泡 ---------- */
function openSettingsPopover() {
    const old = document.getElementById("settings-pop");
    if (old) {
        old.remove();
        return;
    }
    const pop = document.createElement("div");
    pop.className = "popover";
    pop.id = "settings-pop";
    pop.style.right = "16px";
    pop.style.top = "58px";
    pop.innerHTML = `
    <h4>接口设置</h4>
    <div class="field"><label>API 基地址</label><input id="set-api" value="${esc(apiBase())}" placeholder="${DEFAULT_API}"></div>
    <div class="hint" style="margin:4px 0 10px">默认 ${esc(DEFAULT_API)}；若本页与平台同域部署，可填相对地址（留空同域）。</div>
    <div style="display:flex;gap:8px">
      <button class="btn primary" id="set-save" style="flex:1">保存并测试</button>
      <button class="btn" id="set-reset">恢复默认</button>
    </div>
    <div class="hint" id="set-result" style="margin-top:8px"></div>`;
    document.body.appendChild(pop);
    const close = ev => {
        if (!pop.contains(ev.target) && ev.target.id !== "btn-settings") {
            pop.remove();
            document.removeEventListener("click", close);
        }
    };
    setTimeout(() => document.addEventListener("click", close), 0);
    pop.querySelector("#set-reset").addEventListener("click", () => {
        localStorage.removeItem(LS.api);
        location.reload();
    });
    pop.querySelector("#set-save").addEventListener("click", async () => {
        const v = pop.querySelector("#set-api").value.trim().replace(/\/+$/, "");
        const res = pop.querySelector("#set-result");
        if (v) localStorage.setItem(LS.api, v);
        else localStorage.removeItem(LS.api);
        res.textContent = "测试连接中…";
        try {
            await api("/api/problems");
            res.textContent = "✅ 连接成功";
            document.getElementById("footer-api").textContent = apiBase();
            setTimeout(() => location.reload(), 500);
        } catch (e) {
            res.textContent = "❌ " + e.message;
        }
    });
}

/* ---------- 顶栏用户区 ---------- */
function renderUserSlot() {
    const slot = document.getElementById("user-slot");
    const u = getStoredUser();
    if (!u) {
        slot.innerHTML = `<button class="btn-login" data-action="open-login">登录 / 注册</button>`;
        return;
    }
    slot.innerHTML = `<div class="user-chip link-ish" data-action="open-me" title="点击查看我的空间">${avatarHTML(u)}<b>${esc(fullName(u))}</b></div>`;
}

/* ---------- 路由 ---------- */
// 视图函数定义在 views.js / views2.js（后加载），这里用惰性查找避免加载顺序问题
function getRoute(name) {
    return {
        dashboard: viewDashboard,
        leaderboard: viewLeaderboard,
        live: viewLive,
        curve: viewCurve,
        compare: viewCompare,
        mine: viewMine,
        evo: viewEvo,
        cprob: viewCprob,
    } [name];
}

function parseHash() {
    const h = location.hash.replace(/^#\/?/, "");
    const [name, qs] = h.split("?");
    const params = new URLSearchParams(qs || "");
    return {
        name: getRoute(name) ? name : "dashboard",
        params
    };
}

function navHash(name, params) {
    const q = params instanceof URLSearchParams && [...params].length ? "?" + params.toString() : "";
    location.hash = "#/" + name + q;
}

function render() {
    clearTimers();
    closeDrawer();
    state.route = parseHash();
    document.querySelectorAll("#main-nav a").forEach(a => a.classList.toggle("on", a.dataset.nav === state.route.name));
    const view = document.getElementById("view");
    view.innerHTML = `<div class="loading-row"><span class="spinner"></span>加载中…</div>`;
    getRoute(state.route.name)(view, state.route.params).catch(e => {
        view.innerHTML = `<div class="card"><div class="error-banner">页面加载失败：${esc(e.message)}</div>
      <button class="btn" onclick="location.reload()">重新加载</button></div>`;
    });
}

/* ---------- 全局事件委托 ---------- */
document.addEventListener("click", ev => {
    const el = ev.target.closest("[data-action]");
    if (!el) return;
    const act = el.dataset.action;
    if (act === "close-drawer") closeDrawer();
    else if (act === "open-user") {
        ev.stopPropagation();
        openUserDrawer(el.dataset.uid);
    } else if (act === "open-sub") {
        ev.stopPropagation();
        openSubmissionDrawer(el.dataset.sid);
    } else if (act === "open-login") openLoginModal();
    else if (act === "open-me") navHash("mine");
    else if (act === "copy") {
        const pre = document.querySelector(`[data-codeblock="${el.dataset.code}"]`);
        if (pre) copyText(pre.textContent);
    } else if (act === "goto-curve") navHash("curve", new URLSearchParams({
        id: el.dataset.sid
    }));
    else if (act === "modal-mask") {
        if (ev.target.dataset.action === "modal-mask") document.getElementById("modal-root").innerHTML = "";
    }
});
document.getElementById("drawer-mask").addEventListener("click", closeDrawer);
document.addEventListener("keydown", ev => {
    if (ev.key === "Escape") {
        closeDrawer();
        document.getElementById("modal-root").innerHTML = "";
    }
});
document.getElementById("btn-theme").addEventListener("click", () =>
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
document.getElementById("btn-settings").addEventListener("click", openSettingsPopover);
window.addEventListener("hashchange", render);

/* ---------- 启动 ---------- */
async function boot() {
    applyTheme(localStorage.getItem(LS.theme) || "dark");
    renderUserSlot();
    // 头像图加载失败 → 回退显示首字母
    document.addEventListener("error", (e) => {
        const img = e.target;
        if (img && img.tagName === "IMG" && img.parentElement && img.parentElement.classList.contains("avatar")) {
            img.style.display = "none";
            const span = img.parentElement;
            if (!span.dataset.fallbackDone) {
                span.dataset.fallbackDone = "1";
                span.insertAdjacentHTML("beforeend", `<b style="font-weight: 800">${esc(span.dataset.initial || "?")}</b>`);
            }
        }
    }, true);
    document.getElementById("footer-api").textContent = apiBase();
    try {
        const r = await api("/api/problems");
        state.problems = r.problems ?? [];
        state.problemMap = new Map(state.problems.map(p => [p.key, p]));
    } catch (e) {
        document.getElementById("view").innerHTML = `<div class="card"><div class="error-banner">
      无法连接平台接口（${esc(apiBase())}）：${esc(e.message)}</div>
      <p class="hint">请确认平台已启动，或点击右上角 ⚙ 修改接口地址。</p></div>`;
        return;
    }
    render();
    // 已登录时刷新一次用户信息
    if (getToken()) api("/api/auth/me").then(u => setSession(null, u)).catch(() => {});
}
