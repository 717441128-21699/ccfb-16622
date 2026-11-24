/**
 * 主线程音频引擎：加载 AudioWorklet，管理四弦参数与分析回调。
 * 物理求解全部在 worklet 线程，这里只做参数下发和状态接收。
 */
import workletUrl from './bow-worklet.ts?worklet-url';
import { buildInstrumentConfig, BOWS, VIOLINS } from '../instruments';
import type { InstrumentConfig, StringAnalysis, StringId } from '../types';
import { noteToFreq } from '../types';

export interface BowInput {
  /** 弓压 0..1 */
  pressure: number;
  /** 弓速 m/s（带方向） */
  bowSpeed: number;
  /** 离琴码距离 0..1 */
  beta: number;
  /** 接触门控 0..1（跳弓用） */
  contact: number;
}

export class ViolinAudioEngine {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private config: InstrumentConfig | null = null;
  private violinIdx = 0;
  private bowIdx = 0;
  private activeString: StringId = 2;
  private freqParams: AudioParam[] = [];
  private analysisListeners = new Set<(a: StringAnalysis[]) => void>();
  private latest: StringAnalysis[] = [];

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 48000;
  }

  get isRunning(): boolean {
    return this.node !== null && this.ctx?.state === 'running';
  }

  async init(): Promise<void> {
    if (this.node) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    await this.ctx.audioWorklet.addModule(workletUrl);
    this.config = buildInstrumentConfig(VIOLINS[this.violinIdx], BOWS[this.bowIdx], this.ctx.sampleRate);
    this.node = new AudioWorkletNode(this.ctx, 'violin-engine', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    // 零输入的 source 型 worklet 在部分浏览器不会被音频图拉取，
    // 接一个静音 ConstantSource 保证 process() 每量子都被调度（物理全靠参数驱动）。
    const keeper = new ConstantSourceNode(this.ctx);
    keeper.offset.value = 0;
    keeper.connect(this.node);
    keeper.start();
    this.node.connect(this.ctx.destination);
    this.node.port.postMessage({ type: 'config', config: this.config });
    this.node.port.onmessage = (e: MessageEvent<{ type: string; analyses: StringAnalysis[] }>) => {
      if (e.data.type === 'analysis') {
        this.latest = e.data.analyses;
        this.analysisListeners.forEach((fn) => fn(e.data.analyses));
      }
    };
    this.node.onprocessorerror = (err: Event) => {
      const e = err as ErrorEvent;
      console.error('AudioWorklet 处理器错误', e.message, e.filename, e.lineno, e.error);
    };
    // 缓存 20 个 AudioParam 引用
    this.freqParams = [0, 1, 2, 3].map((i) => this.node!.parameters.get(`freq_${i}`)!);
    // 初始频率 = 空弦
    [0, 1, 2, 3].forEach((i) => this.freqParams[i].value = this.config!.strings[i].baseFreq);
  }

  async resume(): Promise<void> {
    await this.init();
    if (this.ctx!.state !== 'running') await this.ctx!.resume();
  }

  setInstrument(violinIdx: number, bowIdx: number): void {
    this.violinIdx = violinIdx;
    this.bowIdx = bowIdx;
    if (!this.ctx) return;
    this.config = buildInstrumentConfig(VIOLINS[violinIdx], BOWS[bowIdx], this.ctx.sampleRate);
    this.node?.port.postMessage({ type: 'config', config: this.config });
  }

  setActiveString(s: StringId): void {
    this.activeString = s;
    this.node?.port.postMessage({ type: 'active', string: s });
  }

  /** 设置某弦当前演奏频率（按音），空弦传 baseFreq */
  setFrequency(string: StringId, freq: number): void {
    if (this.node) this.freqParams[string].setTargetAtTime(freq, this.ctx!.currentTime, 0.005);
  }

  /** 每帧下发某弦的运弓输入 */
  setBowInput(string: StringId, input: BowInput): void {
    if (!this.node || !this.ctx) return;
    const t = this.ctx.currentTime;
    const p = this.node.parameters;
    p.get(`pressure_${string}`)!.setTargetAtTime(input.pressure, t, 0.008);
    p.get(`bowSpeed_${string}`)!.setTargetAtTime(input.bowSpeed, t, 0.008);
    p.get(`beta_${string}`)!.setTargetAtTime(input.beta, t, 0.012);
    p.get(`contact_${string}`)!.setTargetAtTime(input.contact, t, 0.006);
  }

  /** 非活动弦静默（压力/接触/弓速清零） */
  silenceString(string: StringId): void {
    this.setBowInput(string, { pressure: 0, bowSpeed: 0, beta: 0.2, contact: 0 });
  }

  onAnalysis(fn: (a: StringAnalysis[]) => void): () => void {
    this.analysisListeners.add(fn);
    return () => this.analysisListeners.delete(fn);
  }

  getLatest(): StringAnalysis[] {
    return this.latest;
  }

  getActiveAnalysis(): StringAnalysis | null {
    return this.latest[this.activeString] ?? null;
  }

  get instrumentConfig(): InstrumentConfig | null {
    return this.config;
  }
}

/** 单例 */
export const audioEngine = new ViolinAudioEngine();

// 调试/冒烟测试入口（生产环境无副作用）
if (typeof window !== 'undefined') {
  (window as unknown as { __audioEngine?: ViolinAudioEngine }).__audioEngine = audioEngine;
}

/** 便捷：按音名+弦号设置频率 */
export function playPitch(engine: ViolinAudioEngine, string: StringId, pitch: string): void {
  engine.setFrequency(string, noteToFreq(pitch));
}
