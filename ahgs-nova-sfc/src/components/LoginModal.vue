<script setup>
import { ref } from "vue";
import { api } from "../lib/api";
import { store, setSession, toast } from "../lib/store";
import { fullName } from "../lib/format";

const mode = ref("login");
const username = ref("");
const displayName = ref("");
const password = ref("");
const confirm = ref("");
const agree = ref(true);
const err = ref("");
const busy = ref(false);

async function submit() {
    err.value = "";
    if (!username.value.trim() || !password.value) {
        err.value = "请填写一卡通号和密码";
        return;
    }
    if (!agree.value) {
        err.value = "请先阅读并同意《用户须知》";
        return;
    }
    if (mode.value === "register" && password.value !== confirm.value) {
        err.value = "两次输入的密码不一致";
        return;
    }
    busy.value = true;
    try {
        if (mode.value === "register") {
            await api("/api/auth/register", {
                method: "POST",
                body: {
                    username: username.value.trim(),
                    display_name: displayName.value.trim(),
                    password: password.value,
                    confirm_password: confirm.value,
                    agree_terms: true,
                },
            });
        }
        const r = await api("/api/auth/login", {
            method: "POST",
            body: {
                username: username.value.trim(),
                password: password.value,
                agree_terms: true,
            },
        });
        setSession(r.access_token, r.user);
        store.loginModal = false;
        toast(`欢迎，${fullName(r.user || {})}`, "ok");
        store.viewVer = (store.viewVer || 0) + 1;
    } catch (e) {
        err.value = e.message;
    } finally {
        busy.value = false;
    }
}
</script>

<template>
    <div class="modal-mask" @click.self="store.loginModal = false">
        <div class="modal">
            <h3>登录 AHGS 平台</h3>
            <div class="tabs">
                <button class="chip" :class="{ on: mode === 'login' }" @click="mode = 'login'">登录</button>
                <button class="chip" :class="{ on: mode === 'register' }" @click="mode = 'register'">注册</button>
            </div>
            <form @submit.prevent="submit">
                <div class="field">
                    <label>一卡通号 / 用户名</label>
                    <input v-model="username" autocomplete="username" />
                </div>
                <div class="field" v-if="mode === 'register'">
                    <label>昵称（display_name）</label>
                    <input v-model="displayName" autocomplete="nickname" />
                </div>
                <div class="field">
                    <label>密码</label>
                    <input v-model="password" type="password" autocomplete="current-password" />
                </div>
                <div class="field" v-if="mode === 'register'">
                    <label>确认密码</label>
                    <input v-model="confirm" type="password" autocomplete="new-password" />
                </div>
                <label class="check-row"><input type="checkbox" v-model="agree" />我已阅读并同意平台《用户须知》</label>
                <div class="error-banner" v-if="err">{{ err }}</div>
                <button class="btn primary" style="width: 100%" type="submit" :disabled="busy">
                    {{ mode === 'register' ? '注册并登录' : '登录' }}</button>
            </form>
        </div>
    </div>
</template>
