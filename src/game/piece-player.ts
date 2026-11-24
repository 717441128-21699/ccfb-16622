/**
 * 曲目序列器：按时间轴推进音符，驱动音频引擎与评分。
 * 跳弓（spiccato）音符自动生成离弦门控；连弓保持接触。
 */
import { audioEngine } from '../audio/engine';
import { noteToFreq } from '../types';
import type { NoteEvent, Piece, StringId } from '../types';
import { Scorer } from './scoring';

export interface PlayState {
  noteIndex: number;
  note: NoteEvent | null;
  /** 当前音符内进度 0..1 */
  noteProgress: number;
  /** 全曲进度 0..1 */
  totalProgress: number;
  elapsed: number;
  totalDuration: number;
  running: boolean;
  finished: boolean;
}

interface TimedNote extends NoteEvent {
  start: number;
}

export class PiecePlayer {
  private timed: TimedNote[] = [];
  private totalDuration = 0;
  private index = 0;
  private elapsed = 0;
  private running = false;
  private finished = false;
  private lastTs = 0;
  private rafId = 0;
  private scorer = new Scorer();
  private activeString: StringId = 2;

  constructor(
    private piece: Piece,
    private onUpdate: (s: PlayState) => void,
    private onFinish: (result: ReturnType<Scorer['buildResult']>) => void,
  ) {
    let t = 0;
    this.timed = piece.notes.map((n) => {
      const tn = { ...n, start: t };
      t += n.duration;
      return tn;
    });
    this.totalDuration = t;
  }

  get scorerRef(): Scorer {
    return this.scorer;
  }

  start(): void {
    this.running = true;
    this.finished = false;
    this.elapsed = 0;
    this.index = 0;
    this.lastTs = performance.now();
    this.enterNote(0);
    this.loop();
  }

  private enterNote(i: number): void {
    const note = this.timed[i];
    if (!note) return;
    this.index = i;
    this.activeString = note.string;
    audioEngine.setActiveString(note.string);
    audioEngine.setFrequency(note.string, noteToFreq(note.pitch));
    // 其他弦静默
    ([0, 1, 2, 3] as StringId[]).forEach((s) => {
      if (s !== note.string) audioEngine.silenceString(s);
    });
    this.scorer.startNote(note);
  }

  private loop = (): void => {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTs) / 1000);
    this.lastTs = now;
    this.elapsed += dt;

    // 音符推进
    while (this.index < this.timed.length && this.elapsed >= this.timed[this.index].start + this.timed[this.index].duration) {
      this.scorer.endNote();
      if (this.index + 1 < this.timed.length) this.enterNote(this.index + 1);
      else break;
    }

    if (this.elapsed >= this.totalDuration) {
      this.complete();
      return;
    }

    const note = this.timed[this.index];
    if (note) {
      const noteElapsed = this.elapsed - note.start;
      const noteProgress = Math.min(1, noteElapsed / note.duration);
      // 跳弓门控：前 45% 咬住弦，之后弓弹起离弦（用余弦做平滑的接触包络）
      const spiccatoEnv =
        note.bowing === 'spiccato'
          ? noteProgress < 0.45
            ? 0.5 + 0.5 * Math.cos((noteProgress / 0.45) * Math.PI * 0.5)
            : 0
          : 1;
      // 用弓法包络调制当前活动弦的接触门控（玩家仍控制弓压/弓速/β）
      const raw = this.bowInput;
      audioEngine.setBowInput(this.activeString, {
        pressure: raw.pressure,
        bowSpeed: raw.bowSpeed,
        beta: raw.beta,
        contact: Math.min(raw.contact, spiccatoEnv),
      });
      // 评分只在弓应接触的段落统计
      const analysis = audioEngine.getActiveAnalysis();
      if (analysis && spiccatoEnv > 0.2) this.scorer.addFrame(analysis);
      this.onUpdate({
        noteIndex: this.index,
        note,
        noteProgress,
        totalProgress: this.elapsed / this.totalDuration,
        elapsed: this.elapsed,
        totalDuration: this.totalDuration,
        running: true,
        finished: false,
      });
    }
    this.rafId = requestAnimationFrame(this.loop);
  };

  /** 关卡页把玩家原始运弓输入透传给序列器，以便弓法包络调制接触 */
  private bowInput = { pressure: 0, bowSpeed: 0, beta: 0.18, contact: 0 };

  setBowInput(input: { pressure: number; bowSpeed: number; beta: number; contact: number }): void {
    this.bowInput = input;
  }

  private complete(): void {
    this.running = false;
    this.finished = true;
    cancelAnimationFrame(this.rafId);
    ([0, 1, 2, 3] as StringId[]).forEach((s) => audioEngine.silenceString(s));
    const result = this.scorer.buildResult(this.piece.id, this.piece.title);
    this.onUpdate({
      noteIndex: this.timed.length - 1,
      note: this.timed[this.timed.length - 1],
      noteProgress: 1,
      totalProgress: 1,
      elapsed: this.totalDuration,
      totalDuration: this.totalDuration,
      running: false,
      finished: true,
    });
    this.onFinish(result);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.scorer.reset();
    ([0, 1, 2, 3] as StringId[]).forEach((s) => audioEngine.silenceString(s));
  }

  get state(): PlayState {
    const note = this.timed[this.index] ?? null;
    return {
      noteIndex: this.index,
      note,
      noteProgress: note ? (this.elapsed - note.start) / note.duration : 0,
      totalProgress: this.elapsed / this.totalDuration,
      elapsed: this.elapsed,
      totalDuration: this.totalDuration,
      running: this.running,
      finished: this.finished,
    };
  }
}
