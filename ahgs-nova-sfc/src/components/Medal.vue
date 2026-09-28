<script setup>
import { computed } from "vue";

const props = defineProps({ rank: { type: Number, required: true } });
const emoji = computed(() => ["🥇", "🥈", "🥉"][props.rank - 1] || "");
</script>

<template>
    <span v-if="rank <= 3" class="medal" :class="'r' + rank">{{ emoji }}</span>
    <span v-else class="rank-val mono">{{ rank }}</span>
</template>
