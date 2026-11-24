/**
 * 起音延迟 + 四弦频谱差异验证
 */
import { BowStringEngine } from '../src/audio/string-physics.ts';
import { BASE_STRINGS } from '../src/instruments.ts';

const SR = 48000;

// 1) 起音延迟：从 gate 打开到 regime 进入 good 的毫秒数
console.log('===== 起音延迟（窗口几何中心弓力）=====');
for (let s = 0; s < 4; s++) {
  const p = BASE_STRINGS[s];
  const beta = s === 3 ? 0.14 : 0.18;
  const en = new BowStringEngine(p, p.baseFreq, SR);
  const w = en.schellengWindow(0.4, beta, 1);
  const force = Math.sqrt(w.fMin * w.fMax);
  let onsetMs = -1;
  const total = SR * 0.3;
  for (let n = 0; n < total; n++) {
    // 5ms 内触弦（模拟真实运弓接触）
    const gate = Math.min(1, n / (SR * 0.005));
    en.step(0.4, force * gate, gate, beta);
    if ((n + 1) % 1024 === 0) {
      const a = en.analyze({ pressure: force / 1.6, vBow: 0.4, beta, contact: 1, tolerance: 1, stringId: s });
      if (onsetMs < 0 && a.onsetMs >= 0) onsetMs = a.onsetMs;
    }
  }
  console.log(
    `${['G3', 'D4', 'A4', 'E5'][s]}: 窗口${w.fMin.toFixed(2)}..${w.fMax.toFixed(2)}N 取${force.toFixed(2)}N，首次 good 帧 @ ${onsetMs}ms`,
  );
}

// 2) 四弦频谱质心差异（音色明暗）
console.log('\n===== 四弦频谱质心（good 区稳态，应 G 暗 E 亮）=====');
for (let s = 0; s < 4; s++) {
  const p = BASE_STRINGS[s];
  const beta = s === 3 ? 0.14 : 0.18;
  const en = new BowStringEngine(p, p.baseFreq, SR);
  const w = en.schellengWindow(0.4, beta, 1);
  const force = Math.sqrt(w.fMin * w.fMax);
  const N = 4096;
  const sig: number[] = [];
  for (let n = 0; n < SR * 1.2; n++) {
    const gate = Math.min(1, n / (SR * 0.01));
    const r = en.step(0.4, force * gate, gate, beta);
    if (n >= SR * 0.8) sig.push(r.vBridge);
  }
  // 简单 DFT 质心（只算到 5kHz）
  const frame = sig.slice(0, N);
  let weighted = 0;
  let norm = 0;
  const maxBin = Math.floor((5000 * N) / SR);
  for (let k = 1; k < maxBin; k++) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < N; n++) {
      const ang = (2 * Math.PI * k * n) / N;
      re += frame[n] * Math.cos(ang);
      im -= frame[n] * Math.sin(ang);
    }
    const mag = Math.sqrt(re * re + im * im);
    const freq = (k * SR) / N;
    weighted += freq * mag;
    norm += mag;
  }
  console.log(
    `${['G3', 'D4', 'A4', 'E5'][s]} f0=${p.baseFreq}Hz 频谱质心=${(weighted / norm).toFixed(0)}Hz 桥截止=${p.bridgeDamping}Hz`,
  );
}
