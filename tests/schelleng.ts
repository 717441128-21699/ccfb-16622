/**
 * Schelleng 系数标定：在目标弓力网格上验证三态分布，
 * 要求每弦在典型 β 下：低压→airy、中间一段→good、高压→raucous。
 */
import { BowStringEngine } from '../src/audio/string-physics.ts';
import { BASE_STRINGS } from '../src/instruments.ts';

const SR = 48000;

function classify(stringIdx: number, force: number, beta: number, vBow = 0.4) {
  const p = BASE_STRINGS[stringIdx];
  const en = new BowStringEngine(p, p.baseFreq, SR);
  const total = Math.floor(SR * 1.2);
  const frames: string[] = [];
  for (let n = 0; n < total; n++) {
    const gate = Math.min(1, n / (SR * 0.02));
    en.step(vBow, force * gate, gate, beta);
    if ((n + 1) % 1024 === 0 && n > SR * 0.4) {
      frames.push(
        en
          .analyze({ pressure: force / 1.6, vBow, beta, contact: 1, tolerance: 1, stringId: stringIdx })
          .regime.slice(0, 4),
      );
    }
  }
  // 多数表决
  const count: Record<string, number> = {};
  for (const f of frames) count[f] = (count[f] ?? 0) + 1;
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
}

const NAMES = ['G3', 'D4', 'A4', 'E5'];
const forces = [0.03, 0.06, 0.12, 0.25, 0.5, 0.9, 1.4];

for (let s = 0; s < 4; s++) {
  const beta = s === 3 ? 0.14 : 0.18;
  const p = BASE_STRINGS[s];
  const win = new BowStringEngine(p, p.baseFreq, SR).schellengWindow(0.4, beta, 1);
  console.log(`\n===== ${NAMES[s]} β=${beta} 窗口预测 ${win.fMin.toFixed(2)}..${win.fMax.toFixed(2)}N =====`);
  let row = '力:   ' + forces.map((f) => f.toFixed(2).padStart(7)).join('');
  console.log(row);
  row = '状态: ';
  for (const f of forces) {
    const c = classify(s, f, beta);
    row += c.padStart(7);
  }
  console.log(row);
}

// β 扫描验证 Schelleng 拓扑（窗口应随 β 收窄/移动）
console.log('\n===== A4 窗口随 β 变化（Schelleng 拓扑）=====');
const en = new BowStringEngine(BASE_STRINGS[2], 440, SR);
for (const beta of [0.08, 0.12, 0.18, 0.26, 0.35, 0.44]) {
  const w = en.schellengWindow(0.4, beta, 1);
  console.log(`β=${beta}: fMin=${w.fMin.toFixed(3)} fMax=${w.fMax.toFixed(3)} 宽度=${(w.fMax - w.fMin).toFixed(3)}`);
}
