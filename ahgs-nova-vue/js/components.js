/* ============ AHGS NOVA Vue 版 · 共享组件与全局动作 ============ */
"use strict";

/* ---------- 全局动作 ---------- */
function openSubmissionDrawer(id) {
    store.drawer = {
        comp: "sub-detail",
        props: {
            sid: String(id)
        }
    };
}

function openUserDrawer(uid) {
    store.drawer = {
        comp: "user-profile",
        props: {
            uid
        }
    };
}

function closeDrawer() {
    store.drawer = null;
}

/* ---------- 小组件 ---------- */
const FwBadge = {
    props: {
        ft: String
    },
    computed: {
        label() {
            return FW_LABEL[this.ft] || "AHG";
        },
        cls() {
            return this.ft === "custom" ? "fw-custom" : "fw-ahg";
        }
    },
    template: `<span class="badge" :class="cls">{{ label }}</span>`,
};
const SrcBadge = {
    props: {
        src: String
    },
    computed: {
        label() {
            return this.src === "local" ? "本地LLM" : "API";
        },
        cls() {
            return this.src === "local" ? "src-local" : "src-api";
        }
    },
    template: `<span class="badge" :class="cls">{{ label }}</span>`,
};
const Medal = {
    props: {
        rank: Number
    },
    computed: {
        emoji() {
            return ["🥇", "🥈", "🥉"][this.rank - 1] || "";
        }
    },
    template: `<span v-if="rank <= 3" class="medal" :class="'r' + rank">{{ emoji }}</span><span v-else class="rank-val mono">{{ rank }}</span>`,
};
const Avatar = {
    props: {
        user: Object,
        size: {
            type: Number,
            default: 30
        }
    },
    data() {
        return {
            imgErr: false
        };
    },
    computed: {
        initial() {
            return (fullName(this.user)[0] || "?").toUpperCase();
        },
        showImg() {
            return this.user && this.user.avatar && !this.imgErr;
        },
        st() {
            return {
                width: this.size + "px",
                height: this.size + "px",
                fontSize: Math.round(this.size * 0.44) + "px"
            };
        },
    },
    watch: {
        "user.avatar"() {
            this.imgErr = false;
        },
    },
    template: `<span class="avatar" :style="st"><img v-if="showImg" :src="user.avatar" alt="" referrerpolicy="no-referrer" @error="imgErr = true">{{ initial }}</span>`,
};
const UserCell = {
    components: {
        Avatar
    },
    props: {
        user: Object
    },
    methods: {
        open() {
            if (this.user && this.user.user_id != null) openUserDrawer(this.user.user_id);
        }
    },
    template: `<div class="user-cell">
    <span class="link-ish" @click.stop="open"><Avatar :user="user" /></span>
    <div class="u-name"><span class="u-main">{{ fullName(user) }}</span>
      <span v-if="user && user.display_name && user.username && user.display_name !== user.username" class="u-sub mono">{{ user.username }}</span></div>
  </div>`,
};
const EmptyState = {
    props: {
        icon: {
            type: String,
            default: "📭"
        },
        desc: String
    },
    template: `<div class="empty"><div class="ico">{{ icon }}</div>{{ desc }}</div>`,
};

/* ---------- 登录 / 注册弹窗 ---------- */
const LoginModal = {
    data: () => ({
        mode: "login",
        username: "",
        displayName: "",
        password: "",
        confirm: "",
        agree: true,
        err: "",
        busy: false
    }),
    methods: {
        async submit() {
            this.err = "";
            if (!this.username.trim() || !this.password) {
                this.err = "请填写一卡通号和密码";
                return;
            }
            if (!this.agree) {
                this.err = "请先阅读并同意《用户须知》";
                return;
            }
            if (this.mode === "register" && this.password !== this.confirm) {
                this.err = "两次输入的密码不一致";
                return;
            }
            this.busy = true;
            try {
                if (this.mode === "register") {
                    await api("/api/auth/register", {
                        method: "POST",
                        body: {
                            username: this.username.trim(),
                            display_name: this.displayName.trim(),
                            password: this.password,
                            confirm_password: this.confirm,
                            agree_terms: true
                        }
                    });
                }
                const r = await api("/api/auth/login", {
                    method: "POST",
                    body: {
                        username: this.username.trim(),
                        password: this.password,
                        agree_terms: true
                    }
                });
                setSession(r.access_token, r.user);
                store.loginModal = false;
                toast(`欢迎，${fullName(r.user || {})}`, "ok");
                store.viewVer = (store.viewVer || 0) + 1;
            } catch (e) {
                this.err = e.message;
            } finally {
                this.busy = false;
            }
        },
    },
    template: `
  <div class="modal-mask" @click.self="store.loginModal = false">
    <div class="modal">
      <h3>登录 AHGS 平台</h3>
      <div class="tabs">
        <button class="chip" :class="{ on: mode === 'login' }" @click="mode = 'login'">登录</button>
        <button class="chip" :class="{ on: mode === 'register' }" @click="mode = 'register'">注册</button>
      </div>
      <form @submit.prevent="submit">
        <div class="field"><label>一卡通号 / 用户名</label><input v-model="username" autocomplete="username"></div>
        <div class="field" v-if="mode === 'register'"><label>昵称（display_name）</label><input v-model="displayName" autocomplete="nickname"></div>
        <div class="field"><label>密码</label><input v-model="password" type="password" autocomplete="current-password"></div>
        <div class="field" v-if="mode === 'register'"><label>确认密码</label><input v-model="confirm" type="password" autocomplete="new-password"></div>
        <label class="check-row"><input type="checkbox" v-model="agree">我已阅读并同意平台《用户须知》</label>
        <div class="error-banner" v-if="err">{{ err }}</div>
        <button class="btn primary" style="width:100%" type="submit" :disabled="busy">{{ mode === 'register' ? '注册并登录' : '登录' }}</button>
      </form>
    </div>
  </div>`,
};

/* ---------- 抽屉：最优算法详情 ---------- */
const SubDetailDrawer = {
    props: {
        sid: String
    },
    data: () => ({
        d: null,
        err: ""
    }),
    computed: {
        features() {
            return (this.d?.features ?? []);
        }
    },
    async mounted() {
        try {
            this.d = await api(`/api/submissions/${this.sid}`);
        } catch (e) {
            this.err = e.status === 401 ? "此内容需要登录后查看" : ("加载失败：" + e.message);
        }
    },
    template: `
  <div>
    <div class="drawer-head"><h3>最优算法详情 <span class="mono hint">#{{ sid }}</span></h3>
      <button class="drawer-close" @click="closeDrawer()">×</button></div>
    <div v-if="!d && !err" class="loading-row"><span class="spinner"></span>加载中…</div>
    <div v-else-if="err" class="error-banner">
      {{ err.startsWith('加载失败') ? err : '🔐 ' + err }}
      <div v-if="!err.startsWith('加载失败')" style="margin-top:8px"><button class="btn primary" @click="store.loginModal = true">登录 / 注册</button></div>
    </div>
    <template v-else>
      <div class="user-cell" style="margin-bottom:12px">
        <span><Avatar :user="d" /></span>
        <div class="u-name"><span class="u-main">{{ fullName(d) }}</span>
          <span v-if="d.display_name && d.username && d.display_name !== d.username" class="u-sub mono">{{ d.username }}</span></div>
      </div>
      <div class="grid-2">
        <div class="kv"><span class="k">适应度</span><span class="mono">{{ fmtObj(d.objective) }}</span></div>
        <div class="kv"><span class="k">所耗 token</span><span class="mono">{{ fmtTokens(d.total_tokens) }}</span></div>
        <div class="kv"><span class="k">来源</span><SrcBadge :src="d.model_source" /></div>
        <div class="kv"><span class="k">框架</span><FwBadge :ft="d.framework_type" /></div>
      </div>
      <div class="field"><label>使用模型</label><div class="mono">{{ d.llm_model || "—" }}</div></div>
      <div class="field"><label>启发式思想</label><p class="drawer-text">{{ d.concept ?? "—" }}</p></div>
      <div class="field"><label>关键词组</label><div class="badge-row">
        <span v-for="f in features" :key="f" class="badge feature-badge">{{ f }}</span>
        <span v-if="!features.length" class="hint">无</span></div></div>
      <div class="field"><label>算法代码</label>
        <div class="code-container"><button class="btn small copy-btn" @click="copyText(d.algorithm ?? '')">复制</button>
        <pre>{{ d.algorithm ?? "" }}</pre></div></div>
      <button class="btn primary" style="width:100%;margin-top:8px" @click="navHash('curve', new URLSearchParams({ id: d.id ?? sid }))">📈 查看进化曲线分析</button>
    </template>
  </div>`,
};

/* ---------- 抽屉：用户档案 ---------- */
const UserProfileDrawer = {
    components: {
        Avatar,
        SrcBadge
    },
    props: {
        uid: [String, Number]
    },
    data: () => ({
        u: null,
        subs: [],
        err: ""
    }),
    computed: {
        byProblem() {
            const m = new Map();
            for (const s of this.subs) {
                if (!m.has(s.problem_key)) m.set(s.problem_key, []);
                m.get(s.problem_key).push(s);
            }
            return m;
        },
    },
    async mounted() {
        try {
            const [u, subs] = await Promise.all([
                api(`/api/users/${this.uid}`),
                api(`/api/users/${this.uid}/submissions`).then(r => r.submissions ?? []).catch(() => []),
            ]);
            this.u = u;
            this.subs = subs;
        } catch (e) {
            this.err = e.message;
        }
    },
    methods: {
        bestOf(list) {
            const objs = list.map(s => Number(s.objective)).filter(isFinite);
            if (!objs.length) return null;
            const key = this.u ? this.u.username : "";
            return null; // 由模板直接展示列表
        },
    },
    template: `
  <div>
    <div class="drawer-head"><h3>用户档案</h3><button class="drawer-close" @click="closeDrawer()">×</button></div>
    <div v-if="!u && !err" class="loading-row"><span class="spinner"></span>加载中…</div>
    <div v-else-if="err" class="error-banner">加载失败：{{ err }}</div>
    <template v-else>
      <div class="user-cell" style="margin-bottom:12px">
        <span><Avatar :user="u" /></span>
        <div class="u-name"><span class="u-main">{{ u.display_name || u.username }}</span><span class="u-sub mono">{{ u.username }}</span></div>
      </div>
      <div class="grid-2">
        <div class="kv"><span class="k">用户 ID</span><span class="mono">{{ u.id }}</span></div>
        <div class="kv"><span class="k">角色</span><span class="badge" :class="u.role === 'admin' ? 'src-api' : 'feature-badge'">{{ u.role === 'admin' ? 'ADMIN' : 'USER' }}</span></div>
        <div class="kv"><span class="k">提交总数</span><span class="mono">{{ subs.length }}</span></div>
        <div class="kv"><span class="k">参与赛道</span><span class="mono">{{ byProblem.size }}</span></div>
      </div>
      <template v-for="[key, list] in byProblem" :key="key">
        <div class="mine-head"><span class="mine-title">{{ (store.problems.find(p => p.key === key) || {}).name || key }}</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>ID</th><th class="num">适应度</th><th>模型</th><th class="num">token</th><th>时间</th></tr></thead>
          <tbody>
            <tr v-for="s in [...list].sort((a,b) => (parseServerTime(b.created_at)?.getTime() ?? 0) - (parseServerTime(a.created_at)?.getTime() ?? 0))"
                :key="s.id" class="clickable-row" @click="openSubmissionDrawer(s.id)">
              <td class="mono">{{ s.id }}</td>
              <td class="mono">{{ fmtObj(s.objective) }}</td>
              <td><SrcBadge :src="s.model_source" /> <span class="mono hint">{{ s.llm_model || "" }}</span></td>
              <td class="mono">{{ fmtTokens(s.total_tokens) }}</td>
              <td class="mono hint">{{ fmtTime(s.created_at) }}</td>
            </tr>
          </tbody>
        </table></div>
      </template>
      <div v-if="!byProblem.size" class="empty"><div class="ico">🗂️</div>该用户暂无公开提交</div>
    </template>
  </div>`,
};

const DRAWER_COMPS = {
    "sub-detail": SubDetailDrawer,
    "user-profile": UserProfileDrawer
};
