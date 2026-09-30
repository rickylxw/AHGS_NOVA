<script setup>
import { onMounted, reactive, ref } from "vue";
import { api, getToken } from "../lib/api";
import { EVO_DEFAULTS, FW_LABEL, STATUS_LABEL } from "../lib/constants";
import { store, toast } from "../lib/store";
import { navHash } from "../lib/router";
import { fmtObj } from "../lib/format";
import EmptyState from "../components/EmptyState.vue";
import CopyButton from "../components/CopyButton.vue";

const props = defineProps({ params: { type: URLSearchParams, default: () => new URLSearchParams() } });

const presets = ref([]);
const instances = ref([]);
const runs = ref([]);
const cfg = reactive({
    problem_key: props.params.get("problem") || store.problems[0]?.key || "",
    framework_type: "calm",
    ...EVO_DEFAULTS,
    preset_id: "",
    llm_model: "",
    llm_base_url: "",
    use_local_llm: true,
    api_key: "",
    problem_override: "",
    fun_name: "",
    fun_args: [],
    fun_return: [],
    fun_notes: "",
    ascend: true,
    problem_path: "",
    train_data: "",
    train_solution: "",
    framework_code: "",
    framework_filename: "framework.py",
    framework_id: null,
});
const numFields = {
    population_size: "种群容量",
    num_generations: "进化代数",
    num_mutation: "突变数",
    num_hybridization: "杂交数",
    num_reflection: "反思数",
    num_policy_updates: "策略更新数",
};
const funArgsText = ref("[]");
const funRetText = ref("[]");
const presetSel = ref("");
const instSel = ref("");
const advOpen = ref(false);
const formErr = ref("");
const starting = ref(false);
const devRunning = ref(false);
const fwState = ref("");
const validateOut = ref("");
const fwfile = ref(null);

onMounted(async () => {
    presets.value = await api("/api/llm-presets").then(r => r.presets ?? []).catch(() => []);
    instances.value = await api("/api/instances").then(r => r.instances ?? []).catch(() => []);
    runs.value = await api("/api/evolution/my").then(r => r.runs ?? []).catch(() => []);
    // 恢复上次发起的配置（api_key 出于安全不保存）
    const saved = getSavedCfg();
    if (saved) {
        for (const k of Object.keys(saved)) {
            if (k in cfg && k !== "api_key" && k !== "framework_id") cfg[k] = saved[k];
        }
        funArgsText.value = JSON.stringify(cfg.fun_args ?? []);
        funRetText.value = JSON.stringify(cfg.fun_return ?? []);
    }
    if (!cfg.preset_id || !presets.value.some(x => x.id === cfg.preset_id)) {
        cfg.preset_id = presets.value[0]?.id ?? "custom";
    }
    presetSel.value = cfg.preset_id;
    if (cfg.preset_id !== "custom") {
        const p = presets.value.find(x => x.id === presetSel.value);
        if (p && !saved?.llm_base_url) {
            cfg.llm_model = p.id;
            cfg.llm_base_url = p.base_url;
        }
    }
    applyPreset();
    loadProblemDetail();
});

function getSavedCfg() {
    try {
        return JSON.parse(localStorage.getItem("nova_evo_cfg") || "null");
    } catch {
        return null;
    }
}

function persistCfg() {
    try {
        const { api_key, framework_id, ...rest } = cfg;
        localStorage.setItem("nova_evo_cfg", JSON.stringify(rest));
    } catch { /* ignore */ }
}

function applyPreset() {
    if (presetSel.value === "custom") return; // 保留当前手填的 Base URL / 模型（含恢复的配置）
    const p = presets.value.find(x => x.id === presetSel.value);
    if (p) {
        cfg.llm_model = p.id;
        cfg.llm_base_url = p.base_url;
    }
}

function onPresetChange() {
    if (presetSel.value === "custom") {
        cfg.llm_model = "";
        cfg.llm_base_url = "";
    }
    applyPreset();
}

async function loadProblemDetail() {
    try {
        const d = await api(`/api/problems/${cfg.problem_key}`);
        cfg.problem_override = d.description ?? "";
        cfg.fun_name = d.fun_name ?? "";
        cfg.fun_args = d.fun_args ?? [];
        cfg.fun_return = d.fun_return ?? [];
        cfg.fun_notes = d.fun_notes ?? "";
        cfg.ascend = d.ascend !== false;
        cfg.problem_path = d.problem_path ?? "";
        cfg.train_data = d.train_data ?? "";
        cfg.train_solution = d.train_solution ?? "";
        funArgsText.value = JSON.stringify(cfg.fun_args ?? []);
        funRetText.value = JSON.stringify(cfg.fun_return ?? []);
    } catch { /* ignore */ }
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
        llm_model: inst.config?.llm_model ?? "",
        llm_base_url: inst.config?.llm_base_url ?? "",
        problem_override:
            typeof inst.config?.problem_override === "string" ? inst.config.problem_override : cfg.problem_override,
        fun_name: inst.config?.fun_name ?? "",
        fun_args: inst.config?.fun_args ?? [],
        fun_return: inst.config?.fun_return ?? [],
        fun_notes: inst.config?.fun_notes ?? "",
        ascend: inst.config?.ascend !== false,
        problem_path: inst.config?.problem_path ?? "",
        train_data: inst.config?.train_data ?? "",
        train_solution: inst.config?.train_solution ?? "",
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
    if (f)
        f.text().then(t => {
            cfg.framework_code = t;
            cfg.framework_filename = f.name;
        });
}

async function validateFw() {
    fwState.value = "校验中…";
    try {
        const r = await api("/api/developer/validate", {
            method: "POST",
            body: { framework_code: cfg.framework_code },
        });
        validateOut.value = typeof r === "string" ? r : JSON.stringify(r, null, 2);
        fwState.value = r && (r.valid ?? r.ok) !== false ? "✔ 校验通过" : "✘ 校验未通过";
    } catch (e) {
        fwState.value = "✘ " + e.message;
    }
}

async function uploadFw() {
    fwState.value = "上传中…";
    try {
        const r = await api("/api/developer/upload", {
            method: "POST",
            body: {
                framework_code: cfg.framework_code,
                framework_filename: cfg.framework_filename || "framework.py",
            },
        });
        cfg.framework_id = r.framework_id ?? null;
        fwState.value = `⬆ 已上传并加载「${cfg.framework_filename}」`;
        toast("框架已上传并加载", "ok");
    } catch (e) {
        fwState.value = "✘ " + e.message;
    }
}

function collectBody() {
    let fa, fr;
    try {
        fa = JSON.parse(funArgsText.value || "[]");
    } catch {
        throw new Error("fun_args 不是合法 JSON 数组");
    }
    try {
        fr = JSON.parse(funRetText.value || "[]");
    } catch {
        throw new Error("fun_return 不是合法 JSON 数组");
    }
    const body = {
        problem_key: cfg.problem_key,
        framework_type: cfg.framework_type,
        population_size: Number(cfg.population_size) || 0,
        num_generations: Number(cfg.num_generations) || 0,
        num_mutation: Number(cfg.num_mutation) || 0,
        num_hybridization: Number(cfg.num_hybridization) || 0,
        num_reflection: Number(cfg.num_reflection) || 0,
        num_policy_updates: Number(cfg.num_policy_updates) || 0,
        preset_id: presetSel.value,
        llm_model: presetSel.value === "custom" ? cfg.llm_model.trim() || "custom-model" : cfg.llm_model,
        llm_base_url: cfg.llm_base_url,
        use_local_llm: cfg.use_local_llm,
        problem_override: cfg.problem_override,
        fun_name: cfg.fun_name,
        fun_args: fa,
        fun_return: fr,
        fun_notes: cfg.fun_notes,
        ascend: cfg.ascend,
        problem_path: cfg.problem_path,
        train_data: cfg.train_data,
        train_solution: cfg.train_solution,
    };
    if (!cfg.use_local_llm && cfg.api_key) body.api_key = cfg.api_key;
    return body;
}

/** 与原站一致：启动成功后立即创建实例，提交才能关联曲线 */
async function createInstanceAtStart(ft, runId) {
    try {
        const config = {
            problem_key: cfg.problem_key,
            framework_type: ft,
            population_size: Number(cfg.population_size) || 0,
            num_generations: Number(cfg.num_generations) || 0,
            num_mutation: Number(cfg.num_mutation) || 0,
            num_hybridization: Number(cfg.num_hybridization) || 0,
            num_reflection: Number(cfg.num_reflection) || 0,
            num_policy_updates: Number(cfg.num_policy_updates) || 0,
            preset_id: presetSel.value,
            llm_model: cfg.llm_model,
            llm_base_url: cfg.llm_base_url,
            use_local_llm: cfg.use_local_llm,
            problem_override: cfg.problem_override,
            fun_name: cfg.fun_name,
            fun_args: cfg.fun_args,
            fun_return: cfg.fun_return,
            fun_notes: cfg.fun_notes,
            ascend: cfg.ascend,
            problem_path: cfg.problem_path,
            train_data: cfg.train_data,
            train_solution: cfg.train_solution,
        };
        if (ft === "custom") {
            config.framework_code = cfg.framework_code;
            config.framework_filename = cfg.framework_filename || "framework.py";
            config.framework_id = cfg.framework_id ?? null;
        }
        const name = `实例_${cfg.problem_key}_${new Date().toLocaleString("zh-CN").replace(/[/: ]/g, "-")}`;
        await api("/api/instances", {
            method: "POST",
            body: {
                name,
                framework_type: ft,
                problem_key: cfg.problem_key,
                config,
                run_id: runId,
                population_snapshot: null,
            },
        });
    } catch { /* ignore */ }
}

async function launch() {
    formErr.value = "";
    starting.value = true;
    let body;
    try {
        body = collectBody();
    } catch (e) {
        formErr.value = e.message;
        starting.value = false;
        return;
    }
    try {
        const r = await api("/api/evolution/start", { method: "POST", body });
        persistCfg();
        createInstanceAtStart(cfg.framework_type, r.run_id);
        refreshHistory();
        toast(`进化已启动（Run #${r.run_id}），正在打开实时监控…`, "ok");
        navHash("curve", new URLSearchParams({ run: String(r.run_id) }));
    } catch (e) {
        formErr.value = e.message;
    } finally {
        starting.value = false;
    }
}

async function devRun() {
    formErr.value = "";
    if (!cfg.framework_id) {
        formErr.value = "请先「上传并加载」框架，再开发者运行";
        return;
    }
    devRunning.value = true;
    let body;
    try {
        body = collectBody();
    } catch (e) {
        formErr.value = e.message;
        devRunning.value = false;
        return;
    }
    try {
        const r = await api("/api/developer/run", {
            method: "POST",
            body: {
                framework_id: cfg.framework_id,
                problem_key: body.problem_key,
                num_generations: body.num_generations,
                preset_id: body.preset_id,
                llm_model: body.llm_model,
                llm_base_url: body.llm_base_url,
                use_local_llm: body.use_local_llm,
                problem_override: body.problem_override,
                fun_name: body.fun_name,
                fun_args: body.fun_args,
                fun_return: body.fun_return,
                fun_notes: body.fun_notes,
                ascend: body.ascend,
                problem_path: body.problem_path,
                train_data: body.train_data,
                train_solution: body.train_solution,
                ...(body.api_key ? { api_key: body.api_key } : {}),
            },
        });
        persistCfg();
        createInstanceAtStart("custom", r.run_id);
        refreshHistory();
        toast(`开发者运行已启动（Run #${r.run_id}），正在打开实时监控…`, "ok");
        navHash("curve", new URLSearchParams({ run: String(r.run_id) }));
    } catch (e) {
        formErr.value = e.message;
    } finally {
        devRunning.value = false;
    }
}

async function refreshHistory() {
    runs.value = await api("/api/evolution/my").then(r => r.runs ?? []).catch(() => []);
}

function statusName(st) {
    return STATUS_LABEL[st] ?? st ?? "—";
}

function fwName(ft) {
    return FW_LABEL[ft] || ft;
}
</script>

<template>
    <div v-if="!getToken() || !store.user">
        <div class="card">
            <EmptyState icon="🔐" desc="发起进化需要登录" />
        </div>
    </div>
    <div v-else>
        <div>
            <div class="card">
                <h2>发起进化 <span class="tail">参数与原站一致</span></h2>
                <div class="field">
                    <label>加载实例配置</label>
                    <select v-model="instSel" @change="loadInstance">
                        <option value="">— 选择已保存的实例 —</option>
                        <option v-for="i in instances" :key="i.id" :value="String(i.id)">{{ i.name }}（{{
                            fwName(i.framework_type) }} · {{ i.problem_key ?? "" }}）</option>
                    </select>
                </div>
                <div class="field">
                    <label>问题情景</label>
                    <select v-model="cfg.problem_key" @change="loadProblemDetail">
                        <option v-for="p in store.problems" :key="p.key" :value="p.key">{{ p.name }}</option>
                    </select>
                </div>
                <div class="field">
                    <label>框架类型</label>
                    <div class="chip-row">
                        <button v-for="ft in ['calm', 'eoh_nseh', 'custom']" :key="ft" class="chip"
                            :class="{ on: cfg.framework_type === ft }" @click="cfg.framework_type = ft">{{ fwName(ft)
                            }}</button>
                    </div>
                </div>
                <div class="grid cols-3">
                    <div class="field" v-for="(meta, k) in numFields" :key="k">
                        <label>{{ meta }}</label>
                        <input type="number" min="0" v-model.number="cfg[k]" />
                    </div>
                </div>
                <div class="field">
                    <label>LLM 预设</label>
                    <select v-model="presetSel" @change="onPresetChange">
                        <option v-for="p in presets" :key="p.id" :value="p.id">{{ p.name }}（{{ p.provider }}）</option>
                    </select>
                </div>
                <template v-if="!cfg.use_local_llm">
                    <div class="grid cols-2">
                        <div class="field">
                            <label>模型 ID</label>
                            <input v-model="cfg.llm_model" placeholder="自定义模型名，如 custom-model" />
                        </div>
                        <div class="field">
                            <label>API key</label>
                            <input v-model="cfg.api_key" placeholder="你的 api key" />
                        </div>
                    </div>
                    <div class="field">
                        <label>Base URL（含端口）</label>
                        <input v-model="cfg.llm_base_url" placeholder="https://api.deepseek.com/v1" />
                    </div>
                </template>
                <div class="field">
                    <label>&nbsp;</label>
                    <div class="chip-row">
                        <button class="chip" :class="{ on: cfg.use_local_llm }"
                            @click="cfg.use_local_llm = !cfg.use_local_llm">使用实验室本地LLM（Qwen3-30B）</button>
                    </div>
                    <div class="hint">{{ cfg.use_local_llm ? "已选择实验室本地 LLM，无需配置 API Key / Base URL / 模型。" :
                        "将改用你自己的 API：请填写 Base URL（含端口）、模型名与 API Key。" }}</div>
                </div>

                <div v-if="cfg.framework_type === 'custom'">
                    <div class="mine-head"><span class="mine-title">自定义进化框架</span><span class="hint">上传
                            framework.py，平台加载后随进化启动</span></div>
                    <div class="field">
                        <label>框架文件名</label>
                        <input v-model="cfg.framework_filename" />
                    </div>
                    <div class="field">
                        <label>framework.py 源码</label>
                        <div class="code-container"><CopyButton :text="cfg.framework_code || ''" />
                            <textarea v-model="cfg.framework_code" spellcheck="false"
                                style="width: 100%; min-height: 220px; background: transparent; border: none; outline: none; color: #d7e3ff; font-family: Consolas, monospace; font-size: 12.5px; padding: 10px; resize: vertical"></textarea>
                        </div>
                    </div>
                    <div class="chip-row" style="margin-bottom: 8px">
                        <button class="btn small" @click="fwfile.click()">📁 选择本地文件</button>
                        <input type="file" ref="fwfile" accept=".py" style="display: none" @change="readFwFile" />
                        <button class="btn small" @click="validateFw">✔ 校验</button>
                        <button class="btn small" @click="uploadFw">⬆ 上传并加载</button>
                        <span class="hint">{{ fwState }}</span>
                    </div>
                    <div v-if="validateOut">
                        <pre class="mono"
                            style="max-height: 160px; overflow: auto; background: var(--code-bg); color: #d7e3ff; padding: 10px; border-radius: 8px; font-size: 12px">{{
                                validateOut }}</pre>
                    </div>
                </div>

                <div class="field">
                    <label>&nbsp;</label>
                    <button class="chip" @click="advOpen = !advOpen">{{ advOpen ? "▾" : "▸" }} 高级参数（函数签名 / 训练数据 /
                        进化方向）</button>
                </div>
                <div v-if="advOpen">
                    <div class="field">
                        <label>问题描述覆盖（problem_override）</label>
                        <textarea class="input" v-model="cfg.problem_override" rows="3"></textarea>
                    </div>
                    <div class="grid cols-2">
                        <div class="field">
                            <label>函数名 fun_name</label>
                            <input v-model="cfg.fun_name" />
                        </div>
                        <div class="field">
                            <label>进化方向</label>
                            <select :value="cfg.ascend ? 'true' : 'false'"
                                @change="cfg.ascend = $event.target.value === 'true'">
                                <option value="true">适应度越小越好</option>
                                <option value="false">适应度越大越好</option>
                            </select>
                        </div>
                    </div>
                    <div class="grid cols-2">
                        <div class="field">
                            <label>fun_args（JSON 数组）</label>
                            <textarea class="input mono" v-model="funArgsText" rows="2"></textarea>
                        </div>
                        <div class="field">
                            <label>fun_return（JSON 数组）</label>
                            <textarea class="input mono" v-model="funRetText" rows="2"></textarea>
                        </div>
                    </div>
                    <div class="field">
                        <label>fun_notes</label>
                        <input v-model="cfg.fun_notes" />
                    </div>
                    <div class="field">
                        <label>problem_path（问题文件路径）</label>
                        <input class="mono" v-model="cfg.problem_path" />
                    </div>
                    <div class="grid cols-2">
                        <div class="field">
                            <label>训练数据 train_data</label>
                            <textarea class="input mono" v-model="cfg.train_data" rows="2"></textarea>
                        </div>
                        <div class="field">
                            <label>训练解 train_solution</label>
                            <textarea class="input mono" v-model="cfg.train_solution" rows="2"></textarea>
                        </div>
                    </div>
                </div>
                <div class="error-banner" v-if="formErr">{{ formErr }}</div>
                <div class="chip-row">
                    <button class="btn primary" :disabled="starting" @click="launch">🚀 启动进化</button>
                    <button class="btn" v-if="cfg.framework_type === 'custom'" :disabled="devRunning"
                        @click="devRun">▶ 开发者运行（framework_id）</button>
                </div>
            </div>
        </div>

        <div class="card">
            <h2>我的进化记录 <span class="tail">点击「监控」查看实时曲线与控制</span></h2>
            <div v-if="!runs.length" class="empty">
                <div class="ico">🧫</div>
                暂无进化记录，从上方发起第一次进化
            </div>
            <div v-else class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th class="num">ID</th>
                            <th>问题</th>
                            <th>状态</th>
                            <th class="num">最优适应度</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="r in runs" :key="r.run_id">
                            <td class="num mono">{{ r.run_id }}</td>
                            <td>{{ r.problem_key ?? "—" }}</td>
                            <td><span class="badge" :class="'evo-st-' + r.status">{{ statusName(r.status) }}</span></td>
                            <td class="num mono">{{ fmtObj(r.best_objective) }}</td>
                            <td><a class="btn small" :href="'#/curve?run=' + r.run_id">监控 →</a></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</template>
