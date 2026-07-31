// 核心功能盲点测试（整理测试库时补充）：
//   A. i18n：t() 中英文返回 + {param} 插值 + 未知 key 回退
//   B. 视图模式：setViewMode 切换 .editor-container 的 preview-mode 类并隐藏对应查找面板
//   C. 设置生效：applySettings 把 settings.tabSize 驱动到 CM 的 tabSize/indentUnit，
//      以及 lineWrapping/lineNumbers 选项
//
// 这些路径在 jsdom 下安全可测；applySettings 内涉及主题/字体副作用的方法被桩掉以隔离。

const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, delay } = require('./helpers/app-env.cjs');

// ---------- A. i18n ----------
test('i18n: t() 按 settings.language 返回中文 / 英文', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  await delay(300);
  const ed = w.editor;
  ed.settings.language = 'zh';
  assert.strictEqual(ed.t('closeTab'), '关闭', 'zh 下 closeTab 应为「关闭」');
  assert.strictEqual(ed.t('file'), '文件', 'zh 下 file 应为「文件」');
  assert.strictEqual(ed.t('edit'), '编辑', 'zh 下 edit 应为「编辑」');
  ed.settings.language = 'en';
  assert.strictEqual(ed.t('closeTab'), 'Close', 'en 下 closeTab 应为 "Close"');
  assert.strictEqual(ed.t('file'), 'File', 'en 下 file 应为 "File"');
  assert.strictEqual(ed.t('edit'), 'Edit', 'en 下 edit 应为 "Edit"');
  cleanup(w);
});

test('i18n: 未知 key 回退到 key 本身（en 缺失时取 zh，再缺失取 key）', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  await delay(300);
  const ed = w.editor;
  ed.settings.language = 'en';
  assert.strictEqual(ed.t('__no_such_key_999__'), '__no_such_key_999__', '未知 key 应原样返回');
  cleanup(w);
});

test('i18n: t() 支持 {param} 插值', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  await delay(300);
  const ed = w.editor;
  ed.settings.language = 'zh';
  // replaceAllDone: '已替换 {n} 处'
  assert.strictEqual(ed.t('replaceAllDone', { n: 3 }), '已替换 3 处', 't() 应把 {n} 替换为参数值');
  cleanup(w);
});

// ---------- B. 视图模式 ----------
test('viewmode: setViewMode(preview) 加 preview-mode 类并隐藏编辑查找面板', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  await delay(300);
  const ed = w.editor;
  const container = w.document.querySelector('.editor-container');
  if (ed.viewMode === 'preview') ed.setViewMode('edit'); // 确保从非 preview 起步
  ed.setViewMode('preview');
  assert.ok(container.classList.contains('preview-mode'), 'preview 模式应给容器加 preview-mode 类');
  assert.ok(w.document.getElementById('find-panel').classList.contains('hidden'),
    'preview 模式应隐藏编辑查找面板');
  ed.setViewMode('edit');
  assert.strictEqual(container.classList.contains('preview-mode'), false, '切回 edit 应移除 preview-mode');
  assert.ok(w.document.getElementById('preview-find-panel').classList.contains('hidden'),
    '切回 edit 应隐藏预览查找面板');
  cleanup(w);
});

// ---------- C. 设置生效 ----------
test('settings: applySettings 把 tabSize 驱动到 CM tabSize/indentUnit', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  await delay(300);
  const ed = w.editor;
  // 隔离主题/字体副作用（避免 mermaid 重渲染、字体注册等）
  ed.applyThemeMode = async () => {};
  ed.applyFontScheme = () => {};
  ed.applyCustomFonts = () => {};

  ed.settings.tabSize = 2;
  await ed.applySettings();
  assert.strictEqual(ed.cm.getOption('indentUnit'), 2, 'indentUnit 应等于 tabSize=2');
  assert.strictEqual(ed.cm.getOption('tabSize'), 2, 'tabSize 选项应为 2');

  ed.settings.tabSize = 8;
  await ed.applySettings();
  assert.strictEqual(ed.cm.getOption('indentUnit'), 8, 'tabSize=8 应驱动 indentUnit=8');

  ed.settings.lineWrap = false;
  await ed.applySettings();
  assert.strictEqual(ed.cm.getOption('lineWrapping'), false, 'lineWrap=false 应关闭换行');

  ed.settings.lineNumbers = false;
  await ed.applySettings();
  assert.strictEqual(ed.cm.getOption('lineNumbers'), false, 'lineNumbers=false 应关闭行号');

  cleanup(w);
});
