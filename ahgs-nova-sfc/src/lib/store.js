/* ============ AHGS NOVA · 响应式全局状态与全局动作 ============ */
import { reactive } from "vue";
import { LS } from "./constants";
import { getStoredUser } from "./api";

export const store = reactive({
    problems: [],
    theme: localStorage.getItem(LS.theme) || "dark",
    user: getStoredUser(),
    /** 登录/登出等会改变全局数据的动作 +1，强制重建路由视图 */
    viewVer: 0,
    /** 抽屉：{ comp, props } 或 null */
    drawer: null,
    loginModal: false,
    toasts: [],
});

let toastSeq = 0;

export function toast(msg, kind = "") {
    const id = ++toastSeq;
    store.toasts.push({ id, msg, kind });
    setTimeout(() => {
        const i = store.toasts.findIndex(t => t.id === id);
        if (i >= 0) store.toasts.splice(i, 1);
    }, 2600);
}

export function setSession(token, user) {
    if (token) localStorage.setItem(LS.token, token);
    if (user) {
        localStorage.setItem(LS.user, JSON.stringify(user));
        store.user = user;
    }
}

export function clearSession() {
    localStorage.removeItem(LS.token);
    localStorage.removeItem(LS.user);
    store.user = null;
}

/** 主动退出登录：清空会话并强制路由视图重建（受登录门控的页面会显示登录提示） */
export function logout() {
    clearSession();
    store.viewVer = (store.viewVer || 0) + 1;
}

/* ---------- 抽屉动作 ---------- */
export function openSubmissionDrawer(id) {
    store.drawer = { comp: "sub-detail", props: { sid: String(id) } };
}

export function openUserDrawer(uid) {
    store.drawer = { comp: "user-profile", props: { uid } };
}

export function openHeurDrawer(h, gen, idx) {
    store.drawer = { comp: "heur-detail", props: { h, gen, idx } };
}

export function closeDrawer() {
    store.drawer = null;
}

/* ---------- 主题 ---------- */
export function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(LS.theme, theme);
}
