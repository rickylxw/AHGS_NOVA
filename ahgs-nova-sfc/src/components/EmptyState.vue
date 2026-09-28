<script setup>
defineProps({
    icon: { type: String, default: "📭" },
    desc: { type: String, default: "" },
});
</script>

<template>
    <div class="empty">
        <div class="ico">{{ icon }}</div>
        {{ desc }}
    </div>
</template>
