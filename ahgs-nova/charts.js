/* ============ 轻量 SVG 图表（无外部依赖） ============ */
"use strict";

const PALETTE = ["#22d3ee", "#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#60a5fa", "#fb7185", "#4ade80"];

function _niceTicks(min, max, count = 4) {
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
    return {
        ticks,
        lo,
        hi
    };
}

function _fmtTick(v) {
    const a = Math.abs(v);
    if (a >= 1e8) return (v / 1e8).toFixed(1) + "亿";
    if (a >= 1e4) return (v / 1e4).toFixed(1) + "万";
    if (a >= 1000) return (v / 1000).toFixed(1) + "k";
    if (a > 0 && a < 0.01) return v.toExponential(1);
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(a < 1 ? 3 : 1);
}

/**
 * 折线图：series = [{name, color, points:[{x,y,label}], dashed}]
 * x 为数值（自动按序）；返回 svg 字符串。
 */
function lineChartSVG(series, opts = {}) {
    const W = opts.width || 780,
        H = opts.height || 300;
    const pad = {
        l: 58,
        r: 18,
        t: 14,
        b: 34
    };
    const pts = series.flatMap(s => s.points.filter(p => isFinite(p.x) && isFinite(p.y)));
    if (!pts.length) return `<div class="empty"><div class="ico">📈</div>暂无可绘制的数据点</div>`;
    const xs = pts.map(p => p.x),
        ys = pts.map(p => p.y);
    const {
        ticks,
        lo,
        hi
    } = _niceTicks(Math.min(...ys), Math.max(...ys));
    let xlo = Math.min(...xs),
        xhi = Math.max(...xs);
    if (xlo === xhi) {
        xlo -= 1;
        xhi += 1;
    }
    const xpad = (xhi - xlo) * 0.02;
    xlo -= xpad;
    xhi += xpad;
    const X = x => pad.l + (x - xlo) / (xhi - xlo) * (W - pad.l - pad.r);
    const Y = y => pad.t + (hi - y) / (hi - lo) * (H - pad.t - pad.b);
    let g = "";
    for (const t of ticks) {
        const y = Y(t);
        g += `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="currentColor" stroke-opacity=".1" stroke-width="1"/>
          <text class="axis-text" x="${pad.l - 8}" y="${y + 3.5}" text-anchor="end">${_fmtTick(t)}</text>`;
    }
    const nx = Math.min(8, Math.max(2, Math.round((W - pad.l - pad.r) / 90)));
    for (let i = 0; i <= nx; i++) {
        const x = xlo + (xhi - xlo) * i / nx;
        g += `<text class="axis-text" x="${X(x)}" y="${H - 10}" text-anchor="middle">${opts.xFormat ? opts.xFormat(x) : _fmtTick(x)}</text>`;
    }
    if (opts.yLabel) g += `<text class="axis-text" transform="rotate(-90 14 ${H / 2})" x="14" y="${H / 2}" text-anchor="middle">${opts.yLabel}</text>`;
    for (const s of series) {
        const pv = s.points.filter(p => isFinite(p.x) && isFinite(p.y));
        if (!pv.length) continue;
        const d = pv.map((p, i) => (i ? "L" : "M") + X(p.x).toFixed(1) + " " + Y(p.y).toFixed(1)).join(" ");
        g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2" ${s.dashed ? 'stroke-dasharray="5 4"' : ""} stroke-linejoin="round" stroke-linecap="round" opacity=".95"/>`;
        for (const p of pv) {
            g += `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3" fill="${s.color}"><title>${esc(p.label ?? p.x)}：${_fmtTick(p.y)}</title></circle>`;
        }
    }
    return `<svg viewBox="0 0 ${W} ${H}" role="img" style="color:var(--text)">${g}</svg>`;
}

/** 竖向柱状图（活跃度等）：items=[{label, value, tip}] */
function barChartSVG(items, opts = {}) {
    const W = opts.width || 780,
        H = opts.height || 180;
    const pad = {
        l: 46,
        r: 12,
        t: 12,
        b: 26
    };
    const max = Math.max(1, ...items.map(i => i.value));
    const {
        ticks,
        hi
    } = _niceTicks(0, max, 3);
    const bw = (W - pad.l - pad.r) / Math.max(items.length, 1);
    let g = "";
    for (const t of ticks) {
        const y = pad.t + (hi - t) / hi * (H - pad.t - pad.b);
        g += `<line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="currentColor" stroke-opacity=".1"/>
          <text class="axis-text" x="${pad.l - 6}" y="${y + 3.5}" text-anchor="end">${_fmtTick(t)}</text>`;
    }
    items.forEach((it, i) => {
        const h = it.value / hi * (H - pad.t - pad.b);
        const x = pad.l + i * bw + bw * 0.14,
            w = bw * 0.72;
        const y = H - pad.b - h;
        const c = it.color || `url(#barg)`;
        g += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(h, it.value > 0 ? 1.5 : 0).toFixed(1)}" rx="2.5" fill="${c}" opacity="${it.value ? 0.92 : 0.15}">` +
            `<title>${esc(it.tip ?? it.label)}：${_fmtTick(it.value)}</title></rect>`;
        if (items.length <= 14 || i % Math.ceil(items.length / 12) === 0) {
            g += `<text class="axis-text" x="${(x + w / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(it.label)}</text>`;
        }
    });
    return `<svg viewBox="0 0 ${W} ${H}" style="color:var(--text)"><defs><linearGradient id="barg" x1="0" y1="1" x2="0" y2="0">` +
        `<stop offset="0" stop-color="#22d3ee" stop-opacity=".55"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs>${g}</svg>`;
}

/** 环形图：segments=[{label, value, color}] */
function donutSVG(segments) {
    const total = segments.reduce((s, x) => s + x.value, 0);
    if (!total) return `<div class="empty"><div class="ico">🧭</div>暂无数据</div>`;
    const R = 52,
        C = 2 * Math.PI * R;
    let off = 0,
        g = "";
    for (const seg of segments) {
        const frac = seg.value / total,
            len = frac * C;
        g += `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${seg.color}" stroke-width="17" ` +
            `stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 70 70)">` +
            `<title>${esc(seg.label)}：${seg.value}（${(frac * 100).toFixed(1)}%）</title></circle>`;
        off += len;
    }
    return `<div class="donut-flex"><svg viewBox="0 0 140 140" width="150" height="150">${g}` +
        `<text x="70" y="67" text-anchor="middle" style="fill:var(--text);font-weight:800;font-size:19px">${total}</text>` +
        `<text x="70" y="85" text-anchor="middle" class="axis-text">总计</text></svg>` +
        `<div class="legend" style="flex-direction:column;align-items:flex-start;gap:6px">` +
        segments.map(s => `<span><span class="dot" style="background:${s.color}"></span>${esc(s.label)} · ${s.value}（${(s.value / total * 100).toFixed(0)}%）</span>`).join("") +
        `</div></div>`;
}

/** 迷你走势线（用于列表内嵌） */
function sparklineSVG(values, color = "#22d3ee", w = 110, h = 30) {
    const pts = values.filter(v => isFinite(v));
    if (pts.length < 2) return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"></svg>`;
    const lo = Math.min(...pts),
        hi = Math.max(...pts);
    const X = i => 2 + i / (values.length - 1) * (w - 4);
    const Y = v => hi === lo ? h / 2 : 3 + (hi - v) / (hi - lo) * (h - 6);
    const d = values.map((v, i) => isFinite(v) ? ((i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)) : "").join(" ");
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
}

/** 排行榜条形视图：rows=[{rank,label,sub,value,fmt,color}] */
function hbarListHTML(rows, ascend) {
    if (!rows.length) return `<div class="empty"><div class="ico">🏁</div>暂无参赛记录</div>`;
    const vals = rows.map(r => r.value).filter(v => isFinite(v));
    const max = Math.max(...vals),
        min = Math.min(...vals);
    const span = max - min || 1;
    return `<div class="hbar-list">` + rows.map(r => {
        const rel = isFinite(r.value) ? 12 + (r.value - min) / span * 88 : 6;
        return `<div class="hbar-row" data-sid="${r.submissionId ?? ""}" data-uid="${r.userId ?? ""}">
      <span class="hbar-rank">${r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : "#" + r.rank}</span>
      <span class="hbar-who">${esc(r.label)}<small>${esc(r.sub || "")}</small></span>
      <span class="hbar-track"><span class="hbar-fill" style="width:${rel.toFixed(1)}%;background:${r.color || "var(--accent-grad)"}"></span></span>
      <span class="hbar-val mono">${r.fmt}</span>
    </div>`;
    }).join("") + `</div>`;
}
