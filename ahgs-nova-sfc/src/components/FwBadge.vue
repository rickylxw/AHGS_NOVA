<script setup>
import { computed } from "vue";
import { FW_LABEL } from "../lib/constants";

const props = defineProps({ ft: { type: String, default: "" } });
const label = computed(() => FW_LABEL[props.ft] || "AHG");
const cls = computed(() => (props.ft === "custom" ? "fw-custom" : "fw-ahg"));
</script>

<template>
    <span class="badge" :class="cls">{{ label }}</span>
</template>
