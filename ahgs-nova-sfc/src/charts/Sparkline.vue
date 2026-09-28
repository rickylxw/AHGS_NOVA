<script setup>
import { computed } from "vue";

const props = defineProps({
    values: { type: Array, default: () => [] },
    color: { type: String, default: "#22d3ee" },
    w: { type: Number, default: 110 },
    h: { type: Number, default: 30 },
});

const path = computed(() => {
    const pts = props.values.filter(v => isFinite(v));
    if (pts.length < 2) return "";
    const lo = Math.min(...pts);
    const hi = Math.max(...pts);
    const X = i => 2 + (i / (props.values.length - 1)) * (props.w - 4);
    const Y = v => (hi === lo ? props.h / 2 : 3 + ((hi - v) / (hi - lo)) * (props.h - 6));
    return props.values
        .map((v, i) => (isFinite(v) ? (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1) : ""))
        .join(" ");
});
</script>

<template>
    <svg :viewBox="`0 0 ${w} ${h}`" :width="w" :height="h">
        <path v-if="path" :d="path" fill="none" :stroke="color" stroke-width="1.8" stroke-linejoin="round" />
    </svg>
</template>
