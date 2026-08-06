/**
 * ツールごとの設定を localStorage に保存する薄いラッパ。
 * プライベートブラウズ等で localStorage が使えない場合は黙って無効化する。
 */

const PREFIX = 'mtb';

function storage() {
  try {
    const s = window.localStorage;
    const probe = `${PREFIX}:probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function createPrefs(toolId, defaults) {
  const key = `${PREFIX}:${toolId}`;
  const store = storage();

  function load() {
    if (!store) return { ...defaults };
    try {
      const raw = store.getItem(key);
      if (!raw) return { ...defaults };
      const saved = JSON.parse(raw);
      const merged = { ...defaults };
      for (const k of Object.keys(defaults)) {
        if (saved[k] !== undefined && typeof saved[k] === typeof defaults[k]) {
          merged[k] = saved[k];
        }
      }
      return merged;
    } catch {
      return { ...defaults };
    }
  }

  let timer = null;
  function save(state) {
    if (!store) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const subset = {};
        for (const k of Object.keys(defaults)) subset[k] = state[k];
        store.setItem(key, JSON.stringify(subset));
      } catch {
        /* 保存できなくても動作には影響しない */
      }
    }, 250);
  }

  return { load, save };
}
