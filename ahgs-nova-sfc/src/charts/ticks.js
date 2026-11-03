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
    // 当 step 小于数值量级的浮点精度（ulp）时，v += step 不再前进（粘滞），
    // 原实现会无限 push 直至数组长度上限（RangeError: Invalid array length）。
    // 真实触发场景：收敛的 Run 各代适应度几乎相同，span 只差末位几个 ulp
    // （如 best=1.9096341560457413 / avg=1.909634156045741，span≈3.6e-16 < ulp(1.9)）。
    const ticks = [];
    const limit = hi + step * 0.5;
    for (let v = lo; v <= limit; v += step) {
        ticks.push(Number(v.toFixed(10)));
        if (!(v + step > v) || ticks.length > 64) break; // v 粘滞不再前进 / 兜底上限，保证终止
    }
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
