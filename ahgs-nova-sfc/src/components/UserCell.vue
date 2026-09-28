<script setup>
import { openUserDrawer } from "../lib/store";
import { fullName } from "../lib/format";
import Avatar from "./Avatar.vue";

const props = defineProps({ user: { type: Object, default: null } });

function open() {
    if (props.user && props.user.user_id != null) openUserDrawer(props.user.user_id);
}
</script>

<template>
    <div class="user-cell">
        <span class="link-ish" @click.stop="open"><Avatar :user="user" /></span>
        <div class="u-name">
            <span class="u-main">{{ fullName(user) }}</span>
            <span v-if="user && user.display_name && user.username && user.display_name !== user.username"
                class="u-sub mono">{{ user.username }}</span>
        </div>
    </div>
</template>
