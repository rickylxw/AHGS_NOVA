import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
    plugins: [vue()],
    base: "./",
    server: {
        port: 8925,
        // 平台 2026-10 起关闭跨域访问（CORS 预检一律 400）：开发时 /api 走同源代理转发，
        // 见 src/lib/api.js 的 apiBase()（DEV 下默认接口地址改用同源）。
        proxy: {
            "/api": { target: "http://10.201.186.15:8090", changeOrigin: true },
        },
    },
});
