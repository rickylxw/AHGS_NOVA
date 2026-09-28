<script setup>
import { computed } from "vue";
import { niceTicks, fmtTick } from "./ticks";

const props = defineProps({
    /** [{ label, value, tip, color }] */
    items: { type: Array, default: () => [] },
    width: { type: Number, default: 780 },
    height: { type: Number, default: 180 },
    emptyIcon: { type: String, default: "📊" },
    emptyText: { type: String, default: "暂无数据" },
});

const pad = { l: 46, r: 12, t: 12, b: 26 };
const gradId = `barg-${Math.random().toString(36).slice(2, 9)}`;

const hasData = computed(() => props.items.length > 0);

const scale = computed(() => {
    if (!hasData.value) return null;
    const max = Math.max(1, ...props.items.map(i => i.value));
    const { ticks, hi } = niceTicks(0, max, 3);
    const bw = (props.width - pad.l - pad.r) / Math.max(props.items.length, 1);
    return { ticks, hi, bw };
});

const gridLines = computed(() =>
    scale.value
        ? scale.value.ticks.map(t => ({
            v: t,
            label: fmtTick(t),
            y: (pad.t + ((scale.value.hi - t) / scale.value.hi) * (props.height - pad.t - pad.b)).toFixed(1),
        }))
        : []
);

const bars = computed(() => {
    if (!scale.value) return [];
    const { hi, bw } = scale.value;
    return props.items.map((it, i) => {
        const h = (it.value / hi) * (props.height - pad.t - pad.b);
        const x = pad.l + i * bw + bw * 0.14;
        const w = bw * 0.72;
        return {
            x: x.toFixed(1),
            y: (props.height - pad.b - h).toFixed(1),
            w: w.toFixed(1),
            h: Math.max(h, it.value > 0 ? 1.5 : 0).toFixed(1),
            fill: it.color || `url(#${gradId})`,
            opacity: it.value ? 0.92 : 0.15,
            tip: (it.tip ?? it.label) + "：" + fmtTick(it.value),
            showLabel: props.items.length <= 14 || i % Math.ceil(props.items.length / 12) === 0,
            labelX: (x + w / 2).toFixed(1),
            label: it.label,
        };
    });
});
</script>

<template>
    <div v-if="!hasData" class="empty">
        <div class="ico">{{ emptyIcon }}</div>
        {{ emptyText }}
    </div>
    <svg v-else :viewBox="`0 0 ${width} ${height}`" style="color: var(--text)">
        <defs>
            <linearGradient :id="gradId" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0" stop-color="#22d3ee" stop-opacity=".55" />
                <stop offset="1" stop-color="#a78bfa" />
            </linearGradient>
        </defs>
        <template v-for="t in gridLines" :key="'g' + t.v">
            <line :x1="pad.l" :y1="t.y" :x2="width - pad.r" :y2="t.y" stroke="currentColor" stroke-opacity=".1" />
            <text class="axis-text" :x="pad.l - 6" :y="Number(t.y) + 3.5" text-anchor="end">{{ t.label }}</text>
        </template>
        <g v-for="(b, i) in bars" :key="i">
            <rect :x="b.x" :y="b.y" :width="b.w" :height="b.h" rx="2.5" :fill="b.fill" :opacity="b.opacity">
                <title>{{ b.tip }}</title>
            </rect>
            <text v-if="b.showLabel" class="axis-text" :x="b.labelX" :y="height - 8" text-anchor="middle">
                {{ b.label }}</text>
        </g>
    </svg>
</template>
