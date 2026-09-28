/* ============ Vue 版视图：我的空间（含用户中心） ============ */
"use strict";

const MineView = {
    components: {
        EmptyState,
        FwBadge,
        SrcBadge,
        Avatar
    },
    props: ["params"],
    template: `
  <div v-if="!getToken() || !store.user" class="card">
    <EmptyState icon="🔐" desc="登录后可查看自己在各赛道的名次与全部提交记录" />
    <div style="text-align:center"><button class="btn primary" @click="store.loginModal = true">登录 / 注册</button></div>
  </div>
  <div v-else class="card">
    <h2>我的空间 <span class="tail">{{ meta }}</span></h2>
    <div class="chip-row" style="margin-bottom:14px">
      <button class="chip" :class="{ on: tab === 'records' }" @click="tab = 'records'">名次与提交</button>
      <button class="chip" :class="{ on: tab === 'instances' }" @click="tab = 'instances'">实例与进化记录</button>
      <button class="chip" :class="{ on: tab === 'profile' }" @click="tab = 'profile'">个人资料</button>
    </div>

    <!-- 名次与提交 -->
    <div v-if="tab === 'records'">
      <div v-if="recordsLoading" class="loading-row"><span class="spinner"></span>加载中…</div>
      <template v-else>
        <div v-for="key in problemKeys" :key="key">
          <div class="mine-head">
            <span class="mine-title">{{ rankMap[key]?.problem_name || probName(key) }}</span>
            <span v-if="rankMap[key]" class="mine-rank">
              <template v-if="rankMap[key].rank <= 3">{{ ['🥇','🥈','🥉'][rankMap[key].rank - 1] }}</template>
              第 <b class="mono">{{ rankMap[key].rank }}</b> 名 · 最优 <b class="mono">{{ fmtObj(rankMap[key].best_objective) }}</b>
            </span>
            <span v-else class="hint">暂无名次</span>
            <span v-if="(subsByProblem[key] || []).length > 1" title="我的提交适应度走势（时间序）">
              <span v-html="spark(subsByProblem[key])"></span></span>
          </div>
          <div class="table-wrap"><table>
            <thead><tr><th>ID</th><th>框架</th><th>模型</th><th class="num">适应度</th><th class="num">token</th><th>提交时间</th><th></th></tr></thead>
            <tbody>
              <tr v-for="s in sortedSubs(key)" :key="s.id" class="clickable-row" @click="openSubmissionDrawer(s.id)">
                <td class="mono">{{ s.id }}</td>
                <td><FwBadge :ft="s.framework_type" /></td>
                <td><SrcBadge :src="s.model_source" /> <span class="mono hint">{{ s.llm_model || "" }}</span></td>
                <td class="num mono">{{ fmtObj(s.objective) }}</td>
                <td class="num mono">{{ fmtTokens(s.total_tokens) }}</td>
                <td class="mono hint">{{ fmtTime(s.created_at) }}</td>
                <td><button class="btn small" @click.stop="navHash('curve', new URLSearchParams({ id: s.id }))">曲线</button></td>
              </tr>
            </tbody>
          </table></div>
        </div>
        <EmptyState v-if="!problemKeys.length" icon="🗂️" desc="你还没有参赛记录，去「进化」发起一次吧" />
      </template>
    </div>

    <!-- 实例与进化记录 -->
    <div v-else-if="tab === 'instances'">
      <div class="loading-row" v-if="instLoading"><span class="spinner"></span>加载中…</div>
      <template v-else>
        <div class="mine-head"><span class="mine-title">实例保存</span><span class="hint">点击「载入」把实例配置带到进化页</span></div>
        <div v-if="!instances.length" class="hint">暂无保存的实例，可在进化页发起后保存。</div>
        <div v-else class="table-wrap"><table>
          <thead><tr><th>名称</th><th>框架类型</th><th>模型</th><th>问题</th><th>更新时间</th><th></th></tr></thead>
          <tbody>
            <tr v-for="i in instances" :key="i.id">
              <td><b>{{ i.name }}</b></td>
              <td><FwBadge :ft="i.framework_type" /></td>
              <td class="mono hint">{{ i.config?.llm_model ?? "—" }}</td>
              <td class="mono">{{ i.problem_key ?? "—" }}</td>
              <td class="mono hint">{{ i.updated_at ? fmtTime(i.updated_at) : "—" }}</td>
              <td><a class="btn small" href="#/evo">载入 →</a></td>
            </tr>
          </tbody>
        </table></div>
        <div class="mine-head"><span class="mine-title">AHG 进化记录</span></div>
        <div v-if="!runs.length" class="hint">暂无进化记录。</div>
        <div v-else class="table-wrap"><table>
          <thead><tr><th class="num">ID</th><th>问题</th><th>状态</th><th class="num">最优适应度</th><th></th></tr></thead>
          <tbody>
            <tr v-for="r in runs" :key="r.run_id">
              <td class="num mono">{{ r.run_id }}</td><td class="mono">{{ r.problem_key ?? "—" }}</td>
              <td><span class="badge" :class="'evo-st-' + r.status">{{ statusName(r.status) }}</span></td>
              <td class="num mono">{{ fmtObj(r.best_objective) }}</td>
              <td><a class="btn small" :href="'#/curve?run=' + r.run_id">监控 →</a></td>
            </tr>
          </tbody>
        </table></div>
      </template>
    </div>

    <!-- 个人资料 -->
    <div v-else>
      <div class="loading-row" v-if="profileLoading"><span class="spinner"></span>加载中…</div>
      <div v-else class="grid cols-2">
        <div>
          <div class="mine-head"><span class="mine-title">基本信息</span></div>
          <div class="user-cell" style="margin-bottom:12px">
            <span class="link-ish" title="点击更换头像" @click="$refs.avatarIn.click()"><Avatar :user="me" /></span>
            <div class="u-name"><span class="u-main">{{ me.display_name || me.username }}</span><span class="u-sub mono">{{ me.username }}</span></div>
            <span class="badge" :class="me.role === 'admin' ? 'src-api' : 'feature-badge'">{{ me.role === 'admin' ? 'ADMIN' : 'USER' }}</span>
          </div>
          <input type="file" ref="avatarIn" accept="image/*" style="display:none" @change="uploadAvatar">
          <div class="grid cols-2">
            <div class="field"><label>用户 ID</label><div class="mono" style="padding:6px 0">{{ me.id }}</div></div>
            <div class="field"><label>一卡通号</label><div class="mono" style="padding:6px 0">{{ me.username }}</div></div>
          </div>
          <div class="field"><label>昵称 display_name</label><input v-model="pf.displayName"></div>
          <div class="grid cols-2">
            <div class="field"><label>邮箱 email</label><input v-model="pf.email"></div>
            <div class="field"><label>电话 phone</label><input v-model="pf.phone"></div>
          </div>
          <div class="error-banner" v-if="pfMsg" :class="{ ok: pfOk }">{{ pfMsg }}</div>
          <button class="btn primary" :disabled="pfBusy" @click="saveProfile">保存资料</button>
        </div>
        <div>
          <div class="mine-head"><span class="mine-title">修改密码</span></div>
          <div class="field"><label>原密码</label><input type="password" v-model="pw.old" autocomplete="current-password"></div>
          <div class="field"><label>新密码</label><input type="password" v-model="pw.nw" autocomplete="new-password"></div>
          <div class="field"><label>确认新密码</label><input type="password" v-model="pw.cfm" autocomplete="new-password"></div>
          <div class="error-banner" v-if="pwMsg" :class="{ ok: pwOk }">{{ pwMsg }}</div>
          <button class="btn primary" :disabled="pwBusy" @click="savePassword">修改密码</button>
        </div>
      </div>
    </div>
  </div>`,
    props: ["params"],
    setup(props) {
        const tab = ref(["records", "instances", "profile"].includes(props.params.get("tab")) ? props.params.get("tab") : "records");
        const recordsLoading = ref(true),
            instLoading = ref(true),
            profileLoading = ref(true);
        const ranks = ref([]),
            mySubs = ref([]),
            instances = ref([]),
            runs = ref([]);
        const me = ref({});
        const pf = reactive({
            displayName: "",
            email: "",
            phone: ""
        });
        const pfMsg = ref(""),
            pfOk = ref(false),
            pfBusy = ref(false);
        const pw = reactive({
            old: "",
            nw: "",
            cfm: ""
        });
        const pwMsg = ref(""),
            pwOk = ref(false),
            pwBusy = ref(false);

        const rankMap = computed(() => new Map(ranks.value.map(e => [e.problem_key, e])));
        const subsByProblem = computed(() => {
            const m = {};
            for (const s of mySubs.value) {
                (m[s.problem_key] ??= []).push(s);
            }
            return m;
        });
        const problemKeys = computed(() => [...new Set([...rankMap.value.keys(), ...Object.keys(subsByProblem.value)])]);
        const meta = computed(() => `${fullName(store.user)} · 共 ${mySubs.value.length} 次提交 · ${problemKeys.value.length} 个赛道`);

        function sortedSubs(key) {
            return (subsByProblem.value[key] ?? []).slice().sort((a, b) => (parseServerTime(b.created_at)?.getTime() ?? 0) - (parseServerTime(a.created_at)?.getTime() ?? 0));
        }

        function probName(key) {
            return (store.problems.find(p => p.key === key) || {}).name || key;
        }

        function spark(subs) {
            const vals = subs.slice().sort((a, b) => (parseServerTime(a.created_at)?.getTime() ?? 0) - (parseServerTime(b.created_at)?.getTime() ?? 0)).map(s => Number(s.objective)).filter(isFinite);
            return sparklineSVG(vals);
        }
        onMounted(async () => {
            if (tab.value === "instances") loadInstances();
            else if (tab.value === "profile") loadProfile();
            else loadRecords();
        });
        watch(tab, t => {
            try {
                history.replaceState(null, "", "#/mine?tab=" + t);
            } catch {}
            if (t === "instances") loadInstances();
            else if (t === "profile") loadProfile();
        });
        watch(() => props.params.get("tab"), t => {
            if (t && ["records", "instances", "profile"].includes(t) && t !== tab.value) tab.value = t;
        });
        async function loadRecords() {
            recordsLoading.value = true;
            const [r1, r2] = await Promise.all([
                api("/api/ranking/me").then(r => r.entries ?? []).catch(() => []),
                api("/api/submissions/my").then(r => r.submissions ?? []).catch(() => []),
            ]);
            ranks.value = r1;
            mySubs.value = r2;
            recordsLoading.value = false;
        }
        async function loadInstances() {
            instLoading.value = true;
            const [i, r] = await Promise.all([
                api("/api/instances").then(r => r.instances ?? []).catch(() => []),
                api("/api/evolution/my").then(r => r.runs ?? []).catch(() => []),
            ]);
            instances.value = i;
            runs.value = r;
            instLoading.value = false;
        }
        async function loadProfile() {
            profileLoading.value = true;
            try {
                me.value = await api("/api/auth/me");
                setSession(null, me.value);
                pf.displayName = me.value.display_name ?? "";
                pf.email = me.value.email ?? "";
                pf.phone = me.value.phone ?? "";
            } catch (e) {
                me.value = getStoredUser() ?? {};
            }
            profileLoading.value = false;
        }
        async function uploadAvatar(ev) {
            const f = ev.target.files?.[0];
            ev.target.value = "";
            if (!f) return;
            if (!f.type.startsWith("image/")) {
                toast("请选择图片文件", "err");
                return;
            }
            const rd = new FileReader();
            rd.onload = async () => {
                try {
                    const u = await api("/api/auth/me", {
                        method: "PATCH",
                        body: {
                            avatar: rd.result
                        }
                    });
                    setSession(null, u);
                    toast("头像已更新", "ok");
                    loadProfile();
                } catch (e) {
                    toast("头像更新失败：" + e.message, "err");
                }
            };
            rd.readAsDataURL(f);
        }
        async function saveProfile() {
            pfMsg.value = "";
            pfBusy.value = true;
            try {
                const u = await api("/api/auth/me", {
                    method: "PATCH",
                    body: {
                        display_name: pf.displayName.trim(),
                        email: pf.email.trim(),
                        phone: pf.phone.trim()
                    }
                });
                setSession(null, u);
                pfOk.value = true;
                pfMsg.value = "已保存";
                toast("资料已保存", "ok");
            } catch (e) {
                pfOk.value = false;
                pfMsg.value = e.message;
            } finally {
                pfBusy.value = false;
            }
        }
        async function savePassword() {
            pwMsg.value = "";
            if (!pw.old || !pw.nw || !pw.cfm) {
                pwMsg.value = "请填写完整的密码信息";
                return;
            }
            if (pw.nw !== pw.cfm) {
                pwMsg.value = "两次输入的新密码不一致";
                return;
            }
            pwBusy.value = true;
            try {
                await api("/api/auth/me/password", {
                    method: "POST",
                    body: {
                        old_password: pw.old,
                        new_password: pw.nw,
                        confirm_password: pw.cfm
                    }
                });
                pwOk.value = true;
                pwMsg.value = "密码修改成功";
                pw.old = pw.nw = pw.cfm = "";
                toast("密码已修改", "ok");
            } catch (e) {
                pwOk.value = false;
                pwMsg.value = e.message;
            } finally {
                pwBusy.value = false;
            }
        }
        return {
            store,
            getToken,
            tab,
            recordsLoading,
            instLoading,
            profileLoading,
            rankMap,
            subsByProblem,
            problemKeys,
            meta,
            sortedSubs,
            probName,
            spark,
            instances,
            runs,
            me,
            pf,
            pfMsg,
            pfOk,
            pfBusy,
            pw,
            pwMsg,
            pwOk,
            pwBusy,
            saveProfile,
            savePassword,
            uploadAvatar,
            openSubmissionDrawer,
            navHash,
            statusName: s => STATUS_LABEL[s] ?? s ?? "—",
            fmtObj,
            fmtTokens,
            fmtTime,
            fullName
        };
    },
};
ROUTE_COMPS.mine = MineView;
