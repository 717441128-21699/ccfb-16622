/**
 * 运弓练习页：自由运弓，实时看 regime、弓压/弓速/β，听三种发音状态。
 */
import { audioEngine } from '../audio/engine';
import { BowController } from '../input/bow-controller';
import { ViolinRenderer } from '../render/violin-renderer';
import { BOWS, VIOLINS } from '../instruments';
import type { StringAnalysis, StringId } from '../types';
import { OPEN_STRINGS } from '../types';

const STRING_NAMES = ['G 弦', 'D 弦', 'A 弦', 'E 弦'];

export class PracticePage {
  private root: HTMLElement;
  private renderer: ViolinRenderer | null = null;
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
      <div class="row">
        <div class="col" style="flex:2 1 480px">
          <div class="panel">
            <h2>琴与弓 · 弦</h2>
            <div class="row">
              <label class="field">琴
                <select id="violin-sel">${VIOLINS.map((v, i) => `<option value="${i}">${v.name}</option>`).join('')}</select>
              </label>
              <label class="field">弓
                <select id="bow-sel">${BOWS.map((b, i) => `<option value="${i}">${b.name}</option>`).join('')}</select>
              </label>
              <label class="field">练习弦
                <select id="string-sel">${STRING_NAMES.map((n, i) => `<option value="${i}" ${i === 2 ? 'selected' : ''}>${n}</option>`).join('')}</select>
              </label>
            </div>
            <p id="instr-desc" style="color:var(--muted);font-size:12px;margin:10px 0 0"></p>
          </div>
          <div class="panel">
            <h2>琴身与弓（Canvas 实时渲染）</h2>
            <canvas id="violin-canvas" style="height:300px"></canvas>
          </div>
        </div>
        <div class="col" style="flex:1 1 320px">
          <div class="panel">
            <h2>运弓控制板</h2>
            <div class="control-pad" id="bow-pad">
              <div class="hint">按住左右拖动 = 运弓（速度+方向）<br>上下位置 = 弓压（上轻下重）<br>滚轮 = 离琴码距离 β</div>
            </div>
            <label class="field" style="margin-top:12px">离琴码距离 β：<span id="beta-val">0.18</span>
              <input type="range" id="beta-range" min="0.05" max="0.45" step="0.01" value="0.18">
            </label>
            <div class="metric">
              <div class="card"><div class="k">发音状态</div><div class="v" id="m-regime">—</div></div>
              <div class="card"><div class="k">弓速</div><div class="v" id="m-speed">0.00</div></div>
              <div class="card"><div class="k">弓力</div><div class="v" id="m-force">0.00N</div></div>
              <div class="card"><div class="k">起音延迟</div><div class="v" id="m-onset">—</div></div>
            </div>
          </div>
          <div class="panel">
            <h2>练习提示</h2>
            <p style="color:var(--muted);font-size:13px;line-height:1.7;margin:0">
              目标是让状态保持在<span style="color:var(--good)">绿色「赫姆霍兹」</span>。<br>
              弓压太轻 → <span style="color:var(--airy)">蓝色气声</span>；压太重 → <span style="color:var(--raucous)">红色噪音</span>。<br>
              先在中弓位置找稳长音，再试着一弓内慢慢改变弓速，观察弓压窗口如何移动。
            </p>
          </div>
        </div>
      </div>`;

    const canvas = this.root.querySelector('#violin-canvas') as HTMLCanvasElement;
    this.renderer = new ViolinRenderer(canvas);
    const pad = this.root.querySelector('#bow-pad') as HTMLElement;
    this.controller = new BowController(pad);

    const violinSel = this.root.querySelector('#violin-sel') as HTMLSelectElement;
    const bowSel = this.root.querySelector('#bow-sel') as HTMLSelectElement;
    const stringSel = this.root.querySelector('#string-sel') as HTMLSelectElement;
    const betaRange = this.root.querySelector('#beta-range') as HTMLInputElement;
    const desc = this.root.querySelector('#instr-desc') as HTMLElement;
    desc.textContent = `${VIOLINS[0].description} ｜ ${BOWS[0].description}`;

    violinSel.addEventListener('change', () => {
      audioEngine.setInstrument(Number(violinSel.value), Number(bowSel.value));
      desc.textContent = `${VIOLINS[Number(violinSel.value)].description} ｜ ${BOWS[Number(bowSel.value)].description}`;
    });
    bowSel.addEventListener('change', () => {
      audioEngine.setInstrument(Number(violinSel.value), Number(bowSel.value));
      desc.textContent = `${VIOLINS[Number(violinSel.value)].description} ｜ ${BOWS[Number(bowSel.value)].description}`;
    });
    stringSel.addEventListener('change', () => {
      this.activeString = Number(stringSel.value) as StringId;
      audioEngine.setActiveString(this.activeString);
      audioEngine.setFrequency(this.activeString, OPEN_STRINGS[this.activeString]);
    });
    betaRange.addEventListener('input', () => {
      const beta = Number(betaRange.value);
      this.controller!.setBeta(beta);
      (this.root.querySelector('#beta-val') as HTMLElement).textContent = beta.toFixed(2);
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
    this.cleanupFns.push(
      audioEngine.onAnalysis((a) => {
        this.analyses = a;
      }),
    );

    window.addEventListener('resize', this.onResize);
    this.loop();
  }

  private onResize = (): void => this.renderer?.resize();

  private loop = (): void => {
    const s = this.controller!.getState();
    const analyses = this.analyses.length ? this.analyses : audioEngine.getLatest();
    this.renderer?.render({
      activeString: this.activeString,
      analyses,
      bowX: s.pointerX,
      pressure: s.pressure,
      contact: s.contact,
      beta: s.beta,
      bowDir: s.bowSpeed > 0.05 ? 1 : s.bowSpeed < -0.05 ? -1 : 0,
    });
    const a = analyses[this.activeString];
    if (a) {
      const regimeText: Record<string, string> = {
        idle: '未触弦',
        good: '好音 ✓',
        airy: '气声',
        raucous: '噪音',
        surface: '瞬态',
      };
      const el = this.root.querySelector('#m-regime') as HTMLElement;
      el.textContent = regimeText[a.regime] ?? '—';
      el.style.color =
        a.regime === 'good' ? 'var(--good)' : a.regime === 'airy' ? 'var(--airy)' : a.regime === 'raucous' ? 'var(--raucous)' : 'var(--text)';
      (this.root.querySelector('#m-speed') as HTMLElement).textContent = a.bowSpeed.toFixed(2);
      (this.root.querySelector('#m-force') as HTMLElement).textContent = `${a.bowForce.toFixed(2)}N`;
      (this.root.querySelector('#m-onset') as HTMLElement).textContent = a.onsetMs >= 0 ? `${a.onsetMs.toFixed(1)}ms` : '—';
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
