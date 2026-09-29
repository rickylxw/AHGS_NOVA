<script setup>
import { computed } from "vue";
import { niceTicks, fmtTick } from "./ticks";

const props = defineProps({
    /** [{ name, color, points: [{x, y, label}], dashed }] */
    series: { type: Array, default: () => [] },
    width: { type: Number, default: 780 },
    height: { type: Number, default: 300 },
    yLabel: { type: String, default: "" },
    xFormat: { type: Function, default: null },
    emptyIcon: { type: String, default: "📈" },
    emptyText: { type: String, default: "暂无可绘制的数据点" },
});

const pad = { l: 58, r: 18, t: 14, b: 34 };

const allPoints = computed(() =>
    props.series.flatMap(s => (s.points || []).filter(p => isFinite(p.x) && isFinite(p.y)))
);
const hasData = computed(() => allPoints.value.length > 0);

const scale = computed(() => {
    if (!hasData.value) return null;
    const pts = allPoints.value;
    const ys = pts.map(p => p.y);
    const { ticks, lo, hi } = niceTicks(Math.min(...ys), Math.max(...ys));
    let xlo = Math.min(...pts.map(p => p.x));
    let xhi = Math.max(...pts.map(p => p.x));
    if (xlo === xhi) {
        xlo -= 1;
        xhi += 1;
    }
    const xpad = (xhi - xlo) * 0.02;
    xlo -= xpad;
    xhi += xpad;
    const X = x => pad.l + ((x - xlo) / (xhi - xlo)) * (props.width - pad.l - pad.r);
    const Y = y => pad.t + ((hi - y) / (hi - lo)) * (props.height - pad.t - pad.b);
    return { ticks, X, Y, xlo, xhi };
});

const yTicks = computed(() =>
    scale.value
        ? scale.value.ticks.map(t => ({ v: t, label: fmtTick(t), y: scale.value.Y(t) }))
        : []
);

const xTicks = computed(() => {
    if (!scale.value) return [];
    const { X, xlo, xhi } = scale.value;
    const nx = Math.min(8, Math.max(2, Math.round((props.width - pad.l - pad.r) / 90)));
    const out = [];
    for (let i = 0; i <= nx; i++) {
        const x = xlo + ((xhi - xlo) * i) / nx;
        out.push({ x: X(x), label: props.xFormat ? props.xFormat(x) : fmtTick(x) });
    }
    return out;
});

const drawnSeries = computed(() => {
    if (!scale.value) return [];
    const { X, Y } = scale.value;
    return props.series
        .map(s => {
            const pv = (s.points || []).filter(p => isFinite(p.x) && isFinite(p.y));
            if (!pv.length) return null;
            const d = pv.map((p, i) => (i ? "L" : "M") + X(p.x).toFixed(1) + " " + Y(p.y).toFixed(1)).join(" ");
            return {
                color: s.color,
                d,
                dashed: !!s.dashed,
                dots: pv.map(p => ({
                    cx: X(p.x).toFixed(1),
                    cy: Y(p.y).toFixed(1),
                    tip: (p.label ?? p.x) + "：" + fmtTick(p.y),
                })),
            };
        })
        .filter(Boolean);
});
</script>

<template>
    <div v-if="!hasData" class="empty">
        <div class="ico">{{ emptyIcon }}</div>{{ emptyText }}
    </div>
    <svg v-else :viewBox="`0 0 ${width} ${height}`" role="img" style="color: var(--text)">
        <template v-for="t in yTicks" :key="'gy' + t.v">
            <line :x1="pad.l" :y1="t.y" :x2="width - pad.r" :y2="t.y" stroke="currentColor" stroke-opacity=".1"
                stroke-width="1" />
            <text class="axis-text" :x="pad.l - 8" :y="t.y + 3.5" text-anchor="end">{{ t.label }}</text>
        </template>
        <text v-for="(t, i) in xTicks" :key="'gx' + i" class="axis-text" :x="t.x" :y="height - 10"
            text-anchor="middle">{{ t.label }}</text>
        <text v-if="yLabel" class="axis-text" :transform="`rotate(-90 14 ${height / 2})`" x="14" :y="height / 2"
            text-anchor="middle">{{ yLabel }}</text>
        <template v-for="(s, si) in drawnSeries" :key="'s' + si">
            <path :d="s.d" fill="none" :stroke="s.color" stroke-width="2.2"
                :stroke-dasharray="s.dashed ? '5 4' : undefined" stroke-linejoin="round" stroke-linecap="round"
                opacity=".95" />
            <circle v-for="(dot, di) in s.dots" :key="di" :cx="dot.cx" :cy="dot.cy" r="3" :fill="s.color">
                <title>{{ dot.tip }}</title>
            </circle>
        </template>
    </svg>
</template>
