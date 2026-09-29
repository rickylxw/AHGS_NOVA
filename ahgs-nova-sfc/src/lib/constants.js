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

export const STATUS_LABEL = {
    pending: "排队中",
    running: "运行中",
    paused: "已暂停",
    completed: "已完成",
    stopped: "已停止",
    failed: "失败",
};

export const STATUS_ACTIVE = new Set(["pending", "running", "paused"]);
export const STATUS_DONE = new Set(["completed", "failed", "stopped"]);

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
