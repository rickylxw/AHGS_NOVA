<script setup>
import CopyButton from "./CopyButton.vue";

defineProps({
    code: { type: String, default: "" },
    maxHeight: { type: String, default: "" },
});
</script>

<template>
    <div class="code-container">
        <CopyButton :text="code" />
        <pre :style="maxHeight ? { maxHeight } : null">{{ code }}</pre>
    </div>
</template>
