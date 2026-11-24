/**
 * 曲目关卡页：选曲 → 跟拉 → 实时状态与音符进度 → 提交成绩。
 */
import { audioEngine } from '../audio/engine';
import { BowController } from '../input/bow-controller';
import { ViolinRenderer } from '../render/violin-renderer';
import { PIECES } from '../pieces';
import { PiecePlayer } from '../game/piece-player';
import type { LevelResult, StringAnalysis, StringId } from '../types';

export class LevelPage {
  private root: HTMLElement;
  private renderer: ViolinRenderer | null = null;
  private controller: BowController | null = null;
  private player: PiecePlayer | null = null;
  private raf = 0;
  private analyses: StringAnalysis[] = [];
  private activeString: StringId = 2;
  private cleanupFns: (() => void)[] = [];
  private onResult: (r: LevelResult) => void;

  constructor(mount: HTMLElement, onResult: (r: LevelResult) => void) {
    this.onResult = onResult;
    this.root = document.createElement('div');
    mount.appendChild(this.root);
    this.buildList();
  }

  private buildList(): void {
    this.root.innerHTML = `
      <div class="panel">
        <h2>曲目关卡</h2>
        <p style="color:var(--muted);font-size:13px;margin:0 0 14px">
          每首都针对右手控制设计。开始后按音符序列运弓，琴会提示当前弦、推荐 β 与弓法；你的发音质量实时决定分数。
        </p>
        <div class="row">
          ${PIECES.map(
            (p, i) => `
            <div class="col" style="flex:1 1 300px">
              <div class="piece-card" data-idx="${i}">
                <h3>${p.title}</h3>
                <div class="meta">${p.composer} ｜ ♩=${p.bpm} ｜ <span class="diff-dots">${'●'.repeat(p.difficulty)}${'○'.repeat(5 - p.difficulty)}</span></div>
                <p>${p.description}</p>
              </div>
            </div>`,
          ).join('')}
        </div>
      </div>`;
    this.root.querySelectorAll('.piece-card').forEach((card) => {
      card.addEventListener('click', () => this.startLevel(PIECES[Number((card as HTMLElement).dataset.idx)]));
    });
  }

  private startLevel(piece: (typeof PIECES)[number]): void {
    this.root.innerHTML = `
      <div class="panel">
        <div class="row" style="align-items:center;justify-content:space-between">
          <div>
            <h2 style="margin-bottom:4px">${piece.title}</h2>
            <div class="meta" style="color:var(--muted);font-size:12px">${piece.composer} ｜ ${piece.notes.length} 个音</div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn secondary" id="lv-quit">退出</button>
          </div>
        </div>
        <div class="progress-track"><div id="lv-progress" style="width:0%"></div></div>
      </div>
      <div class="row">
        <div class="col" style="flex:2 1 460px">
          <div class="panel">
            <h2>琴身与弓</h2>
            <canvas id="lv-canvas" style="height:280px"></canvas>
            <div id="lv-cue" style="margin-top:10px;font-size:14px;color:var(--muted)"></div>
          </div>
          <div class="panel">
            <h2>音符序列</h2>
            <div id="lv-notes" style="max-height:170px;overflow:auto"></div>
          </div>
        </div>
        <div class="col" style="flex:1 1 300px">
          <div class="panel">
            <h2>运弓控制板</h2>
            <div class="control-pad" id="lv-pad">
              <div class="hint">按住拖动运弓<br>上下调弓压 · 滚轮调 β</div>
            </div>
            <label class="field" style="margin-top:12px">β：<span id="lv-beta-val">0.18</span>
              <input type="range" id="lv-beta" min="0.05" max="0.45" step="0.01" value="0.18">
            </label>
            <div class="metric">
              <div class="card"><div class="k">状态</div><div class="v" id="lv-regime">—</div></div>
              <div class="card"><div class="k">连击</div><div class="v combo" id="lv-combo">0</div></div>
              <div class="card"><div class="k">当前音</div><div class="v" id="lv-pitch">—</div></div>
              <div class="card"><div class="k">弓力/窗口</div><div class="v" id="lv-window" style="font-size:14px">—</div></div>
            </div>
          </div>
        </div>
      </div>`;

    const canvas = this.root.querySelector('#lv-canvas') as HTMLCanvasElement;
    this.renderer = new ViolinRenderer(canvas);
    const pad = this.root.querySelector('#lv-pad') as HTMLElement;
    this.controller = new BowController(pad);
    const betaRange = this.root.querySelector('#lv-beta') as HTMLInputElement;
    betaRange.addEventListener('input', () => {
      const beta = Number(betaRange.value);
      this.controller!.setBeta(beta);
      (this.root.querySelector('#lv-beta-val') as HTMLElement).textContent = beta.toFixed(2);
    });
    this.root.querySelector('#lv-quit')!.addEventListener('click', () => {
      this.player?.stop();
      this.teardown();
      this.buildList();
    });

    // 音符序列
    const notesEl = this.root.querySelector('#lv-notes') as HTMLElement;
    notesEl.innerHTML = piece.notes
      .map(
        (n, i) =>
          `<div class="note-row" data-i="${i}"><span style="width:34px;font-weight:600">${n.pitch}</span><span style="color:var(--muted);width:60px">${['G', 'D', 'A', 'E'][n.string]}弦</span><span style="color:var(--muted)">${n.bowing === 'spiccato' ? '跳弓' : n.bowing === 'down' ? '下弓' : '上弓'}</span><span style="margin-left:auto;color:var(--muted)">β${(n.betaHint ?? 0.18).toFixed(2)}</span></div>`,
      )
      .join('');

    this.cleanupFns.push(
      this.controller.onChange((s) => {
        // 透传给序列器，由其按弓法（跳弓）调制接触门控后再下发引擎
        this.player?.setBowInput({
          pressure: s.pressure,
          bowSpeed: s.bowSpeed,
          beta: s.beta,
          contact: s.contact,
        });
      }),
    );
    this.cleanupFns.push(audioEngine.onAnalysis((a) => (this.analyses = a)));
    window.addEventListener('resize', this.onResize);

    this.player = new PiecePlayer(
      piece,
      (state) => this.onPlayUpdate(state),
      (result) => {
        this.teardown();
        this.onResult(result);
      },
    );
    this.player.start();
    this.loop();
  }

  private onPlayUpdate = (state: import('../game/piece-player').PlayState): void => {
    const progress = this.root.querySelector('#lv-progress') as HTMLElement;
    if (progress) progress.style.width = `${state.totalProgress * 100}%`;
    if (state.note) {
      this.activeString = state.note.string;
      const cue = this.root.querySelector('#lv-cue') as HTMLElement;
      if (cue)
        cue.innerHTML = `当前：<b>${state.note.pitch}</b> ｜ ${['G', 'D', 'A', 'E'][state.note.string]} 弦 ｜ ${
          state.note.bowing === 'spiccato' ? '跳弓（短促离弦）' : state.note.bowing === 'down' ? '下弓' : '上弓'
        } ｜ 推荐 β=${(state.note.betaHint ?? 0.18).toFixed(2)}`;
      const pitchEl = this.root.querySelector('#lv-pitch') as HTMLElement;
      if (pitchEl) pitchEl.textContent = state.note.pitch;
      // 高亮当前音符
      this.root.querySelectorAll('.note-row').forEach((row) => {
        const i = Number((row as HTMLElement).dataset.i);
        row.classList.toggle('playing', i === state.noteIndex);
        row.classList.toggle('done', i < state.noteIndex);
      });
      // 自动把 β 滑块提示到推荐值（不强制，玩家可微调）
      const betaRange = this.root.querySelector('#lv-beta') as HTMLInputElement;
      if (betaRange && document.activeElement !== betaRange) {
        betaRange.value = String(state.note.betaHint ?? 0.18);
        this.controller?.setBeta(state.note.betaHint ?? 0.18);
        (this.root.querySelector('#lv-beta-val') as HTMLElement).textContent = (state.note.betaHint ?? 0.18).toFixed(2);
      }
    }
  };

  private onResize = (): void => this.renderer?.resize();

  private loop = (): void => {
    if (!this.controller) return;
    const s = this.controller.getState();
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
      const map: Record<string, string> = { idle: '未触弦', good: '好音 ✓', airy: '气声', raucous: '噪音', surface: '瞬态' };
      const reg = this.root.querySelector('#lv-regime') as HTMLElement;
      if (reg) {
        reg.textContent = map[a.regime] ?? '—';
        reg.style.color =
          a.regime === 'good' ? 'var(--good)' : a.regime === 'airy' ? 'var(--airy)' : a.regime === 'raucous' ? 'var(--raucous)' : 'var(--text)';
      }
      const win = this.root.querySelector('#lv-window') as HTMLElement;
      if (win) win.textContent = `${a.bowForce.toFixed(2)}/${a.fMin.toFixed(2)}~${a.fMax.toFixed(2)}`;
    }
    if (this.player) {
      const comboEl = this.root.querySelector('#lv-combo') as HTMLElement;
      if (comboEl) comboEl.textContent = String(this.player.scorerRef.comboCount);
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private teardown(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns = [];
    this.controller?.destroy();
    this.controller = null;
  }

  destroy(): void {
    this.player?.stop();
    this.teardown();
    this.root.remove();
  }
}
