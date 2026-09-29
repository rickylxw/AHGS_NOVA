/* ============ AHGS NOVA · hash 路由 ============ */
import { reactive } from "vue";

import DashboardView from "../views/DashboardView.vue";
import LeaderboardView from "../views/LeaderboardView.vue";
import LiveView from "../views/LiveView.vue";
import EvoView from "../views/EvoView.vue";
import CprobView from "../views/CprobView.vue";
import CurveView from "../views/CurveView.vue";
import CompareView from "../views/CompareView.vue";
import MineView from "../views/MineView.vue";

const VIEWS = {
    dashboard: DashboardView,
    leaderboard: LeaderboardView,
    live: LiveView,
    evo: EvoView,
    cprob: CprobView,
    curve: CurveView,
    compare: CompareView,
    mine: MineView,
};

export const route = reactive({
    name: "dashboard",
    params: new URLSearchParams(),
});

export function getView(name) {
    return VIEWS[name] || null;
}

export function parseHash() {
    const h = location.hash.replace(/^#\/?/, "");
    const [name, qs] = h.split("?");
    return {
        name: VIEWS[name] ? name : "dashboard",
        params: new URLSearchParams(qs || ""),
    };
}

export function navHash(name, params) {
    const q = params instanceof URLSearchParams && [...params].length ? "?" + params.toString() : "";
    location.hash = "#/" + name + q;
}

/** 跳转到某次提交的曲线分析页（模板里不能直接 new URLSearchParams —— 编译器会加 _ctx. 前缀） */
export function navToCurve(id) {
    if (id == null || id === "") return;
    navHash("curve", new URLSearchParams({ id: String(id) }));
}

export function initRouter() {
    Object.assign(route, parseHash());
    window.addEventListener("hashchange", () => Object.assign(route, parseHash()));
}
