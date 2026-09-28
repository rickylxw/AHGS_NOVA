<script setup>
import { computed, onMounted, ref } from "vue";
import { api } from "../../lib/api";
import { store, closeDrawer } from "../../lib/store";
import { navHash } from "../../lib/router";
import { fmtObj, fmtTokens, fullName } from "../../lib/format";
import Avatar from "../Avatar.vue";
import SrcBadge from "../SrcBadge.vue";
import FwBadge from "../FwBadge.vue";
import CodeBlock from "../CodeBlock.vue";

const props = defineProps({ sid: { type: String, required: true } });

const d = ref(null);
const err = ref("");
const features = computed(() => d.value?.features ?? []);

onMounted(async () => {
    try {
        d.value = await api(`/api/submissions/${props.sid}`);
    } catch (e) {
        err.value = e.status === 401 ? "此内容需要登录后查看" : "加载失败：" + e.message;
    }
});

function isLoadErr() {
    return err.value.startsWith("加载失败");
}
</script>

<template>
    <div>
        <div class="drawer-head">
            <h3>最优算法详情 <span class="mono hint">#{{ sid }}</span></h3>
            <button class="drawer-close" @click="closeDrawer()">×</button>
        </div>
        <div v-if="!d && !err" class="loading-row"><span class="spinner"></span>加载中…</div>
        <div v-else-if="err" class="error-banner">
            {{ isLoadErr() ? err : "🔐 " + err }}
            <div v-if="!isLoadErr()" style="margin-top: 8px"><button class="btn primary"
                    @click="store.loginModal = true">登录 / 注册</button></div>
        </div>
        <template v-else>
            <div class="user-cell" style="margin-bottom: 12px">
                <span><Avatar :user="d" /></span>
                <div class="u-name">
                    <span class="u-main">{{ fullName(d) }}</span>
                    <span v-if="d.display_name && d.username && d.display_name !== d.username" class="u-sub mono">{{
                        d.username }}</span>
                </div>
            </div>
            <div class="grid-2">
                <div class="kv"><span class="k">适应度</span><span class="mono">{{ fmtObj(d.objective) }}</span></div>
                <div class="kv"><span class="k">所耗 token</span><span class="mono">{{ fmtTokens(d.total_tokens)
                    }}</span></div>
                <div class="kv"><span class="k">来源</span><SrcBadge :src="d.model_source" /></div>
                <div class="kv"><span class="k">框架</span><FwBadge :ft="d.framework_type" /></div>
            </div>
            <div class="field">
                <label>使用模型</label>
                <div class="mono">{{ d.llm_model || "—" }}</div>
            </div>
            <div class="field">
                <label>启发式思想</label>
                <p class="drawer-text">{{ d.concept ?? "—" }}</p>
            </div>
            <div class="field">
                <label>关键词组</label>
                <div class="badge-row">
                    <span v-for="f in features" :key="f" class="badge feature-badge">{{ f }}</span>
                    <span v-if="!features.length" class="hint">无</span>
                </div>
            </div>
            <div class="field">
                <label>算法代码</label>
                <CodeBlock :code="d.algorithm ?? ''" />
            </div>
            <button class="btn primary" style="width: 100%; margin-top: 8px"
                @click="navHash('curve', new URLSearchParams({ id: d.id ?? sid }))">📈 查看进化曲线分析</button>
        </template>
    </div>
</template>
