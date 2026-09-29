<script setup>
import { computed } from "vue";

const props = defineProps({
    /** [{ rank, label, sub, value, fmt, submissionId, userId }] */
    rows: { type: Array, default: () => [] },
});

const emit = defineEmits(["open"]);

const computedRows = computed(() => {
    const vals = props.rows.map(r => r.value).filter(v => isFinite(v));
    const max = vals.length ? Math.max(...vals) : 0;
    const min = vals.length ? Math.min(...vals) : 0;
    const span = max - min || 1;
    return props.rows.map(r => ({
        ...r,
        rel: isFinite(r.value) ? 12 + ((r.value - min) / span) * 88 : 6,
        medal: r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : "#" + r.rank,
    }));
});

function click(row) {
    emit("open", row);
}
</script>

<template>
    <div v-if="!rows.length" class="empty">
        <div class="ico">🏁</div>暂无参赛记录
    </div>
    <div v-else class="hbar-list">
        <div v-for="r in computedRows" :key="r.rank" class="hbar-row" @click="click(r)">
            <span class="hbar-rank">{{ r.medal }}</span>
            <span class="hbar-who">{{ r.label }}<small>{{ r.sub || "" }}</small></span>
            <span class="hbar-track"><span class="hbar-fill"
                    :style="{ width: r.rel.toFixed(1) + '%', background: 'var(--accent-grad)' }"></span></span>
            <span class="hbar-val mono">{{ r.fmt }}</span>
        </div>
    </div>
</template>

<style scoped>
.hbar-row {
    cursor: pointer;
}
</style>
