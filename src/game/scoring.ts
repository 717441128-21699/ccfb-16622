/**
 * 曲目评分：消费 AudioWorklet 上报的分析帧，按音符时长聚合打分。
 */
import type { LevelResult, NoteEvent, NoteScore, Regime, StringAnalysis } from '../types';

interface NoteAccum {
  note: NoteEvent;
  frames: number;
  regimeCounts: Record<Regime, number>;
  speedSamples: number[];
  pressureInWindow: number;
  pressureTotal: number;
  onsetMs: number;
  hadGood: boolean;
}

function emptyRegimeCounts(): Record<Regime, number> {
  return { idle: 0, good: 0, airy: 0, raucous: 0, surface: 0 };
}

export class Scorer {
  private current: NoteAccum | null = null;
  private finished: NoteAccum[] = [];
  private combo = 0;
  private maxCombo = 0;
  private regimeTotals = emptyRegimeCounts();
  private totalFrames = 0;

  startNote(note: NoteEvent): void {
    this.current = {
      note,
      frames: 0,
      regimeCounts: emptyRegimeCounts(),
      speedSamples: [],
      pressureInWindow: 0,
      pressureTotal: 0,
      onsetMs: -1,
      hadGood: false,
    };
  }

  /** 每个分析帧调用（仅当前活动弦） */
  addFrame(a: StringAnalysis): void {
    if (!this.current) return;
    const acc = this.current;
    acc.frames++;
    acc.regimeCounts[a.regime]++;
    this.regimeTotals[a.regime]++;
    this.totalFrames++;
    acc.speedSamples.push(a.bowSpeed);

    // 弓压是否落在 Schelleng 窗口内（弓力 vs fMin/fMax）
    if (a.bowForce > 0.001) {
      acc.pressureTotal++;
      if (a.bowForce >= a.fMin && a.bowForce <= a.fMax) acc.pressureInWindow++;
    }
    if (a.regime === 'good') {
      if (!acc.hadGood) {
        acc.hadGood = true;
        acc.onsetMs = a.onsetMs;
      }
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
    } else if (a.regime === 'airy' || a.regime === 'raucous') {
      this.combo = 0;
    }
  }

  endNote(): NoteScore | null {
    if (!this.current) return null;
    const acc = this.current;
    this.finished.push(acc);
    this.current = null;
    return this.scoreNote(acc);
  }

  private scoreNote(acc: NoteAccum): NoteScore {
    const f = Math.max(1, acc.frames);
    const goodRatio = acc.regimeCounts.good / f;
    const airyRatio = acc.regimeCounts.airy / f;
    const raucousRatio = acc.regimeCounts.raucous / f;

    // 弓速稳定度：变异系数越小越稳
    let speedStability = 1;
    if (acc.speedSamples.length > 1) {
      const mean = acc.speedSamples.reduce((a, b) => a + b, 0) / acc.speedSamples.length;
      const variance =
        acc.speedSamples.reduce((a, b) => a + (b - mean) ** 2, 0) / acc.speedSamples.length;
      const cv = Math.abs(mean) > 0.01 ? Math.sqrt(variance) / Math.abs(mean) : 1;
      speedStability = clamp(1 - cv, 0, 1);
    }

    const pressureAccuracy = acc.pressureTotal > 0 ? acc.pressureInWindow / acc.pressureTotal : 0;
    // 起音：前 40ms 内进入 good 给满分，越晚越低，未起振 0 分
    let onsetScore = 0;
    if (acc.onsetMs >= 0) onsetScore = clamp(1 - Math.max(0, acc.onsetMs - 8) / 60, 0.2, 1);

    const total = clamp(
      goodRatio * 100 * 0.55 +
        pressureAccuracy * 100 * 0.2 +
        speedStability * 100 * 0.15 +
        onsetScore * 100 * 0.1,
      0,
      100,
    );

    return {
      pitch: acc.note.pitch,
      goodRatio,
      airyRatio,
      raucousRatio,
      speedStability,
      pressureAccuracy,
      onsetScore,
      total: Math.round(total * 10) / 10,
    };
  }

  buildResult(pieceId: string, pieceTitle: string): LevelResult {
    const noteScores = this.finished.map((acc) => this.scoreNote(acc));
    const totalScore =
      noteScores.length > 0
        ? Math.round((noteScores.reduce((a, b) => a + b.total, 0) / noteScores.length) * 10) / 10
        : 0;
    const denom = Math.max(1, this.totalFrames);
    const regimeStats = {
      idle: this.regimeTotals.idle / denom,
      good: this.regimeTotals.good / denom,
      airy: this.regimeTotals.airy / denom,
      raucous: this.regimeTotals.raucous / denom,
      surface: this.regimeTotals.surface / denom,
    };
    return {
      pieceId,
      pieceTitle,
      date: Date.now(),
      noteScores,
      totalScore,
      maxCombo: this.maxCombo,
      regimeStats,
    };
  }

  reset(): void {
    this.current = null;
    this.finished = [];
    this.combo = 0;
    this.maxCombo = 0;
    this.regimeTotals = emptyRegimeCounts();
    this.totalFrames = 0;
  }

  get comboCount(): number {
    return this.combo;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
