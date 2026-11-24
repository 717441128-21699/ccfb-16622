/**
 * 运弓输入控制器：把鼠标/触屏手势映射为物理引擎的四个输入。
 *
 * 控制约定（在控制区上）：
 *   左右拖动速度  → 弓速（带方向，负=上弓）
 *   上下位置      → 弓压（上轻下重，0..1）
 *   β 滑块/滚轮   → 离琴码距离
 *   按住/触摸     → 接触门控；快速点触即跳弓
 */
import { clamp } from '../types';

export interface RawBowState {
  pressure: number;
  bowSpeed: number; // m/s，带方向
  beta: number;
  contact: number; // 0..1
  /** 指针在控制区的归一化位置（供画面） */
  pointerX: number;
  pointerY: number;
  active: boolean;
}

export class BowController {
  private state: RawBowState = {
    pressure: 0,
    bowSpeed: 0,
    beta: 0.18,
    contact: 0,
    pointerX: 0.5,
    pointerY: 0.5,
    active: false,
  };
  private lastX = 0;
  private lastT = 0;
  private pointerDown = false;
  private betaOverride: number | null = null;
  private el: HTMLElement;
  private maxSpeed = 1.8; // m/s
  private listeners = new Set<(s: RawBowState) => void>();

  constructor(el: HTMLElement) {
    this.el = el;
    this.bind();
  }

  private bind(): void {
    this.el.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    this.el.addEventListener('wheel', this.onWheel, { passive: false });
    this.el.style.touchAction = 'none';
  }

  destroy(): void {
    this.el.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.el.removeEventListener('wheel', this.onWheel);
  }

  private onDown = (e: PointerEvent): void => {
    this.pointerDown = true;
    this.lastX = e.clientX;
    this.lastT = performance.now();
    const rect = this.el.getBoundingClientRect();
    this.state.pointerX = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    this.state.pointerY = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    // 触屏有压力数据时优先用，鼠标按下给一个中等压力基线（再由纵向位置调）
    const press = e.pressure && e.pressure > 0 && e.pressure !== 0.5 ? e.pressure : 0.55;
    this.state.pressure = press;
    this.state.contact = 1;
    this.state.active = true;
    this.el.setPointerCapture?.(e.pointerId);
    this.emit();
  };

  private onMove = (e: PointerEvent): void => {
    const rect = this.el.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    this.state.pointerX = x;
    this.state.pointerY = y;

    if (this.pointerDown) {
      const now = performance.now();
      const dt = Math.max(1, now - this.lastT) / 1000;
      // 像素位移 → 物理弓速（控制区宽度约对应 0.7m 有效弓段）
      const dxM = ((e.clientX - this.lastX) / rect.width) * 0.7;
      let speed = clamp(dxM / dt, -this.maxSpeed, this.maxSpeed);
      // 静止时弓速快速回零
      if (Math.abs(speed) < 0.01) speed = 0;
      this.state.bowSpeed = speed;
      this.lastX = e.clientX;
      this.lastT = now;

      // 纵向位置 → 弓压（上轻下重）。触屏压力作为微调乘子
      const yPressure = clamp(1 - y, 0.02, 1);
      const touchMod = e.pressure && e.pressure > 0 && e.pressure !== 0.5 ? 0.6 + e.pressure * 0.6 : 1;
      this.state.pressure = clamp(yPressure * touchMod, 0.02, 1);
      this.state.contact = 1;
      this.state.active = true;
    }
    this.emit();
  };

  private onUp = (): void => {
    this.pointerDown = false;
    // 离弦：接触与弓压衰减（由 worklet 平滑完成最终斜坡）
    this.state.contact = 0;
    this.state.pressure = 0;
    this.state.bowSpeed = 0;
    this.state.active = false;
    this.emit();
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.02 : -0.02;
    this.setBeta(clamp(this.state.beta + delta, 0.05, 0.45));
  };

  setBeta(beta: number): void {
    this.betaOverride = beta;
    this.state.beta = clamp(beta, 0.05, 0.45);
    this.emit();
  }

  /** 程序化设置（关卡引导/演示用） */
  setProgrammatic(s: Partial<RawBowState>): void {
    Object.assign(this.state, s);
    this.emit();
  }

  getState(): RawBowState {
    return { ...this.state };
  }

  onChange(fn: (s: RawBowState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn(this.getState()));
  }
}
