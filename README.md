# music tool bundle

ちょっとした音楽系ツールをまとめた、自分用のウェブアプリ。
ビルド不要の静的サイトで、GitHub Pages にそのまま置いて使う。

**公開URL**: `https://bonsai-human.github.io/music_tool_bundle/`

## 収録ツール

| ツール | 状態 | 内容 |
| --- | --- | --- |
| [音叉](tools/tuning-fork/) | 公開中 | A1〜C7 の基準音を鳴らす電子音叉。A4 較正 415〜466Hz、波形 4 種、高調波量、音圧レベル。 |
| メトロノーム | 予定 | 拍子・テンポ・アクセント。 |
| チューナー | 予定 | マイク入力からの音高検出。 |

## 設計方針

iOS アプリを 1 本ずつ入れる代わりに、**1 つのサイトに小さなツールを足していく**構成にしている。

- **ビルドなし** — 素の HTML / CSS / ES モジュール。`git push` した内容がそのまま本番。
  ツールチェーンの更新に追われず、数年後でも直せる。
- **依存ゼロ** — 外部 CDN もフォントも読まない。オフラインで完全に動く。
- **相対パスのみ** — GitHub Pages のサブディレクトリ配信（`/music_tool_bundle/`）でも
  ローカルの `python -m http.server` でもそのまま動く。ルート絶対パス (`/shared/...`) は使わない。
- **共有基盤 + 独立したツール** — 音律の計算・AudioContext・設定保存といった
  「どのツールでも要るもの」だけを `shared/` に置き、ツール同士は依存させない。
  1 つのツールが壊れても他は動く。
- **PWA** — Service Worker で全ファイルを事前キャッシュ。ホーム画面に追加すれば
  電波の無いスタジオや練習室でも起動する。

### ディレクトリ

```
index.html                トップ（ツール一覧。registry.js から自動生成）
home.css
manifest.webmanifest      PWA マニフェスト
sw.js                     Service Worker（全ファイルを事前キャッシュ）
assets/favicon.svg
shared/
  css/base.css            デザイントークン・画面シェル・スライダー等の共通パーツ
  js/registry.js          ツール一覧（唯一の情報源）
  js/note.js              音名 / MIDIノート番号 / 周波数 の変換
  js/audio.js             共有 AudioContext・自動再生ポリシー対策・スリープ抑止
  js/wave.js              倍音構成を無段階で変えられる PeriodicWave 生成
  js/prefs.js             localStorage への設定保存
  js/pwa.js               Service Worker 登録
tools/
  tuning-fork/            音叉
.github/workflows/pages.yml
```

## 音叉ツールについて

元の iOS アプリの機能をそのまま移植したうえで、ウェブ向けに少し足している。

- **音符** — A1〜C7 を半音単位で選択。スライダー上下に A / C の目盛りを表示。
- **A4 較正** — 415〜466Hz を 0.5Hz 刻みで。周波数は `a4 × 2^((midi−69)/12)`。
- **音圧レベル** — 二乗カーブでゲインへ変換（聴感上リニアになる）。
- **高調波** — 0% で純正弦波、100% で選んだ波形そのもの。
  基本波形の理想倍音列に指数状の傾き `exp(−k(n−1))` を掛けて連続的に補間している
  （`shared/js/wave.js`）。正弦波選択時は倍音が無いので無効化される。
- **波形** — 正弦波 / 三角波 / のこぎり波 / 矩形波。すべて `PeriodicWave` で生成し、
  ナイキスト周波数を超える倍音は落としてエイリアシングを防ぐ。
- 追加した点: 設定の自動保存、発音中の画面スリープ抑止、タブを離れると自動停止、
  発音開始・停止のフェード（プチノイズ防止）、キーボード操作、オフライン動作。

## 開発

```sh
python3 -m http.server 8000
# → http://localhost:8000/
```

Service Worker はローカルでも有効なので、キャッシュが残って更新が反映されない場合は
DevTools の Application → Service Workers → Update on reload を使う。

### ツールを追加する手順

1. `tools/<tool-id>/` に `index.html` / `<tool-id>.css` / `<tool-id>.js` を作る。
   共通部分は `shared/css/base.css` と `shared/js/*` を相対パスで読む。
2. `shared/js/registry.js` にエントリを 1 つ追加する（トップページのカードは自動生成）。
3. `sw.js` の `PRECACHE` に新しいファイルを足し、`CACHE_VERSION` を上げる。

## デプロイ

`.github/workflows/pages.yml` がデフォルトブランチへの push で自動デプロイする。
初回のみ GitHub の **Settings → Pages → Source** を **GitHub Actions** に設定する必要がある。
