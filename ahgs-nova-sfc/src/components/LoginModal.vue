<script setup>
import { ref } from "vue";
import { api } from "../lib/api";
import { store, setSession, toast } from "../lib/store";
import { LS } from "../lib/constants";
import { fullName } from "../lib/format";

const mode = ref("login");
const username = ref("");
const displayName = ref("");
const password = ref("");
const confirm = ref("");
const agree = ref(true);
const remember = ref(true);
const showPw = ref(false);
const showCfm = ref(false);
const err = ref("");
const busy = ref(false);

// 打开弹窗时恢复「记住的账号密码」（弹窗为 v-if 挂载，每次打开都会执行）
try {
    const m = JSON.parse(localStorage.getItem(LS.remember) || "null");
    if (m && typeof m.u === "string") {
        username.value = m.u;
        password.value = m.p ?? "";
        remember.value = true;
    }
} catch { /* ignore */ }

function persistRemember() {
    if (remember.value) {
        localStorage.setItem(LS.remember, JSON.stringify({ u: username.value.trim(), p: password.value }));
    } else {
        localStorage.removeItem(LS.remember);
    }
}

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
        persistRemember();
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
                    <div class="pw-wrap">
                        <input v-model="password" :type="showPw ? 'text' : 'password'"
                            autocomplete="current-password" />
                        <button type="button" class="pw-toggle" :aria-label="showPw ? '隐藏密码' : '显示密码'"
                            :aria-pressed="showPw ? 'true' : 'false'" @click="showPw = !showPw"><svg width="20"
                                height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                                <path
                                    d="M2.06 12.35a1 1 0 0 1 0-.7C3.4 7.3 7.45 4.5 12 4.5s8.6 2.8 9.94 7.15a1 1 0 0 1 0 .7C20.6 16.7 16.55 19.5 12 19.5s-8.6-2.8-9.94-7.15Z">
                                </path>
                                <circle cx="12" cy="12" r="3"></circle>
                                <line x1="4" y1="20" x2="20" y2="4" v-show="showPw"></line>
                            </svg></button>
                    </div>
                </div>
                <div class="field" v-if="mode === 'register'">
                    <label>确认密码</label>
                    <div class="pw-wrap">
                        <input v-model="confirm" :type="showCfm ? 'text' : 'password'" autocomplete="new-password" />
                        <button type="button" class="pw-toggle" :aria-label="showCfm ? '隐藏密码' : '显示密码'"
                            :aria-pressed="showCfm ? 'true' : 'false'" @click="showCfm = !showCfm"><svg width="20"
                                height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                                <path
                                    d="M2.06 12.35a1 1 0 0 1 0-.7C3.4 7.3 7.45 4.5 12 4.5s8.6 2.8 9.94 7.15a1 1 0 0 1 0 .7C20.6 16.7 16.55 19.5 12 19.5s-8.6-2.8-9.94-7.15Z">
                                </path>
                                <circle cx="12" cy="12" r="3"></circle>
                                <line x1="4" y1="20" x2="20" y2="4" v-show="showCfm"></line>
                            </svg></button>
                    </div>
                </div>
                <label class="check-row"><input type="checkbox" v-model="remember" />记住账号和密码</label>
                <label class="check-row"><input type="checkbox" v-model="agree" />我已阅读并同意平台《用户须知》</label>
                <div class="error-banner" v-if="err">{{ err }}</div>
                <button class="btn primary" style="width: 100%" type="submit" :disabled="busy">
                    {{ mode === 'register' ? '注册并登录' : '登录' }}</button>
            </form>
        </div>
    </div>
</template>
