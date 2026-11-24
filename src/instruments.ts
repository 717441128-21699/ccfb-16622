import type { BowModel, InstrumentConfig, StringParams, ViolinModel } from './types';
import { OPEN_STRINGS } from './types';

/**
 * 四根弦的波导参数（虚构标定值，定性符合真实小提琴）
 * impedance = sqrt(T·μ)：粗弦 μ 大 → Z 大，音色暗；
 * bridgeDamping 决定桥端反射损耗，粗弦截止低 → 高频少。
 */
export const BASE_STRINGS: StringParams[] = [
  {
    // G 弦：钢包银丝，最粗最暗，高频损耗最大
    baseFreq: OPEN_STRINGS[0],
    impedance: 0.55,
    length: 0.328,
    muStick: 0.82,
    muSlide: 0.3,
    vc: 0.09,
    gamma: 1.4,
    bridgeDamping: 2400,
    nutDamping: 4200,
    bridgeLoss: 0.996,
    nutLoss: 0.998,
    schellMinK: 0.20,
    schellMaxK: 0.55,
    noiseGain: 0.16,
  },
  {
    // D 弦
    baseFreq: OPEN_STRINGS[1],
    impedance: 0.42,
    length: 0.328,
    muStick: 0.8,
    muSlide: 0.28,
    vc: 0.08,
    gamma: 1.4,
    bridgeDamping: 3200,
    nutDamping: 5500,
    bridgeLoss: 0.9972,
    nutLoss: 0.9986,
    schellMinK: 0.18,
    schellMaxK: 0.6,
    noiseGain: 0.12,
  },
  {
    // A 弦
    baseFreq: OPEN_STRINGS[2],
    impedance: 0.32,
    length: 0.328,
    muStick: 0.78,
    muSlide: 0.26,
    vc: 0.07,
    gamma: 1.3,
    bridgeDamping: 7200,
    nutDamping: 11500,
    bridgeLoss: 0.9988,
    nutLoss: 0.9994,
    schellMinK: 0.16,
    schellMaxK: 0.68,
    noiseGain: 0.09,
  },
  {
    // E 弦：细钢弦，最亮最敏感，高频保留最多
    baseFreq: OPEN_STRINGS[3],
    impedance: 0.22,
    length: 0.325,
    muStick: 0.75,
    muSlide: 0.23,
    vc: 0.06,
    gamma: 1.2,
    bridgeDamping: 11000,
    nutDamping: 16000,
    bridgeLoss: 0.9994,
    nutLoss: 0.9997,
    schellMinK: 0.14,
    schellMaxK: 0.78,
    noiseGain: 0.07,
  },
];

/** 三把虚构的琴 */
export const VIOLINS: ViolinModel[] = [
  {
    id: 'studio-1742',
    name: '工坊 1742 型',
    description: '宽容度高的练习琴，Schelleng 窗口宽，适合初学者找手感',
    impedanceScale: 1.0,
    tolerance: 1.35,
    bridgeCutoff: 5200,
    outputGain: 1.0,
    bodyBiquads: [
      { freq: 280, q: 10, gain: 1.5 }, // 主共振 A0（空气腔）
      { freq: 460, q: 14, gain: 1.1 }, // 主木质共振
      { freq: 1350, q: 9, gain: 0.7 },
      { freq: 2400, q: 12, gain: 0.9 }, // 琴码共振峰

      { freq: 3800, q: 10, gain: 0.4 },
    ],
  },
  {
    id: 'cremona-mid',
    name: '克雷莫纳之声',
    description: '平衡的演奏琴，窗口适中，音色温暖通透',
    impedanceScale: 0.94,
    tolerance: 1.0,
    bridgeCutoff: 6200,
    outputGain: 1.08,
    bodyBiquads: [
      { freq: 272, q: 12, gain: 1.7 },
      { freq: 510, q: 16, gain: 1.25 },
      { freq: 1500, q: 10, gain: 0.85 },
      { freq: 2600, q: 14, gain: 1.05 },
      { freq: 4200, q: 9, gain: 0.5 },
    ],
  },
  {
    id: 'solo-black',
    name: '黑鸟独奏琴',
    description: '锋利的独奏琴，窗口窄、对控制要求高，换来了明亮的穿透力',
    impedanceScale: 0.88,
    tolerance: 0.72,
    bridgeCutoff: 7600,
    outputGain: 1.15,
    bodyBiquads: [
      { freq: 265, q: 14, gain: 1.9 },
      { freq: 560, q: 18, gain: 1.35 },
      { freq: 1700, q: 11, gain: 1.0 },
      { freq: 2900, q: 16, gain: 1.25 },
      { freq: 4800, q: 8, gain: 0.65 },
    ],
  },
];

/** 三把虚构的弓（松香/弓毛特性不同 → 摩擦曲线不同） */
export const BOWS: BowModel[] = [
  {
    id: 'student-horse',
    name: '练习马尾弓',
    description: '摩擦温和，粘住门槛低，好出声但极限音量小',
    muStick: 0.72,
    muSlide: 0.28,
    vc: 0.1,
    noiseGain: 1.0,
  },
  {
    id: 'golden-rosin',
    name: '金松香演奏弓',
    description: '粘-滑落差大，动态范围宽，控制力好时音色华丽',
    muStick: 0.85,
    muSlide: 0.24,
    vc: 0.07,
    noiseGain: 0.8,
  },
  {
    id: 'carbon-spicc',
    name: '碳素跳弓',
    description: '轻、弹，跳弓自然，摩擦曲线陡，离弦回弹快',
    muStick: 0.78,
    muSlide: 0.22,
    vc: 0.055,
    noiseGain: 0.6,
  },
];

/** RBJ peaking EQ 双二阶系数；linearGain 为峰值线性幅度（主线程预算后随配置传入 worklet） */
function peakingBiquad(freq: number, q: number, linearGain: number, sr: number): InstrumentConfig['bodyBiquads'][number] {
  const dB = 20 * Math.log10(Math.max(0.0001, linearGain));
  const A = 10 ** (dB / 40);
  const w0 = (2 * Math.PI * freq) / sr;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  const b0 = 1 + alpha * A;
  const b1 = -2 * cos;
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * cos;
  const a2 = 1 - alpha / A;
  // 并联共振组：每个节用较小的混频权重，避免直流堆积与削波
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0, g: 0.28 };
}

/** 组合琴 + 弓 → worklet 配置 */
export function buildInstrumentConfig(violin: ViolinModel, bow: BowModel, sampleRate: number): InstrumentConfig {
  return {
    strings: BASE_STRINGS.map((s) => ({
      ...s,
      impedance: s.impedance * violin.impedanceScale,
      muStick: bow.muStick,
      muSlide: bow.muSlide,
      vc: bow.vc,
      noiseGain: s.noiseGain * bow.noiseGain,
    })),
    bodyBiquads: violin.bodyBiquads.map((b) => peakingBiquad(b.freq, b.q, b.gain, sampleRate)),
    bridgeCutoff: violin.bridgeCutoff,
    outputGain: violin.outputGain,
    tolerance: violin.tolerance,
  };
}
