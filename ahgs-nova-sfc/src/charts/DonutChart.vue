<script setup>
import { computed } from "vue";

const props = defineProps({
    /** [{ label, value, color }] */
    segments: { type: Array, default: () => [] },
    emptyIcon: { type: String, default: "🧭" },
});

const total = computed(() => props.segments.reduce((s, x) => s + x.value, 0));

const arcs = computed(() => {
    const R = 52;
    const C = 2 * Math.PI * R;
    let off = 0;
    return props.segments.map(seg => {
        const frac = total.value ? seg.value / total.value : 0;
        const len = frac * C;
        const arc = {
            color: seg.color,
            label: seg.label,
            value: seg.value,
            dasharray: `${len.toFixed(2)} ${(C - len).toFixed(2)}`,
            dashoffset: (-off).toFixed(2),
            pct: (frac * 100).toFixed(1),
        };
        off += len;
        return arc;
    });
});
</script>

<template>
    <div v-if="!total" class="empty">
        <div class="ico">{{ emptyIcon }}</div>暂无数据
    </div>
    <div v-else class="donut-flex">
        <svg viewBox="0 0 140 140" width="150" height="150">
            <circle v-for="(a, i) in arcs" :key="i" r="52" cx="70" cy="70" fill="none" :stroke="a.color"
                stroke-width="17" :stroke-dasharray="a.dasharray" :stroke-dashoffset="a.dashoffset"
                transform="rotate(-90 70 70)">
                <title>{{ a.label }}：{{ a.value }}（{{ a.pct }}%）</title>
            </circle>
            <text x="70" y="67" text-anchor="middle" style="fill: var(--text); font-weight: 800; font-size: 19px">
                {{ total }}</text>
            <text x="70" y="85" text-anchor="middle" class="axis-text">总计</text>
        </svg>
        <div class="legend" style="flex-direction: column; align-items: flex-start; gap: 6px">
            <span v-for="(a, i) in arcs" :key="'l' + i"><span class="dot" :style="{ background: a.color }"></span>{{
                a.label }} · {{ a.value }}（{{ (a.value / total * 100).toFixed(0) }}%）</span>
        </div>
    </div>
</template>
