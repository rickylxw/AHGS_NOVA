<script setup>
import { copyText } from "../lib/format";

defineProps({
    code: { type: String, default: "" },
    maxHeight: { type: String, default: "" },
});
</script>

<template>
    <div class="code-container">
        <button class="btn small copy-btn" @click="copyText(code)">复制</button>
        <pre :style="maxHeight ? { maxHeight } : null">{{ code }}</pre>
    </div>
</template>
