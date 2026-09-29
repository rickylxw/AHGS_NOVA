<script setup>
import { fmtObj } from "../lib/format";

defineProps({
    /** { good: [{name, n, avg, best, overall, delta}], bad: [...] } */
    insight: { type: Object, required: true },
    scope: { type: String, default: "" },
    ascend: { type: Boolean, default: true },
});
</script>

<template>
    <div class="card">
        <h2>关键词洞察 <span class="tail">{{ scope }}</span></h2>
        <p class="hint" style="margin-bottom: 8px">统计个体 features 与适应度的相关性：出现该关键词的个体平均适应度相对总体平均的变化（{{ ascend ? "越小越好" : "越大越好" }}，正值 = 有利）。</p>
        <div class="field">
            <label>👍 有利关键词（携带者更优）</label>
            <div class="badge-row">
                <span v-for="k in insight.good" :key="k.name" class="badge src-local"
                    :title="'出现 ' + k.n + ' 次 · 平均 ' + fmtObj(k.avg) + '（总体 ' + fmtObj(k.overall) + '）· 最好 ' + fmtObj(k.best)">
                    {{ k.name }} ×{{ k.n }}（{{ k.delta > 0 ? "+" : "" }}{{ k.delta.toFixed(1) }}%）</span>
                <span v-if="!insight.good.length" class="hint">无明显有利关键词</span>
            </div>
        </div>
        <div class="field">
            <label>👎 不利关键词（携带者更差）</label>
            <div class="badge-row">
                <span v-for="k in insight.bad" :key="k.name" class="badge src-api"
                    :title="'出现 ' + k.n + ' 次 · 平均 ' + fmtObj(k.avg) + '（总体 ' + fmtObj(k.overall) + '）'">
                    {{ k.name }} ×{{ k.n }}（{{ k.delta > 0 ? "+" : "" }}{{ k.delta.toFixed(1) }}%）</span>
                <span v-if="!insight.bad.length" class="hint">无明显不利关键词</span>
            </div>
        </div>
    </div>
</template>
