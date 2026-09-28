/* ============ AHGS NOVA 视图层 ============ */
"use strict";

const FW_CHIPS = [{
    key: "ahg",
    label: "AHG 全部",
    types: ["eoh_nseh", "calm"]
}, {
    key: "eoh_nseh",
    label: "EoH(NSEH)",
    types: ["eoh_nseh"]
}, {
    key: "calm",
    label: "CALM",
    types: ["calm"]
}, {
    key: "custom",
    label: "自定义",
    types: ["custom"]
}, ];
const SRC_CHIPS = [{
    key: "api",
    label: "API"
}, {
    key: "local",
    label: "本地LLM"
}];

function fwFilter(selected, onToggle) {
    return `<div class="chip-row">${FW_CHIPS.map(c =>
    `<button class="chip ${selected.has(c.key) ? "on" : ""}" data-fw="${c.key}">${c.label}</button>`).join("")}</div>`;
}

function srcFilter(selected) {
    return `<div class="chip-row">${SRC_CHIPS.map(c =>
    `<button class="chip ${selected.has(c.key) ? "on" : ""}" data-src="${c.key}">${c.label}</button>`).join("")}</div>`;
}

function bindChips(container, attr, set, onChange) {
    container.querySelectorAll(`[data-${attr}]`).forEach(btn => btn.addEventListener("click", () => {
        const k = btn.dataset[attr];
        set.has(k) ? set.delete(k) : set.add(k);
        btn.classList.toggle("on", set.has(k));
        onChange();
    }));
}

function emptyHTML(icon, desc) {
    return `<div class="empty"><div class="ico">${icon}</div>${esc(desc)}</div>`;
}

/* ==================== 总览 ==================== */
async function viewDashboard(view) {
    const recent = await api("/api/submissions/recent?limit=300").then(r => r.submissions ?? []).catch(() => []);
    const rankings = await Promise.all(state.problems.map(p =>
        api(`/api/ranking/${p.key}`).then(r => ({
            p,
            entries: r.entries ?? []
        })).catch(() => ({
            p,
            entries: []
        }))));

    const users = new Set(),
        tokensAll = [];
    for (const {
            entries
        }
        of rankings)
        for (const e of entries) {
            if (e.user_id != null) users.add(e.user_id);
            if (e.total_tokens != null) tokensAll.push(Number(e.total_tokens));
        }
    const sumTokens = tokensAll.reduce((a, b) => a + b, 0);

    // 最近 24h 活跃度（按小时）
    const now = Date.now(),
        buckets = [];
    for (let i = 23; i >= 0; i--) buckets.push({
        t: new Date(now - i * 3600e3),
        value: 0
    });
    for (const s of recent) {
        const d = parseServerTime(s.created_at);
        const idx = buckets.findIndex(b => d >= b.t && d < new Date(b.t.getTime() + 3600e3));
        if (idx >= 0) buckets[idx].value++;
    }

    const srcSegs = [{
        label: "API 模型",
        value: recent.filter(s => s.model_source === "api").length,
        color: "#fbbf24"
    }, {
        label: "本地 LLM",
        value: recent.filter(s => s.model_source === "local").length,
        color: "#22d3ee"
    }, ];
    const fwSegs = ["eoh_nseh", "calm", "custom"].map((ft, i) => ({
        label: FW_LABEL[ft],
        value: recent.filter(s => s.framework_type === ft).length,
        color: PALETTE[i],
    }));

    const podiums = rankings.map(({
        p,
        entries
    }) => {
        const top = entries.slice(0, 3);
        return `<div class="podium-item-card">
      <div class="mine-head" style="margin:0 0 8px"><span class="mine-title">${esc(p.name)}</span>
        <a class="hint" href="#/leaderboard?problem=${esc(p.key)}">查看完整榜 →</a></div>
      ${top.length ? `<div class="podium">${top.map(e => `
        <div class="podium-item p${e.rank}">
          <div class="user-cell" style="min-width:0"><span class="link-ish" data-action="open-user" data-uid="${esc(e.user_id)}">${avatarHTML(e)}</span>
            <div class="u-name"><span class="u-main" style="font-size:13.5px">${esc(fullName(e))}</span></div></div>
          <div class="obj mono">${fmtObj(e.best_objective)}</div>
          ${fwBadge(e.framework_type)}
        </div>`).join("")}</div>` : `<div class="hint">暂无参赛记录</div>`}
    </div>`;
    }).join("");

    const feedRows = recent.slice(0, 8).map(s => `
    <tr class="clickable-row" data-action="open-sub" data-sid="${esc(s.id)}">
      <td>${userCellHTML(s)}</td>
      <td>${esc(s.problem_name || s.problem_key)}</td>
      <td>${fwBadge(s.framework_type)}</td>
      <td class="mono">${fmtObj(s.objective)}</td>
      <td class="mono hint">${fmtTime(s.created_at)}</td>
    </tr>`).join("");

    view.innerHTML = `
    <div class="grid cols-4">
      <div class="stat"><div class="k">参赛赛道</div><div class="v">${state.problems.length}</div><div class="s">${esc(state.problems.map(p => p.name.split(" ")[0]).join(" / "))}</div></div>
      <div class="stat"><div class="k">上榜选手</div><div class="v">${users.size}</div><div class="s">各赛道排行榜去重用户</div></div>
      <div class="stat"><div class="k">近期提交</div><div class="v">${recent.length}</div><div class="s">最近提交流样本</div></div>
      <div class="stat"><div class="k">累计 token</div><div class="v">${fmtTokens(sumTokens)}</div><div class="s">上榜记录 token 之和</div></div>
    </div>
    <div class="card">
      <h2>提交活跃度 <span class="tail">最近 24 小时 · 每小时提交数</span></h2>
      <div class="chart-box">${barChartSVG(buckets.map(b => ({
        label: b.t.getHours() + "时", value: b.value, tip: b.t.toLocaleString("zh-CN", { hour: "2-digit" }) + ":00",
      })))}</div>
    </div>
    <div class="grid cols-2">
      <div class="card"><h2>模型来源分布 <span class="tail">近期提交</span></h2><div class="chart-box">${donutSVG(srcSegs)}</div></div>
      <div class="card"><h2>框架分布 <span class="tail">近期提交</span></h2><div class="chart-box">${donutSVG(fwSegs)}</div></div>
    </div>
    <div class="card"><h2>各赛道前三 <span class="tail">点击头像查看用户档案</span></h2><div class="grid cols-2">${podiums}</div></div>
    <div class="card">
      <h2>最新提交 <a class="tail" href="#/live">进入实时流 →</a></h2>
      <div class="table-wrap"><table><thead><tr><th>用户</th><th>问题</th><th>框架</th><th class="num">适应度</th><th>时间</th></tr></thead>
      <tbody>${feedRows || emptyHTML("🛰️", "暂无提交")}</tbody></table></div>
    </div>`;
}

/* ==================== 排行榜 ==================== */
async function viewLeaderboard(view, params) {
    let problemKey = params.get("problem") && state.problemMap.has(params.get("problem")) ? params.get("problem") : (state.problems[0]?.key ?? "");
    const local = {
        fw: new Set(),
        src: new Set(),
        sort: "score",
        q: "",
        barView: false,
        auto: false,
        entries: [],
        ascend: true,
        loading: true
    };

    view.innerHTML = `<div class="card">
    <h2>排行榜 <span class="tail" id="lb-meta"></span></h2>
    <div class="toolbar">
      <div class="field" style="min-width:230px"><label>问题情景</label>
        <select id="lb-problem">${state.problems.map(p => `<option value="${esc(p.key)}">${esc(p.name)}</option>`).join("")}</select></div>
      <div class="field"><label>框架筛选</label>${fwFilter(local.fw)}</div>
      <div class="field"><label>来源筛选</label>${srcFilter(local.src)}</div>
      <div class="field" style="min-width:150px"><label>排序</label>
        <select id="lb-sort">
          <option value="score">按最优适应度</option>
          <option value="time">按最近提交</option>
          <option value="token">按 token 消耗</option>
        </select></div>
      <div class="field" style="min-width:170px"><label>搜索用户</label>
        <input id="lb-q" placeholder="昵称 / 一卡通号"></div>
      <div class="field"><label>&nbsp;</label><div class="chip-row">
        <button class="chip" id="lb-view">📊 条形图</button>
        <button class="chip" id="lb-auto">⟳ 自动刷新</button>
        <button class="chip" id="lb-csv">⬇ 导出 CSV</button>
      </div></div>
    </div>
    <div id="lb-body"><div class="loading-row"><span class="spinner"></span>加载中…</div></div>
  </div>`;

    const $ = sel => view.querySelector(sel.includes("#") ? sel : "#" + sel);
    $("select#lb-problem").value = problemKey;

    async function load() {
        local.loading = true;
        const qs = new URLSearchParams();
        const types = [...local.fw].flatMap(k => FW_CHIPS.find(c => c.key === k).types).join(",");
        if (types) qs.set("framework_types", types);
        const srcs = [...local.src].join(",");
        if (srcs) qs.set("model_sources", srcs);
        $("lb-body").innerHTML = `<div class="loading-row"><span class="spinner"></span>加载中…</div>`;
        try {
            const r = await api(`/api/ranking/${problemKey}${qs.toString() ? "?" + qs : ""}`);
            local.entries = r.entries ?? [];
            local.ascend = r.ascend !== false;
        } catch (e) {
            $("lb-body").innerHTML = `<div class="error-banner">加载失败：${esc(e.message)}</div>`;
            return;
        }
        local.loading = false;
        paint();
    }

    function visibleEntries() {
        let list = local.entries;
        const q = local.q.trim().toLowerCase();
        if (q) list = list.filter(e => (e.username || "").toLowerCase().includes(q) || (e.display_name || "").toLowerCase().includes(q));
        if (local.sort === "time") list = [...list].sort((a, b) => (parseServerTime(b.best_submitted_at)?.getTime() ?? 0) - (parseServerTime(a.best_submitted_at)?.getTime() ?? 0));
        else if (local.sort === "token") list = [...list].sort((a, b) => (b.total_tokens ?? -1) - (a.total_tokens ?? -1));
        return list;
    }

    function paint() {
        const list = visibleEntries();
        const p = state.problemMap.get(problemKey);
        $("lb-meta").textContent = `${list.length} 人上榜 · 适应度${local.ascend ? "越小" : "越大"}越好${local.fw.size || local.src.size ? " · 已按筛选过滤" : ""}`;
        if (!list.length) {
            $("lb-body").innerHTML = emptyHTML("🏁", "暂无参赛记录");
            return;
        }

        if (local.barView) {
            const top = list.slice(0, 15);
            $("lb-body").innerHTML = hbarListHTML(top.map(e => ({
                rank: e.rank,
                label: fullName(e),
                sub: `${e.username ?? ""} · ${FW_LABEL[e.framework_type] || "AHG"} · ${e.llm_model ?? ""}`,
                value: Number(e.best_objective),
                fmt: fmtObj(e.best_objective),
                submissionId: e.submission_id,
                userId: e.user_id,
            })));
            $("lb-body").querySelectorAll(".hbar-row").forEach(row => {
                row.style.cursor = "pointer";
                row.addEventListener("click", () => {
                    if (row.dataset.sid) openSubmissionDrawer(row.dataset.sid);
                    else if (row.dataset.uid) openUserDrawer(row.dataset.uid);
                });
            });
            return;
        }

        const rows = list.map(e => `
      <tr class="clickable-row ${e.rank <= 3 ? "rank-top3" : ""}" data-action="open-sub" data-sid="${esc(e.submission_id)}">
        <td class="num">${medalHTML(e.rank)}</td>
        <td>${userCellHTML(e)}</td>
        <td>${fwBadge(e.framework_type)}</td>
        <td>${srcBadge(e.model_source)}</td>
        <td class="mono hint">${esc(e.llm_model || "—")}</td>
        <td class="num mono">${fmtObj(e.best_objective)}</td>
        <td class="num mono">${fmtTokens(e.total_tokens)}</td>
        <td class="mono hint" title="${esc(e.best_submitted_at || "")}">${fmtTime(e.best_submitted_at)}</td>
        <td><button class="btn small" data-action="goto-curve" data-sid="${esc(e.submission_id)}">曲线</button></td>
      </tr>`).join("");
        $("lb-body").innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th class="num">名次</th><th>用户</th><th>框架</th><th>来源</th><th>模型</th>
      <th class="num">最优适应度</th><th class="num">所耗 token</th><th>最近提交</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
    }

    $("select#lb-problem").addEventListener("change", e => {
        problemKey = e.target.value;
        try {
            history.replaceState(null, "", "#/leaderboard?problem=" + encodeURIComponent(problemKey));
        } catch {}
        load();
    });
    $("select#lb-sort").addEventListener("change", e => {
        local.sort = e.target.value;
        paint();
    });
    $("input#lb-q").addEventListener("input", e => {
        local.q = e.target.value;
        paint();
    });
    bindChips(view, "fw", local.fw, load);
    bindChips(view, "src", local.src, load);
    $("lb-view").addEventListener("click", () => {
        local.barView = !local.barView;
        $("lb-view").classList.toggle("on", local.barView);
        paint();
    });
    $("lb-auto").addEventListener("click", () => {
        local.auto = !local.auto;
        $("lb-auto").classList.toggle("on", local.auto);
        if (local.auto) addTimer(setInterval(load, 10000));
        else clearTimers();
    });
    $("lb-csv").addEventListener("click", () => {
        const list = visibleEntries();
        if (!list.length) {
            toast("没有可导出的数据", "err");
            return;
        }
        const head = "rank,user_id,username,display_name,framework_type,llm_model,model_source,best_objective,total_tokens,best_submitted_at,submission_id";
        const lines = list.map(e => [e.rank, e.user_id, e.username, e.display_name, e.framework_type, e.llm_model, e.model_source, e.best_objective, e.total_tokens ?? "", e.best_submitted_at ?? "", e.submission_id ?? ""]
            .map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
        downloadText(`ranking_${problemKey}_${new Date().toISOString().slice(0, 10)}.csv`, [head, ...lines].join("\n"));
        toast(`已导出 ${list.length} 条记录`, "ok");
    });

    await load();
}

/* ==================== 实时提交流 ==================== */
async function viewLive(view) {
    const local = {
        fw: new Set(),
        src: new Set(),
        sort: "time",
        problem: "",
        paused: false,
        subs: [],
        seen: new Set()
    };

    view.innerHTML = `<div class="card">
    <h2>实时提交流 <span class="tail">全赛道 · 全用户 · 每 4 秒自动刷新 · <button class="chip on" id="lv-pause" style="padding:1px 10px">⏸ 暂停</button></span></h2>
    <div class="toolbar">
      <div class="field" style="min-width:230px"><label>问题情景</label>
        <select id="lv-problem"><option value="">全部问题</option>${state.problems.map(p => `<option value="${esc(p.key)}">${esc(p.name)}</option>`).join("")}</select></div>
      <div class="field"><label>框架筛选</label>${fwFilter(local.fw)}</div>
      <div class="field"><label>来源筛选</label>${srcFilter(local.src)}</div>
      <div class="field" style="min-width:160px"><label>排序</label>
        <select id="lv-sort">
          <option value="time">按时间（最新）</option>
          <option value="score">按适应度</option>
          <option value="token">按 token 消耗</option>
        </select></div>
    </div>
    <div id="lv-body"><div class="loading-row"><span class="spinner"></span>加载中…</div></div>
  </div>`;

    const $ = sel => view.querySelector(sel.includes("#") ? sel : "#" + sel);

    async function load() {
        const qs = new URLSearchParams({
            limit: "60"
        });
        if (local.problem) qs.set("problem_key", local.problem);
        const types = [...local.fw].flatMap(k => FW_CHIPS.find(c => c.key === k).types).join(",");
        if (types) qs.set("framework_types", types);
        const srcs = [...local.src].join(",");
        if (srcs) qs.set("model_sources", srcs);
        let subs = [];
        try {
            subs = (await api(`/api/submissions/recent?${qs}`)).submissions ?? [];
        } catch (e) {
            $("lv-body").innerHTML = `<div class="error-banner">加载失败：${esc(e.message)}</div>`;
            return;
        }
        const freshIds = new Set(subs.map(s => s.id).filter(id => !local.seen.has(id)));
        subs.forEach(s => local.seen.add(s.id));
        if (local.seen.size > 400) local.seen = new Set(subs.map(s => s.id));
        local.subs = subs;
        paint(freshIds);
    }

    function paint(freshIds = new Set()) {
        let list = local.subs;
        if (local.sort === "score") list = [...list].sort((a, b) => Number(a.objective) - Number(b.objective));
        else if (local.sort === "token") list = [...list].sort((a, b) => (b.total_tokens ?? -1) - (a.total_tokens ?? -1));
        if (!list.length) {
            $("lv-body").innerHTML = emptyHTML("🛰️", "暂无提交记录，去「AHG进化」跑一局吧");
            return;
        }
        const p = local.problem ? state.problemMap.get(local.problem) : null;
        const asc = p ? p.ascend !== false : true;
        if (local.sort === "score" && !asc) list.reverse();
        $("lv-body").innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>用户</th><th>问题</th><th>框架</th><th>来源</th><th>模型</th>
      <th class="num">适应度</th><th class="num">所耗 token</th><th>提交时间</th></tr></thead>
      <tbody>${list.map(s => `
        <tr class="clickable-row ${freshIds.has(s.id) ? "fresh-row" : ""}" data-action="open-sub" data-sid="${esc(s.id)}">
          <td>${userCellHTML(s)}</td>
          <td>${esc(s.problem_name || s.problem_key)}</td>
          <td>${fwBadge(s.framework_type)}</td>
          <td>${srcBadge(s.model_source)}</td>
          <td class="mono hint">${esc(s.llm_model || "—")}</td>
          <td class="num mono">${fmtObj(s.objective)}</td>
          <td class="num mono">${fmtTokens(s.total_tokens)}</td>
          <td class="mono hint" title="${esc(s.created_at || "")}">${fmtTime(s.created_at)}</td>
        </tr>`).join("")}</tbody></table></div>`;
    }

    $("select#lv-problem").addEventListener("change", e => {
        local.problem = e.target.value;
        load();
    });
    $("select#lv-sort").addEventListener("change", e => {
        local.sort = e.target.value;
        paint();
    });
    bindChips(view, "fw", local.fw, load);
    bindChips(view, "src", local.src, load);
    $("lv-pause").addEventListener("click", () => {
        local.paused = !local.paused;
        const btn = $("lv-pause");
        btn.textContent = local.paused ? "▶ 继续" : "⏸ 暂停";
        btn.classList.toggle("on", !local.paused);
    });
    addTimer(setInterval(() => {
        if (!local.paused) load();
    }, 4000));
    await load();
}

/* ==================== 曲线分析 ==================== */
async function viewCurve(view, params) {
    const sid = params.get("id") || "";
    const [recentPick, mySubs] = await Promise.all([
        api("/api/submissions/recent?limit=50").then(r => r.submissions ?? []).catch(() => []),
        getToken() ? api("/api/submissions/my").then(r => r.submissions ?? []).catch(() => []) : Promise.resolve([]),
    ]);
    const mySorted = mySubs.slice().sort((a, b) => (parseServerTime(b.created_at)?.getTime() ?? 0) - (parseServerTime(a.created_at)?.getTime() ?? 0));

    view.innerHTML = `<div class="card">
    <h2>进化曲线分析 <span class="tail">输入提交 ID，或从下拉中选择</span></h2>
    <div class="picker-row">
      <input class="input" id="cv-id" placeholder="提交 ID（如 28）" value="${esc(sid)}" style="max-width:200px">
      <select class="input" id="cv-pick" style="max-width:360px">
        <option value="">— 最近提交（全站）—</option>
        ${recentPick.map(s => `<option value="${esc(s.id)}">#${esc(s.id)} · ${esc(fullName(s))} · ${esc(s.problem_name || s.problem_key)} · ${fmtObj(s.objective)}</option>`).join("")}
      </select>
      <select class="input" id="cv-mine" style="max-width:360px">
        <option value="">— 我的提交 —</option>
        ${mySorted.map(s => `<option value="${esc(s.id)}">#${esc(s.id)} · ${esc(s.problem_name || s.problem_key)} · ${fmtObj(s.objective)} · ${fmtTime(s.created_at)}</option>`).join("")}
      </select>
      <button class="btn primary" id="cv-go">分析</button>
    </div>
    ${!getToken() ? `<div class="hint" style="margin-top:8px">登录后这里会多一个「我的提交」下拉，只列你自己的记录。</div>` : (mySorted.length ? "" : `<div class="hint" style="margin-top:8px">你还没有提交记录。</div>`)}
  </div>
  <div id="cv-body">${sid ? `<div class="loading-row"><span class="spinner"></span>加载中…</div>` :
    `<div class="card">${emptyHTML("🧬", "选择一个提交，查看它的完整进化过程：每代适应度曲线、种群规模与 token 消耗")}</div>`}</div>`;

    const $ = sel => view.querySelector(sel.includes("#") ? sel : "#" + sel);
    $("cv-pick").addEventListener("change", e => {
        if (e.target.value) {
            $("cv-id").value = e.target.value;
            analyze();
        }
    });
    $("cv-mine").addEventListener("change", e => {
        if (e.target.value) {
            $("cv-id").value = e.target.value;
            analyze();
        }
    });
    $("cv-go").addEventListener("click", analyze);
    $("cv-id").addEventListener("keydown", e => {
        if (e.key === "Enter") analyze();
    });
    if (sid) analyze();

    function tokOf(t) {
        if (t == null) return null;
        if (typeof t === "number") return t;
        if (typeof t === "object") return t.total_tokens ?? t.total ?? t.tokens ?? null;
        return null;
    }

    async function analyze() {
        const id = String($("cv-id").value).trim();
        if (!id) {
            toast("请先填写提交 ID", "err");
            return;
        }
        try {
            history.replaceState(null, "", "#/curve?id=" + encodeURIComponent(id));
        } catch {}
        $("cv-body").innerHTML = `<div class="card"><div class="loading-row"><span class="spinner"></span>正在拉取进化记录…</div></div>`;
        let rec;
        try {
            rec = await api(`/api/submissions/${id}/record`);
        } catch (e) {
            $("cv-body").innerHTML = `<div class="card">${e.status === 401 ? needLoginHTML("进化记录需要登录后查看") : `<div class="error-banner">加载失败：${esc(e.message)}</div>`}</div>`;
            return;
        }
        const inst = rec.instance,
            sub = rec.submission ?? {};
        if (!inst) {
            $("cv-body").innerHTML = `<div class="card">
        <div class="error-banner">该提交未关联进化任务（实例），因此没有种群快照，无法绘制曲线。</div>
        <p class="hint">通常原因：发起这次进化的前端在启动时没有创建实例（AHGS NOVA 旧版本的缺陷，现已修复——启动进化后会像原站一样自动创建实例）。
        若是历史遗留提交，可在「进化」页的我的进化记录中打开该 Run，点「💾 保存实例」补建实例后重新「🏆 提交最优」，新提交即可关联曲线。</p></div>`;
            return;
        }
        const cfg = inst.config ?? {};
        const asc = cfg.ascend !== false;
        const gens = (inst.population_snapshot ?? []).slice().sort((a, b) => (a.generation ?? 0) - (b.generation ?? 0));
        const statOf = g => {
            const objs = (g.heuristics ?? []).map(h => Number(h?.objective)).filter(isFinite);
            return {
                n: objs.length,
                best: objs.length ? (asc ? Math.min(...objs) : Math.max(...objs)) : null,
                avg: objs.length ? objs.reduce((a, b) => a + b, 0) / objs.length : null,
                worst: objs.length ? (asc ? Math.max(...objs) : Math.min(...objs)) : null,
                tok: tokOf(g.token_usage),
            };
        };
        const stats = gens.map(statOf);
        const xkey = g => g.generation ?? 0;
        const bestSeries = {
            name: "每代最优",
            color: "#22d3ee",
            points: stats.map((s, i) => ({
                x: xkey(gens[i]),
                y: s.best,
                label: "第 " + xkey(gens[i]) + " 代"
            })).filter(p => p.y != null)
        };
        const avgSeries = {
            name: "每代平均",
            color: "#a78bfa",
            dashed: true,
            points: stats.map((s, i) => ({
                x: xkey(gens[i]),
                y: s.avg,
                label: "第 " + xkey(gens[i]) + " 代"
            })).filter(p => p.y != null)
        };
        const anyTok = stats.some(s => s.tok != null);

        const cfgKv = inst.framework_type === "custom" ? `
      <div class="kv"><span class="k">框架文件</span><span class="mono">${esc(cfg.framework_filename || "framework.py")}</span></div>` : `
      <div class="kv"><span class="k">种群容量</span><span class="mono">${cfg.population_size ?? "—"}</span></div>
      <div class="kv"><span class="k">进化代数</span><span class="mono">${cfg.num_generations ?? "—"}</span></div>
      <div class="kv"><span class="k">突变数</span><span class="mono">${cfg.num_mutation ?? "—"}</span></div>
      <div class="kv"><span class="k">杂交数</span><span class="mono">${cfg.num_hybridization ?? "—"}</span></div>
      <div class="kv"><span class="k">反思数</span><span class="mono">${cfg.num_reflection ?? "—"}</span></div>`;

        const heurCount = stats.reduce((a, s) => a + s.n, 0);
        const tokTotal = stats.reduce((a, s) => a + (s.tok ?? 0), 0);
        const firstBest = bestSeries.points[0]?.y,
            finalBest = bestSeries.points.at(-1)?.y;
        let improve = null;
        if (firstBest != null && finalBest != null && firstBest !== 0) {
            improve = (asc ? (firstBest - finalBest) / Math.abs(firstBest) : (finalBest - firstBest) / Math.abs(firstBest)) * 100;
        }

        const genRows = gens.map((g, i) => {
            const s = stats[i];
            return `<tr>
        <td class="mono">${esc(g.generation ?? i)}</td><td class="num mono">${s.n}</td>
        <td class="num mono">${fmtObj(s.best)}</td><td class="num mono hint">${fmtObj(s.avg)}</td>
        <td class="num mono hint">${fmtObj(s.worst)}</td>
        <td class="num mono">${s.tok != null ? fmtTokens(s.tok) : "—"}</td></tr>`;
        }).join("");

        // 种群个体明细：每代每个启发式的思想 / 关键词 / 算法代码
        const popDetail = gens.map((g, gi) => {
            const heurs = (g.heuristics ?? []).slice().sort((a, b) => {
                const x = Number(a?.objective),
                    y = Number(b?.objective);
                const fx = isFinite(x),
                    fy = isFinite(y);
                if (!fx && !fy) return 0;
                if (!fx) return 1;
                if (!fy) return -1;
                return asc ? x - y : y - x;
            });
            if (!heurs.length) return "";
            const s = stats[gi];
            const cards = heurs.map((h, hi) => {
                const codeId = `alg-${g.generation ?? gi}-${hi}`;
                return `<div class="pop-card static">
          <div class="pop-card-head">
            <span class="pop-rank">#${hi + 1}</span>
            <span class="pop-obj mono">${fmtObj(h?.objective)}</span>
            ${s.best != null && Number(h?.objective) === s.best ? `<span class="badge src-local">本代最优</span>` : ""}
          </div>
          <div class="pop-concept" style="min-height:0">${esc(h?.concept || "（无描述）")}</div>
          <div class="pop-tags">${(h?.features ?? []).map(f => `<span class="badge feature-badge">${esc(f)}</span>`).join("") || `<span class="hint">无关键词</span>`}</div>
          ${h?.algorithm ? `<details class="alg-details"><summary>算法代码</summary>
            <div class="code-container"><button class="btn small copy-btn" data-action="copy" data-code="${codeId}">复制</button>
            <pre data-codeblock="${codeId}">${esc(h.algorithm)}</pre></div></details>` : ""}
        </div>`;
            }).join("");
            return `<div class="mine-head"><span class="mine-title">第 ${esc(g.generation ?? gi)} 代种群</span>
        <span class="hint">${heurs.length} 个个体${s.tok != null ? ` · ${fmtTokens(s.tok)} tokens` : ""}</span></div>
        <div class="pop-grid" style="margin-top:6px">${cards}</div>`;
        }).join("");

        const codeBlock = inst.framework_type === "custom" && cfg.framework_code ? `
      <div class="field"><label>框架源码（framework.py）</label>
        <div class="code-container"><button class="btn small copy-btn" data-action="copy" data-code="fw">复制</button>
        <pre data-codeblock="fw">${esc(cfg.framework_code)}</pre></div></div>` : "";

        $("cv-body").innerHTML = `
      <div class="grid cols-4">
        <div class="stat"><div class="k">最终最优适应度</div><div class="v mono">${fmtObj(sub.objective ?? finalBest)}</div><div class="s">${asc ? "越小越好" : "越大越好"}</div></div>
        <div class="stat"><div class="k">相对首代提升</div><div class="v mono">${improve == null ? "—" : improve.toFixed(2) + "%"}</div><div class="s">${firstBest != null ? "首代最优 " + fmtObj(firstBest) : ""}</div></div>
        <div class="stat"><div class="k">进化代数 / 个体</div><div class="v mono">${gens.length} <small style="font-size:14px;color:var(--text-faint)">代</small> / ${heurCount}</div><div class="s">种群快照统计</div></div>
        <div class="stat"><div class="k">总 token</div><div class="v mono">${anyTok ? fmtTokens(tokTotal) : "—"}</div><div class="s">${esc(sub.llm_model || "")}</div></div>
      </div>
      <div class="grid cols-2">
        <div class="card">
          <h2>每代适应度曲线</h2>
          <div class="legend"><span><span class="dot" style="background:#22d3ee"></span>每代最优</span><span><span class="dot" style="background:#a78bfa"></span>每代平均</span></div>
          <div class="chart-box">${lineChartSVG([bestSeries, avgSeries], { yLabel: "适应度" })}</div>
        </div>
        <div class="card">
          <h2>提交信息</h2>
          <div class="user-cell" style="margin-bottom:10px">${avatarHTML(sub)}<div class="u-name">
            <span class="u-main">${esc(fullName(sub))}</span><span class="u-sub mono">${esc(sub.username ?? "")}</span></div></div>
          <div class="grid-2">
            <div class="kv"><span class="k">实例名称</span><span>${esc(inst.name ?? "—")}</span></div>
            <div class="kv"><span class="k">框架类型</span>${fwBadge(inst.framework_type)}</div>
          </div>
          ${cfgKv}
          <div class="field" style="margin-top:10px"><label>启发式思想</label><p class="drawer-text">${esc(sub.concept ?? "—")}</p></div>
          <div class="field"><label>关键词组</label><div class="badge-row">${(sub.features ?? []).map(f => `<span class="badge feature-badge">${esc(f)}</span>`).join("") || `<span class="hint">无</span>`}</div></div>
        </div>
      </div>
      ${anyTok ? `<div class="card"><h2>每代 token 消耗</h2><div class="chart-box">${barChartSVG(stats.map((s, i) => ({
        label: String(xkey(gens[i])), value: s.tok ?? 0, tip: "第 " + xkey(gens[i]) + " 代",
      })))}</div></div>` : ""}
      <div class="card">
        <h2>种群明细 <span class="tail">${gens.length} 代 · 共 ${heurCount} 个启发式个体</span></h2>
        <div class="table-wrap"><table><thead><tr><th>代数</th><th class="num">个体数</th><th class="num">最优</th><th class="num">平均</th><th class="num">最差</th><th class="num">token</th></tr></thead>
        <tbody>${genRows || emptyHTML("🧫", "无种群快照")}</tbody></table></div>
        ${popDetail}
        ${codeBlock}
      </div>`;
    }
}

/* ==================== 双提交对比 ==================== */
async function viewCompare(view) {
    const recentPick = await api("/api/submissions/recent?limit=50").then(r => r.submissions ?? []).catch(() => []);
    const pickHTML = side => `
    <div class="picker-row">
      <input class="input" id="cp-id-${side}" placeholder="提交 ID" style="max-width:110px">
      <select class="input" id="cp-pick-${side}" style="flex:1">
        <option value="">— 从最近提交选择 —</option>
        ${recentPick.map(s => `<option value="${esc(s.id)}">#${esc(s.id)} · ${esc(fullName(s))} · ${esc(s.problem_name || s.problem_key)} · ${fmtObj(s.objective)}</option>`).join("")}
      </select>
    </div>`;

    view.innerHTML = `<div class="card">
    <h2>双提交对比 <span class="tail">对比两次提交的进化过程与最终成绩</span></h2>
    <div class="vs-grid">
      <div class="field"><label>提交 A</label>${pickHTML("a")}</div>
      <div class="vs-mid">VS</div>
      <div class="field"><label>提交 B</label>${pickHTML("b")}</div>
    </div>
    <div style="margin-top:12px"><button class="btn primary" id="cp-go">开始对比</button>
      <span class="hint" style="margin-left:10px">提示：在排行榜 / 实时流的详情抽屉里可以快速跳转曲线分析</span></div>
  </div>
  <div id="cp-body">${emptyHTML("⚔️", "选择两个提交开始对比")}</div>`;

    view.querySelector("#cp-go").addEventListener("click", run);
    ["a", "b"].forEach(side => {
        view.querySelector(`#cp-pick-${side}`).addEventListener("change", e => {
            if (e.target.value) view.querySelector(`#cp-id-${side}`).value = e.target.value;
        });
    });

    async function fetchOne(side) {
        const id = String(view.querySelector(`#cp-id-${side}`).value).trim();
        if (!id) throw new Error("请填写两侧的提交 ID");
        const rec = await api(`/api/submissions/${id}/record`);
        const inst = rec.instance;
        const cfg = inst?.config ?? {};
        const asc = cfg.ascend !== false;
        const gens = (inst?.population_snapshot ?? []).slice().sort((a, b) => (a.generation ?? 0) - (b.generation ?? 0));
        const bests = gens.map(g => {
            const objs = (g.heuristics ?? []).map(h => Number(h?.objective)).filter(isFinite);
            return objs.length ? (asc ? Math.min(...objs) : Math.max(...objs)) : null;
        });
        return {
            id,
            rec,
            sub: rec.submission ?? {},
            inst,
            asc,
            gens,
            bests
        };
    }

    function infoCard(side, d) {
        const s = d.sub;
        const finite = d.bests.filter(isFinite);
        const best = finite.length ? (d.asc ? Math.min(...finite) : Math.max(...finite)) : null;
        return `<div class="card">
      <h2>${side === "a" ? "🅰 提交 A" : "🅱 提交 B"} <span class="mono hint">#${esc(d.id)}</span></h2>
      <div class="user-cell" style="margin-bottom:8px">${avatarHTML(s)}<div class="u-name">
        <span class="u-main">${esc(fullName(s))}</span><span class="u-sub mono">${esc(s.username ?? "")}</span></div></div>
      <div class="grid-2">
        <div class="kv"><span class="k">问题</span><span>${esc(s.problem_name || s.problem_key || d.inst?.name || "—")}</span></div>
        <div class="kv"><span class="k">框架</span>${fwBadge(s.framework_type ?? d.inst?.framework_type)}</div>
        <div class="kv"><span class="k">适应度</span><span class="mono">${fmtObj(s.objective ?? best)}</span></div>
        <div class="kv"><span class="k">token</span><span class="mono">${fmtTokens(s.total_tokens)}</span></div>
        <div class="kv"><span class="k">模型</span><span class="mono">${esc(s.llm_model || "—")}</span></div>
        <div class="kv"><span class="k">代数</span><span class="mono">${d.gens.length}</span></div>
      </div>
      <div class="field" style="margin-top:8px"><label>启发式思想</label><p class="drawer-text">${esc(s.concept ?? "—")}</p></div>
    </div>`;
    }


    function deltaRow(label, va, vb, fmt, better, ascend) {
        if (label === "适应度") better = ascend ? "low" : "high";
        const dv = va != null && vb != null ? vb - va : null;
        let cls = "";
        if (dv != null && dv !== 0) cls = (better === "low" ? dv < 0 : dv > 0) ? "delta-up" : "delta-down";
        const dvText = dv == null ? "—" : (dv > 0 ? "+" : "") + fmt(dv);
        return `<div class="kv"><span class="k">${label}</span>
      <span class="mono">${fmt(va)}</span>
      <span class="${cls}">${dvText}</span>
      <span class="mono">${fmt(vb)}</span></div>`;
    }

    async function run() {
        document.getElementById("cp-body").innerHTML = `<div class="card"><div class="loading-row"><span class="spinner"></span>对比数据加载中…</div></div>`;
        let A, B;
        try {
            [A, B] = await Promise.all([fetchOne("a"), fetchOne("b")]);
        } catch (e) {
            document.getElementById("cp-body").innerHTML = `<div class="card">${e.status === 401 ? needLoginHTML("进化记录需要登录后查看") : `<div class="error-banner">${esc(e.message)}</div>`}</div>`;
            return;
        }

        const pkA = A.sub.problem_key || A.inst?.problem_key,
            pkB = B.sub.problem_key || B.inst?.problem_key;
        const sameProblem = pkA === pkB;

        // 归一化提升率曲线（相对各自首代）
        const improveSeries = d => {
            const first = d.bests.find(isFinite);
            if (first == null || first === 0) return [];
            return d.bests.map((v, i) => isFinite(v) ? {
                x: i,
                y: d.asc ? (first - v) / Math.abs(first) * 100 : (v - first) / Math.abs(first) * 100,
                label: `#${d.id} 第 ${i} 代`,
            } : null).filter(Boolean);
        };
        const sa = improveSeries(A),
            sb = improveSeries(B);
        const overlay = lineChartSVG([{
            name: "A 提升%",
            color: "#22d3ee",
            points: sa
        }, {
            name: "B 提升%",
            color: "#f472b6",
            points: sb
        }, ], {
            yLabel: "相对首代提升 %",
            xFormat: x => "第" + Math.round(x) + "代"
        });

        const tokA = A.sub.total_tokens,
            tokB = B.sub.total_tokens;
        const ascendCmp = isAscend(A.sub.problem_key || A.inst?.problem_key);

        document.getElementById("cp-body").innerHTML = `
      ${!sameProblem ? `<div class="card"><div class="error-banner">⚠️ 两次提交分属不同问题（${esc(state.problemMap.get(pkA)?.name || pkA || "?")} vs ${esc(state.problemMap.get(pkB)?.name || pkB || "?")}），适应度不可直接比较，仅对比进化过程。</div></div>` : ""}
      <div class="vs-grid">${infoCard("a", A)}<div class="vs-mid">VS</div>${infoCard("b", B)}</div>
      <div class="card">
        <h2>关键指标对比 <span class="tail">左 A · 中差值（绿色=B 更优）· 右 B</span></h2>
        ${deltaRow("适应度", A.sub.objective, B.sub.objective, fmtObj, "low", ascendCmp)}
        ${deltaRow("所耗 token", tokA, tokB, fmtTokens, "low", ascendCmp)}
        ${deltaRow("进化代数", A.gens.length, B.gens.length, v => String(v ?? "—"), "low", ascendCmp)}
        ${deltaRow("种群个体总数", A.gens.reduce((a, g) => a + (g.heuristics?.length ?? 0), 0), B.gens.reduce((a, g) => a + (g.heuristics?.length ?? 0), 0), v => String(v ?? "—"), "low", ascendCmp)}
      </div>
      <div class="card"><h2>进化提升率对比</h2>
        <div class="legend"><span><span class="dot" style="background:#22d3ee"></span>提交 A</span><span><span class="dot" style="background:#f472b6"></span>提交 B</span></div>
        <div class="chart-box">${overlay}</div>
        <p class="hint" style="margin-bottom:0">纵轴 = 相对各自首代最优的提升百分比（${sameProblem ? "" : "按各自问题的进化方向计算"}），横轴为代数。</p>
      </div>
      <div class="grid cols-2">
        ${[A, B].map(d => `<div class="card"><h2>#${esc(d.id)} 每代最优</h2>
          <div class="chart-box">${lineChartSVG([{ name: "每代最优", color: d === A ? "#22d3ee" : "#f472b6", points: d.bests.map((v, i) => ({ x: i, y: v, label: "第 " + i + " 代" })).filter(p => p.y != null) }])}</div></div>`).join("")}
      </div>`;
    }
}

/* ==================== 我的空间（含用户中心） ==================== */
async function viewMine(view, params) {
    if (!getToken() || !getStoredUser()) {
        view.innerHTML = `<div class="card">${emptyHTML("🔐", "登录后可查看自己在各赛道的名次与全部提交记录")}
      <div style="text-align:center"><button class="btn primary" data-action="open-login">登录 / 注册</button></div></div>`;
        return;
    }
    let tab = params.get("tab") || "records";
    if (!["records", "profile", "instances"].includes(tab)) tab = "records";

    view.innerHTML = `<div class="card">
    <h2>我的空间 <span class="tail" id="mn-meta"></span></h2>
    <div class="chip-row" style="margin-bottom:14px" id="mn-tabs">
      <button class="chip" data-tab="records">名次与提交</button>
      <button class="chip" data-tab="instances">实例与进化记录</button>
      <button class="chip" data-tab="profile">个人资料</button>
    </div>
    <div id="mn-body"></div>
  </div>`;

    const $ = sel => view.querySelector(sel.includes("#") ? sel : "#" + sel);

    function setTab(t) {
        tab = t;
        try {
            history.replaceState(null, "", "#/mine?tab=" + t);
        } catch {}
        $("mn-tabs").querySelectorAll("[data-tab]").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
        if (t === "records") renderRecords();
        else if (t === "instances") renderInstances();
        else renderProfile();
    }
    $("mn-tabs").querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

    /* ---------- 名次与提交 ---------- */
    async function renderRecords() {
        $("mn-meta").textContent = fullName(getStoredUser());
        $("mn-body").innerHTML = `<div class="loading-row"><span class="spinner"></span>加载中…</div>`;
        const [rankRes, subsRes] = await Promise.all([
            api("/api/ranking/me").then(r => r.entries ?? []).catch(() => []),
            api("/api/submissions/my").then(r => r.submissions ?? []).catch(() => []),
        ]);
        $("mn-meta").textContent = `${fullName(getStoredUser())} · 共 ${subsRes.length} 次提交 · ${new Set([...rankRes.map(e => e.problem_key), ...subsRes.map(s => s.problem_key)]).size} 个赛道`;
        const rankMap = new Map(rankRes.map(e => [e.problem_key, e]));
        const byProblem = new Map();
        for (const s of subsRes) {
            if (!byProblem.has(s.problem_key)) byProblem.set(s.problem_key, []);
            byProblem.get(s.problem_key).push(s);
        }
        const keys = [...new Set([...rankMap.keys(), ...byProblem.keys()])];
        const TIERS = [
            { key: "1", label: "第 1 名", test: r => r === 1 },
            { key: "2", label: "第 2 名", test: r => r === 2 },
            { key: "3", label: "第 3 名", test: r => r === 3 },
            { key: "46", label: "第 4~6 名", test: r => r >= 4 && r <= 6 },
            { key: "710", label: "第 7~10 名", test: r => r >= 7 && r <= 10 },
            { key: "1120", label: "第 11~20 名", test: r => r >= 11 && r <= 20 },
            { key: "2150", label: "第 21~50 名", test: r => r >= 21 && r <= 50 },
            { key: "50p", label: "50 名开外 / 未上榜", test: r => r == null || r > 50 },
            { key: "none", label: "未参加", test: r => r === "none" },
        ];
        const allTracks = state.problems.map(p => {
            const rank = rankMap.get(p.key);
            const subs = (byProblem.get(p.key) ?? []).slice().sort((a, b) => (parseServerTime(a.created_at)?.getTime() ?? 0) - (parseServerTime(b.created_at)?.getTime() ?? 0));
            const objs = subs.map(x => Number(x.objective)).filter(isFinite);
            const asc = p.ascend !== false;
            const best = objs.length ? (asc ? Math.min(...objs) : Math.max(...objs)) : null;
            const part = subs.length > 0 || !!rank;
            return {
                key: p.key, name: p.name.split(" ")[0], fullName: p.name, asc,
                rank: rank ? rank.rank : null, best,
                count: subs.length, lastAt: subs.length ? subs[subs.length - 1].created_at : null,
                spark: objs, participated: part,
            };
        });
        const tierGroups = TIERS.map(t => ({
            key: t.key, label: t.label,
            items: allTracks.filter(c => t.test(c.participated ? (c.rank ?? null) : "none")),
        })).filter(g => g.items.length);
        const tierHtml = tierGroups.map(g => `<details class="tier${g.key === "none" ? " tier-dim" : ""}">
          <summary><span class="tier-name">${esc(g.label)}</span><span class="tier-count">${g.items.length} 个赛道</span><span class="tier-preview">${esc(g.items.map(i => i.name).join("、"))}</span></summary>
          <div class="tier-body">${g.items.map(c => `<div class="tier-row" title="${esc(c.fullName)}" onclick="document.getElementById('sec-${esc(c.key)}')?.scrollIntoView({ behavior: 'smooth' })">
            <span class="tier-track">${esc(c.name)}</span>
            <span class="tier-best mono">${fmtObj(c.best)}</span>
            <span class="tier-dir">${c.asc ? "越小越好" : "越大越好"}</span>
            <span class="tier-meta">${c.count} 次${c.lastAt ? " · " + fmtTime(c.lastAt) : ""}</span>
            ${c.spark.length > 1 ? sparklineSVG(c.spark) : ""}
          </div>`).join("")}</div>
        </details>`).join("");
        $("mn-body").innerHTML = (keys.length ? `<div class="mine-head"><span class="mine-title">各赛道速览</span>
      <span class="hint">共 ${state.problems.length} 个赛道 · ${state.problems.filter(p => rankMap.get(p.key) || (byProblem.get(p.key) ?? []).length).length} 个已参与 · 按名次分组，点开查看</span></div>` + tierHtml : "") + (keys.length ? keys.map(key => {
            const p = state.problemMap.get(key);
            const rank = rankMap.get(key);
            const list = (byProblem.get(key) ?? []).slice().sort((a, b) => (parseServerTime(a.created_at)?.getTime() ?? 0) - (parseServerTime(b.created_at)?.getTime() ?? 0));
            const spark = list.map(s => Number(s.objective)).filter(isFinite);
            const rows = list.slice().reverse().map(s => `
        <tr class="clickable-row" data-action="open-sub" data-sid="${esc(s.id)}">
          <td class="mono">${esc(s.id)}</td>
          <td>${fwBadge(s.framework_type)}</td>
          <td>${srcBadge(s.model_source)} <span class="mono hint">${esc(s.llm_model || "")}</span></td>
          <td class="num mono">${fmtObj(s.objective)}</td>
          <td class="num mono">${fmtTokens(s.total_tokens)}</td>
          <td class="mono hint">${fmtTime(s.created_at)}</td>
          <td><button class="btn small" data-action="goto-curve" data-sid="${esc(s.id)}">曲线</button></td>
        </tr>`).join("");
            return `<section id="sec-${esc(key)}">
        <div class="mine-head">
          <span class="mine-title">${esc(rank?.problem_name || p?.name || key)}</span>
          ${rank ? `<span class="mine-rank">${rank.rank <= 3 ? ["🥇", "🥈", "🥉"][rank.rank - 1] : ""} 第 <b class="mono">${rank.rank}</b> 名 · 最优 <b class="mono">${fmtObj(rank.best_objective)}</b></span>` : `<span class="hint">暂无名次</span>`}
          ${spark.length > 1 ? `<span title="我的提交适应度走势（时间序）">${sparklineSVG(spark)}</span>` : ""}
        </div>
        ${rows ? `<div class="table-wrap"><table>
          <thead><tr><th>ID</th><th>框架</th><th>模型</th><th class="num">适应度</th><th class="num">token</th><th>提交时间</th><th></th></tr></thead>
          <tbody>${rows}</tbody></table></div>` : `<div class="hint">无提交记录</div>`}
      </section>`;
        }).join("") : "") + (keys.length ? "" : emptyHTML("🗂️", "你还没有参赛记录，去「进化」发起一次，或去平台「AHG进化」页提交"));
    }

    /* ---------- 实例与进化记录 ---------- */
    async function renderInstances() {
        $("mn-meta").textContent = "实例保存 · AHG 进化记录";
        $("mn-body").innerHTML = `<div class="loading-row"><span class="spinner"></span>加载中…</div>`;
        const [insts, runs] = await Promise.all([
            api("/api/instances").then(r => r.instances ?? []).catch(() => []),
            api("/api/evolution/my").then(r => r.runs ?? []).catch(() => []),
        ]);
        $("mn-body").innerHTML = `
      <div class="mine-head"><span class="mine-title">实例保存</span><span class="hint">点击「载入」把实例配置带到进化页</span></div>
      ${insts.length ? `<div class="table-wrap"><table>
        <thead><tr><th>名称</th><th>框架类型</th><th>模型</th><th>问题</th><th>更新时间</th><th></th></tr></thead>
        <tbody>${insts.map(i => `<tr>
          <td><b>${esc(i.name)}</b></td>
          <td>${fwBadge(i.framework_type)}</td>
          <td class="mono hint">${esc(i.config?.llm_model ?? "—")}</td>
          <td class="mono">${esc(i.problem_key ?? "—")}</td>
          <td class="mono hint">${i.updated_at ? fmtTime(i.updated_at) : "—"}</td>
          <td><a class="btn small" href="#/evo">载入 →</a></td>
        </tr>`).join("")}</tbody></table></div>` : `<div class="hint">暂无保存的实例，可在进化页发起后保存。</div>`}
      <div class="mine-head"><span class="mine-title">AHG 进化记录</span></div>
      ${runs.length ? `<div class="table-wrap"><table>
        <thead><tr><th class="num">ID</th><th>问题</th><th>状态</th><th class="num">最优适应度</th><th></th></tr></thead>
        <tbody>${runs.map(r => `<tr>
          <td class="num mono">${esc(r.run_id)}</td><td class="mono">${esc(r.problem_key ?? "—")}</td>
          <td>${statusBadge(r.status)}</td><td class="num mono">${fmtObj(r.best_objective)}</td>
          <td><a class="btn small" href="#/evo?run=${esc(r.run_id)}">监控 →</a></td>
        </tr>`).join("")}</tbody></table></div>` : `<div class="hint">暂无进化记录。</div>`}`;
    }

    /* ---------- 个人资料 ---------- */
    async function renderProfile() {
        $("mn-meta").textContent = "个人资料 · 账号安全";
        $("mn-body").innerHTML = `<div class="loading-row"><span class="spinner"></span>加载中…</div>`;
        let me;
        try {
            me = await api("/api/auth/me");
            setSession(null, me);
        } catch (e) {
            $("mn-body").innerHTML = `<div class="error-banner">加载失败：${esc(e.message)}</div>`;
            return;
        }
        $("mn-body").innerHTML = `
      <div class="grid cols-2">
        <div>
          <div class="mine-head"><span class="mine-title">基本信息</span></div>
          <div class="user-cell" style="margin-bottom:12px">
            <span class="link-ish" id="pf-avatar-wrap" title="点击更换头像">${avatarHTML(me)}</span>
            <div class="u-name"><span class="u-main">${esc(me.display_name || me.username)}</span><span class="u-sub mono">${esc(me.username)}</span></div>
            <span class="badge ${me.role === "admin" ? "src-api" : "feature-badge"}">${me.role === "admin" ? "ADMIN" : "USER"}</span>
          </div>
          <input type="file" id="pf-avatar-in" accept="image/*" style="display:none">
          <div class="grid cols-2">
            <div class="field"><label>用户 ID</label><div class="mono" style="padding:6px 0">${esc(me.id)}</div></div>
            <div class="field"><label>一卡通号</label><div class="mono" style="padding:6px 0">${esc(me.username)}</div></div>
          </div>
          <div class="field"><label>昵称 display_name</label><input id="pf-dn" value="${esc(me.display_name ?? "")}"></div>
          <div class="grid cols-2">
            <div class="field"><label>邮箱 email</label><input id="pf-email" value="${esc(me.email ?? "")}"></div>
            <div class="field"><label>电话 phone</label><input id="pf-phone" value="${esc(me.phone ?? "")}"></div>
          </div>
          <div class="error-banner" id="pf-err1" style="display:none"></div>
          <button class="btn primary" id="pf-save">保存资料</button>
        </div>
        <div>
          <div class="mine-head"><span class="mine-title">修改密码</span></div>
          <div class="field"><label>原密码</label><input type="password" id="pw-old" autocomplete="current-password"></div>
          <div class="field"><label>新密码</label><input type="password" id="pw-new" autocomplete="new-password"></div>
          <div class="field"><label>确认新密码</label><input type="password" id="pw-cfm" autocomplete="new-password"></div>
          <div class="error-banner" id="pf-err2" style="display:none"></div>
          <button class="btn primary" id="pw-save">修改密码</button>
        </div>
      </div>`;
        const err1 = $("pf-err1"),
            err2 = $("pf-err2");
        const show = (el, m) => {
            el.textContent = m;
            el.style.display = m ? "" : "none";
        };
        $("pf-avatar-wrap").addEventListener("click", () => $("pf-avatar-in").click());
        $("pf-avatar-in").addEventListener("change", e => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            if (!f.type.startsWith("image/")) {
                toast("请选择图片文件", "err");
                return;
            }
            const rd = new FileReader();
            rd.onload = async () => {
                try {
                    const u = await api("/api/auth/me", {
                        method: "PATCH",
                        body: {
                            avatar: rd.result
                        }
                    });
                    setSession(null, u);
                    toast("头像已更新", "ok");
                    renderProfile();
                } catch (e2) {
                    toast("头像更新失败：" + e2.message, "err");
                }
            };
            rd.readAsDataURL(f);
        });
        $("pf-save").addEventListener("click", async () => {
            show(err1, "");
            const btn = $("pf-save");
            btn.disabled = true;
            try {
                const u = await api("/api/auth/me", {
                    method: "PATCH",
                    body: {
                        display_name: $("pf-dn").value.trim(),
                        email: $("pf-email").value.trim(),
                        phone: $("pf-phone").value.trim()
                    }
                });
                setSession(null, u);
                show(err1, "已保存");
                toast("资料已保存", "ok");
            } catch (e) {
                show(err1, e.message);
            } finally {
                btn.disabled = false;
            }
        });
        $("pw-save").addEventListener("click", async () => {
            show(err2, "");
            const oldP = $("pw-old").value,
                newP = $("pw-new").value,
                cfm = $("pw-cfm").value;
            if (!oldP || !newP || !cfm) {
                show(err2, "请填写完整的密码信息");
                return;
            }
            if (newP !== cfm) {
                show(err2, "两次输入的新密码不一致");
                return;
            }
            const btn = $("pw-save");
            btn.disabled = true;
            try {
                await api("/api/auth/me/password", {
                    method: "POST",
                    body: {
                        old_password: oldP,
                        new_password: newP,
                        confirm_password: cfm
                    }
                });
                show(err2, "密码修改成功");
                $("pw-old").value = $("pw-new").value = $("pw-cfm").value = "";
                toast("密码已修改", "ok");
            } catch (e) {
                show(err2, e.message);
            } finally {
                btn.disabled = false;
            }
        });
    }

    setTab(tab);
}
