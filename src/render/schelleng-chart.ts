/**
 * 弓压-弓速 / Schelleng 图：
 *   横轴弓速，纵轴弓力，画出当前 β 下的好音窗口（fMin/fMax 边界），
 *   并实时叠加玩家的操作点。
 */
import type { StringAnalysis, StringParams } from '../types';

export class SchellengChart {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private trail: { v: number; f: number; regime: string }[] = [];

  constructor(private canvas: HTMLCanvasElement, private params: StringParams, private tolerance: number) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D 不可用');
    this.ctx = ctx;
    this.resize();
  }

  setParams(params: StringParams, tolerance: number): void {
    this.params = params;
    this.tolerance = tolerance;
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.floor(rect.width * this.dpr);
    this.canvas.height = Math.floor(rect.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private windowAt(v: number, beta: number): { fMin: number; fMax: number } {
    const Z = this.params.impedance;
    const dMu = Math.max(0.05, this.params.muStick - this.params.muSlide);
    const b = Math.min(0.48, Math.max(0.04, beta));
    const fMin = (this.params.schellMinK * Z * Z * v) / (b * (1 - b) * dMu) / this.tolerance;
    const fMax = (this.params.schellMaxK * Z * v * (1 - b)) / (b * dMu) * this.tolerance;
    return { fMin, fMax: Math.max(fMax, fMin * 1.2) };
  }

  render(beta: number, analysis: StringAnalysis | null): void {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    const pad = { l: 46, r: 14, t: 16, b: 34 };
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;
    const vMax = 1.6;
    const fMax = 1.6;

    const xOf = (v: number) => pad.l + (Math.abs(v) / vMax) * plotW;
    const yOf = (f: number) => pad.t + plotH - (f / fMax) * plotH;

    // 背景网格
    ctx.strokeStyle = 'rgba(148,163,184,0.18)';
    ctx.lineWidth = 1;
    ctx.font = '10px system-ui';
    ctx.fillStyle = '#94a3b8';
    for (let v = 0; v <= vMax; v += 0.4) {
      const x = xOf(v);
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, pad.t + plotH);
      ctx.stroke();
      ctx.fillText(`${v.toFixed(1)}`, x - 6, pad.t + plotH + 16);
    }
    for (let f = 0; f <= fMax; f += 0.4) {
      const y = yOf(f);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + plotW, y);
      ctx.stroke();
      ctx.fillText(`${f.toFixed(1)}N`, 6, y + 3);
    }

    // 好音窗口带（fMin..fMax 随 v 线性）
    ctx.beginPath();
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const v = (i / steps) * vMax;
      const win = this.windowAt(Math.max(0.02, v), beta);
      const x = xOf(v);
      const y = yOf(Math.min(fMax, win.fMin));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = steps; i >= 0; i--) {
      const v = (i / steps) * vMax;
      const win = this.windowAt(Math.max(0.02, v), beta);
      ctx.lineTo(xOf(v), yOf(Math.min(fMax, win.fMax)));
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(74,222,128,0.22)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(74,222,128,0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 区域标注
    ctx.fillStyle = 'rgba(125,211,252,0.9)';
    ctx.font = '11px system-ui';
    ctx.fillText('气声区（压不足）', pad.l + 8, pad.t + plotH - 8);
    ctx.fillStyle = 'rgba(248,113,113,0.9)';
    ctx.fillText('噪音区（压过大）', pad.l + plotW - 96, pad.t + 14);
    ctx.fillStyle = 'rgba(74,222,128,0.95)';
    ctx.fillText('赫姆霍兹好音区', pad.l + plotW * 0.4, pad.t + plotH * 0.5);

    // 轴标题
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px system-ui';
    ctx.fillText('弓速 m/s →', pad.l + plotW - 60, h - 8);
    ctx.save();
    ctx.translate(14, pad.t + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('弓力 N', -20, 0);
    ctx.restore();

    // 实时操作点 + 拖尾
    if (analysis && analysis.contact > 0.05) {
      this.trail.push({ v: Math.abs(analysis.bowSpeed), f: analysis.bowForce, regime: analysis.regime });
      if (this.trail.length > 60) this.trail.shift();
      const color: Record<string, string> = {
        good: '#4ade80',
        airy: '#7dd3fc',
        raucous: '#f87171',
        surface: '#fbbf24',
        idle: '#8a8f99',
      };
      this.trail.forEach((pt, i) => {
        ctx.globalAlpha = (i / this.trail.length) * 0.6;
        ctx.fillStyle = color[pt.regime] ?? '#fff';
        ctx.beginPath();
        ctx.arc(xOf(pt.v), yOf(Math.min(fMax, pt.f)), 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      // 当前点
      ctx.fillStyle = color[analysis.regime] ?? '#fff';
      ctx.beginPath();
      ctx.arc(xOf(Math.abs(analysis.bowSpeed)), yOf(Math.min(fMax, analysis.bowForce)), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      this.trail.length = 0;
    }
  }
}
