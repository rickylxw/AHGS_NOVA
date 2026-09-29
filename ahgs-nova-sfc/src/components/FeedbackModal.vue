<script setup>
// 问题反馈 / 建议提交：组装成 GitHub Issue 预填链接（用户用自己 GitHub 登录态一键提交）
import { computed, reactive, ref } from "vue";
import { store } from "../lib/store";
import { apiBase, getStoredUser } from "../lib/api";
import { REPO_URL } from "../lib/constants";
import { fullName } from "../lib/format";

const emit = defineEmits(["close"]);

const TYPE_LABEL = { bug: "🐛 问题反馈", feature: "💡 功能建议", data: "🔢 数据问题", other: "💬 其他" };
const TYPE_SHORT = { bug: "问题反馈", feature: "功能建议", data: "数据问题", other: "其他" };
const form = reactive({ type: "bug", title: "", detail: "", contact: "" });
const busy = ref(false);

const issueUrl = computed(() => {
    const u = getStoredUser();
    const lines = [
        "## 反馈类型",
        TYPE_LABEL[form.type],
        "",
        "## 内容",
        form.detail.trim() || "（未填写）",
        "",
        "## 联系方式",
        form.contact.trim() || "（未填写）",
        "",
        "## 环境信息（自动生成）",
        `- 平台账号：${u ? fullName(u) + "（" + u.username + "，ID " + u.id + "）" : "未登录"}`,
        `- 页面：${location.hash || "#/"}`,
        `- 前端版本：v${"2.4.1"}（SFC）`,
        `- 接口地址：${apiBase()}`,
        `- 浏览器：${navigator.userAgent}`,
        `- 时间：${new Date().toLocaleString("zh-CN")}`,
    ];
    const params = new URLSearchParams({
        title: `[${TYPE_SHORT[form.type]}] ${form.title.trim() || "未命名反馈"}`,
        body: lines.join("\n"),
        labels: form.type === "bug" ? "bug" : form.type === "feature" ? "enhancement" : "feedback",
    });
    return `${REPO_URL}/issues/new?${params.toString()}`;
});

function submit() {
    if (!form.title.trim() || !form.detail.trim()) return;
    busy.value = true;
    // 新窗口打开 GitHub Issue 预填页（保留本页状态），反馈人只需点一次“Submit new issue”
    window.open(issueUrl.value, "_blank", "noopener");
    setTimeout(() => {
        busy.value = false;
        emit("close");
    }, 400);
}
</script>

<template>
    <div class="modal-mask" @click.self="emit('close')">
        <div class="modal feedback-modal">
            <h3>📝 问题反馈 / 建议提交</h3>
            <div class="tabs">
                <button v-for="(label, key) in TYPE_LABEL" :key="key" class="chip"
                    :class="{ on: form.type === key }" @click="form.type = key">{{ label }}</button>
            </div>
            <form @submit.prevent="submit">
                <div class="field">
                    <label>标题 *<span class="hint">（一句话概括）</span></label>
                    <input v-model="form.title" maxlength="80" placeholder="如：排行榜搜索时回车会清空输入" />
                </div>
                <div class="field">
                    <label>详细描述 *<span class="hint">（怎么复现 / 期望什么效果）</span></label>
                    <textarea v-model="form.detail" rows="5" maxlength="2000"
                        placeholder="1. 打开哪个页面&#10;2. 做了什么操作&#10;3. 看到了什么、期望看到什么"></textarea>
                </div>
                <div class="field">
                    <label>联系方式<span class="hint">（可选，方便回访；平台一卡通号 / 微信等）</span></label>
                    <input v-model="form.contact" maxlength="60" placeholder="如：213253844" />
                </div>
                <div class="hint" style="margin: 4px 0 10px">
                    提交后会打开 GitHub Issues 预填页（用你的 GitHub 账号点一次
                    <b>Submit new issue</b> 即完成），环境信息已自动附上，也可截图补充。
                </div>
                <div style="display: flex; gap: 8px">
                    <button class="btn primary" style="flex: 1" type="submit" :disabled="busy || !form.title.trim() || !form.detail.trim()">
                        前往 GitHub 提交
                    </button>
                    <button class="btn" type="button" @click="emit('close')">取消</button>
                </div>
            </form>
        </div>
    </div>
</template>
