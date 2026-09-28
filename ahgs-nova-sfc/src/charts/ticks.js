/* ============ AHGS NOVA · 图表坐标计算 ============ */

export function niceTicks(min, max, count = 4) {
    if (!isFinite(min) || !isFinite(max)) {
        min = 0;
        max = 1;
    }
    if (min === max) {
        const d = Math.abs(min) * 0.1 || 0.5;
        min -= d;
        max += d;
    }
    const span = max - min;
    const step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag;
    const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step * 0.5; v += step) ticks.push(Number(v.toFixed(10)));
    return { ticks, lo, hi };
}

export function fmtTick(v) {
    const a = Math.abs(v);
    if (a >= 1e8) return (v / 1e8).toFixed(1) + "亿";
    if (a >= 1e4) return (v / 1e4).toFixed(1) + "万";
    if (a >= 1000) return (v / 1000).toFixed(1) + "k";
    if (a > 0 && a < 0.01) return v.toExponential(1);
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(a < 1 ? 3 : 1);
}
