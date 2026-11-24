/**
 * 弓压弓速图页：Schelleng 窗口随 β 变化，实时叠加操作点轨迹。
 */
import { audioEngine } from '../audio/engine';
import { BowController } from '../input/bow-controller';
import { SchellengChart } from '../render/schelleng-chart';
import { buildInstrumentConfig, BOWS, VIOLINS } from '../instruments';
import type { StringAnalysis, StringId } from '../types';
import { OPEN_STRINGS } from '../types';

const STRING_NAMES = ['G 弦', 'D 弦', 'A 弦', 'E 弦'];

export class ChartPage {
  private root: HTMLElement;
  private chart: SchellengChart | null = null;
  private controller: BowController | null = null;
  private raf = 0;
  private analyses: StringAnalysis[] = [];
  private activeString: StringId = 2;
  private cleanupFns: (() => void)[] = [];

  constructor(private mount: HTMLElement) {
    this.root = document.createElement('div');
    mount.appendChild(this.root);
    this.build();
  }

  private build(): void {
    this.root.innerHTML = `
      <div class="panel">
        <h2>Schelleng 弓压窗口图</h2>
        <p style="color:var(--muted);font-size:13px;line-height:1.7;margin:0 0 12px">
          绿色区域是能产生单拐角赫姆霍兹运动的弓力范围。它随弓速线性展宽、随离琴码距离 β 收窄——
          这就是真实小提琴「弓速越快、越靠琴码，需要的弓压越大且窗口越窄」的规律。
          在控制板上运弓，你的实时操作点会画在图上。
        </p>
        <div class="row">
          <label class="field">弦
            <select id="ch-string">${STRING_NAMES.map((n, i) => `<option value="${i}" ${i === 2 ? 'selected' : ''}>${n}</option>`).join('')}</select>
          </label>
          <label class="field" style="flex:1">离琴码 β：<span id="ch-beta-val">0.18</span>
            <input type="range" id="ch-beta" min="0.05" max="0.45" step="0.01" value="0.18">
          </label>
        </div>
      </div>
      <div class="row">
        <div class="col" style="flex:2 1 480px">
          <div class="panel">
            <canvas id="schell-canvas" style="height:380px"></canvas>
          </div>
        </div>
        <div class="col" style="flex:1 1 300px">
          <div class="panel">
            <h2>运弓控制板</h2>
            <div class="control-pad" id="ch-pad">
              <div class="hint">按住拖动运弓<br>观察操作点落在哪个区域</div>
            </div>
            <div class="metric">
              <div class="card"><div class="k">当前弓力</div><div class="v" id="ch-force">0.00N</div></div>
              <div class="card"><div class="k">窗口下限</div><div class="v" id="ch-fmin">—</div></div>
              <div class="card"><div class="k">窗口上限</div><div class="v" id="ch-fmax">—</div></div>
              <div class="card"><div class="k">状态</div><div class="v" id="ch-regime">—</div></div>
            </div>
          </div>
        </div>
      </div>`;

    const canvas = this.root.querySelector('#schell-canvas') as HTMLCanvasElement;
    const cfg = buildInstrumentConfig(VIOLINS[0], BOWS[0], audioEngine.sampleRate);
    this.chart = new SchellengChart(canvas, cfg.strings[2], VIOLINS[0].tolerance);

    const pad = this.root.querySelector('#ch-pad') as HTMLElement;
    this.controller = new BowController(pad);
    this.controller.setBeta(0.18);

    const stringSel = this.root.querySelector('#ch-string') as HTMLSelectElement;
    const betaRange = this.root.querySelector('#ch-beta') as HTMLInputElement;
    stringSel.addEventListener('change', () => {
      this.activeString = Number(stringSel.value) as StringId;
      audioEngine.setActiveString(this.activeString);
      audioEngine.setFrequency(this.activeString, OPEN_STRINGS[this.activeString]);
      const c = audioEngine.instrumentConfig ?? cfg;
      this.chart!.setParams(c.strings[this.activeString], VIOLINS[0].tolerance);
    });
    betaRange.addEventListener('input', () => {
      const beta = Number(betaRange.value);
      this.controller!.setBeta(beta);
      (this.root.querySelector('#ch-beta-val') as HTMLElement).textContent = beta.toFixed(2);
    });

    this.cleanupFns.push(
      this.controller.onChange((s) => {
        audioEngine.setBowInput(this.activeString, {
          pressure: s.pressure,
          bowSpeed: s.bowSpeed,
          beta: s.beta,
          contact: s.contact,
        });
      }),
    );
    this.cleanupFns.push(audioEngine.onAnalysis((a) => (this.analyses = a)));
    window.addEventListener('resize', this.onResize);
    this.loop();
  }

  private onResize = (): void => this.chart?.resize();

  private loop = (): void => {
    const s = this.controller!.getState();
    const analyses = this.analyses.length ? this.analyses : audioEngine.getLatest();
    const a = analyses[this.activeString] ?? null;
    this.chart?.render(s.beta, a);
    if (a) {
      (this.root.querySelector('#ch-force') as HTMLElement).textContent = `${a.bowForce.toFixed(2)}N`;
      (this.root.querySelector('#ch-fmin') as HTMLElement).textContent = `${a.fMin.toFixed(2)}N`;
      (this.root.querySelector('#ch-fmax') as HTMLElement).textContent = `${a.fMax.toFixed(2)}N`;
      const map: Record<string, string> = { idle: '未触弦', good: '好音', airy: '气声', raucous: '噪音', surface: '瞬态' };
      const reg = this.root.querySelector('#ch-regime') as HTMLElement;
      reg.textContent = map[a.regime] ?? '—';
      reg.style.color =
        a.regime === 'good' ? 'var(--good)' : a.regime === 'airy' ? 'var(--airy)' : a.regime === 'raucous' ? 'var(--raucous)' : 'var(--text)';
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.cleanupFns.forEach((fn) => fn());
    this.controller?.destroy();
    this.root.remove();
  }
}
