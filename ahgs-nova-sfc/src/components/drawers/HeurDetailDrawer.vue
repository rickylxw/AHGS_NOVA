<script setup>
import { fmtObj } from "../../lib/format";
import { closeDrawer } from "../../lib/store";
import CodeBlock from "../CodeBlock.vue";

defineProps({
    h: { type: Object, required: true },
    gen: { type: [String, Number], default: "?" },
    idx: { type: Number, required: true },
});
</script>

<template>
    <div>
        <div class="drawer-head">
            <h3>种群个体 #{{ idx + 1 }}</h3>
            <button class="drawer-close" @click="closeDrawer()">×</button>
        </div>
        <div class="grid-2">
            <div class="kv"><span class="k">适应度</span><span class="mono">{{ fmtObj(h.objective) }}</span></div>
            <div class="kv"><span class="k">代数</span><span class="mono">{{ gen }}</span></div>
        </div>
        <div class="field">
            <label>启发式思想</label>
            <p class="drawer-text">{{ h.concept ?? "—" }}</p>
        </div>
        <div class="field">
            <label>关键词组</label>
            <div class="badge-row">
                <span v-for="f in (h.features ?? [])" :key="f" class="badge feature-badge">{{ f }}</span>
                <span v-if="!(h.features ?? []).length" class="hint">无</span>
            </div>
        </div>
        <div v-if="h.algorithm" class="field">
            <label>算法代码</label>
            <CodeBlock :code="h.algorithm" />
        </div>
    </div>
</template>
