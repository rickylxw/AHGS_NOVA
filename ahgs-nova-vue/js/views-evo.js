/* ============ Vue 版视图：进化 / 自定义问题 ============ */
"use strict";

/* ==================== 进化页 ==================== */
const EvoView = {
  components: { EmptyState, FwBadge, SrcBadge, Avatar },
  props: ["params"],
  template: `
  <div v-if="!getToken() || !store.user">
    <div class="card"><EmptyState icon="🔐" desc="发起与监控进化需要登录" /></div>
  </div>
  <div v-else>
    <div class="grid evo-grid">
      <div class="card">
        <h2>发起进化 <span class="tail">参数与原站一致</span></h2>
        <div class="field"><label>加载实例配置</label>
          <select v-model="instSel" @change="loadInstance">
            <option value="">— 选择已保存的实例 —</option>
            <option v-for="i in instances" :key="i.id" :value="String(i.id)">{{ i.name }}（{{ fwName(i.framework_type) }} · {{ i.problem_key ?? "" }}）</option>
          </select></div>
        <div class="field"><label>问题情景</label>
          <select v-model="cfg.problem_key" @change="loadProblemDetail">
            <option v-for="p in store.problems" :key="p.key" :value="p.key">{{ p.name }}</option>
          </select></div>
        <div class="field"><label>框架类型</label><div class="chip-row">
          <button v-for="ft in ['calm','eoh_nseh','custom']" :key="ft" class="chip" :class="{ on: cfg.framework_type === ft }" @click="cfg.framework_type = ft">{{ fwName(ft) }}</button>
        </div></div>
        <div class="grid cols-3">
          <div class="field" v-for="(meta, k) in numFields" :key="k"><label>{{ meta }}</label>
            <input type="number" min="0" v-model.number="cfg[k]"></div>
        </div>
        <div class="field"><label>LLM 预设</label>
          <select v-model="presetSel" @change="applyPreset">
            <option v-for="p in presets" :key="p.id" :value="p.id">{{ p.name }}（{{ p.provider }}）</option>
            <option value="custom">自定义（手动填写 Base URL / 模型）</option>
          </select></div>
        <template v-if="!cfg.use_local_llm">
          <div class="grid cols-2">
            <div class="field"><label>模型 ID</label><input v-model="cfg.llm_model" placeholder="自定义模型名，如 custom-model"></div>
            <div class="field"><label>API key</label><input v-model="cfg.api_key" placeholder="你的 api key"></div>
          </div>
          <div class="field"><label>Base URL（含端口）</label><input v-model="cfg.llm_base_url" placeholder="https://api.deepseek.com/v1"></div>
        </template>
        <div class="field"><label>&nbsp;</label><div class="chip-row">
          <button class="chip" :class="{ on: cfg.use_local_llm }" @click="cfg.use_local_llm = !cfg.use_local_llm">使用实验室本地LLM（Qwen3-30B）</button>
        </div>
        <div class="hint">{{ cfg.use_local_llm ? "已选择实验室本地 LLM，无需配置 API Key / Base URL / 模型。" : "将改用你自己的 API：请填写 Base URL（含端口）、模型名与 API Key。" }}</div></div>

        <div v-if="cfg.framework_type === 'custom'">
          <div class="mine-head"><span class="mine-title">自定义进化框架</span><span class="hint">上传 framework.py，平台加载后随进化启动</span></div>
          <div class="field"><label>框架文件名</label><input v-model="cfg.framework_filename"></div>
          <div class="field"><label>framework.py 源码</label>
            <div class="code-container"><button class="btn small copy-btn" @click="copyText(cfg.framework_code)">复制</button>
            <textarea v-model="cfg.framework_code" spellcheck="false" style="width:100%;min-height:220px;background:transparent;border:none;outline:none;color:#d7e3ff;font-family:Consolas,monospace;font-size:12.5px;padding:10px;resize:vertical"></textarea></div></div>
          <div class="chip-row" style="margin-bottom:8px">
            <button class="btn small" @click="$refs.fwfile.click()">📁 选择本地文件</button>
            <input type="file" ref="fwfile" accept=".py" style="display:none" @change="readFwFile">
            <button class="btn small" @click="validateFw">✔ 校验</button>
            <button class="btn small" @click="uploadFw">⬆ 上传并加载</button>
            <span class="hint">{{ fwState }}</span>
          </div>
          <div v-if="validateOut"><pre class="mono" style="max-height:160px;overflow:auto;background:var(--code-bg);color:#d7e3ff;padding:10px;border-radius:8px;font-size:12px">{{ validateOut }}</pre></div>
        </div>

        <div class="field"><label>&nbsp;</label>
          <button class="chip" @click="advOpen = !advOpen">{{ advOpen ? "▾" : "▸" }} 高级参数（函数签名 / 训练数据 / 进化方向）</button></div>
        <div v-if="advOpen">
          <div class="field"><label>问题描述覆盖（problem_override）</label><textarea class="input" v-model="cfg.problem_override" rows="3"></textarea></div>
          <div class="grid cols-2">
            <div class="field"><label>函数名 fun_name</label><input v-model="cfg.fun_name"></div>
            <div class="field"><label>进化方向</label>
              <select :value="cfg.ascend ? 'true' : 'false'" @change="cfg.ascend = $event.target.value === 'true'">
                <option value="true">适应度越小越好</option>
                <option value="false">适应度越大越好</option>
              </select></div>
          </div>
          <div class="grid cols-2">
            <div class="field"><label>fun_args（JSON 数组）</label><textarea class="input mono" v-model="funArgsText" rows="2"></textarea></div>
            <div class="field"><label>fun_return（JSON 数组）</label><textarea class="input mono" v-model="funRetText" rows="2"></textarea></div>
          </div>
          <div class="field"><label>fun_notes</label><input v-model="cfg.fun_notes"></div>
          <div class="field"><label>problem_path（问题文件路径）</label><input class="mono" v-model="cfg.problem_path"></div>
          <div class="grid cols-2">
            <div class="field"><label>训练数据 train_data</label><textarea class="input mono" v-model="cfg.train_data" rows="2"></textarea></div>
            <div class="field"><label>训练解 train_solution</label><textarea class="input mono" v-model="cfg.train_solution" rows="2"></textarea></div>
          </div>
        </div>
        <div class="error-banner" v-if="formErr">{{ formErr }}</div>
        <div class="chip-row">
          <button class="btn primary" :disabled="starting" @click="launch">🚀 启动进化</button>
          <button class="btn" v-if="cfg.framework_type === 'custom'" :disabled="devRunning" @click="devRun">▶ 开发者运行（framework_id）</button>
        </div>
      </div>

      <div class="card">
        <h2>实时监控 <span class="tail">{{ currentRun ? "Run #" + currentRun : "" }}</span></h2>
        <div class="chip-row" style="margin-bottom:10px">
          <button class="btn small" :disabled="!currentRun || ctrlBusy" @click="ctrl('pause')">⏸ 暂停</button>
          <button class="btn small" :disabled="!currentRun || ctrlBusy" @click="ctrl('resume')">▶ 继续</button>
          <button class="btn small danger" :disabled="!currentRun || ctrlBusy" @click="ctrl('stop')">⏹ 停止</button>
          <button class="btn small" :disabled="!currentRun || ctrlBusy" @click="ctrl('submit')">🏆 提交最优</button>
          <button class="btn small" :disabled="!currentRun" @click="promptOpen = !promptOpen">📝 提示词</button>
          <button class="btn small" :disabled="!currentRun || savingInst" @click="saveInstance">💾 保存实例</button>
        </div>
        <div class="error-banner" v-if="ctrlErr">{{ ctrlErr }}</div>
        <div v-if="!currentRun" class="hint">暂无进行中的进化，从左侧发起，或在下方历史中选择。</div>
        <template v-else>
          <div class="grid cols-4">
            <div class="stat"><div class="k">状态</div><div class="v" style="font-size:18px"><span class="badge" :class="'evo-st-' + status.status">{{ statusName(status.status) }}</span></div></div>
            <div class="stat"><div class="k">代数</div><div class="v mono" style="font-size:18px">{{ status.current_generation ?? 0 }} / {{ status.total_generations ?? "—" }}</div><div class="s">共 {{ (results?.history ?? []).length }} 代进化记录</div></div>
            <div class="stat"><div class="k">最优适应度</div><div class="v mono" style="font-size:18px">{{ fmtObj(status.best_objective) }}</div></div>
            <div class="stat"><div class="k">进度</div><div class="v mono" style="font-size:18px">{{ status.progress != null ? Math.round(status.progress * 100) + "%" : "—" }}</div></div>
          </div>
          <div class="progress-track" style="margin-top:10px"><div class="progress-fill" :style="{ width: (status.progress != null ? Math.round(status.progress * 100) : 0) + '%' }"></div></div>
          <div v-if="resultsErr" class="error-banner" style="margin-top:10px">
            {{ resultsErr.startsWith('401') || resultsErr.includes('登录') ? '' : '' }}{{ resultsErr }}
            <div v-if="resultsErr.includes('登录')" style="margin-top:8px"><button class="btn primary" @click="store.loginModal = true">登录 / 注册</button></div>
          </div>
          <template v-if="results">
            <div v-if="bestHeur" style="margin-top:14px">
              <div class="mine-head"><span class="mine-title">最优算法</span>
                <span class="hint">第 {{ bestHeur.generation ?? "?" }} 代 · 适应度 {{ fmtObj(bestHeur.objective) }}</span></div>
              <p class="drawer-text" style="margin-bottom:8px">{{ bestHeur.concept || "（无描述）" }}</p>
              <div v-if="bestHeur.algorithm" class="code-container">
                <button class="btn small copy-btn" @click="copyText(bestHeur.algorithm)">复制</button>
                <pre style="max-height:320px">{{ bestHeur.algorithm }}</pre></div>
            </div>
            <div v-if="popHeurs.length" style="margin-top:14px">
              <div class="mine-head"><span class="mine-title">当代种群</span>
                <span class="hint">第 {{ pop.generation ?? "?" }} 代 · {{ popHeurs.length }} 个个体</span></div>
              <div class="chart-box" v-html="popChart"></div>
              <div class="pop-grid">
                <button v-for="(h, i) in popHeurs" :key="i" class="pop-card" @click="showHeur(h, i)">
                  <span class="pop-rank">{{ i + 1 }}</span>
                  <span class="pop-obj mono">{{ fmtObj(h.objective) }}</span>
                  <span v-if="popBest != null && Number(h.objective) === popBest" class="badge src-local">本代最优</span>
                  <span class="pop-concept">{{ (h.concept || "").slice(0, 48) || "（无描述）" }}</span>
                  <span class="pop-tags"><span v-for="f in (h.features ?? []).slice(0, 3)" :key="f" class="badge feature-badge">{{ f }}</span></span>
                </button>
              </div>
              <div v-if="pop && pop.memory" class="grid cols-2" style="margin-top:10px">
                <div class="field"><label>CALM 正向记忆</label><div class="badge-row">
                  <span v-for="f in (pop.memory.positive_features ?? [])" :key="f" class="badge src-local">{{ f }}</span>
                  <span v-if="!(pop.memory.positive_features ?? []).length" class="hint">无</span></div></div>
                <div class="field"><label>CALM 负向记忆</label><div class="badge-row">
                  <span v-for="f in (pop.memory.negative_features ?? [])" :key="f" class="badge src-api">{{ f }}</span>
                  <span v-if="!(pop.memory.negative_features ?? []).length" class="hint">无</span></div></div>
              </div>
            </div>
            <div v-if="top3.length" style="margin-top:14px">
              <div class="mine-head"><span class="mine-title">每代前三</span><span class="hint">第 {{ lastGen.generation }} 代</span></div>
              <div class="chart-box" v-html="top3Chart"></div>
            </div>
            <div class="mine-head" style="margin-top:14px"><span class="mine-title">历代最优 / 均值 / 方差</span></div>
            <div class="legend"><span><span class="dot" style="background:#22d3ee"></span>最优</span><span><span class="dot" style="background:#a78bfa"></span>均值</span><span><span class="dot" style="background:#fb7185"></span>方差</span></div>
            <div class="chart-box" v-html="histChart"></div>
            <template v-if="tokenHistory.length">
              <div class="mine-head" style="margin-top:14px"><span class="mine-title">Token 消耗</span></div>
              <div class="grid cols-3">
                <div class="stat"><div class="k">累计输入</div><div class="v mono" style="font-size:18px">{{ fmtTokens(lastTok.prompt_tokens) }}</div></div>
                <div class="stat"><div class="k">累计输出</div><div class="v mono" style="font-size:18px">{{ fmtTokens(lastTok.completion_tokens) }}</div></div>
                <div class="stat"><div class="k">累计总量</div><div class="v mono" style="font-size:18px">{{ fmtTokens(lastTok.total_tokens) }}</div></div>
              </div>
              <div class="chart-box" style="margin-top:10px" v-html="tokDeltaChart"></div>
            </template>
          </template>
          <div v-else-if="!resultsErr" class="hint" style="margin-top:10px">尚无代际数据，等待第一代完成…</div>

          <div v-if="promptOpen && currentRun" style="margin-top:14px">
            <div class="field"><label>{{ promptIsCode ? "框架代码（framework_code）" : "提示词组件（components JSON）" }}</label>
              <div class="code-container"><button class="btn small copy-btn" @click="copyText(promptText)">复制</button>
                <textarea v-model="promptText" spellcheck="false" style="width:100%;min-height:200px;background:transparent;border:none;outline:none;color:#d7e3ff;font-family:Consolas,monospace;font-size:12.5px;padding:10px;resize:vertical"></textarea></div></div>
            <button class="btn small primary" @click="savePrompt">保存提示词</button>
            <span class="hint" style="margin-left:8px">修改将注入下一代的进化提示 {{ promptState }}</span>
          </div>
        </template>
      </div>
    </div>

    <div class="card">
      <h2>我的进化记录 <span class="tail">点击「监控」查看实时曲线与控制</span></h2>
      <div v-if="!runs.length" class="empty"><div class="ico">🧫</div>暂无进化记录，从上方发起第一次进化</div>
      <div v-else class="table-wrap"><table>
        <thead><tr><th class="num">ID</th><th>问题</th><th>状态</th><th class="num">最优适应度</th><th></th></tr></thead>
        <tbody>
          <tr v-for="r in runs" :key="r.run_id" :class="{ 'rank-top3': r.run_id === currentRun }">
            <td class="num mono">{{ r.run_id }}</td><td>{{ r.problem_key ?? "—" }}</td>
            <td><span class="badge" :class="'evo-st-' + r.status">{{ statusName(r.status) }}</span></td>
            <td class="num mono">{{ fmtObj(r.best_objective) }}</td>
            <td><button class="btn small" @click="watchRun(r.run_id)">监控</button></td>
          </tr>
        </tbody>
      </table></div>
    </div>
  </div>`,
  props: ["params"],
  setup(props) {
    const presets = ref([]), instances = ref([]), runs = ref([]);
    const cfg = reactive({
      problem_key: props.params.get("problem") || store.problems[0]?.key || "",
      framework_type: "calm", ...EVO_DEFAULTS,
      preset_id: "", llm_model: "", llm_base_url: "", use_local_llm: true, api_key: "",
      problem_override: "", fun_name: "", fun_args: [], fun_return: [], fun_notes: "",
      ascend: true, problem_path: "", train_data: "", train_solution: "",
      framework_code: "", framework_filename: "framework.py", framework_id: null,
    });
    const numFields = { population_size: "种群容量", num_generations: "进化代数", num_mutation: "突变数", num_hybridization: "杂交数", num_reflection: "反思数", num_policy_updates: "策略更新数" };
    const funArgsText = ref("[]"), funRetText = ref("[]");
    const presetSel = ref(""), instSel = ref("");
    const advOpen = ref(false), formErr = ref(""), starting = ref(false), devRunning = ref(false);
    const fwState = ref(""), validateOut = ref("");
    const currentRun = ref(Number(props.params.get("run")) || Number(localStorage.getItem("nova_current_run")) || null);
    const status = ref({}), results = ref(null), resultsErr = ref("");
    const pop = ref(null);
    const ctrlBusy = ref(false), ctrlErr = ref(""), savingInst = ref(false);
    const promptOpen = ref(false), promptText = ref(""), promptIsCode = ref(false), promptState = ref("");
    let pollTimer = null;

    onMounted(async () => {
      presets.value = await api("/api/llm-presets").then(r => r.presets ?? []).catch(() => []);
      instances.value = await api("/api/instances").then(r => r.instances ?? []).catch(() => []);
      runs.value = await api("/api/evolution/my").then(r => r.runs ?? []).catch(() => []);
      if (!cfg.preset_id && presets.value.length) cfg.preset_id = presets.value[0].id;
      presetSel.value = cfg.preset_id;
      applyPreset();
      loadProblemDetail();
      if (currentRun.value) startPolling();
    });

    function applyPreset() {
      if (presetSel.value === "custom") { cfg.llm_model = ""; cfg.llm_base_url = ""; return; }
      const p = presets.value.find(x => x.id === presetSel.value);
      if (p) { cfg.llm_model = p.id; cfg.llm_base_url = p.base_url; }
    }
    async function loadProblemDetail() {
      try {
        const d = await api(`/api/problems/${cfg.problem_key}`);
        cfg.problem_override = d.description ?? "";
        cfg.fun_name = d.fun_name ?? ""; cfg.fun_args = d.fun_args ?? []; cfg.fun_return = d.fun_return ?? [];
        cfg.fun_notes = d.fun_notes ?? ""; cfg.ascend = d.ascend !== false;
        cfg.problem_path = d.problem_path ?? ""; cfg.train_data = d.train_data ?? ""; cfg.train_solution = d.train_solution ?? "";
        funArgsText.value = JSON.stringify(cfg.fun_args ?? []);
        funRetText.value = JSON.stringify(cfg.fun_return ?? []);
      } catch {}
    }
    async function loadInstance() {
      const inst = instances.value.find(x => String(x.id) === instSel.value);
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
        framework_code: inst.config?.framework_code ?? cfg.framework_code,
        framework_filename: inst.config?.framework_filename ?? cfg.framework_filename,
      });
      funArgsText.value = JSON.stringify(cfg.fun_args ?? []);
      funRetText.value = JSON.stringify(cfg.fun_return ?? []);
      toast(`已加载实例「${inst.name}」的配置`, "ok");
    }
    function readFwFile(ev) {
      const f = ev.target.files?.[0];
      ev.target.value = "";
      if (f) f.text().then(t => { cfg.framework_code = t; cfg.framework_filename = f.name; });
    }
    async function validateFw() {
      fwState.value = "校验中…";
      try {
        const r = await api("/api/developer/validate", { method: "POST", body: { framework_code: cfg.framework_code } });
        validateOut.value = typeof r === "string" ? r : JSON.stringify(r, null, 2);
        fwState.value = (r && (r.valid ?? r.ok) !== false) ? "✔ 校验通过" : "✘ 校验未通过";
      } catch (e) { fwState.value = "✘ " + e.message; }
    }
    async function uploadFw() {
      fwState.value = "上传中…";
      try {
        const r = await api("/api/developer/upload", { method: "POST", body: { framework_code: cfg.framework_code, framework_filename: cfg.framework_filename || "framework.py" } });
        cfg.framework_id = r.framework_id ?? null;
        fwState.value = `⬆ 已上传并加载「${cfg.framework_filename}」`;
        toast("框架已上传并加载", "ok");
      } catch (e) { fwState.value = "✘ " + e.message; }
    }
    function collectBody() {
      let fa, fr;
      try { fa = JSON.parse(funArgsText.value || "[]"); } catch { throw new Error("fun_args 不是合法 JSON 数组"); }
      try { fr = JSON.parse(funRetText.value || "[]"); } catch { throw new Error("fun_return 不是合法 JSON 数组"); }
      const body = {
        problem_key: cfg.problem_key, framework_type: cfg.framework_type,
        population_size: Number(cfg.population_size) || 0, num_generations: Number(cfg.num_generations) || 0,
        num_mutation: Number(cfg.num_mutation) || 0, num_hybridization: Number(cfg.num_hybridization) || 0,
        num_reflection: Number(cfg.num_reflection) || 0, num_policy_updates: Number(cfg.num_policy_updates) || 0,
        preset_id: presetSel.value,
        llm_model: presetSel.value === "custom" ? (cfg.llm_model.trim() || "custom-model") : cfg.llm_model,
        llm_base_url: cfg.llm_base_url,
        use_local_llm: cfg.use_local_llm, problem_override: cfg.problem_override,
        fun_name: cfg.fun_name, fun_args: fa, fun_return: fr, fun_notes: cfg.fun_notes,
        ascend: cfg.ascend, problem_path: cfg.problem_path, train_data: cfg.train_data, train_solution: cfg.train_solution,
      };
      if (!cfg.use_local_llm && cfg.api_key) body.api_key = cfg.api_key;
      return body;
    }
    /** 与原站 Dc 一致：启动成功后立即创建实例，提交才能关联曲线 */
    async function createInstanceAtStart(ft) {
      try {
        const config = {
          problem_key: cfg.problem_key, framework_type: ft,
          population_size: Number(cfg.population_size) || 0, num_generations: Number(cfg.num_generations) || 0,
          num_mutation: Number(cfg.num_mutation) || 0, num_hybridization: Number(cfg.num_hybridization) || 0,
          num_reflection: Number(cfg.num_reflection) || 0, num_policy_updates: Number(cfg.num_policy_updates) || 0,
          preset_id: presetSel.value, llm_model: cfg.llm_model, llm_base_url: cfg.llm_base_url,
          use_local_llm: cfg.use_local_llm, problem_override: cfg.problem_override,
          fun_name: cfg.fun_name, fun_args: cfg.fun_args, fun_return: cfg.fun_return, fun_notes: cfg.fun_notes,
          ascend: cfg.ascend, problem_path: cfg.problem_path, train_data: cfg.train_data, train_solution: cfg.train_solution,
        };
        if (ft === "custom") {
          config.framework_code = cfg.framework_code;
          config.framework_filename = cfg.framework_filename || "framework.py";
          config.framework_id = cfg.framework_id ?? null;
        }
        const name = `实例_${cfg.problem_key}_${new Date().toLocaleString("zh-CN").replace(/[/: ]/g, "-")}`;
        await api("/api/instances", { method: "POST", body: { name, framework_type: ft, problem_key: cfg.problem_key, config, run_id: currentRun.value, population_snapshot: null } });
      } catch {}
    }
    async function launch() {
      formErr.value = ""; starting.value = true;
      let body;
      try { body = collectBody(); } catch (e) { formErr.value = e.message; starting.value = false; return; }
      try {
        const r = await api("/api/evolution/start", { method: "POST", body });
        currentRun.value = r.run_id;
        localStorage.setItem("nova_current_run", String(r.run_id));
        monitorKeyOverride.value = cfg.problem_key;
        toast(`进化已启动（Run #${r.run_id}）`, "ok");
        createInstanceAtStart(cfg.framework_type);
        results.value = null; startPolling(); refreshHistory();
      } catch (e) { formErr.value = e.message; }
      finally { starting.value = false; }
    }
    async function devRun() {
      formErr.value = "";
      if (!cfg.framework_id) { formErr.value = "请先「上传并加载」框架，再开发者运行"; return; }
      devRunning.value = true;
      let body;
      try { body = collectBody(); } catch (e) { formErr.value = e.message; devRunning.value = false; return; }
      try {
        const r = await api("/api/developer/run", { method: "POST", body: { framework_id: cfg.framework_id, problem_key: body.problem_key, num_generations: body.num_generations, preset_id: body.preset_id, llm_model: body.llm_model, llm_base_url: body.llm_base_url, use_local_llm: body.use_local_llm, problem_override: body.problem_override, fun_name: body.fun_name, fun_args: body.fun_args, fun_return: body.fun_return, fun_notes: body.fun_notes, ascend: body.ascend, problem_path: body.problem_path, train_data: body.train_data, train_solution: body.train_solution, ...(body.api_key ? { api_key: body.api_key } : {}) } });
        currentRun.value = r.run_id;
        localStorage.setItem("nova_current_run", String(r.run_id));
        monitorKeyOverride.value = cfg.problem_key;
        toast(`开发者运行已启动（Run #${r.run_id}）`, "ok");
        createInstanceAtStart("custom");
        results.value = null; startPolling(); refreshHistory();
      } catch (e) { formErr.value = e.message; }
      finally { devRunning.value = false; }
    }

    /* ---------- 监控 ---------- */
    async function pollOnce() {
      if (!currentRun.value) return;
      try { status.value = await api(`/api/evolution/${currentRun.value}/status`); }
      catch (e) { if (e.status === 401) ctrlErr.value = "监控进化状态需要登录"; }
    }
    async function pollResults() {
      if (!currentRun.value) return;
      try {
        results.value = await api(`/api/evolution/${currentRun.value}/results`);
        resultsErr.value = "";
      } catch (e) {
        if (e.status === 401) resultsErr.value = "生成结果（曲线 / 种群 / token）需要登录后查看";
      }
      try { pop.value = await api(`/api/evolution/${currentRun.value}/population`); } catch {}
    }
    function startPolling() {
      if (pollTimer) clearInterval(pollTimer);
      pollOnce(); pollResults();
      pollTimer = setInterval(async () => {
        if (!currentRun.value) return;
        pollOnce();
        try {
          const st = await api(`/api/evolution/${currentRun.value}/status`);
          await pollResults();
          if (!STATUS_ACTIVE.has(st.status)) { clearInterval(pollTimer); pollTimer = null; pollResults(); refreshHistory(); }
        } catch {}
      }, 3000);
    }
    onUnmounted(() => { if (pollTimer) clearInterval(pollTimer); });

    const hist = computed(() => results.value?.history ?? []);
    const lastGen = computed(() => hist.value.at(-1) ?? {});
    const top3 = computed(() => lastGen.value.top3 ?? []);
    const tokenHistory = computed(() => results.value?.token_history ?? []);
    const lastTok = computed(() => tokenHistory.value.at(-1) ?? {});
    const bestHeur = computed(() => results.value?.best_heuristic ?? null);
    const monitorKeyOverride = ref(null);
    const monitorProblemKey = computed(() =>
      monitorKeyOverride.value ?? runs.value.find(r => r.run_id === currentRun.value)?.problem_key ?? cfg.problem_key);
    const popAsc = computed(() => isAscend(monitorProblemKey.value));
    const popHeurs = computed(() => (pop.value?.heuristics ?? []).slice().sort((a, b) => {
      const x = Number(a?.objective), y = Number(b?.objective);
      const fx = isFinite(x), fy = isFinite(y);
      if (!fx && !fy) return 0;
      if (!fx) return 1;
      if (!fy) return -1;
      return popAsc.value ? x - y : y - x;
    }));
    const popBest = computed(() => {
      const objs = popHeurs.value.map(h => Number(h?.objective)).filter(isFinite);
      return objs.length ? (popAsc.value ? Math.min(...objs) : Math.max(...objs)) : null;
    });
    const popChart = computed(() => barChartSVG(popHeurs.value.map((h, i) => ({ label: String(i + 1), value: Number(h?.objective ?? 0), tip: h?.concept || `个体 ${i + 1}` })), { height: 140 }));
    const top3Chart = computed(() => barChartSVG(top3.value.map((t, i) => ({ label: "#" + (i + 1), value: Number(t.objective), tip: t.concept || `#${i + 1}` }))));
    const histChart = computed(() => lineChartSVG([
      { name: "最优", color: "#22d3ee", points: hist.value.map((h, i) => ({ x: h.generation ?? i, y: h.best_objective, label: "第 " + (h.generation ?? i) + " 代" })).filter(p => p.y != null) },
      { name: "均值", color: "#a78bfa", points: hist.value.map((h, i) => ({ x: h.generation ?? i, y: h.avg_objective, label: "第 " + (h.generation ?? i) + " 代" })).filter(p => p.y != null) },
      { name: "方差", color: "#fb7185", dashed: true, points: hist.value.map((h, i) => ({ x: h.generation ?? i, y: h.variance, label: "第 " + (h.generation ?? i) + " 代" })).filter(p => p.y != null) },
    ], { yLabel: "适应度", xFormat: x => "第" + Math.round(x) + "代" }));
    const tokDeltaChart = computed(() => barChartSVG(tokenHistory.value.map((t, i) => ({
      label: String(t.generation ?? i), value: Math.max(0, (t.total_tokens ?? 0) - (i > 0 ? tokenHistory.value[i - 1].total_tokens ?? 0 : 0)), tip: `第 ${t.generation ?? i} 代消耗`,
    }))));

    async function ctrl(action) {
      if (!currentRun.value) return;
      ctrlErr.value = ""; ctrlBusy.value = true;
      try {
        await api(`/api/evolution/${currentRun.value}/${action}`, { method: "POST" });
        toast({ stop: "已停止", pause: "已暂停", resume: "已继续", submit: "当前最优已提交到排行榜" }[action] ?? "操作成功", "ok");
        pollOnce(); pollResults(); refreshHistory();
      } catch (e) {
        ctrlErr.value = (action === "submit" ? "提交失败：" : "操作失败：") + e.message;
        toast(ctrlErr.value, "err");
      }
      finally { ctrlBusy.value = false; }
    }
    async function saveInstance() {
      ctrlErr.value = ""; savingInst.value = true;
      try {
        let popData = null;
        try { popData = await api(`/api/evolution/${currentRun.value}/population`); } catch {}
        const snapshot = popData?.heuristics ? [{
          generation: popData.generation ?? 0,
          heuristics: (popData.heuristics ?? []).map(h => ({ concept: h.concept, algorithm: h.algorithm, features: h.features ?? [], objective: h.objective == null || h.objective === Infinity ? null : h.objective })),
          memory: popData.memory ?? { positive_features: [], negative_features: [] },
        }] : [];
        const config = {
          framework_type: cfg.framework_type, population_size: Number(cfg.population_size) || 0,
          num_generations: Number(cfg.num_generations) || 0, num_mutation: Number(cfg.num_mutation) || 0,
          num_hybridization: Number(cfg.num_hybridization) || 0, num_reflection: Number(cfg.num_reflection) || 0,
          num_policy_updates: Number(cfg.num_policy_updates) || 0, preset_id: presetSel.value,
          llm_model: cfg.llm_model, llm_base_url: cfg.llm_base_url, use_local_llm: cfg.use_local_llm,
          problem_override: cfg.problem_override, fun_name: cfg.fun_name, fun_args: cfg.fun_args,
          fun_return: cfg.fun_return, fun_notes: cfg.fun_notes, ascend: cfg.ascend,
          problem_path: cfg.problem_path, train_data: cfg.train_data, train_solution: cfg.train_solution,
        };
        if (cfg.framework_type === "custom") { config.framework_code = cfg.framework_code; config.framework_filename = cfg.framework_filename; }
        const name = `实例_${cfg.problem_key}_${new Date().toLocaleString("zh-CN").replace(/[/: ]/g, "-")}`;
        await api("/api/instances", { method: "POST", body: { name, framework_type: cfg.framework_type, problem_key: cfg.problem_key, config, run_id: currentRun.value, population_snapshot: snapshot } });
        toast(`实例已保存：${name}`, "ok");
      } catch (e) { ctrlErr.value = e.message; }
      finally { savingInst.value = false; }
    }
    watch(promptOpen, async open => {
      if (!open || !currentRun.value) return;
      promptState.value = "";
      try {
        const p = await api(`/api/evolution/${currentRun.value}/prompt`);
        promptIsCode.value = p.framework_code != null;
        promptText.value = promptIsCode.value ? p.framework_code : JSON.stringify(p.components ?? {}, null, 2);
      } catch (e) { promptText.value = "加载失败：" + e.message; }
    });
    async function savePrompt() {
      try {
        const body = promptIsCode.value ? { framework_code: promptText.value } : { components: JSON.parse(promptText.value) };
        await api(`/api/evolution/${currentRun.value}/prompt`, { method: "POST", body });
        promptState.value = "✔ 已保存";
        toast("提示词已保存", "ok");
      } catch (e) { promptState.value = "✘ " + e.message; }
    }
    async function refreshHistory() {
      runs.value = await api("/api/evolution/my").then(r => r.runs ?? []).catch(() => []);
    }
    function watchRun(runId) {
      currentRun.value = Number(runId);
      const r = runs.value.find(x => Number(x.run_id) === Number(runId));
      if (r) monitorKeyOverride.value = r.problem_key ?? null;
      localStorage.setItem("nova_current_run", String(currentRun.value));
      results.value = null; startPolling();
    }
    function showHeur(h, i) {
      store.drawer = { comp: "heur-detail", props: { h, gen: pop.value?.generation ?? "?", idx: i } };
    }
    return { store, getToken, presets, instances, runs, cfg, numFields, bestHeur, popAsc, popBest, monitorProblemKey, funArgsText, funRetText, presetSel, instSel, advOpen, formErr, starting, devRunning, fwState, validateOut, currentRun, status, results, resultsErr, pop, ctrlBusy, ctrlErr, savingInst, promptOpen, promptText, promptIsCode, promptState, applyPreset, loadProblemDetail, loadInstance, readFwFile, validateFw, uploadFw, launch, devRun, ctrl, saveInstance, savePrompt, watchRun, showHeur, statusName: s => STATUS_LABEL[s] ?? s ?? "—", fwName: ft => FW_LABEL[ft] || ft, hist, lastGen, top3, tokenHistory, lastTok, popHeurs, popChart, top3Chart, histChart, tokDeltaChart, fmtObj, fmtTokens, copyText };
  },
};
ROUTE_COMPS.evo = EvoView;

/* ---------- 抽屉：种群个体详情 ---------- */
const HeurDetailDrawer = {
  props: { h: Object, gen: [String, Number], idx: Number },
  template: `
  <div>
    <div class="drawer-head"><h3>种群个体 #{{ idx + 1 }}</h3><button class="drawer-close" @click="closeDrawer()">×</button></div>
    <div class="grid-2">
      <div class="kv"><span class="k">适应度</span><span class="mono">{{ fmtObj(h.objective) }}</span></div>
      <div class="kv"><span class="k">代数</span><span class="mono">{{ gen }}</span></div>
    </div>
    <div class="field"><label>启发式思想</label><p class="drawer-text">{{ h.concept ?? "—" }}</p></div>
    <div class="field"><label>关键词组</label><div class="badge-row">
      <span v-for="f in (h.features ?? [])" :key="f" class="badge feature-badge">{{ f }}</span>
      <span v-if="!(h.features ?? []).length" class="hint">无</span></div></div>
    <div v-if="h.algorithm" class="field"><label>算法代码</label>
      <div class="code-container"><button class="btn small copy-btn" @click="copyText(h.algorithm)">复制</button>
      <pre>{{ h.algorithm }}</pre></div></div>
  </div>`,
};
DRAWER_COMPS["heur-detail"] = HeurDetailDrawer;

/* ==================== 自定义问题页 ==================== */
const CprobView = {
  components: { EmptyState, FwBadge, SrcBadge },
  template: `
  <div>
    <div class="card">
      <h2>自定义问题 <span class="tail">公开列表 · 上传与 Agent 建题需登录</span></h2>
      <div class="chip-row" style="margin-bottom:12px">
        <button class="btn small" @click="loggedIn ? $refs.upfile.click() : toast('请先登录', 'err')">⬆ 上传数据文件</button>
        <input type="file" ref="upfile" multiple style="display:none" @change="uploadFiles">
        <button v-if="loggedIn" class="btn small primary" @click="agentOpen = !agentOpen">🤖 Agent 建题</button>
        <span v-else class="hint">登录后可上传文件或用 Agent 自动建题</span>
      </div>
      <div v-if="loading" class="loading-row"><span class="spinner"></span>加载中…</div>
      <div v-else-if="!list.length"><EmptyState icon="🧩" desc="还没有自定义问题，上传数据文件或用 Agent 建一个" /></div>
      <div v-else class="table-wrap"><table>
        <thead><tr><th>问题名称</th><th>标识 key</th><th>进化方向</th><th>分类</th><th>函数名</th><th></th></tr></thead>
        <tbody>
          <tr v-for="p in list" :key="p.problem_key ?? p.key">
            <td><b>{{ p.name ?? p.problem_key ?? "—" }}</b>
              <div v-if="p.description" class="hint" style="max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" :title="p.description">{{ p.description }}</div></td>
            <td class="mono">{{ p.problem_key ?? p.key ?? "—" }}</td>
            <td><span class="badge" :class="p.ascend === false ? 'src-api' : 'src-local'">{{ p.ascend === false ? "越大越好" : "越小越好" }}</span></td>
            <td>{{ p.category ?? "自定义" }}</td>
            <td class="mono">{{ p.fun_name ?? "—" }}</td>
            <td><button v-if="loggedIn" class="btn small danger" @click="del(p)">删除</button></td>
          </tr>
        </tbody>
      </table></div>
    </div>

    <div v-if="agentOpen" class="card">
      <h2>🤖 Agent 自动建题 <span class="tail">描述问题 → 生成任务计划 → 执行 → 审批</span></h2>
      <div class="grid cols-2">
        <div class="field"><label>问题名称 *</label><input v-model="ag.name"></div>
        <div class="field"><label>数据目录 source_dir（可选）</label><input class="mono" v-model="ag.src"></div>
      </div>
      <div class="field"><label>问题描述 *</label><textarea class="input" v-model="ag.desc" rows="3"></textarea></div>
      <div class="grid cols-3">
        <div class="field"><label>LLM 预设</label><select v-model="ag.preset" @change="agApplyPreset">
          <option v-for="p in presets" :key="p.id" :value="p.id">{{ p.name }}</option></select></div>
        <div class="field"><label>模型 ID</label><input v-model="ag.model"></div>
        <div class="field"><label>Base URL</label><input v-model="ag.baseUrl"></div>
      </div>
      <div class="chip-row" style="margin-bottom:8px">
        <button class="chip" :class="{ on: ag.local }" @click="ag.local = !ag.local">使用实验室本地 LLM</button>
      </div>
      <div class="field" v-if="!ag.local"><label>API key</label><input v-model="ag.apiKey" style="max-width:300px"></div>
      <div class="error-banner" v-if="agErr">{{ agErr }}</div>
      <button class="btn primary" :disabled="agPlanning" @click="plan">① 生成任务计划</button>
      <div v-if="planData" style="margin-top:12px">
        <div v-if="planData.meta?.name" class="section-note">计划名称：<b>{{ planData.meta.name }}</b>
          <span v-if="planData.plan_id"> · plan_id <span class="mono">{{ planData.plan_id }}</span></span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>#</th><th>任务类型</th><th>说明</th></tr></thead>
          <tbody><tr v-for="(t, i) in (planData.tasks ?? [])" :key="i">
            <td class="mono">{{ i + 1 }}</td>
            <td><span class="badge feature-badge">{{ CP_TASK_LABEL[t.type] ?? t.type ?? "任务" }}</span></td>
            <td class="hint">{{ t.description ?? t.goal ?? t.detail ?? JSON.stringify(t).slice(0, 160) }}</td>
          </tr></tbody>
        </table></div>
        <button class="btn primary" style="margin-top:10px" @click="exec">② 执行计划</button>
      </div>
      <div v-if="runId" style="margin-top:12px">
        <div class="grid cols-3">
          <div class="stat"><div class="k">状态</div><div class="v" style="font-size:16px">{{ runState.status ?? "—" }}</div></div>
          <div class="stat"><div class="k">任务进度</div><div class="v mono" style="font-size:16px">{{ runState.current_task_index ?? 0 }} / {{ (runState.tasks ?? []).length || 1 }}</div></div>
          <div class="stat"><div class="k">Run</div><div class="v mono" style="font-size:16px">#{{ runId }}</div></div>
        </div>
        <div class="progress-track" style="margin:10px 0"><div class="progress-fill" :style="{ width: (((runState.tasks ?? []).length ? (runState.current_task_index ?? 0) / runState.tasks.length : 0) * 100).toFixed(0) + '%' }"></div></div>
        <div class="error-banner" v-if="runState.error">{{ runState.error }}</div>
        <div v-if="runState.pending_file" class="field">
          <label>待审批文件：<span class="mono">{{ runState.pending_file.path ?? runState.pending_file.name ?? "" }}</span>（{{ CP_TASK_LABEL[runState.pending_file.type] ?? runState.pending_file.type ?? "文件" }}）</label>
          <div class="chip-row">
            <button class="btn small primary" @click="approve(true)">✔ 通过并继续</button>
            <button class="btn small danger" @click="approve(false)">✘ 拒绝</button>
            <input class="input" v-model="agFeedback" placeholder="拒绝时的反馈意见" style="max-width:280px">
          </div>
          <div v-if="runState.pending_file.preview" class="code-container"><pre style="max-height:200px">{{ runState.pending_file.preview }}</pre></div>
        </div>
        <div v-if="runState.status === 'completed'" class="section-note">🎉 自定义问题已创建：{{ runState.custom_problem ? (runState.custom_problem.name ?? runState.custom_problem.problem_key ?? "") + "（key: " + runState.custom_problem.problem_key + "）" : "完成" }}</div>
      </div>
    </div>
  </div>`,
  setup() {
    const loggedIn = computed(() => !!(getToken() && store.user));
    const list = ref([]), loading = ref(true);
    const presets = ref([]);
    const agentOpen = ref(false);
    const ag = reactive({ name: "", desc: "", src: "", preset: "", model: "", baseUrl: "", apiKey: "", local: true });
    const agErr = ref(""), agPlanning = ref(false), agFeedback = ref("");
    const planData = ref(null), runId = ref(null), runState = ref({});
    let runTimer = null;

    async function loadList() {
      loading.value = true;
      list.value = await api("/api/custom-problems").then(r => Array.isArray(r) ? r : []).catch(() => []);
      loading.value = false;
    }
    onMounted(async () => {
      presets.value = await api("/api/llm-presets").then(r => r.presets ?? []).catch(() => []);
      await loadList();
    });
    async function uploadFiles(ev) {
      const files = [...(ev.target.files ?? [])];
      ev.target.value = "";
      if (!files.length) return;
      const fd = new FormData();
      files.forEach(f => fd.append("files", f, f.name));
      try {
        const resp = await fetch(apiBase() + "/api/custom-problems/upload", { method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
        const j = await resp.json().catch(() => null);
        if (!resp.ok) throw new Error(j?.detail ?? resp.statusText);
        toast(`已上传 ${files.length} 个文件`, "ok");
        loadList();
      } catch (e) { toast("上传失败：" + e.message, "err"); }
    }
    async function del(p) {
      const key = p.problem_key ?? p.key;
      if (!confirm(`确认删除问题「${p.name || key}」？此操作不可撤销。`)) return;
      try { await api(`/api/custom-problems/${key}`, { method: "DELETE" }); toast("已删除", "ok"); loadList(); }
      catch (e) { toast(e.message, "err"); }
    }
    function agApplyPreset() {
      const p = presets.value.find(x => x.id === ag.preset);
      if (p) { ag.model = p.id; ag.baseUrl = p.base_url; }
    }
    async function plan() {
      agErr.value = "";
      if (!ag.name.trim() || !ag.desc.trim()) { agErr.value = "请填写问题名称与描述"; return; }
      agPlanning.value = true;
      try {
        planData.value = await api("/api/custom-problems/agent/plan", {
          method: "POST",
          body: {
            name: ag.name.trim(), description: ag.desc.trim() || undefined, source_dir: ag.src.trim() || undefined,
            llm_config: { base_url: ag.baseUrl.trim(), model: ag.model.trim(), api_key: ag.apiKey.trim(), use_local_llm: ag.local },
          },
        });
      } catch (e) { agErr.value = e.message; planData.value = null; }
      finally { agPlanning.value = false; }
    }
    async function exec() {
      agErr.value = "";
      try {
        const r = await api("/api/custom-problems/agent/execute", { method: "POST", body: { plan_id: planData.value.plan_id, name: ag.name.trim() || undefined, description: ag.desc.trim() || undefined } });
        runId.value = r.run_id ?? r.id ?? null;
        if (runId.value) {
          pollRun();
          runTimer = setInterval(pollRun, 3000);
        }
      } catch (e) { agErr.value = e.message; }
    }
    async function pollRun() {
      if (!runId.value) return;
      try { runState.value = await api(`/api/custom-problems/agent/runs/${runId.value}`); } catch { return; }
      if (STATUS_DONE.has(runState.value.status)) { clearInterval(runTimer); runTimer = null; loadList(); }
    }
    async function approve(approved) {
      const pf = runState.value.pending_file;
      if (!pf) return;
      try {
        await api("/api/custom-problems/agent/approve", { method: "POST", body: { run_id: runId.value, path: pf.path, approved, feedback: approved ? undefined : (agFeedback.value.trim() || undefined) } });
        pollRun();
      } catch (e) { toast(e.message, "err"); }
    }
    onUnmounted(() => { if (runTimer) clearInterval(runTimer); });
    return { store, getToken, toast, loggedIn, list, loading, presets, agentOpen, ag, agErr, agPlanning, agFeedback, planData, runId, runState, plan, exec, approve, uploadFiles, del, agApplyPreset, CP_TASK_LABEL };
  },
};
ROUTE_COMPS.cprob = CprobView;
