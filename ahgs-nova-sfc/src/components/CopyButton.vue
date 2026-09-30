<script setup>
import { onBeforeUnmount, ref } from "vue";
import { copyText } from "../lib/format";

const props = defineProps({
    text: { type: String, default: "" },
});

const copied = ref(false);
let timer = null;

async function onClick() {
    const ok = await copyText(props.text);
    if (!ok) return;
    copied.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => (copied.value = false), 1500);
}

onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
    <button class="btn small copy-btn" :class="{ copied }" @click="onClick">{{ copied ? "已复制 ✓" : "复制" }}</button>
</template>
