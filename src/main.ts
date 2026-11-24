import './styles.css';
import { audioEngine } from './audio/engine';
import { PracticePage } from './pages/practice-page';
import { ChartPage } from './pages/chart-page';
import { LevelPage } from './pages/level-page';
import { ResultPage, saveResult } from './pages/result-page';
import type { LevelResult } from './types';

type TabId = 'practice' | 'chart' | 'level' | 'result';

const TABS: { id: TabId; label: string }[] = [
  { id: 'practice', label: '运弓练习' },
  { id: 'chart', label: '弓压弓速图' },
  { id: 'level', label: '曲目关卡' },
  { id: 'result', label: '成绩' },
];

class App {
  private view: HTMLElement;
  private page: { destroy: () => void } | null = null;
  private currentTab: TabId = 'practice';
  private latestResult: LevelResult | null = null;

  constructor() {
    const app = document.getElementById('app')!;
    app.innerHTML = `
      <header class="app-header">
        <h1>赫姆霍兹小提琴</h1>
        <span class="sub">弓弦粘-滑摩擦实验室 · 右手控制（弓压 × 弓速 × 离琴码距离）</span>
        <span style="flex:1"></span>
        <button class="btn secondary" id="audio-unlock" style="padding:7px 14px;font-size:13px">开启声音</button>
      </header>
      <nav class="tabs">
        ${TABS.map((t) => `<button data-tab="${t.id}" class="${t.id === 'practice' ? 'active' : ''}">${t.label}</button>`).join('')}
      </nav>
      <div id="view"></div>`;
    this.view = app.querySelector('#view')!;
    app.querySelectorAll<HTMLButtonElement>('nav.tabs button').forEach((btn) => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab as TabId));
    });
    app.querySelector('#audio-unlock')!.addEventListener('click', async (e) => {
      await audioEngine.resume();
      (e.target as HTMLButtonElement).textContent = audioEngine.isRunning ? '声音已开启 ✓' : '开启声音';
    });
    this.switchTab('practice');
  }

  private switchTab(tab: TabId): void {
    this.currentTab = tab;
    document.querySelectorAll('nav.tabs button').forEach((b) => {
      b.classList.toggle('active', (b as HTMLElement).dataset.tab === tab);
    });
    this.page?.destroy();
    this.view.innerHTML = '';
    // 进入任意交互页面前确保音频上下文已初始化（仍需用户手势 resume）
    audioEngine.init().catch((err) => console.error('音频初始化失败', err));

    if (tab === 'practice') this.page = new PracticePage(this.view);
    else if (tab === 'chart') this.page = new ChartPage(this.view);
    else if (tab === 'level')
      this.page = new LevelPage(this.view, (result) => {
        this.latestResult = result;
        saveResult(result);
        this.switchTab('result');
      });
    else this.page = new ResultPage(this.view, this.latestResult);
  }
}

new App();
