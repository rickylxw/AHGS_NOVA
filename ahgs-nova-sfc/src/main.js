import { createApp } from "vue";
import App from "./App.vue";
import { initRouter } from "./lib/router";
import "./styles/style.css";

initRouter();
createApp(App).mount("#app");
