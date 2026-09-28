/* ============ AHGS NOVA 进阶视图：进化 / 自定义问题 ============ */
"use strict";

const STATUS_LABEL = { pending: "排队中", running: "运行中", paused: "已暂停", completed: "已完成", stopped: "已停止", failed: "失败" };
const STATUS_ACTIVE = new Set(["pending", "running", "paused"]);
const CP_TASK_LABEL = { dataset_builder: "数据集构建脚本", evaluator: "评估器", example_heuristic: "示例启发式" };
const EVO_DEFAULTS = { population_size: 8, num_generations: 10, num_mutation: 3, num_hybridization: 3, num_reflection: 3, num_policy_updates: 1 };

function statusBadge(s) {
  return `<span class="badge evo-st-${esc(s)}">${esc(STATUS_LABEL[s] ?? s ?? "—")}</span>`;
}

/* ==================== 进化页 ==================== */
async function viewEvo(view, params) {
  if (!getToken() || !getStoredUser()) {
    view.innerHTML = `<div class="card">${emptyHTML("🔐", "发起与监控进化需要登录")}</div>`;
    return;
  }
  const [presets, instances, myRuns] = await Promise.all([
    api("/api/llm-presets").then(r => r.presets ?? []).catch(() => []),
    api("/api/instances").then(r => r.instances ?? []).catch(() => []),
    api("/api/evolution/my").then(r => r.runs ?? []).catch(() => []),
  ]);
  const cfg = {
    problem_key: params.get("problem") || state.problems[0]?.key || "",
    framework_type: "calm",
    ...EVO_DEFAULTS,
    preset_id: presets[0]?.id || "deepseek-v4-flash",
    llm_model: "", llm_base_url: "", use_local_llm: true, api_key: "",
    problem_override: "", fun_name: "", fun_args: [], fun_return: [], fun_notes: "",
    ascend: true, problem_path: "", train_data: "", train_solution: "",
    framework_code: "", framework_filename: "framework.py", framework_id: null,
  };
  let currentRun = Number(params.get("run")) || Number(localStorage.getItem("nova_current_run")) || null;
  let advOpen = false;

  view.innerHTML = `
    <div class="grid evo-grid">
      <div class="card" id="evo-form-card">
        <h2>发起进化 <span class="tail">登录用户可用 · 参数与原站一致</span></h2>
        <div class="field"><label>加载实例配置</label>
          <select id="evo-inst"><option value="">— 选择已保存的实例 —</option>
            ${instances.map(i => `<option value="${esc(i.id)}">${esc(i.name)}（${esc(FW_LABEL[i.framework_type] || i.framework_type)} · ${esc(i.problem_key ?? "")}）</option>`).join("")}
          </select></div>
        <div class="field"><label>问题情景</label>
          <select id="evo-problem">${state.problems.map(p => `<option value="${esc(p.key)}">${esc(p.name)}</option>`).join("")}</select></div>
        <div class="field"><label>框架类型</label><div class="chip-row" id="evo-fw">
          ${["calm", "eoh_nseh", "custom"].map(ft => `<button class="chip ${ft === cfg.framework_type ? "on" : ""}" data-ft="${ft}">${FW_LABEL[ft]}</button>`).join("")}
        </div></div>
        <div class="grid cols-3">
          ${[["population_size", "种群容量"], ["num_generations", "进化代数"], ["num_mutation", "突变数"],
             ["num_hybridization", "杂交数"], ["num_reflection", "反思数"], ["num_policy_updates", "策略更新数"]]
            .map(([k, label]) => `<div class="field"><label>${label}</label><input type="number" min="0" id="evo-${k}" value="${EVO_DEFAULTS[k]}"></div>`).join("")}
        </div>
        <div class="grid cols-2">
          <div class="field"><label>LLM 预设</label>
            <select id="evo-preset">${presets.map(p => `<option value="${esc(p.id)}">${esc(p.name)}（${esc(p.provider)}）</option>`).join("")}<option value="custom">自定义（手动填写 Base URL / 模型）</option></select></div>
          <div class="field"><label>模型 ID</label><input id="evo-model" placeholder="自定义模型名，如 custom-model"></div>
        </div>
        <div class="grid cols-2">
          <div class="field"><label>Base URL（含端口）</label><input id="evo-baseurl" placeholder="https://api.deepseek.com/v1"></div>
          <div class="field"><label>API key</label><input id="evo-apikey" placeholder="你的 api key"></div>
        </div>
        <div class="field"><label>&nbsp;</label><div class="chip-row">
          <button class="chip on" id="evo-local">使用实验室本地LLM（Qwen3-30B）</button>
        </div>
        <div class="hint" id="evo-local-hint">已选择实验室本地 LLM，无需配置 API Key / Base URL / 模型。</div>
        <div id="evo-custom-panel" style="display:none">
          <div class="mine-head"><span class="mine-title">自定义进化框架</span>
            <span class="hint">上传 framework.py，平台加载后随进化启动</span></div>
          <div class="field"><label>框架文件名</label><input id="evo-fwfile" value="framework.py"></div>
          <div class="field"><label>framework.py 源码</label>
            <div class="code-container"><button class="btn small copy-btn" data-action="copy" data-code="evofw">复制</button>
            <pre id="evo-fwcode" contenteditable="true" spellcheck="false" style="max-height:260px;white-space:pre-wrap"></pre></div></div>
          <div class="chip-row" style="margin-bottom:8px">
            <button class="btn small" id="evo-fwfile-btn">📁 选择本地文件</button><input type="file" id="evo-fwfile-in" accept=".py" style="display:none">
            <button class="btn small" id="evo-fw-validate">✔ 校验</button>
            <button class="btn small" id="evo-fw-upload">⬆ 上传并加载</button>
            <span class="hint" id="evo-fw-state"></span>
          </div>
          <div id="evo-fw-validate-out"></div>
        </div>
        <div class="field"><label>&nbsp;</label>
          <button class="chip" id="evo-adv">▸ 高级参数（函数签名 / 训练数据 / 进化方向）</button></div>
        <div id="evo-adv-panel" style="display:none">
          <div class="field"><label>问题描述覆盖（problem_override）</label><textarea class="input" id="evo-desc" rows="3"></textarea></div>
          <div class="grid cols-2">
            <div class="field"><label>函数名 fun_name</label><input id="evo-funname"></div>
            <div class="field"><label>进化方向 ascend（越小越好）</label>
              <select id="evo-ascend">
                <option value="true">适应度越小越好</option>
                <option value="false">适应度越大越好</option>
              </select></div>
          </div>
          <div class="grid cols-2">
            <div class="field"><label>fun_args（JSON 数组）</label><textarea class="input mono" id="evo-funargs" rows="2">[]</textarea></div>
            <div class="field"><label>fun_return（JSON 数组）</label><textarea class="input mono" id="evo-funret" rows="2">[]</textarea></div>
          </div>
          <div class="field"><label>fun_notes</label><input id="evo-funnotes"></div>
          <div class="field"><label>problem_path（问题文件路径）</label><input class="mono" id="evo-ppath"></div>
          <div class="grid cols-2">
            <div class="field"><label>训练数据 train_data</label><textarea class="input mono" id="evo-tdata" rows="2"></textarea></div>
            <div class="field"><label>训练解 train_solution</label><textarea class="input mono" id="evo-tsol" rows="2"></textarea></div>
          </div>
        </div>
        <div class="error-banner" id="evo-err" style="display:none"></div>
        <div class="chip-row">
          <button class="btn primary" id="evo-start">🚀 启动进化</button>
          <button class="btn" id="evo-devrun" style="display:none">▶ 开发者运行（framework_id）</button>
        </div>
      </div>
      <div id="evo-monitor"></div>
    </div>
    <div class="card">
      <h2>我的进化记录 <span class="tail">点击「监控」查看实时曲线与控制</span></h2>
      <div id="evo-history"><div class="loading-row"><span class="spinner"></span>加载中…</div></div>
    </div>`;

  const $ = sel => view.querySelector(sel.includes("#") ? sel : "#" + sel);
  $("select#evo-problem").value = cfg.problem_key;
  const errEl = $("evo-err");
  const showErr = m => { errEl.textContent = m; errEl.style.display = m ? "" : "none"; };
  const numKeys = ["population_size", "num_generations", "num_mutation", "num_hybridization", "num_reflection", "num_policy_updates"];

  function collectCfg() {
    for (const k of numKeys) cfg[k] = Number($( "#evo-" + k).value) || 0;
    cfg.llm_model = $("evo-model").value.trim();
    cfg.llm_base_url = $("evo-baseurl").value.trim();
    cfg.use_local_llm = $("evo-local").classList.contains("on");
    cfg.ascend = $("evo-ascend").value === "true";
    cfg.api_key = $("evo-apikey").value.trim();
    cfg.problem_override = $("evo-desc").value;
    cfg.fun_name = $("evo-funname").value.trim();
    cfg.fun_notes = $("evo-funnotes").value.trim();
    cfg.problem_path = $("evo-ppath").value.trim();
    cfg.train_data = $("evo-tdata").value;
    cfg.train_solution = $("evo-tsol").value;
    cfg.framework_code = $("evo-fwcode").textContent;
    cfg.framework_filename = $("evo-fwfile").value.trim() || "framework.py";
    try { cfg.fun_args = JSON.parse($("evo-funargs").value || "[]"); } catch { throw new Error("fun_args 不是合法 JSON 数组"); }
    try { cfg.fun_return = JSON.parse($("evo-funret").value || "[]"); } catch { throw new Error("fun_return 不是合法 JSON 数组"); }
  }

  async function loadProblemDetail() {
    try {
      const d = await api(`/api/problems/${cfg.problem_key}`);
      cfg.problem_override = d.description ?? "";
      cfg.fun_name = d.fun_name ?? ""; cfg.fun_args = d.fun_args ?? []; cfg.fun_return = d.fun_return ?? [];
      cfg.fun_notes = d.fun_notes ?? ""; cfg.ascend = d.ascend !== false;
      cfg.problem_path = d.problem_path ?? ""; cfg.train_data = d.train_data ?? ""; cfg.train_solution = d.train_solution ?? "";
      fillAdv();
    } catch {}
  }
  function fillAdv() {
    $("evo-desc").value = cfg.problem_override;
    $("evo-funname").value = cfg.fun_name;
    $("evo-funargs").value = JSON.stringify(cfg.fun_args ?? []);
    $("evo-funret").value = JSON.stringify(cfg.fun_return ?? []);
    $("evo-funnotes").value = cfg.fun_notes ?? "";
    $("evo-ppath").value = cfg.problem_path ?? "";
    $("evo-tdata").value = cfg.train_data ?? "";
    $("evo-tsol").value = cfg.train_solution ?? "";
    $("evo-ascend").value = cfg.ascend ? "true" : "false";
  }

  function applyPreset() {
    if ($("evo-preset").value === "custom") { $("evo-model").value = ""; $("evo-baseurl").value = ""; return; }
    const p = presets.find(x => x.id === $("evo-preset").value);
    if (p) { $("evo-model").value = p.id; $("evo-baseurl").value = p.base_url; }
  }

  $("select#evo-problem").addEventListener("change", e => { cfg.problem_key = e.target.value; loadProblemDetail(); });
  $("select#evo-preset").addEventListener("change", applyPreset);
  $("evo-fw").querySelectorAll("[data-ft]").forEach(b => b.addEventListener("click", () => {
    cfg.framework_type = b.dataset.ft;
    $("evo-fw").querySelectorAll("[data-ft]").forEach(x => x.classList.toggle("on", x === b));
    $("evo-custom-panel").style.display = cfg.framework_type === "custom" ? "" : "none";
    $("evo-devrun").style.display = cfg.framework_type === "custom" ? "" : "none";
  }));
  function applyLocalUi() {
    const on = $("evo-local").classList.contains("on");
    $("evo-model").closest(".grid.cols-2").style.display = on ? "none" : "";
    $("evo-baseurl").closest(".grid.cols-2").style.display = on ? "none" : "";
    $("evo-local-hint").textContent = on
      ? "已选择实验室本地 LLM，无需配置 API Key / Base URL / 模型。"
      : "将改用你自己的 API：请填写 Base URL（含端口）、模型名与 API Key。";
  }
  $("evo-local").addEventListener("click", () => { $("evo-local").classList.toggle("on"); applyLocalUi(); });
  $("evo-adv").addEventListener("click", () => {
    advOpen = !advOpen;
    $("evo-adv-panel").style.display = advOpen ? "" : "none";
    $("evo-adv").textContent = (advOpen ? "▾" : "▸") + " 高级参数（函数签名 / 训练数据 / 进化方向）";
  });
  $("evo-inst").addEventListener("change", async e => {
    const inst = instances.find(x => String(x.id) === e.target.value);
    if (!inst) return;
    Object.assign(cfg, {
      problem_key: inst.problem_key ?? cfg.problem_key,
      framework_type: inst.framework_type ?? "calm",
      population_size: inst.config?.population_size ?? cfg.population_size,
      num_generations: inst.config?.num_generations ?? cfg.num_generations,
      num_mutation: inst.config?.num_mutation ?? cfg.num_mutation,
      num_hybridization: inst.config?.num_hybridization ?? cfg.num_hybridization,
      num_reflection: inst.config?.num_reflection ?? cfg.num_reflection,
      llm_model: inst.config?.llm_model ?? "", llm_base_url: inst.config?.llm_base_url ?? "",
      problem_override: typeof inst.config?.problem_override === "string" ? inst.config.problem_override : cfg.problem_override,
      fun_name: inst.config?.fun_name ?? "", fun_args: inst.config?.fun_args ?? [], fun_return: inst.config?.fun_return ?? [],
      fun_notes: inst.config?.fun_notes ?? "", ascend: inst.config?.ascend !== false,
      problem_path: inst.config?.problem_path ?? "", train_data: inst.config?.train_data ?? "", train_solution: inst.config?.train_solution ?? "",
    });
    $("select#evo-problem").value = cfg.problem_key;
    for (const k of numKeys) $("evo-" + k).value = cfg[k];
    $("evo-model").value = cfg.llm_model; $("evo-baseurl").value = cfg.llm_base_url;
    $("evo-fw").querySelectorAll("[data-ft]").forEach(x => x.classList.toggle("on", x.dataset.ft === cfg.framework_type));
    $("evo-custom-panel").style.display = cfg.framework_type === "custom" ? "" : "none";
    $("evo-devrun").style.display = cfg.framework_type === "custom" ? "" : "none";
    if (cfg.framework_type === "custom" && inst.config?.framework_code) $("evo-fwcode").textContent = inst.config.framework_code;
    fillAdv();
    toast(`已加载实例「${inst.name}」的配置`, "ok");
  });

  // 自定义框架：文件 / 校验 / 上传
  $("evo-fwfile-btn").addEventListener("click", () => $("evo-fwfile-in").click());
  $("evo-fwfile-in").addEventListener("change", e => {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = "";
    f.text().then(t => { $("evo-fwcode").textContent = t; $("evo-fwfile").value = f.name; });
  });
  $("evo-fw-validate").addEventListener("click", async () => {
    collectCfg();
    $("evo-fw-state").textContent = "校验中…";
    try {
      const r = await api("/api/developer/validate", { method: "POST", body: { framework_code: cfg.framework_code } });
      const ok = r && (r.valid ?? r.ok) !== false;
      $("evo-fw-state").textContent = ok ? "✔ 校验通过" : "✘ 校验未通过";
      $("evo-fw-validate-out").innerHTML = `<pre class="mono" style="max-height:160px;overflow:auto;background:var(--code-bg);color:#d7e3ff;padding:10px;border-radius:8px;font-size:12px">${esc(typeof r === "string" ? r : JSON.stringify(r, null, 2))}</pre>`;
    } catch (e) { $("evo-fw-state").textContent = "✘ " + e.message; }
  });
  $("evo-fw-upload").addEventListener("click", async () => {
    collectCfg();
    $("evo-fw-state").textContent = "上传中…";
    try {
      const r = await api("/api/developer/upload", { method: "POST", body: { framework_code: cfg.framework_code, framework_filename: cfg.framework_filename } });
      cfg.framework_id = r.framework_id ?? null;
      $("evo-fw-state").textContent = `⬆ 已上传并加载「${cfg.framework_filename}」${cfg.framework_id ? "（" + cfg.framework_id + "）" : ""}`;
      toast("框架已上传并加载", "ok");
    } catch (e) { $("evo-fw-state").textContent = "✘ " + e.message; }
  });

  /** 启动成功后立即创建实例（与原站 Dc 一致：提交→run→实例→种群快照 才能关联曲线） */
  async function createInstanceAtStart(ft) {
    try {
      const isCustom = ft === "custom";
      const config = {
        problem_key: cfg.problem_key, framework_type: ft,
        population_size: cfg.population_size, num_generations: cfg.num_generations,
        num_mutation: cfg.num_mutation, num_hybridization: cfg.num_hybridization,
        num_reflection: cfg.num_reflection, num_policy_updates: cfg.num_policy_updates,
        preset_id: $("evo-preset")?.value, llm_model: cfg.llm_model, llm_base_url: cfg.llm_base_url,
        use_local_llm: cfg.use_local_llm, problem_override: cfg.problem_override,
        fun_name: cfg.fun_name, fun_args: cfg.fun_args, fun_return: cfg.fun_return,
        fun_notes: cfg.fun_notes, ascend: cfg.ascend, problem_path: cfg.problem_path,
        train_data: cfg.train_data, train_solution: cfg.train_solution,
      };
      if (isCustom) {
        config.framework_code = cfg.framework_code;
        config.framework_filename = cfg.framework_filename || "framework.py";
        config.framework_id = cfg.framework_id ?? null;
      }
      const name = `实例_${cfg.problem_key}_${new Date().toLocaleString("zh-CN").replace(/[/: ]/g, "-")}`;
      await api("/api/instances", { method: "POST", body: { name, framework_type: ft, problem_key: cfg.problem_key, config, run_id: currentRun, population_snapshot: null } });
    } catch {}
  }

  async function launch() {
    collectCfg(); showErr("");
    const btn = $("evo-start"); btn.disabled = true;
    try {
      if ($("evo-preset").value === "custom") cfg.llm_model = cfg.llm_model.trim() || "custom-model";
      const body = {
        problem_key: cfg.problem_key, framework_type: cfg.framework_type,
        population_size: cfg.population_size, num_generations: cfg.num_generations,
        num_mutation: cfg.num_mutation, num_hybridization: cfg.num_hybridization,
        num_reflection: cfg.num_reflection, num_policy_updates: cfg.num_policy_updates,
        preset_id: $("evo-preset").value, llm_model: cfg.llm_model, llm_base_url: cfg.llm_base_url,
        use_local_llm: cfg.use_local_llm, problem_override: cfg.problem_override,
        fun_name: cfg.fun_name, fun_args: cfg.fun_args, fun_return: cfg.fun_return, fun_notes: cfg.fun_notes,
        ascend: cfg.ascend, problem_path: cfg.problem_path, train_data: cfg.train_data, train_solution: cfg.train_solution,
      };
      if (!cfg.use_local_llm && cfg.api_key) body.api_key = cfg.api_key;
      const r = await api("/api/evolution/start", { method: "POST", body });
      currentRun = r.run_id;
      monitorProblemKey = cfg.problem_key;
      localStorage.setItem("nova_current_run", String(r.run_id));
      toast(`进化已启动（Run #${r.run_id}）`, "ok");
      createInstanceAtStart(cfg.framework_type);
      renderMonitor(); startPolling(); refreshHistory();
    } catch (e) { showErr(e.message); }
    finally { btn.disabled = false; }
  }
  $("evo-start").addEventListener("click", launch);
  $("evo-devrun").addEventListener("click", async () => {
    collectCfg(); showErr("");
    if (!cfg.framework_id) { showErr("请先「上传并加载」框架，再开发者运行"); return; }
    try {
      const body = {
        framework_id: cfg.framework_id, problem_key: cfg.problem_key, num_generations: cfg.num_generations,
        preset_id: $("evo-preset").value, llm_model: cfg.llm_model, llm_base_url: cfg.llm_base_url,
        use_local_llm: cfg.use_local_llm, problem_override: cfg.problem_override,
        fun_name: cfg.fun_name, fun_args: cfg.fun_args, fun_return: cfg.fun_return, fun_notes: cfg.fun_notes,
        ascend: cfg.ascend, problem_path: cfg.problem_path, train_data: cfg.train_data, train_solution: cfg.train_solution,
      };
      if (!cfg.use_local_llm && cfg.api_key) body.api_key = cfg.api_key;
      const r = await api("/api/developer/run", { method: "POST", body });
      currentRun = r.run_id;
      monitorProblemKey = cfg.problem_key;
      localStorage.setItem("nova_current_run", String(r.run_id));
      toast(`开发者运行已启动（Run #${r.run_id}）`, "ok");
      createInstanceAtStart("custom");
      renderMonitor(); startPolling(); refreshHistory();
    } catch (e) { showErr(e.message); }
  });

  /* ---------- 监控 ---------- */
  let pollTimer = null, lastHistLen = 0, monitorProblemKey = null, evoRuns = [];
  function renderMonitor() {
    $("evo-monitor").innerHTML = `<div class="card">
      <h2>实时监控 <span class="tail" id="evm-meta"></span></h2>
      <div class="chip-row" style="margin-bottom:10px">
        <button class="btn small" data-evm-ctrl="pause">⏸ 暂停</button>
        <button class="btn small" data-evm-ctrl="resume">▶ 继续</button>
        <button class="btn small danger" data-evm-ctrl="stop">⏹ 停止</button>
        <button class="btn small" data-evm-ctrl="submit" data-evm-primary="1">🏆 提交最优</button>
        <button class="btn small" id="evm-prompt-btn">📝 提示词</button>
        <button class="btn small" id="evm-saveinst">💾 保存实例</button>
      </div>
      <div class="error-banner" id="evm-err" style="display:none"></div>
      <div id="evm-status"><div class="hint">暂无进行中的进化，从左侧发起，或在下方历史中选择。</div></div>
      <div id="evm-results"></div>
      <div id="evm-prompt"></div>
    </div>`;
    $("evo-monitor").querySelectorAll("[data-evm-ctrl]").forEach(b => b.addEventListener("click", async () => {
      if (!currentRun) return;
      const errM = $("evm-err"); errM.style.display = "none";
      b.disabled = true;
      try {
        await api(`/api/evolution/${currentRun}/${b.dataset.evmCtrl}`, { method: "POST" });
        const msg = { stop: "已停止", pause: "已暂停", resume: "已继续", submit: "当前最优已提交到排行榜" }[b.dataset.evmCtrl] ?? "操作成功";
        toast(msg, "ok");
        pollOnce(); pollResults(); refreshHistory();
      } catch (e) {
        errM.textContent = (b.dataset.evmCtrl === "submit" ? "提交失败：" : "操作失败：") + e.message;
        errM.style.display = "";
        toast(errM.textContent, "err");
      }
      finally { b.disabled = false; }
    }));
    $("evm-saveinst").addEventListener("click", saveInstance);
    $("evm-prompt-btn").addEventListener("click", openPromptEditor);
  }

  /** 保存实例配置（POST /api/instances） */
  let lastPop = null;
  async function saveInstance() {
    const errM = $("evm-err"); errM.style.display = "none";
    if (!currentRun) { toast("请先选择一个进化 Run", "err"); return; }
    try { collectCfg(); } catch (e) { /* 高级参数 JSON 不完整时仍允许保存 */ }
    const btn = $("evm-saveinst"); btn.disabled = true;
    try {
      let pop = null;
      try { pop = await api(`/api/evolution/${currentRun}/population`); } catch {}
      const snapshot = pop?.heuristics ? [{
        generation: pop.generation ?? 0,
        heuristics: (pop.heuristics ?? []).map(h => ({
          concept: h.concept, algorithm: h.algorithm, features: h.features ?? [],
          objective: h.objective == null || h.objective === Infinity ? null : h.objective,
        })),
        memory: pop.memory ?? { positive_features: [], negative_features: [] },
      }] : [];
      const config = {
        framework_type: cfg.framework_type, population_size: cfg.population_size,
        num_generations: cfg.num_generations, num_mutation: cfg.num_mutation,
        num_hybridization: cfg.num_hybridization, num_reflection: cfg.num_reflection,
        num_policy_updates: cfg.num_policy_updates, preset_id: $("evo-preset")?.value,
        llm_model: cfg.llm_model, llm_base_url: cfg.llm_base_url, use_local_llm: cfg.use_local_llm,
        problem_override: cfg.problem_override, fun_name: cfg.fun_name, fun_args: cfg.fun_args,
        fun_return: cfg.fun_return, fun_notes: cfg.fun_notes, ascend: cfg.ascend,
        problem_path: cfg.problem_path, train_data: cfg.train_data, train_solution: cfg.train_solution,
      };
      if (cfg.framework_type === "custom") {
        config.framework_code = cfg.framework_code;
        config.framework_filename = cfg.framework_filename;
      }
      const name = `实例_${cfg.problem_key}_${new Date().toLocaleString("zh-CN").replace(/[/: ]/g, "-")}`;
      await api("/api/instances", { method: "POST", body: { name, framework_type: cfg.framework_type, problem_key: cfg.problem_key, config, run_id: currentRun, population_snapshot: snapshot } });
      toast(`实例已保存：${name}`, "ok");
    } catch (e) { errM.textContent = e.message; errM.style.display = ""; }
    finally { btn.disabled = false; }
  }

  async function pollOnce() {
    if (!currentRun) return;
    let st;
    try { st = await api(`/api/evolution/${currentRun}/status`); }
    catch (e) {
      if (e.status === 401) $("evm-status").innerHTML = needLoginHTML("监控进化状态需要登录");
      return;
    }
    $("evm-meta").textContent = `Run #${st.run_id ?? currentRun}`;
    $("evm-status").innerHTML = `
      <div class="grid cols-4">
        <div class="stat"><div class="k">状态</div><div class="v" style="font-size:18px">${statusBadge(st.status)}</div></div>
        <div class="stat"><div class="k">代数</div><div class="v mono" style="font-size:18px">${st.current_generation ?? 0} / ${st.total_generations ?? "—"}</div><div class="s">共 ${lastHistLen} 代进化记录</div></div>
        <div class="stat"><div class="k">最优适应度</div><div class="v mono" style="font-size:18px">${fmtObj(st.best_objective)}</div></div>
        <div class="stat"><div class="k">进度</div><div class="v mono" style="font-size:18px">${st.progress != null ? Math.round(st.progress * 100) + "%" : "—"}</div></div>
      </div>
      <div class="progress-track" style="margin-top:10px"><div class="progress-fill" style="width:${st.progress != null ? Math.round(st.progress * 100) : 0}%"></div></div>`;
  }

  async function pollResults() {
    if (!currentRun) return;
    let res;
    try { res = await api(`/api/evolution/${currentRun}/results`); }
    catch (e) {
      if (e.status === 401) $("evm-results").innerHTML = `<div class="card">${needLoginHTML("生成结果（曲线 / 种群 / token）需要登录后查看")}</div>`;
      return;
    }
    // 当代种群（含 concept / features / algorithm）
    let pop = null;
    try { pop = await api(`/api/evolution/${currentRun}/population`); } catch {}
    lastPop = pop ?? lastPop;
    lastHistLen = (res.history ?? []).length;
    const bh = res.best_heuristic ?? null;
    const hist = res.history ?? [];
    const box = $("evm-results");
    if (!hist.length && !(pop?.heuristics?.length)) { box.innerHTML = `<div class="hint" style="margin-top:10px">尚无代际数据，等待第一代完成…</div>`; return; }
    const last = hist[hist.length - 1];
    const xs = hist.map((h, i) => h.generation ?? i);
    const best = { name: "最优", color: "#22d3ee", points: hist.map((h, i) => ({ x: xs[i], y: h.best_objective, label: "第 " + xs[i] + " 代" })).filter(p => p.y != null) };
    const avg = { name: "均值", color: "#a78bfa", points: hist.map((h, i) => ({ x: xs[i], y: h.avg_objective, label: "第 " + xs[i] + " 代" })).filter(p => p.y != null) };
    const varS = { name: "方差", color: "#fb7185", dashed: true, points: hist.map((h, i) => ({ x: xs[i], y: h.variance, label: "第 " + xs[i] + " 代" })).filter(p => p.y != null) };
    const th = res.token_history ?? [];
    const lastTok = th[th.length - 1];
    const tokDeltas = th.map((t, i) => ({ label: String(t.generation ?? i), value: Math.max(0, (t.total_tokens ?? 0) - (i > 0 ? th[i - 1].total_tokens ?? 0 : 0)), tip: `第 ${t.generation ?? i} 代消耗` }));
    const popAsc = isAscend(monitorProblemKey ?? cfg.problem_key);
    const popBestVal = (() => {
      const objs = (pop?.heuristics ?? []).map(h => Number(h?.objective)).filter(isFinite);
      return objs.length ? (popAsc ? Math.min(...objs) : Math.max(...objs)) : null;
    })();
    const popHeurs = (pop?.heuristics ?? []).slice().sort((a, b) => {
      const x = Number(a?.objective), y = Number(b?.objective);
      const fx = isFinite(x), fy = isFinite(y);
      if (!fx && !fy) return 0;
      if (!fx) return 1;
      if (!fy) return -1;
      return popAsc ? x - y : y - x;
    });
    const mem = pop?.memory;
    box.innerHTML = `
      ${bh ? `<div class="card"><h2>最优算法 <span class="tail">第 ${bh.generation ?? "?"} 代 · 适应度 ${fmtObj(bh.objective)}</span></h2>
        <p class="drawer-text" style="margin-bottom:8px">${esc(bh.concept || "（无描述）")}</p>
        ${bh.algorithm ? `<div class="code-container"><button class="btn small copy-btn" data-action="copy" data-code="bestalg">复制</button>
        <pre data-codeblock="bestalg" style="max-height:320px">${esc(bh.algorithm)}</pre></div>` : ""}</div>` : ""}
      ${popHeurs.length ? `<div class="card"><h2>当代种群 <span class="tail">第 ${pop?.generation ?? "?"} 代 · ${popHeurs.length} 个个体</span></h2>
        <div class="chart-box">${barChartSVG(popHeurs.map((h, i) => ({ label: String(i + 1), value: Number(h?.objective ?? 0), tip: h?.concept || `个体 ${i + 1}` })), { height: 140 })}</div>
        <div class="pop-grid">${popHeurs.map((h, i) => `
          <button class="pop-card" data-pop="${i}" title="点击查看详情">
            <span class="pop-rank">${i + 1}</span>
            <span class="pop-obj mono">${fmtObj(h?.objective)}</span>
            ${popBestVal != null && Number(h?.objective) === popBestVal ? `<span class="badge src-local">本代最优</span>` : ""}
            <span class="pop-concept">${esc((h?.concept ?? "").slice(0, 48) || "（无描述）")}</span>
            <span class="pop-tags">${(h?.features ?? []).slice(0, 3).map(f => `<span class="badge feature-badge">${esc(f)}</span>`).join("")}</span>
          </button>`).join("")}</div>
        ${mem ? `<div class="grid cols-2" style="margin-top:10px">
          <div class="field"><label>CALM 正向记忆</label><div class="badge-row">${(mem.positive_features ?? []).map(f => `<span class="badge src-local">${esc(f)}</span>`).join("") || `<span class="hint">无</span>`}</div></div>
          <div class="field"><label>CALM 负向记忆</label><div class="badge-row">${(mem.negative_features ?? []).map(f => `<span class="badge src-api">${esc(f)}</span>`).join("") || `<span class="hint">无</span>`}</div></div>
        </div>` : ""}
      </div>` : ""}
      ${last?.top3?.length ? `<div class="card"><h2>每代前三 <span class="tail">第 ${last.generation} 代</span></h2>
        <div class="chart-box">${barChartSVG(last.top3.map((t, i) => ({ label: "#" + (i + 1), value: Number(t.objective), tip: t.concept || `#${i + 1}` })))}</div></div>` : ""}
      <div class="card"><h2>历代最优 / 均值 / 方差</h2>
        <div class="legend"><span><span class="dot" style="background:#22d3ee"></span>最优</span><span><span class="dot" style="background:#a78bfa"></span>均值</span><span><span class="dot" style="background:#fb7185"></span>方差</span></div>
        <div class="chart-box">${lineChartSVG([best, avg, varS], { yLabel: "适应度", xFormat: x => "第" + Math.round(x) + "代" })}</div></div>
      ${last?.objectives?.length && !popHeurs.length ? `<div class="card"><h2>当前代种群分布 <span class="tail">${last.objectives.length} 个个体</span></h2>
        <div class="chart-box">${barChartSVG(last.objectives.map((o, i) => ({ label: String(i + 1), value: Number(o), tip: `个体 ${i + 1}` })))}</div></div>` : ""}
      ${th.length ? `<div class="card"><h2>Token 消耗</h2>
        <div class="grid cols-3">
          <div class="stat"><div class="k">累计输入</div><div class="v mono" style="font-size:18px">${fmtTokens(lastTok.prompt_tokens)}</div></div>
          <div class="stat"><div class="k">累计输出</div><div class="v mono" style="font-size:18px">${fmtTokens(lastTok.completion_tokens)}</div></div>
          <div class="stat"><div class="k">累计总量</div><div class="v mono" style="font-size:18px">${fmtTokens(lastTok.total_tokens)}</div></div>
        </div>
        <div class="chart-box" style="margin-top:10px">${barChartSVG(tokDeltas)}</div></div>` : ""}`;
    box.querySelectorAll("[data-pop]").forEach(card => card.addEventListener("click", () => {
      const h = popHeurs[Number(card.dataset.pop)];
      if (!h) return;
      openDrawer(`
        <div class="drawer-head"><h3>种群个体 #${Number(card.dataset.pop) + 1}</h3><button class="drawer-close" data-action="close-drawer">×</button></div>
        <div class="grid-2">
          <div class="kv"><span class="k">适应度</span><span class="mono">${fmtObj(h?.objective)}</span></div>
          <div class="kv"><span class="k">代数</span><span class="mono">${esc(pop?.generation ?? "—")}</span></div>
        </div>
        <div class="field"><label>启发式思想</label><p class="drawer-text">${esc(h?.concept ?? "—")}</p></div>
        <div class="field"><label>关键词组</label><div class="badge-row">${(h?.features ?? []).map(f => `<span class="badge feature-badge">${esc(f)}</span>`).join("") || `<span class="hint">无</span>`}</div></div>
        ${h?.algorithm ? `<div class="field"><label>算法代码</label>
          <div class="code-container"><button class="btn small copy-btn" data-action="copy" data-code="popalg">复制</button>
          <pre data-codeblock="popalg">${esc(h.algorithm)}</pre></div></div>` : ""}`);
    }));
  }

  async function openPromptEditor() {
    const box = $("evm-prompt");
    if (!currentRun) { toast("请先选择一个进化 Run", "err"); return; }
    if (box.innerHTML) { box.innerHTML = ""; return; }
    box.innerHTML = `<div class="loading-row"><span class="spinner"></span>加载提示词…</div>`;
    let p;
    try { p = await api(`/api/evolution/${currentRun}/prompt`); }
    catch (e) { box.innerHTML = `<div class="error-banner">加载失败：${esc(e.message)}</div>`; return; }
    const isCode = p.framework_code != null;
    const content = isCode ? p.framework_code : JSON.stringify(p.components ?? {}, null, 2);
    box.innerHTML = `
      <div class="field" style="margin-top:10px"><label>${isCode ? "框架代码（framework_code）" : "提示词组件（components JSON）"}</label>
        <div class="code-container"><button class="btn small copy-btn" data-action="copy" data-code="prompt">复制</button>
        <pre contenteditable="true" spellcheck="false" data-codeblock="prompt" style="max-height:280px;white-space:pre-wrap">${esc(content)}</pre></div></div>
      <button class="btn small primary" id="evm-prompt-save">保存提示词</button>
      <span class="hint" id="evm-prompt-state" style="margin-left:8px">修改将注入下一代的进化提示</span>`;
    $("evm-prompt-save").addEventListener("click", async () => {
      const text = box.querySelector("[data-codeblock]").textContent;
      try {
        const body = isCode ? { framework_code: text } : { components: JSON.parse(text) };
        await api(`/api/evolution/${currentRun}/prompt`, { method: "POST", body });
        $("evm-prompt-state").textContent = "✔ 已保存";
        toast("提示词已保存", "ok");
      } catch (e) { $("evm-prompt-state").textContent = "✘ " + e.message; }
    });
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollOnce(); pollResults();
    pollTimer = setInterval(() => {
      if (!currentRun) return;
      pollOnce();
      api(`/api/evolution/${currentRun}/status`).then(st => {
        pollResults();
        if (!STATUS_ACTIVE.has(st.status) && pollTimer) { clearInterval(pollTimer); pollTimer = null; pollResults(); refreshHistory(); }
      }).catch(() => {});
    }, 3000);
    addTimer(pollTimer);
  }

  async function refreshHistory() {
    let runs = [];
    try { runs = (await api("/api/evolution/my")).runs ?? []; } catch {}
    evoRuns = runs;
    $("evo-history").innerHTML = runs.length ? `<div class="table-wrap"><table>
      <thead><tr><th class="num">ID</th><th>问题</th><th>状态</th><th class="num">最优适应度</th><th></th></tr></thead>
      <tbody>${runs.map(r => `<tr class="${r.run_id === currentRun ? "rank-top3" : ""}">
        <td class="num mono">${esc(r.run_id)}</td><td>${esc(r.problem_key ?? "—")}</td>
        <td>${statusBadge(r.status)}</td><td class="num mono">${fmtObj(r.best_objective)}</td>
        <td><button class="btn small" data-run="${esc(r.run_id)}">监控</button></td></tr>`).join("")}</tbody></table></div>`
      : emptyHTML("🧫", "暂无进化记录，从上方发起第一次进化");
    $("evo-history").querySelectorAll("[data-run]").forEach(b => b.addEventListener("click", () => {
      currentRun = Number(b.dataset.run);
      const rr = evoRuns.find(x => Number(x.run_id) === currentRun);
      if (rr) monitorProblemKey = rr.problem_key ?? null;
      localStorage.setItem("nova_current_run", String(currentRun));
      renderMonitor(); startPolling();
    }));
  }

  renderMonitor();
  if (currentRun) { startPolling(); } else { $("evm-status").innerHTML = `<div class="hint">暂无进行中的进化，从左侧发起，或在下方历史中选择。</div>`; }
  applyPreset();
  applyLocalUi();
  loadProblemDetail();
  refreshHistory();
}

/* ==================== 自定义问题页 ==================== */
async function viewCprob(view) {
  let list = [];
  const loggedIn = !!(getToken() && getStoredUser());
  const presets = await api("/api/llm-presets").then(r => r.presets ?? []).catch(() => []);

  view.innerHTML = `<div class="card">
    <h2>自定义问题 <span class="tail">公开列表 · 上传与 Agent 建题需登录</span></h2>
    <div class="chip-row" style="margin-bottom:12px">
      <button class="btn small" id="cp-upload-btn">⬆ 上传数据文件</button><input type="file" id="cp-upload-in" multiple style="display:none">
      ${loggedIn ? `<button class="btn small primary" id="cp-agent-btn">🤖 Agent 建题</button>` : `<span class="hint">登录后可上传文件或用 Agent 自动建题</span>`}
    </div>
    <div id="cp-list"><div class="loading-row"><span class="spinner"></span>加载中…</div></div>
  </div>
  <div id="cp-agent"></div>`;

  const $ = sel => view.querySelector(sel.includes("#") ? sel : "#" + sel);

  async function loadList() {
    try { list = await api("/api/custom-problems"); }
    catch (e) { $("cp-list").innerHTML = `<div class="error-banner">加载失败：${esc(e.message)}</div>`; return; }
    if (!Array.isArray(list) || !list.length) { $("cp-list").innerHTML = emptyHTML("🧩", "还没有自定义问题，上传数据文件或用 Agent 建一个"); return; }
    $("cp-list").innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>问题名称</th><th>标识 key</th><th>进化方向</th><th>分类</th><th>函数名</th><th></th></tr></thead>
      <tbody>${list.map(p => `<tr>
        <td><b>${esc(p.name ?? p.problem_key ?? "—")}</b>${p.description ? `<div class="hint" style="max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(p.description)}">${esc(p.description)}</div>` : ""}</td>
        <td class="mono">${esc(p.problem_key ?? p.key ?? "—")}</td>
        <td>${p.ascend === false ? `<span class="badge src-api">越大越好</span>` : `<span class="badge src-local">越小越好</span>`}</td>
        <td>${esc(p.category ?? "自定义")}</td>
        <td class="mono">${esc(p.fun_name ?? "—")}</td>
        <td>${loggedIn ? `<button class="btn small danger" data-del="${esc(p.problem_key ?? p.key)}" data-name="${esc(p.name ?? "")}">删除</button>` : ""}</td>
      </tr>`).join("")}</tbody></table></div>`;
    $("cp-list").querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm(`确认删除问题「${b.dataset.name || b.dataset.del}」？此操作不可撤销。`)) return;
      try { await api(`/api/custom-problems/${b.dataset.del}`, { method: "DELETE" }); toast("已删除", "ok"); loadList(); }
      catch (e) { toast(e.message, "err"); }
    }));
  }

  $("cp-upload-btn").addEventListener("click", () => {
    if (!loggedIn) { toast("请先登录", "err"); return; }
    $("cp-upload-in").click();
  });
  $("cp-upload-in").addEventListener("change", async e => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    const fd = new FormData();
    files.forEach(f => fd.append("files", f, f.name));
    try {
      const resp = await fetch(apiBase() + "/api/custom-problems/upload", { method: "POST", headers: { Authorization: `Bearer ${getToken() ?? ""}` }, body: fd });
      const j = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(j?.detail ?? resp.statusText);
      toast(`已上传 ${files.length} 个文件`, "ok");
      loadList();
    } catch (e2) { toast("上传失败：" + e2.message, "err"); }
  });

  /* ---------- Agent 建题 ---------- */
  $("cp-agent-btn")?.addEventListener("click", () => {
    const box = $("cp-agent");
    if (box.innerHTML) { box.innerHTML = ""; return; }
    box.innerHTML = `<div class="card">
      <h2>🤖 Agent 自动建题 <span class="tail">描述问题 → 生成任务计划 → 执行 → 审批</span></h2>
      <div class="grid cols-2">
        <div class="field"><label>问题名称 *</label><input id="ag-name" placeholder="如：柔性作业车间调度"></div>
        <div class="field"><label>数据目录 source_dir（可选）</label><input class="mono" id="ag-src" placeholder="留空由 Agent 自行生成数据"></div>
      </div>
      <div class="field"><label>问题描述 *</label><textarea class="input" id="ag-desc" rows="3" placeholder="描述问题的输入、决策与目标…"></textarea></div>
      <div class="grid cols-3">
        <div class="field"><label>LLM 预设</label><select id="ag-preset">${presets.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></div>
        <div class="field"><label>模型 ID</label><input id="ag-model"></div>
        <div class="field"><label>Base URL</label><input id="ag-baseurl"></div>
      </div>
      <div class="chip-row" style="margin-bottom:8px">
        <button class="chip on" id="ag-local">使用实验室本地 LLM</button>
        <input class="input" id="ag-apikey" placeholder="api key（走 API 时填）" style="display:none;max-width:260px">
      </div>
      <div class="error-banner" id="ag-err" style="display:none"></div>
      <button class="btn primary" id="ag-plan">① 生成任务计划</button>
      <div id="ag-tasks" style="margin-top:12px"></div>
    </div>`;
    const ag$ = sel => view.querySelector("#cp-agent " + (sel.includes("#") ? sel : "#" + sel));
    const presetSel = ag$("ag-preset");
    const applyP = () => { const p = presets.find(x => x.id === presetSel.value); if (p) { ag$("ag-model").value = p.id; ag$("ag-baseurl").value = p.base_url; } };
    presetSel.addEventListener("change", applyP); applyP();
    ag$("ag-local").addEventListener("click", () => {
      const on = ag$("ag-local").classList.toggle("on");
      ag$("ag-apikey").style.display = on ? "none" : "";
    });

    let plan = null, runId = null, pollT = null;

    ag$("ag-plan").addEventListener("click", async () => {
      const err = ag$("ag-err"); err.style.display = "none";
      const name = ag$("ag-name").value.trim(), desc = ag$("ag-desc").value.trim();
      if (!name || !desc) { err.textContent = "请填写问题名称与描述"; err.style.display = ""; return; }
      ag$("ag-plan").disabled = true;
      ag$("ag-tasks").innerHTML = `<div class="loading-row"><span class="spinner"></span>Agent 规划中…</div>`;
      try {
        plan = await api("/api/custom-problems/agent/plan", {
          method: "POST",
          body: {
            name, description: desc || undefined, source_dir: ag$("ag-src").value.trim() || undefined,
            llm_config: { base_url: ag$("ag-baseurl").value.trim(), model: ag$("ag-model").value.trim(), api_key: ag$("ag-apikey").value.trim(), use_local_llm: ag$("ag-local").classList.contains("on") },
          },
        });
        renderTasks();
      } catch (e) { ag$("ag-tasks").innerHTML = ""; err.textContent = e.message; err.style.display = ""; }
      finally { ag$("ag-plan").disabled = false; }
    });

    function renderTasks() {
      const tasks = plan?.tasks ?? [];
      ag$("ag-tasks").innerHTML = `
        ${plan?.meta?.name ? `<div class="section-note">计划名称：<b>${esc(plan.meta.name)}</b>${plan?.plan_id ? ` · plan_id <span class="mono">${esc(plan.plan_id)}</span>` : ""}</div>` : ""}
        ${tasks.length ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>任务类型</th><th>说明</th></tr></thead>
          <tbody>${tasks.map((t, i) => `<tr><td class="mono">${i + 1}</td><td><span class="badge feature-badge">${esc(CP_TASK_LABEL[t.type] ?? t.type ?? "任务")}</span></td>
          <td class="hint">${esc(t.description ?? t.goal ?? t.detail ?? JSON.stringify(t).slice(0, 160))}</td></tr>`).join("")}</tbody></table></div>` : `<div class="hint">计划为空</div>`}
        <button class="btn primary" id="ag-exec" style="margin-top:10px">② 执行计划</button>
        <div id="ag-run" style="margin-top:10px"></div>`;
      view.querySelector("#ag-exec").addEventListener("click", async () => {
        try {
          const r = await api("/api/custom-problems/agent/execute", { method: "POST", body: { plan_id: plan.plan_id, name: ag$("ag-name").value.trim() || undefined, description: ag$("ag-desc").value.trim() || undefined } });
          runId = r.run_id ?? r.id ?? null;
          if (runId) { pollRun(); pollT = setInterval(pollRun, 3000); addTimer(pollT); }
        } catch (e) { const err = ag$("ag-err"); err.textContent = e.message; err.style.display = ""; }
      });
    }

    async function pollRun() {
      if (!runId) return;
      let st;
      try { st = await api(`/api/custom-problems/agent/runs/${runId}`); } catch { return; }
      const box = ag$("ag-run");
      if (!box) { if (pollT) clearInterval(pollT); return; }
      const done = (st.current_task_index ?? 0);
      const total = (st.tasks ?? []).length || Math.max(done, 1);
      const pending = st.pending_file;
      box.innerHTML = `
        <div class="grid cols-3">
          <div class="stat"><div class="k">状态</div><div class="v" style="font-size:16px">${esc(st.status ?? "—")}</div></div>
          <div class="stat"><div class="k">任务进度</div><div class="v mono" style="font-size:16px">${done} / ${total}</div></div>
          <div class="stat"><div class="k">Run</div><div class="v mono" style="font-size:16px">#${esc(runId)}</div></div>
        </div>
        <div class="progress-track" style="margin:10px 0"><div class="progress-fill" style="width:${total ? Math.round(done / total * 100) : 0}%"></div></div>
        ${st.error ? `<div class="error-banner">${esc(st.error)}</div>` : ""}
        ${pending ? `<div class="field"><label>待审批文件：<span class="mono">${esc(pending.path ?? pending.name ?? "")}</span>（${esc(CP_TASK_LABEL[pending.type] ?? pending.type ?? "文件")}）</label>
          <div class="chip-row">
            <button class="btn small primary" id="ag-ok">✔ 通过并继续</button>
            <button class="btn small danger" id="ag-no">✘ 拒绝</button>
            <input class="input" id="ag-fb" placeholder="拒绝时的反馈意见" style="max-width:280px">
          </div>
          ${pending.preview ? `<div class="code-container"><pre style="max-height:200px">${esc(pending.preview)}</pre></div>` : ""}
        </div>` : ""}
        ${st.status === "completed" ? `<div class="section-note">🎉 自定义问题已创建：${st.custom_problem ? `<b>${esc(st.custom_problem.name ?? st.custom_problem.problem_key ?? "")}</b>（key: <span class="mono">${esc(st.custom_problem.problem_key ?? "")}</span>）` : "完成"}</div>` : ""}`;
      if (STATUS_DONE.has(st.status) && pollT) { clearInterval(pollT); pollT = null; loadList(); }
      const okBtn = box.querySelector("#ag-ok"), noBtn = box.querySelector("#ag-no");
      if (okBtn && pending) {
        const approve = async approved => {
          try {
            await api("/api/custom-problems/agent/approve", { method: "POST", body: { run_id: runId, path: pending.path, approved, feedback: approved ? undefined : (box.querySelector("#ag-fb")?.value.trim() || undefined) } });
            pollRun();
          } catch (e) { toast(e.message, "err"); }
        };
        okBtn.addEventListener("click", () => approve(true));
        noBtn.addEventListener("click", () => approve(false));
      }
    }
  });

  await loadList();
}
const STATUS_DONE = new Set(["completed", "failed", "stopped"]);
