/**
 * ツール一覧。トップページのカードと各ツールのメタ情報はここが唯一の情報源。
 * ツールを追加したら、このリストと sw.js の PRECACHE に 1 行ずつ足す。
 *
 * path はサイトルートからの相対パス（GitHub Pages のサブディレクトリ配信でも
 * そのまま動くよう、先頭に / を付けない）。
 */

export const TOOLS = [
  {
    id: 'tuning-fork',
    name: '音叉',
    tagline: '基準音を鳴らす',
    description:
      'A1〜C7 の任意の音を鳴らす電子音叉。A4 = 415〜466Hz の較正、波形と高調波量、音圧レベルを調整できます。',
    path: 'tools/tuning-fork/',
    accent: '#35d6b5',
    status: 'ready',
    icon: `<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor"
             stroke-width="4.5" stroke-linecap="round">
             <path d="M16 6v20a8 8 0 0 0 16 0V6"/>
             <path d="M24 34v6"/>
             <circle cx="24" cy="43" r="2.5" fill="currentColor" stroke="none"/>
           </svg>`,
  },
  {
    id: 'metronome',
    name: 'メトロノーム',
    tagline: 'テンポを刻む',
    description:
      '拍子12種と任意拍子、拍ごとのアクセント、リズムパターン、音色5種。目標テンポまで自動で上げていく練習プログラム付き。',
    path: 'tools/metronome/',
    accent: '#ffb84d',
    status: 'ready',
    icon: `<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor"
             stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round">
             <path d="M18 6h12l8 36H10z"/>
             <path d="M24 38 32 14"/>
           </svg>`,
  },
  {
    id: 'chord-finder',
    name: 'コード判定',
    tagline: '音から和音名を出す',
    description:
      '鍵盤で選んだ音からコード名を判定します。複数の読み方がある和音は候補を並べ、ベース音を指定すると転回形・分数コードとして絞り込めます。',
    path: 'tools/chord-finder/',
    accent: '#9d8bff',
    status: 'ready',
    icon: `<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor"
             stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
             <rect x="6" y="10" width="36" height="28" rx="3"/>
             <path d="M18 10v18M30 10v18M6 28h36"/>
           </svg>`,
  },
  {
    id: 'tuner',
    name: 'チューナー',
    tagline: '音程を測る',
    description: 'マイク入力から音高を検出して、ずれをセント単位で表示します。',
    path: 'tools/tuner/',
    accent: '#5aa9ff',
    status: 'planned',
    icon: `<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor"
             stroke-width="4.5" stroke-linecap="round">
             <path d="M6 34a18 18 0 0 1 36 0"/>
             <path d="M24 34 33 20"/>
           </svg>`,
  },
];

export const READY_TOOLS = TOOLS.filter((t) => t.status === 'ready');

export function findTool(id) {
  return TOOLS.find((t) => t.id === id) || null;
}
