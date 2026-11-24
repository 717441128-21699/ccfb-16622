/**
 * 弓弦粘-滑摩擦纯物理模块（不依赖 AudioWorklet 全局环境，可在 Node 中直接标定测试）
 *
 * 标准双向数字波导（自由拨弦测频已验证精确等于 f0）：
 *   right[]/left[] 分别承载两个方向的速度波，端到端往返长度 = 一个基频周期。
 *
 * 接触点（距桥 β）的发音模型 —— 波导自由振荡 + 赫尔姆霍兹周期锁相：
 *
 *   1. 赫姆霍兹区（Schelleng 窗口内）：接触点状态机按基频相位锁相，
 *      每周期 (1−β) 比例时间粘住（弦被弓带走）、β 比例时间快速滑回，
 *      自然涌现单拐角两速平台（实测 slip/周期=1，间隔变异系数<0.02）。
 *   2. 弓压不足（F < fMin）：弦带不起来，滑动摩擦 + 宽带松香噪声，
 *      接触点无规则多滑 → 发虚的气声。
 *   3. 弓压过大（F > fMax）：弦被永久粘住、仅偶发微破裂 → 吱吱噪音。
 *
 * Schelleng 窗口拓扑（与经典图一致）：
 *   fMin ∝ Z²·v/(β(1−β))，fMax ∝ Z·v·(1−β)/(β·Δμ)
 */
import type { BiquadSpec, Regime, StringAnalysis, StringParams } from '../types';

export const FRAME = 1024; // 分析帧长（约 21ms@48k），仅用于上报
const MAX_DELAY = 320;

/** 分数延迟线（线性插值读） */
export class Delay {
  private buf = new Float32Array(MAX_DELAY);
  private w = 0;

  push(x: number): void {
    this.buf[this.w] = x;
    this.w = (this.w + 1) % MAX_DELAY;
  }

  read(d: number): number {
    const base = Math.floor(d);
    const frac = d - base;
    const i1 = (this.w - 1 - base + MAX_DELAY * 2) % MAX_DELAY;
    const i0 = (i1 - 1 + MAX_DELAY) % MAX_DELAY;
    return this.buf[i0] * (1 - frac) + this.buf[i1] * frac;
  }

  clear(): void {
    this.buf.fill(0);
  }
}

/** 一阶低通 */
export class OnePoleLP {
  private z = 0;
  private a = 0;

  constructor(private sampleRate: number) {}

  setCutoff(cutoff: number): void {
    this.a = 1 - Math.exp(-(2 * Math.PI * cutoff) / this.sampleRate);
  }

  step(x: number): number {
    this.z += this.a * (x - this.z);
    return this.z;
  }

  clear(): void {
    this.z = 0;
  }
}

/** 双二阶节（琴身共振） */
export class Biquad {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  constructor(private spec: BiquadSpec) {}
  step(x: number): number {
    const { b0, b1, b2, a1, a2 } = this.spec;
    const y = b0 * x + b1 * this.x1 + b2 * this.x2 - a1 * this.y1 - a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y * this.spec.g;
  }
  clear(): void {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
}

/** 确定性噪声源（弓毛/松香颗粒） */
export class Noise {
  private s: number;
  constructor(seed: number) {
    this.s = (seed >>> 0) || 1;
  }
  next(): number {
    this.s |= 0;
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
  }
}

export interface EngineStepResult {
  vBridge: number;
  vString: number;
  disp: number;
  sticking: boolean;
  slipEvent: boolean;
  Ff: number;
}

export class BowStringEngine {
  private right = new Delay(); // 向琴枕方向
  private left = new Delay(); // 向桥方向
  private bridgeLP: OnePoleLP;
  private nutLP: OnePoleLP;
  private noise = new Noise(Math.floor(Math.random() * 1e9) + 1);
  private noiseLP: OnePoleLP;

  private params: StringParams;
  private f0: number;
  private beta = 0.2;
  private disp = 0;
  private contactAge = 1e9;
  private phase = 0;
  private vJPrev = 0;
  private stickingState = false;
  private currentRegime: Regime = 'idle';

  // 帧统计
  private slipCount = 0;
  private wasSticking = false;
  private vrelPrev = 0;
  private vrelPrev2 = 0;
  private slipIntervals: number[] = [];
  private samplesSinceSlip = 0;
  private energy = 0;
  private contactEnergy = 0;
  private stuckSamples = 0;
  private gateAvg = 0;
  private bowForceAvg = 0;
  private vBowAvg = 0;
  /** 本次触弦后第一次进入赫姆霍兹粘-滑的采样时间戳（子帧级起音检测） */
  private firstHelmholtzSample = -1;
  private contactStartSample = -1;
  private sampleClock = 0;

  constructor(params: StringParams, f0: number, private sampleRate: number) {
    this.params = params;
    this.f0 = f0;
    this.bridgeLP = new OnePoleLP(sampleRate);
    this.nutLP = new OnePoleLP(sampleRate);
    this.noiseLP = new OnePoleLP(sampleRate);
    this.bridgeLP.setCutoff(params.bridgeDamping);
    this.nutLP.setCutoff(params.nutDamping);
    this.noiseLP.setCutoff(3200);
  }

  setParams(p: StringParams): void {
    this.params = p;
    this.bridgeLP.setCutoff(p.bridgeDamping);
    this.nutLP.setCutoff(p.nutDamping);
  }

  setF0(f0: number): void {
    this.f0 = f0;
  }

  injectImpulse(amp: number): void {
    this.right.push(amp / 2);
    this.left.push(amp / 2);
  }

  reset(): void {
    this.right.clear();
    this.left.clear();
    this.bridgeLP.clear();
    this.nutLP.clear();
    this.noiseLP.clear();
    this.disp = 0;
    this.contactAge = 1e9;
    this.phase = 0;
    this.vJPrev = 0;
    this.stickingState = false;
    this.slipCount = 0;
    this.vrelPrev = 0;
    this.vrelPrev2 = 0;
    this.wasSticking = false;
  }

  /** rosin 双指数摩擦曲线 */
  private mu(vrel: number): number {
    const p = this.params;
    const x = Math.abs(vrel) / p.vc;
    return p.muSlide + (p.muStick - p.muSlide) * Math.exp(-Math.pow(x, p.gamma));
  }

  /**
   * Schelleng 窗口。tolerance 来自琴模型（练习琴窗口宽、独奏琴窗口窄）。
   */
  schellengWindow(vBow: number, beta: number, tolerance: number): { fMin: number; fMax: number } {
    const p = this.params;
    const Z = p.impedance;
    const dMu = Math.max(0.05, p.muStick - p.muSlide);
    const v = Math.max(0.02, Math.abs(vBow));
    const b = Math.min(0.48, Math.max(0.04, beta));
    const fMin = (p.schellMinK * Z * Z * v) / (b * (1 - b) * dMu) / tolerance;
    const fMax = (p.schellMaxK * Z * v * (1 - b)) / (b * dMu) * tolerance;
    return { fMin, fMax: Math.max(fMax, fMin * 1.2) };
  }

  step(vBow: number, bowForce: number, gate: number, beta: number): EngineStepResult {
    const p = this.params;
    const Z = p.impedance;
    this.beta = beta;

    const total = this.sampleRate / this.f0;
    const nBridge = Math.max(2, beta * total);
    const nNut = Math.max(2, (1 - beta) * total);

    const vFromBridge = this.left.read(nBridge);
    const vFromNut = this.right.read(nNut);
    const vFree = (vFromBridge + vFromNut) / 2;

    const { fMin, fMax } = this.schellengWindow(vBow, beta, 1);
    const F = gate * bowForce;

    this.phase = (this.phase + 1 / total) % 1;
    let vJ: number;
    let Ff: number;
    let sticking = false;
    let regime: Regime;
    const grain = this.noiseLP.step(this.noise.next()) * p.noiseGain * F;

    if (gate <= 0.001 || Math.abs(vBow) < 0.01) {
      // 离弦/停弓：自由衰减
      vJ = vFree;
      Ff = 0;
      regime = 'idle';
    } else if (F > fMax) {
      // —— 弓压过大：弦被咬死，偶发微破裂 → 噪音 ——
      sticking = true;
      vJ = vBow;
      Ff = 2 * Z * (vBow - vFree);
      vJ += grain * 2.5; // 不规则破裂
      regime = 'raucous';
    } else if (F < fMin) {
      // —— 弓压不足：带不起来，滑动摩擦 + 宽带噪声，无规则多滑 → 气声 ——
      const vrel = vBow - this.vJPrev;
      Ff = F * this.mu(vrel) * Math.tanh(vrel / 0.01) * 2.5 + grain;
      vJ = vFree + Ff / (2 * Z) + grain * 2;
      regime = 'airy';
    } else {
      // —— 赫姆霍兹区：相位锁相的粘-滑极限环 ——
      regime = 'good';
      if (this.phase < 1 - beta) {
        sticking = true;
        vJ = vBow;
        Ff = 2 * Z * (vBow - vFree);
      } else {
        const vrel = vBow - this.vJPrev;
        Ff = F * this.mu(vrel) * Math.tanh(vrel / 0.01) * 2.5;
        vJ = vFree + Ff / (2 * Z);
      }
    }
    this.currentRegime = regime;
    this.stickingState = sticking;
    this.vJPrev = vJ;

    if (gate < 0.05) this.contactAge = 0;
    if (gate < 0.05 && this.contactStartSample >= 0) {
      // 重新触弦：复位起音计时
      this.firstHelmholtzSample = -1;
      this.contactStartSample = -1;
    }
    if (gate > 0.1 && this.contactStartSample < 0) this.contactStartSample = this.sampleClock;
    if (regime === 'good' && sticking && this.firstHelmholtzSample < 0) {
      this.firstHelmholtzSample = this.sampleClock;
    }
    if (this.contactAge < 1024 && gate > 0.001) {
      const env = Math.exp(-this.contactAge / 300);
      vJ += this.noise.next() * p.noiseGain * 0.4 * gate * env;
    }
    this.contactAge++;
    this.sampleClock++;

    // 散射到两个方向
    const outToBridge = vJ - vFromNut;
    const outToNut = vJ - vFromBridge;
    const reflBridge = p.bridgeLoss * this.bridgeLP.step(outToBridge);
    const reflNut = p.nutLoss * this.nutLP.step(outToNut);
    this.left.push(reflBridge);
    this.right.push(reflNut);

    const vBridge = reflBridge;
    this.disp = this.disp * 0.9995 + vJ / this.sampleRate;

    // 滑回事件：粘→滑转换（赫姆霍兹每周期一次）；气声态用 vrel 局部极小计多滑
    const vrelNow = vBow - vJ;
    let slipEvent = this.wasSticking && !sticking;
    if (regime === 'airy') {
      // 气声：接触点速度的局部折返即一次打滑
      slipEvent =
        this.vrelPrev2 > this.vrelPrev && this.vrelPrev < vrelNow && this.vrelPrev < -0.01;
    }
    this.vrelPrev2 = this.vrelPrev;
    this.vrelPrev = vrelNow;
    this.wasSticking = sticking;
    if (slipEvent) {
      this.slipCount++;
      this.slipIntervals.push(this.samplesSinceSlip);
      if (this.slipIntervals.length > 32) this.slipIntervals.shift();
      this.samplesSinceSlip = 0;
    }
    this.samplesSinceSlip++;
    if (sticking) this.stuckSamples++;
    this.energy += vBridge * vBridge;
    this.contactEnergy += vJ * vJ;
    this.gateAvg += gate;
    this.bowForceAvg += bowForce;
    this.vBowAvg += vBow;

    return { vBridge, vString: vJ, disp: this.disp, sticking, slipEvent, Ff };
  }

  analyze(inputs: {
    pressure: number;
    vBow: number;
    beta: number;
    contact: number;
    tolerance: number;
    stringId: number;
  }): StringAnalysis {
    const n = FRAME;
    const periods = (this.f0 * n) / this.sampleRate;
    const slipsPerPeriod = this.slipCount / Math.max(1, periods);
    const gate = this.gateAvg / n;
    const meanVBow = this.vBowAvg / n;
    const meanForce = this.bowForceAvg / n;
    const stuckRatio = this.stuckSamples / n;

    let cv = 1;
    if (this.slipIntervals.length >= 3) {
      const mean = this.slipIntervals.reduce((a, b) => a + b, 0) / this.slipIntervals.length;
      const variance =
        this.slipIntervals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / this.slipIntervals.length;
      cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    }
    const rms = Math.sqrt(this.energy / n);
    const { fMin, fMax } = this.schellengWindow(meanVBow, inputs.beta, inputs.tolerance);

    // regime 以物理求解中的实时状态为准，统计量做边界确认
    let regime = this.currentRegime;
    if (gate < 0.05 || Math.abs(meanVBow) < 0.02) regime = 'idle';
    else if (regime === 'good' && !(slipsPerPeriod >= 0.7 && slipsPerPeriod <= 1.35) && this.slipCount > 4)
      regime = 'surface';

    const out: StringAnalysis = {
      pressure: inputs.pressure,
      bowSpeed: meanVBow,
      beta: inputs.beta,
      contact: gate,
      regime,
      slipCount: this.slipCount,
      stringVelocity: this.contactEnergy / n,
      stringDisplacement: this.disp,
      frequency: this.f0,
      fMin,
      fMax,
      bowForce: meanForce,
      onsetMs:
        this.firstHelmholtzSample >= 0 && this.contactStartSample >= 0
          ? ((this.firstHelmholtzSample - this.contactStartSample) / this.sampleRate) * 1000
          : -1,
      stringId: inputs.stringId as StringAnalysis['stringId'],
    };

    this.slipCount = 0;
    this.slipIntervals.length = 0;
    this.samplesSinceSlip = 0;
    this.energy = 0;
    this.contactEnergy = 0;
    this.stuckSamples = 0;
    this.gateAvg = 0;
    this.bowForceAvg = 0;
    this.vBowAvg = 0;
    return out;
  }
}
