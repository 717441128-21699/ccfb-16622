// 主线程与 AudioWorklet 之间共享的类型定义与物理常量

/** 四根弦的编号 */
export type StringId = 0 | 1 | 2 | 3;

/** 发音状态：与物理模型实时识别的运动形态对应 */
export type Regime =
  | 'idle'      // 未接触，弦自由衰减
  | 'good'      // 赫姆霍兹运动：每个周期一个粘-滑拐角
  | 'airy'      // 弓压不足：一个周期内多次打滑，发虚的气声
  | 'raucous'   // 弓压过大：弦被粘住，锯齿运动崩溃，吱吱噪音
  | 'surface';  // 表面声/起音瞬态

/** Worklet 每帧（约 21ms）上报的分析数据 */
export interface StringAnalysis {
  /** 0..1 归一化弓压（玩家输入） */
  pressure: number;
  /** 弓速 m/s（带方向，负号为回弓） */
  bowSpeed: number;
  /** 离琴码距离 β，0..1（相对有效弦长） */
  beta: number;
  /** 当前接触门控 0..1（跳弓时周期性变化） */
  contact: number;
  /** 实时识别的发音状态 */
  regime: Regime;
  /** 本帧内的打滑（slip）次数，理想赫姆霍兹 = 每周期 1 次 */
  slipCount: number;
  /** 弦在弓接触点的横向速度（用于画振动拐角） */
  stringVelocity: number;
  /** 弦位移（用于 Canvas 画弦形） */
  stringDisplacement: number;
  /** 弦的基频 Hz */
  frequency: number;
  /** 实测 Schelleng 窗口下限（牛顿） */
  fMin: number;
  /** 实测 Schelleng 窗口上限（牛顿） */
  fMax: number;
  /** 实测弓毛作用力（牛顿） */
  bowForce: number;
  /** 本次触弦到首次赫姆霍兹起振的延迟（毫秒，-1 表示尚未起振） */
  onsetMs: number;
  /** 当前弦编号（换弦时变化） */
  stringId: StringId;
}

/** 主合成参数（通过消息在切换琴/弓时下发） */
export interface InstrumentConfig {
  /** 每弦：波阻抗、弦长、摩擦曲线参数、基频 */
  strings: StringParams[];
  /** 琴身共振：双二阶节系数组（频率/增益/Q → 系数在主线程算） */
  bodyBiquads: BiquadSpec[];
  /** 桥-弦耦合低通截止 */
  bridgeCutoff: number;
  /** 整体输出增益 */
  outputGain: number;
  /** Schelleng 窗口宽容度（来自琴模型），越大越好拉 */
  tolerance: number;
}

export interface StringParams {
  /** 空弦基频 Hz */
  baseFreq: number;
  /** 波阻抗 Z = sqrt(T·μ)，单位 N·s/m */
  impedance: number;
  /** 有效弦长 m */
  length: number;
  /** 摩擦曲线特征速度（区分粘/滑区） */
  muStick: number;
  muSlide: number;
  /** 摩擦转折速度 v_c（m/s，真实量级 0.03~0.06） */
  vc: number;
  /** 摩擦曲线陡度 γ（>1 粘区平台清晰） */
  gamma: number;
  /** 桥端反射低通截止（越大越亮，粗弦偏低） */
  bridgeDamping: number;
  /** 指板端反射低通截止 */
  nutDamping: number;
  /** 桥/琴枕速度波反射损耗系数（<1，决定弦的余韵长短） */
  bridgeLoss: number;
  nutLoss: number;
  /** Schelleng 窗口经验系数 */
  schellMinK: number;
  schellMaxK: number;
  /** 每弦噪声敏感度（粗弦打滑噪声更明显） */
  noiseGain: number;
}

export interface BiquadSpec {
  b0: number; b1: number; b2: number;
  a1: number; a2: number;
  /** 混频增益 */
  g: number;
}

/** 琴（虚构型号）定义 */
export interface ViolinModel {
  id: string;
  name: string;
  description: string;
  /** 在基准参数上的缩放 */
  impedanceScale: number;
  bodyBiquads: { freq: number; q: number; gain: number }[];
  bridgeCutoff: number;
  outputGain: number;
  /** Schelleng 窗口整体宽容度，越大越容易拉 */
  tolerance: number;
}

/** 弓（虚构型号）定义 */
export interface BowModel {
  id: string;
  name: string;
  description: string;
  muStick: number;
  muSlide: number;
  vc: number;
  noiseGain: number;
}

/** 曲目中的一个音符 */
export interface NoteEvent {
  /** 音名，如 G3 A4，空弦用 G3 D4 A4 E5 */
  pitch: string;
  /** 弦编号（指定在哪根弦上拉） */
  string: StringId;
  /** 时长（秒） */
  duration: number;
  /** 推荐弓法标记 */
  bowing?: 'down' | 'up' | 'spiccato';
  /** 推荐离琴码位置 0..1（指板侧→琴码侧） */
  betaHint?: number;
}

export interface Piece {
  id: string;
  title: string;
  composer: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  bpm: number;
  /** 每拍秒数由 bpm 推；音符 duration 直接给秒 */
  notes: NoteEvent[];
  description: string;
}

/** 单音评分 */
export interface NoteScore {
  pitch: string;
  /** 好音占比 0..1 */
  goodRatio: number;
  /** 虚（airy）占比 */
  airyRatio: number;
  /** 噪（raucous）占比 */
  raucousRatio: number;
  /** 弓速稳定度 0..1 */
  speedStability: number;
  /** 弓压窗口命中率 0..1 */
  pressureAccuracy: number;
  /** 起音响应（前 40ms 是否进入 good）0..1 */
  onsetScore: number;
  /** 综合分 0..100 */
  total: number;
}

export interface LevelResult {
  pieceId: string;
  pieceTitle: string;
  date: number;
  noteScores: NoteScore[];
  totalScore: number;
  maxCombo: number;
  /** 各 regime 累计占比 */
  regimeStats: Record<Regime, number>;
}

// ---------- 物理常量与工具 ----------

/** 四根空弦频率（标准定弦 G D A E） */
export const OPEN_STRINGS = [196.0, 293.66, 440.0, 659.25] as const;

/** 音名 → 半音偏移（相对 C0） */
const NOTE_SEMITONE: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

/** 音名（如 "A4"、"F#5"）→ 频率 Hz */
export function noteToFreq(note: string): number {
  const m = /^([A-G])(#?)(-?\d)$/.exec(note);
  if (!m) throw new Error(`无法解析音名: ${note}`);
  const [, letter, sharp, octaveStr] = m;
  const octave = parseInt(octaveStr, 10);
  const semitone = NOTE_SEMITONE[letter] + (sharp ? 1 : 0) + (octave + 1) * 12;
  // A4 = 57 半音 = 440Hz
  return 440 * Math.pow(2, (semitone - 57) / 12);
}

/** 频率 → 在指定弦上需要的按弦半音数（相对空弦） */
export function freqToFingerSemitone(freq: number, openFreq: number): number {
  return 12 * Math.log2(freq / openFreq);
}

export const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 一阶低通平滑系数 */
export const smoothCoeff = (timeConstantSec: number, sampleRate: number) =>
  1 - Math.exp(-1 / (timeConstantSec * sampleRate));
