/**
 * BowStringWorklet —— 音频线程薄封装，物理求解全部来自 string-physics.ts
 *
 * 四个引擎（G/D/A/E 四弦）并行，每采样点求解；
 * 分析帧（1024 样本 ≈ 21ms）通过 port 上报发音状态。
 */
import type { InstrumentConfig, StringAnalysis } from '../types';
import { Biquad, BowStringEngine, FRAME, OnePoleLP } from './string-physics';

const SAMPLE_RATE = sampleRate;

class ViolinEngineProcessor extends AudioWorkletProcessor {
  private engines: BowStringEngine[] = [];
  private body: Biquad[] = [];
  private config: InstrumentConfig | null = null;
  private activeString = 2;
  private framePos = 0;
  // 输入一阶平滑，杜绝鼠标/触屏量化噪声
  private smooth = { p: [0, 0, 0, 0], vb: [0, 0, 0, 0], beta: [0.2, 0.2, 0.2, 0.2], gate: [0, 0, 0, 0] };
  private masterLP = new OnePoleLP(SAMPLE_RATE);

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      const msg = e.data as
        | { type: 'config'; config: InstrumentConfig }
        | { type: 'active'; string: number }
        | { type: 'reset' };
      if (msg.type === 'config') {
        this.applyConfig(msg.config);
      } else if (msg.type === 'active') {
        this.activeString = msg.string;
      } else if (msg.type === 'reset') {
        this.engines.forEach((en) => en.reset());
      }
    };
  }

  private applyConfig(cfg: InstrumentConfig): void {
    this.config = cfg;
    this.body = cfg.bodyBiquads.map((s) => new Biquad(s));
    this.masterLP.setCutoff(cfg.bridgeCutoff);
    if (this.engines.length === 0) {
      this.engines = cfg.strings.map((s) => new BowStringEngine(s, s.baseFreq, SAMPLE_RATE));
    } else {
      cfg.strings.forEach((s, i) => this.engines[i].setParams(s));
    }
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    if (!this.config || this.engines.length === 0) return true;
    const out = outputs[0];
    const left = out[0];
    const right = out[1] ?? left;
    const N = left.length;
    const cfg = this.config;

    for (let n = 0; n < N; n++) {
      let bridgeSum = 0;

      for (let i = 0; i < 4; i++) {
        const P = this.readParams(parameters, i, n);
        const en = this.engines[i];
        if (P.freq > 10) en.setF0(P.freq);
        // 弓毛法向力 = 压力输入(0..1) × 接触门控，映射到 0..1.6 N
        const bowForce = P.pressure * 1.6 * P.gate;
        const r = en.step(P.vb, bowForce, P.gate, P.beta);
        // 非活动弦保留极弱串音
        bridgeSum += r.vBridge * (i === this.activeString ? 1 : 0.06);
      }

      // 桥 → 琴身共振组（并联）→ 主低通 → 软限幅防削波
      let y = 0;
      for (const bq of this.body) y += bq.step(bridgeSum);
      y += this.masterLP.step(bridgeSum) * 0.35;
      const g = cfg.outputGain * 0.5;
      const sample = y * g;
      // tanh 软限幅，过载时平滑压缩而不产生硬削波
      const limited = Math.tanh(sample);
      left[n] = limited;
      right[n] = limited * 0.985;

      if (++this.framePos >= FRAME) {
        this.framePos = 0;
        const analyses: StringAnalysis[] = [];
        for (let i = 0; i < 4; i++) {
          const P = this.snapshot(i);
          analyses.push(
            this.engines[i].analyze({
              pressure: P.p,
              vBow: P.vb,
              beta: P.beta,
              contact: P.gate,
              tolerance: cfg.tolerance,
              stringId: i,
            }),
          );
        }
        this.port.postMessage({ type: 'analysis', analyses });
      }
    }
    return true;
  }

  private snapshot(i: number) {
    return {
      p: this.smooth.p[i],
      vb: this.smooth.vb[i],
      beta: this.smooth.beta[i],
      gate: this.smooth.gate[i],
    };
  }

  private readParams(
    parameters: Record<string, Float32Array>,
    i: number,
    n: number,
  ) {
    const get = (name: string) => {
      const arr = parameters[`${name}_${i}`];
      return arr.length === 1 ? arr[0] : arr[n];
    };
    const a = 0.12; // ≈2~3 个量子的时间常数
    this.smooth.p[i] += (get('pressure') - this.smooth.p[i]) * a;
    this.smooth.vb[i] += (get('bowSpeed') - this.smooth.vb[i]) * a;
    this.smooth.beta[i] += (get('beta') - this.smooth.beta[i]) * a;
    this.smooth.gate[i] += (get('contact') - this.smooth.gate[i]) * a;
    return {
      pressure: this.smooth.p[i],
      vb: this.smooth.vb[i],
      gate: this.smooth.gate[i],
      beta: this.smooth.beta[i],
      freq: get('freq'),
    };
  }

  static get parameterDescriptors() {
    const names = ['pressure', 'bowSpeed', 'beta', 'contact', 'freq'];
    const desc: { name: string; defaultValue: number; automationRate: AutomationRate }[] = [];
    for (let i = 0; i < 4; i++) {
      for (const nm of names) {
        desc.push({
          name: `${nm}_${i}`,
          defaultValue: nm === 'beta' ? 0.2 : 0,
          automationRate: 'a-rate',
        });
      }
    }
    return desc;
  }
}

registerProcessor('violin-engine', ViolinEngineProcessor);
