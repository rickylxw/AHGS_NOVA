<script setup>
import { computed } from "vue";

const props = defineProps({ src: { type: String, default: "" } });
const label = computed(() => (props.src === "local" ? "本地LLM" : "API"));
const cls = computed(() => (props.src === "local" ? "src-local" : "src-api"));
</script>

<template>
    <span class="badge" :class="cls">{{ label }}</span>
</template>
