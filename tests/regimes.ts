/**
 * 三态验证：低压多滑（airy）、中压单拐角（good Helmholtz）、高压咬死（raucous）
 */
import { BowStringEngine } from '../src/audio/string-physics.ts';
import { BASE_STRINGS } from '../src/instruments.ts';

const SR = 48000;

function probe(stringIdx: number, force: number, beta: number, vBow = 0.4, seconds = 1.5) {
  const p = BASE_STRINGS[stringIdx];
  const en = new BowStringEngine(p, p.baseFreq, SR);
  const total = Math.floor(SR * seconds);
  let wasStick = false;
  let slips = 0;
  const intervals: number[] = [];
  let since = 0;
  let stickN = 0;
  let energy = 0;
  const vjTrace: number[] = [];
  const measuredStart = SR * 0.5;
  for (let n = 0; n < total; n++) {
    const gate = Math.min(1, n / (SR * 0.02));
    const r = en.step(vBow, force * gate, gate, beta);
    if (n >= measuredStart) {
      if (wasStick && !r.sticking) {
        slips++;
        intervals.push(since);
        since = 0;
      }
      since++;
      wasStick = r.sticking;
      if (r.sticking) stickN++;
      energy += r.vBridge * r.vBridge;
      vjTrace.push(r.vString);
    }
  }
  const measured = total - measuredStart;
  const periods = (p.baseFreq * measured) / SR;
  const mean = intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0;
  const cv = mean
    ? Math.sqrt(intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length) / mean
    : 1;
  const rms = Math.sqrt(energy / measured);
  const sp = slips / periods;
  let verdict: string;
  if (stickN / measured > 0.94 && sp < 0.7) verdict = 'R 咬死';
  else if (sp > 1.35) verdict = 'a 多滑气声';
  else if (sp >= 0.7 && sp <= 1.35 && cv < 0.22 && rms > 0.04) verdict = '✓ 赫姆霍兹';
  else verdict = '· 表面/瞬态';
  return {
    sp,
    cv,
    rms,
    stickRatio: stickN / measured,
    verdict,
    vjMin: Math.min(...vjTrace),
    vjMax: Math.max(...vjTrace),
    theoryBack: (-vBow * beta) / (1 - beta),
  };
}

for (let s = 0; s < 4; s++) {
  const p = BASE_STRINGS[s];
  console.log(`\n===== ${['G3', 'D4', 'A4', 'E5'][s]} (Z=${p.impedance}) β=0.18 v=0.4 =====`);
  for (const F of [0.02, 0.05, 0.1, 0.2, 0.4, 0.8, 1.5]) {
    const r = probe(s, F, s === 3 ? 0.14 : 0.18);
    console.log(
      `F=${F}  slip/周期=${r.sp.toFixed(2)} cv=${r.cv.toFixed(2)} rms=${r.rms.toFixed(3)} ` +
        `粘=${r.stickRatio.toFixed(2)} vJ[${r.vjMin.toFixed(2)},${r.vjMax.toFixed(2)}] 理论回滑=${r.theoryBack.toFixed(2)} ${r.verdict}`,
    );
  }
}
