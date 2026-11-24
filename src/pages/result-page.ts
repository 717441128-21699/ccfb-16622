/**
 * 成绩页：本次成绩 + 历史最佳（localStorage 持久化），逐音明细与发音状态占比。
 */
import type { LevelResult, Regime } from '../types';

const STORAGE_KEY = 'helmholtz-violin-results';

export function saveResult(r: LevelResult): void {
  const all = loadResults();
  all.unshift(r);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, 30)));
}

export function loadResults(): LevelResult[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as LevelResult[];
  } catch {
    return [];
  }
}

const REGIME_LABEL: Record<Regime, string> = {
  idle: '未触弦',
  good: '好音',
  airy: '气声',
  raucous: '噪音',
  surface: '瞬态',
};
const REGIME_COLOR: Record<Regime, string> = {
  idle: '#8a8f99',
  good: '#4ade80',
  airy: '#7dd3fc',
  raucous: '#f87171',
  surface: '#fbbf24',
};

export class ResultPage {
  private root: HTMLElement;

  constructor(mount: HTMLElement, private latest: LevelResult | null) {
    this.root = document.createElement('div');
    mount.appendChild(this.root);
    this.build();
  }

  private build(): void {
    const history = loadResults();
    this.root.innerHTML = `
      ${this.latest ? this.latestPanel(this.latest) : ''}
      <div class="panel">
        <h2>历史成绩（${history.length}）</h2>
        ${history.length === 0 ? '<p style="color:var(--muted)">还没有成绩，去曲目关卡拉一首吧。</p>' : history.map((r) => this.historyRow(r)).join('')}
      </div>`;
  }

  private latestPanel(r: LevelResult): string {
    const entries = (Object.entries(r.regimeStats) as [Regime, number][]).filter(([, v]) => v > 0.001);
    return `
      <div class="panel">
        <h2>${r.pieceTitle} · 本次成绩</h2>
        <div class="row" style="align-items:center;gap:24px">
          <div class="big-score">${r.totalScore}</div>
          <div style="flex:1;min-width:200px">
            <div style="color:var(--muted);font-size:13px;margin-bottom:8px">发音状态占比</div>
            <div style="display:flex;height:14px;border-radius:7px;overflow:hidden;background:var(--panel-2)">
              ${entries
                .map(
                  ([k, v]) =>
                    `<div title="${REGIME_LABEL[k]} ${(v * 100).toFixed(0)}%" style="width:${v * 100}%;background:${REGIME_COLOR[k]}"></div>`,
                )
                .join('')}
            </div>
            <div style="margin-top:8px;display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--muted)">
              ${entries.map(([k, v]) => `<span style="color:${REGIME_COLOR[k]}">● ${REGIME_LABEL[k]} ${(v * 100).toFixed(0)}%</span>`).join('')}
            </div>
            <div style="margin-top:10px;font-size:13px">最高连击：<b class="combo">${r.maxCombo}</b></div>
          </div>
        </div>
      </div>
      <div class="panel">
        <h2>逐音明细</h2>
        <table class="scores">
          <thead><tr><th>音</th><th>综合</th><th>好音占比</th><th>弓压命中</th><th>弓速稳定</th><th>起音</th><th>主要问题</th></tr></thead>
          <tbody>
            ${r.noteScores
              .map((n) => {
                const problem =
                  n.raucousRatio > n.airyRatio && n.raucousRatio > 0.2
                    ? '<span class="badge raucous">压过重</span>'
                    : n.airyRatio > 0.2
                      ? '<span class="badge airy">压不足</span>'
                      : n.goodRatio > 0.7
                        ? '<span class="badge good">良好</span>'
                        : '—';
                return `<tr>
                  <td>${n.pitch}</td>
                  <td><b>${n.total}</b></td>
                  <td>${(n.goodRatio * 100).toFixed(0)}%</td>
                  <td>${(n.pressureAccuracy * 100).toFixed(0)}%</td>
                  <td>${(n.speedStability * 100).toFixed(0)}%</td>
                  <td>${(n.onsetScore * 100).toFixed(0)}%</td>
                  <td>${problem}</td>
                </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>`;
  }

  private historyRow(r: LevelResult): string {
    const d = new Date(r.date);
    const date = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `
      <div class="hist-item">
        <div>
          <div style="font-weight:600">${r.pieceTitle}</div>
          <div style="color:var(--muted);font-size:12px">${date} ｜ 好音 ${(r.regimeStats.good * 100).toFixed(0)}% ｜ 连击 ${r.maxCombo}</div>
        </div>
        <div class="big-score" style="font-size:26px">${r.totalScore}</div>
      </div>`;
  }

  destroy(): void {
    this.root.remove();
  }
}
