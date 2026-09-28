<script setup>
import { computed, ref, watch } from "vue";
import { fullName } from "../lib/format";

const props = defineProps({
    user: { type: Object, default: null },
    size: { type: Number, default: 30 },
});

const imgErr = ref(false);
watch(() => props.user?.avatar, () => {
    imgErr.value = false;
});

const initial = computed(() => (fullName(props.user)[0] || "?").toUpperCase());
const showImg = computed(() => props.user && props.user.avatar && !imgErr.value);
const st = computed(() => ({
    width: props.size + "px",
    height: props.size + "px",
    fontSize: Math.round(props.size * 0.44) + "px",
}));
</script>

<template>
    <span class="avatar" :style="st">
        <img v-if="showImg" :src="user.avatar" alt="" referrerpolicy="no-referrer" @error="imgErr = true" />
        {{ initial }}
    </span>
</template>
