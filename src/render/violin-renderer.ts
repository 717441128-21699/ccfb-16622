/**
 * Canvas 渲染：小提琴琴身、四根弦、弓、接触点与弦的赫姆霍兹拐角。
 * 物理状态（regime、接触点、弓速/弓压）驱动颜色与形变。
 */
import type { Regime, StringAnalysis, StringId } from '../types';

const REGIME_COLOR: Record<Regime, string> = {
  idle: '#8a8f99',
  good: '#4ade80',
  airy: '#7dd3fc',
  raucous: '#f87171',
  surface: '#fbbf24',
};

const STRING_COLORS = ['#d1d5db', '#e5e7eb', '#f3f4f6', '#fef3c7'];

export interface SceneState {
  activeString: StringId;
  analyses: StringAnalysis[];
  /** 弓在画面上的归一化横向位置 0..1 */
  bowX: number;
  /** 弓压 0..1（控制弓毛与弦的贴合/下压） */
  pressure: number;
  /** 接触门控 */
  contact: number;
  /** 离琴码位置 */
  beta: number;
  /** 弓速方向 1 下弓 / -1 上弓 / 0 静止 */
  bowDir: number;
}

export class ViolinRenderer {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D 不可用');
    this.ctx = ctx;
    this.resize();
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

  render(s: SceneState): void {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    this.drawBody(w, h);
    this.drawStrings(s, w, h);
    this.drawBow(s, w, h);
    this.drawRegimeBadge(s, w, h);
  }

  private drawBody(w: number, h: number): void {
    const ctx = this.ctx;
    const cx = w * 0.42;
    const cy = h * 0.55;
    // 琴身（简化的双圆弧）
    ctx.save();
    const grad = ctx.createLinearGradient(cx - 60, 0, cx + 60, 0);
    grad.addColorStop(0, '#7c4a21');
    grad.addColorStop(0.5, '#b07a45');
    grad.addColorStop(1, '#6b3e1c');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy + h * 0.12, w * 0.16, h * 0.24, 0, 0, Math.PI * 2);
    ctx.ellipse(cx, cy - h * 0.16, w * 0.13, h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // f 孔
    ctx.strokeStyle = 'rgba(30,15,5,0.6)';
    ctx.lineWidth = 2;
    for (const dx of [-w * 0.05, w * 0.05]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx, cy - h * 0.1);
      ctx.quadraticCurveTo(cx + dx * 1.4, cy, cx + dx, cy + h * 0.12);
      ctx.stroke();
    }
    // 琴码
    const bridgeX = cx + w * 0.12;
    ctx.fillStyle = '#e8dcc4';
    ctx.fillRect(bridgeX - 3, cy - h * 0.2, 6, h * 0.4);
    // 指板
    ctx.fillStyle = '#2a2018';
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.34, cy - h * 0.05);
    ctx.lineTo(cx + w * 0.1, cy - h * 0.12);
    ctx.lineTo(cx + w * 0.1, cy + h * 0.12);
    ctx.lineTo(cx - w * 0.34, cy + h * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawStrings(s: SceneState, w: number, h: number): void {
    const ctx = this.ctx;
    const cx = w * 0.42;
    const cy = h * 0.55;
    const bridgeX = cx + w * 0.12;
    const nutX = cx - w * 0.34;
    const spacing = h * 0.045;
    const active = s.activeString;

    for (let i = 0; i < 4; i++) {
      const y0 = cy + (i - 1.5) * spacing;
      const a = s.analyses[i];
      const isActive = i === active;
      const color = isActive ? REGIME_COLOR[a?.regime ?? 'idle'] : STRING_COLORS[i];
      ctx.strokeStyle = color;
      ctx.lineWidth = isActive ? 2.4 : 1.2;
      ctx.globalAlpha = isActive ? 1 : 0.5;
      ctx.beginPath();
      // 接触点位置（沿弦，β 决定在桥与指板间的位置）
      const contactX = bridgeX - s.beta * (bridgeX - nutX);
      const amp = isActive && a ? Math.min(14, Math.abs(a.stringDisplacement) * 4000) : 0;
      // 弦分两段画，接触点处画拐角（赫姆霍兹可视化）
      ctx.moveTo(nutX, y0);
      ctx.lineTo(contactX, y0 + amp);
      ctx.lineTo(bridgeX, y0);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private drawBow(s: SceneState, w: number, h: number): void {
    const ctx = this.ctx;
    const cy = h * 0.55;
    const cx = w * 0.42;
    const bridgeX = cx + w * 0.12;
    const nutX = cx - w * 0.34;
    const contactX = bridgeX - s.beta * (bridgeX - nutX);
    // 弓横向移动范围
    const bowCenterX = nutX + s.bowX * (bridgeX - nutX);
    const pressDip = s.pressure * h * 0.03 * s.contact;

    ctx.save();
    // 弓杆
    ctx.strokeStyle = '#caa472';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bowCenterX - w * 0.12, cy - h * 0.28);
    ctx.lineTo(bowCenterX + w * 0.12, cy - h * 0.28 + pressDip);
    ctx.stroke();
    // 弓毛
    ctx.strokeStyle = s.contact > 0.5 ? 'rgba(245,240,230,0.9)' : 'rgba(245,240,230,0.4)';
    ctx.lineWidth = 1.4;
    const hairY = cy - h * 0.24 + pressDip;
    ctx.beginPath();
    ctx.moveTo(bowCenterX - w * 0.12, hairY);
    ctx.lineTo(bowCenterX + w * 0.12, hairY);
    ctx.stroke();
    // 接触点高亮
    if (s.contact > 0.2) {
      const a = s.analyses[s.activeString];
      ctx.fillStyle = REGIME_COLOR[a?.regime ?? 'idle'];
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(contactX, cy + (s.activeString - 1.5) * h * 0.045, 5 + s.pressure * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // 弓向箭头
    if (Math.abs(s.bowDir) > 0.1) {
      ctx.fillStyle = '#94a3b8';
      const ax = bowCenterX + s.bowDir * w * 0.16;
      ctx.beginPath();
      ctx.moveTo(ax, hairY - 6);
      ctx.lineTo(ax + s.bowDir * 8, hairY);
      ctx.lineTo(ax, hairY + 6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawRegimeBadge(s: SceneState, w: number, h: number): void {
    const a = s.analyses[s.activeString];
    if (!a) return;
    const ctx = this.ctx;
    const label: Record<Regime, string> = {
      idle: '未触弦',
      good: '赫姆霍兹 · 好音',
      airy: '弓压不足 · 气声',
      raucous: '弓压过大 · 噪音',
      surface: '起音瞬态',
    };
    ctx.save();
    ctx.fillStyle = REGIME_COLOR[a.regime];
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillText(label[a.regime], 16, 26);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(
      `slip/帧 ${a.slipCount} · 弓力 ${a.bowForce.toFixed(2)}N · 窗口 ${a.fMin.toFixed(2)}~${a.fMax.toFixed(2)}N`,
      16,
      46,
    );
    ctx.restore();
  }
}
