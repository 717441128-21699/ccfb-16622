/**
 * 离线音频链验证：物理引擎 → 琴身双二阶共振组 → 软限幅，
 * 确认 good 区有足够输出、无 NaN、无硬削波，且四弦响度/频谱有别。
 */
import { BowStringEngine, Biquad, OnePoleLP } from '../src/audio/string-physics.ts';
import { BASE_STRINGS, buildInstrumentConfig, VIOLINS, BOWS } from '../src/instruments.ts';

const SR = 48000;

function renderString(stringIdx: number, force: number, beta: number) {
  const p = BASE_STRINGS[stringIdx];
  const en = new BowStringEngine(p, p.baseFreq, SR);
  const cfg = buildInstrumentConfig(VIOLINS[0], BOWS[0], SR);
  const body = cfg.bodyBiquads.map((s) => new Biquad(s));
  const master = new OnePoleLP(SR);
  master.setCutoff(cfg.bridgeCutoff);
  const N = Math.floor(SR * 1.5);
  let peak = 0;
  let sumSq = 0;
  let nan = 0;
  let clip = 0;
  const steadyStart = SR * 0.6;
  for (let n = 0; n < N; n++) {
    const gate = Math.min(1, n / (SR * 0.01));
    const r = en.step(0.4, force * gate, gate, beta);
    let y = 0;
    for (const bq of body) y += bq.step(r.vBridge);
    y += master.step(r.vBridge) * 0.35;
    const out = Math.tanh(y * cfg.outputGain * 0.5);
    if (Number.isNaN(out)) nan++;
    if (Math.abs(out) >= 0.999) clip++;
    if (n >= steadyStart) {
      peak = Math.max(peak, Math.abs(out));
      sumSq += out * out;
    }
  }
  const measured = N - steadyStart;
  return { peak, rms: Math.sqrt(sumSq / measured), nan, clip };
}

console.log('离线音频链（good 区窗口中心弓力）:');
for (let s = 0; s < 4; s++) {
  const beta = s === 3 ? 0.14 : 0.18;
  const en = new BowStringEngine(BASE_STRINGS[s], BASE_STRINGS[s].baseFreq, SR);
  const w = en.schellengWindow(0.4, beta, VIOLINS[0].tolerance);
  const force = Math.sqrt(w.fMin * w.fMax);
  const r = renderString(s, force, beta);
  console.log(
    `${['G3', 'D4', 'A4', 'E5'][s]}: 峰值=${r.peak.toFixed(3)} RMS=${r.rms.toFixed(4)} NaN=${r.nan} 硬削波样本=${r.clip} ${
      r.rms > 0.02 ? '✓ 可闻' : '✗ 过弱'
    }`,
  );
}

// 三态响度对比（good 应最饱满，airy 虚弱，raucous 粗糙但有能量）
console.log('\nA4 三态输出对比:');
const cases: [number, string][] = [
  [0.03, 'airy 低压'],
  [0.3, 'good 中压'],
  [1.2, 'raucous 高压'],
];
for (const [F, label] of cases) {
  const r = renderString(2, F, 0.18);
  console.log(`  ${label}: RMS=${r.rms.toFixed(4)} 峰值=${r.peak.toFixed(3)}`);
}
