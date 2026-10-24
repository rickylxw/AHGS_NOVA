/* ============ AHGS NOVA · 常量 ============ */

export const DEFAULT_API = "http://10.201.186.15:8090";

export const LS = {
    token: "ahgs_token",
    user: "ahgs_user",
    api: "nova_api_base",
    theme: "nova_theme",
    remember: "ahgs_remember",
};

export const FW_LABEL = {
    eoh_nseh: "EoH(NSEH)",
    calm: "CALM",
    custom: "自定义框架",
};

/** 官方 2026-10-23 起 Run 新增 queued（排队等待执行资源）状态，语义与 pending 相同，
 *  可经 DELETE /api/evolution/{id}/queue 取消排队 */
export const STATUS_LABEL = {
    queued: "排队中",
    pending: "排队中",
    running: "运行中",
    paused: "已暂停",
    completed: "已完成",
    stopped: "已停止",
    failed: "失败",
};

export const STATUS_ACTIVE = new Set(["queued", "pending", "running", "paused"]);
export const STATUS_DONE = new Set(["completed", "failed", "stopped"]);

/** 官方 2026-10 起失败的 Run 携带 error_category/error_summary/error_message 等原因字段 */
export const ERROR_CATEGORY = {
    restart: "服务重启中断",
    llm_auth: "模型认证失败",
    llm_network: "模型网络异常",
    llm_response: "模型输出异常",
    evaluation: "评估失败",
    framework: "框架执行异常",
    checkpoint: "检查点缺失",
    configuration: "配置或校验错误",
    resource: "资源不足",
    unknown: "未知错误",
};

export const CP_TASK_LABEL = {
    dataset_builder: "数据集构建脚本",
    evaluator: "评估器",
    example_heuristic: "示例启发式",
};

export const EVO_DEFAULTS = {
    population_size: 8,
    num_generations: 10,
    num_mutation: 3,
    num_hybridization: 3,
    num_reflection: 3,
    num_policy_updates: 1,
};

export const PALETTE = ["#22d3ee", "#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#60a5fa", "#fb7185", "#4ade80"];

/** 前端仓库地址（反馈入口 / 页脚链接） */
export const REPO_URL = "https://github.com/rickylxw/AHGS_NOVA";
