<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { api, apiBase, getToken, isTokenExpired, getTokenExpiry, ApiError } from "./lib/api";
import { DEFAULT_API, LS } from "./lib/constants";
import { store, applyTheme, closeDrawer, setSession, clearSession, logout, toast } from "./lib/store";
import { route, getView, navHash, parseHash } from "./lib/router";
import { fullName } from "./lib/format";
import { APP_VERSION } from "./lib/version";
import Avatar from "./components/Avatar.vue";
import LoginModal from "./components/LoginModal.vue";
import DrawerHost from "./components/drawers/DrawerHost.vue";

const ready = ref(false);
const bootErr = ref("");
const settingsOpen = ref(false);
const userMenuOpen = ref(false);
const apiInput = ref(apiBase());
const apiMsg = ref("");
const year = new Date().getFullYear();
const REPO_URL = "https://github.com/rickylxw/AHGS_NOVA";

const navItems = [
    { name: "dashboard", label: "总览" },
    { name: "leaderboard", label: "排行榜" },
    { name: "live", label: "实时流" },
    { name: "evo", label: "进化" },
    { name: "cprob", label: "自定义问题" },
    { name: "curve", label: "进化分析" },
    { name: "compare", label: "对比" },
    { name: "mine", label: "我的" },
];

const currentView = computed(() => getView(route.name));
const routeKey = computed(
    () =>
        route.name +
        ":" +
        (route.params.get("id") ?? "") +
        ":" +
        (route.params.get("run") ?? "") +
        ":" +
        (store.viewVer ?? 0)
);

onMounted(async () => {
    applyTheme(store.theme);
    // 启动即校验本地 JWT：已过期直接清除会话并引导重新登录（不等首个 401）
    if (isTokenExpired()) {
        clearSession();
        toast("登录已过期，请重新登录", "err");
        store.loginModal = true;
    }
    try {
        const r = await api("/api/problems");
        store.problems = r.problems ?? [];
    } catch (e) {
        bootErr.value = e.message;
        ready.value = true;
        return;
    }
    ready.value = true;
    if (getToken()) {
        api("/api/auth/me")
            .then(u => {
                setSession(null, u);
                store.user = u;
            })
            .catch(() => { });
    }
});

// 同步登录用户到 store（供门控判断）
watch(
    () => store.user,
    u => {
        if (u) store.viewVer = (store.viewVer || 0) + 1;
    }
);

function toggleTheme() {
    store.theme = store.theme === "dark" ? "light" : "dark";
    applyTheme(store.theme);
}

async function saveApi() {
    const v = apiInput.value.trim().replace(/\/+$/, "");
    if (v) localStorage.setItem(LS.api, v);
    else localStorage.removeItem(LS.api);
    apiMsg.value = "测试连接中…";
    try {
        await api("/api/problems");
        apiMsg.value = "✅ 连接成功";
        setTimeout(() => location.reload(), 500);
    } catch (e) {
        apiMsg.value = "❌ " + e.message;
    }
}

function resetApi() {
    localStorage.removeItem(LS.api);
    location.reload();
}

/* ---------- 用户菜单 / 退出登录 ---------- */
function toggleUserMenu() {
    userMenuOpen.value = !userMenuOpen.value;
}

function goMine() {
    userMenuOpen.value = false;
    navHash("mine");
}

function doLogout() {
    userMenuOpen.value = false;
    logout();
    toast("已退出登录");
}

/** token 过期（带 token 的请求返回 401）时自动登出并引导重新登录 */
function onSessionExpired() {
    if (!store.user) return; // 避免并发 401 重复提示
    clearSession();
    store.viewVer = (store.viewVer || 0) + 1;
    userMenuOpen.value = false;
    toast("登录已过期，请重新登录", "err");
    store.loginModal = true;
}

const onKey = ev => {
    if (ev.key === "Escape") {
        closeDrawer();
        store.loginModal = false;
        settingsOpen.value = false;
        userMenuOpen.value = false;
    }
};
const onClick = ev => {
    if (settingsOpen.value && !ev.target.closest(".popover") && !ev.target.closest(".icon-btn"))
        settingsOpen.value = false;
    if (userMenuOpen.value && !ev.target.closest(".popover") && !ev.target.closest(".user-chip"))
        userMenuOpen.value = false;
};
let expireTimer = null;
onMounted(() => {
    window.addEventListener("ahgs:session-expired", onSessionExpired);
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    // 每 30s 检查一次本地 JWT 是否过期（页面长期驻留时的主动登出）
    expireTimer = setInterval(() => {
        if (store.user && getTokenExpiry() != null && Date.now() >= getTokenExpiry()) onSessionExpired();
    }, 30000);
});
onUnmounted(() => {
    window.removeEventListener("ahgs:session-expired", onSessionExpired);
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("click", onClick);
    if (expireTimer) clearInterval(expireTimer);
});
</script>

<template>
    <div id="bg-glow" aria-hidden="true"></div>
    <header id="topbar">
        <a class="brand" href="#/dashboard">
            <span class="brand-mark" aria-hidden="true">
                <svg viewBox="0 0 32 32" width="22" height="22">
                    <path d="M5 24 L12 9 L17 19 L21 12 L27 24" stroke="currentColor" stroke-width="3" fill="none"
                        stroke-linecap="round" stroke-linejoin="round" />
                </svg>
            </span>
            <span class="brand-text">AHGS<em>NOVA</em></span>
            <span class="brand-sub">Vue SFC</span>
        </a>
        <nav id="main-nav">
            <a v-for="item in navItems" :key="item.name" :href="'#/' + item.name"
                :class="{ on: route.name === item.name }">{{ item.label }}</a>
        </nav>
        <div class="topbar-right">
            <button class="icon-btn" title="接口设置" @click="settingsOpen = !settingsOpen">
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round">
                    <circle cx="12" cy="12" r="3" />
                    <path
                        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
            </button>
            <button class="icon-btn" title="切换主题" @click="toggleTheme">
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round">
                    <template v-if="store.theme === 'dark'">
                        <circle cx="12" cy="12" r="4" />
                        <path
                            d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                    </template>
                    <template v-else>
                        <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
                    </template>
                </svg>
            </button>
            <button v-if="!store.user" class="btn-login" @click="store.loginModal = true">登录 / 注册</button>
            <div v-else class="user-chip link-ish" title="账户菜单" @click="toggleUserMenu">
                <Avatar :user="store.user" :size="26" /><b>{{ fullName(store.user) }}</b>
            </div>
        </div>
        <div v-if="settingsOpen" class="popover" style="right: 16px; top: 58px" @click.stop>
            <h4>接口设置 <span class="hint">{{ APP_VERSION }}</span></h4>
            <div class="field">
                <label>API 基地址</label>
                <input v-model="apiInput" :placeholder="DEFAULT_API" />
            </div>
            <div class="hint" style="margin: 4px 0 10px">默认 {{ DEFAULT_API }}；若本页与平台同域部署，可填相对地址。</div>
            <div style="display: flex; gap: 8px">
                <button class="btn primary" style="flex: 1" @click="saveApi">保存并测试</button>
                <button class="btn" @click="resetApi">恢复默认</button>
            </div>
            <div class="hint" style="margin-top: 8px">{{ apiMsg }}</div>
        </div>
        <div v-if="userMenuOpen && store.user" class="popover" style="right: 16px; top: 58px" @click.stop>
            <h4>账户</h4>
            <div class="user-cell" style="margin-bottom: 12px">
                <Avatar :user="store.user" />
                <div class="u-name">
                    <span class="u-main">{{ fullName(store.user) }}</span>
                    <span class="u-sub mono">{{ store.user.username }}</span>
                </div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px">
                <button class="btn" @click="goMine">👤 我的空间</button>
                <button class="btn danger" @click="doLogout">🚪 退出登录</button>
            </div>
        </div>
    </header>

    <main id="view" class="view">
        <div v-if="!ready" class="card">
            <div class="loading-row"><span class="spinner"></span>加载中…</div>
        </div>
        <div v-else-if="bootErr" class="card">
            <div class="error-banner">无法连接平台接口（{{ apiBase() }}）：{{ bootErr }}</div>
            <p class="hint">请确认平台已启动，或点击右上角 ⚙ 修改接口地址。</p>
        </div>
        <component v-else :is="currentView" :params="route.params" :key="routeKey" />
    </main>

    <footer id="footer">
        <span>AHGS NOVA · Vue SFC 版 {{ APP_VERSION }} · 基于平台公开接口构建</span>
        <span>© {{ year }} Rickylxw, Midairlogn ·
            <a :href="REPO_URL" target="_blank" rel="noopener">GitHub</a> · GPLv3</span>
        <span id="footer-api" class="mono"><a :href="apiBase()" target="_blank" rel="noopener">{{ apiBase()
        }}</a></span>
    </footer>

    <DrawerHost />
    <LoginModal v-if="store.loginModal" />

    <div class="toast-root" aria-live="polite">
        <div v-for="t in store.toasts" :key="t.id" class="toast" :class="t.kind">{{ t.msg }}</div>
    </div>
</template>
