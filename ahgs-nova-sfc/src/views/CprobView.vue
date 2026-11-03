<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { api, apiBase, getToken } from "../lib/api";
import { CP_TASK_LABEL, STATUS_DONE } from "../lib/constants";
import { store, toast } from "../lib/store";
import EmptyState from "../components/EmptyState.vue";

const loggedIn = computed(() => !!(getToken() && store.user));
const list = ref([]);
const loading = ref(true);
const presets = ref([]);
const agentOpen = ref(false);
const ag = reactive({
    name: "",
    desc: "",
    src: "",
    preset: "",
    model: "",
    baseUrl: "",
    apiKey: "",
    local: true,
});
const agErr = ref("");
const agPlanning = ref(false);
const agExecuting = ref(false);
const agApproving = ref(""); // "yes" | "no"，正在审批的方向
const deleting = ref(""); // 正在删除的题目 key
const agFeedback = ref("");
const planData = ref(null);
const runId = ref(null);
const runState = ref({});
let runTimer = null;
const upfile = ref(null);

async function loadList() {
    loading.value = true;
    list.value = await api("/api/custom-problems").then(r => (Array.isArray(r) ? r : [])).catch(() => []);
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
        const resp = await fetch(apiBase() + "/api/custom-problems/upload", {
            method: "POST",
            headers: { Authorization: `Bearer ${getToken()}` },
            body: fd,
        });
        const j = await resp.json().catch(() => null);
        if (!resp.ok) throw new Error(j?.detail ?? resp.statusText);
        toast(`已上传 ${files.length} 个文件`, "ok");
        loadList();
    } catch (e) {
        toast("上传失败：" + e.message, "err");
    }
}

async function del(p) {
    const key = p.problem_key ?? p.key;
    if (!window.confirm(`确认删除问题「${p.name || key}」？此操作不可撤销。`)) return;
    if (deleting.value) return;
    deleting.value = key;
    try {
        await api(`/api/custom-problems/${key}`, { method: "DELETE" });
        toast("已删除", "ok");
        loadList();
    } catch (e) {
        toast(e.message, "err");
    } finally {
        deleting.value = "";
    }
}

/* ---------- 编辑自定义问题（官方 2026-11 起 PATCH /api/custom-problems/{key}，
    可改名称 / 描述 / 函数签名 / 进化方向 / 数据集可见性与版本） ---------- */
const editOpen = ref(false);
const editBusy = ref(false);
const editErr = ref("");
const editKey = ref("");
const ed = reactive({
    name: "",
    description: "",
    fun_name: "",
    funArgsText: "[]",
    funRetText: "[]",
    fun_notes: "",
    ascend: true,
    dataset_status: "admin_only",
    dataset_version: "",
    evaluator_version: "",
});

function openEdit(p) {
    editKey.value = p.problem_key ?? p.key;
    Object.assign(ed, {
        name: p.name ?? "",
        description: p.description ?? "",
        fun_name: p.fun_name ?? "",
        funArgsText: JSON.stringify(p.fun_args ?? []),
        funRetText: JSON.stringify(p.fun_return ?? []),
        fun_notes: p.fun_notes ?? "",
        ascend: p.ascend !== false,
        dataset_status: p.dataset_status ?? "admin_only",
        dataset_version: p.dataset_version ?? "",
        evaluator_version: p.evaluator_version ?? "",
    });
    editErr.value = "";
    editOpen.value = true;
}

async function saveEdit() {
    let fa, fr;
    try {
        fa = JSON.parse(ed.funArgsText || "[]");
    } catch {
        editErr.value = "fun_args 不是合法 JSON 数组";
        return;
    }
    try {
        fr = JSON.parse(ed.funRetText || "[]");
    } catch {
        editErr.value = "fun_return 不是合法 JSON 数组";
        return;
    }
    if (!ed.name.trim()) {
        editErr.value = "问题命名不能为空";
        return;
    }
    editBusy.value = true;
    editErr.value = "";
    try {
        await api(`/api/custom-problems/${editKey.value}`, {
            method: "PATCH",
            body: {
                name: ed.name.trim(),
                description: ed.description,
                fun_name: ed.fun_name,
                fun_args: fa,
                fun_return: fr,
                fun_notes: ed.fun_notes,
                ascend: ed.ascend,
                dataset_status: ed.dataset_status,
                dataset_version: ed.dataset_version,
                evaluator_version: ed.evaluator_version,
            },
        });
        editOpen.value = false;
        toast("已保存修改", "ok");
        loadList();
    } catch (e) {
        editErr.value = e.message;
    } finally {
        editBusy.value = false;
    }
}

function agApplyPreset() {
    const p = presets.value.find(x => x.id === ag.preset);
    if (p) {
        ag.model = p.id;
        ag.baseUrl = p.base_url;
    }
}

async function plan() {
    agErr.value = "";
    if (!ag.name.trim() || !ag.desc.trim()) {
        agErr.value = "请填写问题名称与描述";
        return;
    }
    agPlanning.value = true;
    try {
        planData.value = await api("/api/custom-problems/agent/plan", {
            method: "POST",
            body: {
                name: ag.name.trim(),
                description: ag.desc.trim() || undefined,
                source_dir: ag.src.trim() || undefined,
                llm_config: {
                    base_url: ag.baseUrl.trim(),
                    model: ag.model.trim(),
                    api_key: ag.apiKey.trim(),
                    use_local_llm: ag.local,
                },
            },
        });
    } catch (e) {
        agErr.value = e.message;
        planData.value = null;
    } finally {
        agPlanning.value = false;
    }
}

async function exec() {
    if (agExecuting.value) return;
    agExecuting.value = true;
    agErr.value = "";
    try {
        const r = await api("/api/custom-problems/agent/execute", {
            method: "POST",
            body: {
                plan_id: planData.value.plan_id,
                name: ag.name.trim() || undefined,
                description: ag.desc.trim() || undefined,
                source_dir: ag.src.trim() || undefined,
                llm_config: {
                    base_url: ag.baseUrl.trim(),
                    model: ag.model.trim(),
                    api_key: ag.apiKey.trim(),
                    use_local_llm: ag.local,
                },
            },
        });
        runId.value = r.run_id ?? r.id ?? null;
        if (runId.value) {
            pollRun();
            runTimer = setInterval(pollRun, 3000);
        }
    } catch (e) {
        agErr.value = e.message;
    } finally {
        agExecuting.value = false;
    }
}

async function pollRun() {
    if (!runId.value) return;
    try {
        runState.value = await api(`/api/custom-problems/agent/runs/${runId.value}`);
    } catch {
        return;
    }
    if (STATUS_DONE.has(runState.value.status)) {
        clearInterval(runTimer);
        runTimer = null;
        loadList();
    }
}

async function approve(approved) {
    const pf = runState.value.pending_file;
    if (!pf || agApproving.value) return;
    agApproving.value = approved ? "yes" : "no";
    try {
        await api("/api/custom-problems/agent/approve", {
            method: "POST",
            body: {
                run_id: runId.value,
                path: pf.path,
                approved,
                feedback: approved ? undefined : agFeedback.value.trim() || undefined,
            },
        });
        pollRun();
    } catch (e) {
        toast(e.message, "err");
    } finally {
        agApproving.value = "";
    }
}

function progressPct() {
    const tasks = runState.value.tasks ?? [];
    return tasks.length ? ((runState.value.current_task_index ?? 0) / tasks.length) * 100 : 0;
}

onUnmounted(() => {
    if (runTimer) clearInterval(runTimer);
});
</script>

<template>
    <div>
        <div class="card">
            <h2>自定义问题 <span class="tail">公开列表 · 上传与 Agent 建题需登录</span></h2>
            <div class="chip-row" style="margin-bottom: 12px">
                <button class="btn small" @click="loggedIn ? upfile.click() : toast('请先登录', 'err')">⬆ 上传数据文件</button>
                <input type="file" ref="upfile" multiple style="display: none" @change="uploadFiles" />
                <button v-if="loggedIn" class="btn small primary" @click="agentOpen = !agentOpen">🤖 Agent 建题</button>
                <span v-else class="hint">登录后可上传文件或用 Agent 自动建题</span>
            </div>
            <div v-if="loading" class="loading-row"><span class="spinner"></span>加载中…</div>
            <div v-else-if="!list.length">
                <EmptyState icon="🧩" desc="还没有自定义问题，上传数据文件或用 Agent 建一个" />
            </div>
            <div v-else class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>问题名称</th>
                            <th>标识 key</th>
                            <th>进化方向</th>
                            <th>分类</th>
                            <th>函数名</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="p in list" :key="p.problem_key ?? p.key">
                            <td><b>{{ p.name ?? p.problem_key ?? "—" }}</b>
                                <div v-if="p.description" class="hint"
                                    style="max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
                                    :title="p.description">{{ p.description }}</div>
                            </td>
                            <td class="mono">{{ p.problem_key ?? p.key ?? "—" }}</td>
                            <td><span class="badge" :class="p.ascend === false ? 'src-api' : 'src-local'">{{ p.ascend ===
                                false ? "越大越好" : "越小越好" }}</span></td>
                            <td>{{ p.category ?? "自定义" }}<span v-if="p.dataset_status"
                                    class="badge" :class="p.dataset_status === 'released' ? 'src-local' : 'feature-badge'"
                                    style="margin-left: 6px" :title="p.dataset_status === 'released' ? '数据集开放给所有用户' : '数据集仅管理员可见'">{{
                                    p.dataset_status === "released" ? "已开放" : "仅管理员" }}</span></td>
                            <td class="mono">{{ p.fun_name ?? "—" }}</td>
                            <td>
                                <span class="chip-row" style="gap: 6px">
                                    <button v-if="loggedIn" class="btn small" :title="`编辑「${p.name ?? p.problem_key ?? p.key}」`"
                                        @click="openEdit(p)">✏️ 编辑</button>
                                    <button v-if="loggedIn" class="btn small danger"
                                        :disabled="deleting === (p.problem_key ?? p.key)" @click="del(p)">{{ deleting ===
                                        (p.problem_key ?? p.key) ? '⏳ 删除中…' : '删除' }}</button>
                                </span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div v-if="agentOpen" class="card">
            <h2>🤖 Agent 自动建题 <span class="tail">描述问题 → 生成任务计划 → 执行 → 审批</span></h2>
            <div class="grid cols-2">
                <div class="field">
                    <label>问题名称 *</label>
                    <input v-model="ag.name" />
                </div>
                <div class="field">
                    <label>数据目录 source_dir（可选）</label>
                    <input class="mono" v-model="ag.src" />
                </div>
            </div>
            <div class="field">
                <label>问题描述 *</label>
                <textarea class="input" v-model="ag.desc" rows="3"></textarea>
            </div>
            <div class="grid cols-3">
                <div class="field">
                    <label>LLM 预设</label>
                    <select v-model="ag.preset" @change="agApplyPreset">
                        <option v-for="p in presets" :key="p.id" :value="p.id">{{ p.name }}</option>
                    </select>
                </div>
                <div class="field">
                    <label>模型 ID</label>
                    <input v-model="ag.model" />
                </div>
                <div class="field">
                    <label>Base URL</label>
                    <input v-model="ag.baseUrl" />
                </div>
            </div>
            <div class="chip-row" style="margin-bottom: 8px">
                <button class="chip" :class="{ on: ag.local }" @click="ag.local = !ag.local">使用实验室本地 LLM</button>
            </div>
            <div class="field" v-if="!ag.local">
                <label>API key</label>
                <input v-model="ag.apiKey" style="max-width: 300px" />
            </div>
            <div class="error-banner" v-if="agErr">{{ agErr }}</div>
            <button class="btn primary" :disabled="agPlanning" @click="plan">{{ agPlanning ? '⏳ 生成中…' : '① 生成任务计划' }}</button>
            <div v-if="planData" style="margin-top: 12px">
                <div v-if="planData.meta?.name" class="section-note">计划名称：<b>{{ planData.meta.name }}</b>
                    <span v-if="planData.plan_id"> · plan_id <span class="mono">{{ planData.plan_id }}</span></span>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>任务类型</th>
                                <th>说明</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(t, i) in planData.tasks ?? []" :key="i">
                                <td class="mono">{{ i + 1 }}</td>
                                <td><span class="badge feature-badge">{{ CP_TASK_LABEL[t.type] ?? t.type ?? "任务"
                                    }}</span></td>
                                <td class="hint">{{ t.description ?? t.goal ?? t.detail ?? JSON.stringify(t).slice(0,
                                    160) }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <button class="btn primary" style="margin-top: 10px" :disabled="agExecuting" @click="exec">{{ agExecuting ? '⏳ 执行中…' : '② 执行计划' }}</button>
            </div>
            <div v-if="runId" style="margin-top: 12px">
                <div class="grid cols-3">
                    <div class="stat">
                        <div class="k">状态</div>
                        <div class="v" style="font-size: 16px">{{ runState.status ?? "—" }}</div>
                    </div>
                    <div class="stat">
                        <div class="k">任务进度</div>
                        <div class="v mono" style="font-size: 16px">{{ runState.current_task_index ?? 0 }} / {{
                            (runState.tasks ?? []).length || 1 }}</div>
                    </div>
                    <div class="stat">
                        <div class="k">Run</div>
                        <div class="v mono" style="font-size: 16px">#{{ runId }}</div>
                    </div>
                </div>
                <div class="progress-track" style="margin: 10px 0">
                    <div class="progress-fill" :style="{ width: progressPct().toFixed(0) + '%' }"></div>
                </div>
                <div class="error-banner" v-if="runState.error">{{ runState.error }}</div>
                <div v-if="runState.pending_file" class="field">
                    <label>待审批文件：<span class="mono">{{ runState.pending_file.path ?? runState.pending_file.name ?? ""
                        }}</span>（{{ CP_TASK_LABEL[runState.pending_file.type] ?? runState.pending_file.type ?? "文件"
                        }}）</label>
                    <div class="chip-row">
                        <button class="btn small primary" :disabled="!!agApproving" @click="approve(true)">{{ agApproving === 'yes' ? '⏳ 处理中…' : '✔ 通过并继续' }}</button>
                        <button class="btn small danger" :disabled="!!agApproving" @click="approve(false)">{{ agApproving === 'no' ? '⏳ 处理中…' : '✘ 拒绝' }}</button>
                        <input class="input" v-model="agFeedback" placeholder="拒绝时的反馈意见" style="max-width: 280px" />
                    </div>
                    <div v-if="runState.pending_file.preview" class="code-container">
                        <pre style="max-height: 200px">{{ runState.pending_file.preview }}</pre>
                    </div>
                </div>
                <div v-if="runState.status === 'completed'" class="section-note">🎉 自定义问题已创建：{{
                    runState.custom_problem
                        ? (runState.custom_problem.name ?? runState.custom_problem.problem_key ?? "") + "（key: " +
                        runState.custom_problem.problem_key + "）"
                        : "完成" }}</div>
            </div>
        </div>

        <!-- 编辑自定义问题 -->
        <div v-if="editOpen" class="modal-mask" @click.self="editOpen = false">
            <div class="modal" role="dialog" aria-modal="true" style="max-width: 640px; width: 92vw">
                <h3>✏️ 编辑问题「{{ ed.name || editKey }}」 <span class="mono hint">{{ editKey }}</span></h3>
                <div class="grid cols-2">
                    <div class="field">
                        <label>问题名称 *</label>
                        <input v-model="ed.name" />
                    </div>
                    <div class="field">
                        <label>函数名 fun_name</label>
                        <input v-model="ed.fun_name" />
                    </div>
                </div>
                <div class="field">
                    <label>问题描述</label>
                    <textarea class="input" v-model="ed.description" rows="3"></textarea>
                </div>
                <div class="grid cols-2">
                    <div class="field">
                        <label>fun_args（JSON 数组）</label>
                        <textarea class="input mono" v-model="ed.funArgsText" rows="2"></textarea>
                    </div>
                    <div class="field">
                        <label>fun_return（JSON 数组）</label>
                        <textarea class="input mono" v-model="ed.funRetText" rows="2"></textarea>
                    </div>
                </div>
                <div class="field">
                    <label>注意事项 fun_notes</label>
                    <input v-model="ed.fun_notes" />
                </div>
                <div class="grid cols-2">
                    <div class="field">
                        <label>进化方向</label>
                        <select :value="ed.ascend ? 'true' : 'false'"
                            @change="ed.ascend = $event.target.value === 'true'">
                            <option value="true">适应度越小越好</option>
                            <option value="false">适应度越大越好</option>
                        </select>
                    </div>
                    <div class="field">
                        <label>可见性 dataset_status</label>
                        <select v-model="ed.dataset_status">
                            <option value="admin_only">仅管理员可见</option>
                            <option value="released">开放给所有用户</option>
                        </select>
                    </div>
                </div>
                <div class="grid cols-2">
                    <div class="field">
                        <label>数据集版本 dataset_version</label>
                        <input class="mono" v-model="ed.dataset_version" placeholder="如 my-dataset-v1" />
                    </div>
                    <div class="field">
                        <label>评估器版本 evaluator_version</label>
                        <input class="mono" v-model="ed.evaluator_version" placeholder="如 my-evaluator-v1" />
                    </div>
                </div>
                <div class="error-banner" v-if="editErr">{{ editErr }}</div>
                <div class="chip-row" style="margin-top: 10px">
                    <button class="btn primary" :disabled="editBusy" @click="saveEdit">{{ editBusy ? '⏳ 保存中…' : '💾 保存修改'
                        }}</button>
                    <button class="btn" :disabled="editBusy" @click="editOpen = false">取消</button>
                </div>
            </div>
        </div>
    </div>
</template>
