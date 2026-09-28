<script setup>
import { computed } from "vue";
import { store, closeDrawer } from "../../lib/store";
import SubDetailDrawer from "./SubDetailDrawer.vue";
import UserProfileDrawer from "./UserProfileDrawer.vue";
import HeurDetailDrawer from "./HeurDetailDrawer.vue";

const DRAWERS = {
    "sub-detail": SubDetailDrawer,
    "user-profile": UserProfileDrawer,
    "heur-detail": HeurDetailDrawer,
};

const drawerComp = computed(() => (store.drawer && DRAWERS[store.drawer.comp]) || "div");
</script>

<template>
    <div class="drawer-mask" v-if="store.drawer" @click="closeDrawer()"></div>
    <aside class="drawer" v-if="store.drawer">
        <component :is="drawerComp" v-bind="store.drawer.props" :key="store.drawer.comp + ':' + JSON.stringify(store.drawer.props ?? {})" />
    </aside>
</template>
