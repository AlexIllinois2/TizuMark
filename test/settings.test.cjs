// 设置模块测试：默认值 / 校验 / 合并 / 主题色 / 字体 / 重置
// 仅依赖共享 harness（jsdom + 真实 CodeMirror），不触及 Tauri 集成。
const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, delay } = require('./helpers/app-env.cjs');

async function makeEditor() {
  const { w, getInitErr } = await buildEnv({ captureInitErr: true });
  await delay(300); // 等异步初始化（DOMContentLoaded -> new MarkdownEditor）完成
  return { w, ed: w.editor, getInitErr };
}

test('settings: defaultSettings 返回完整默认配置', async () => {
  const { w, ed, getInitErr } = await makeEditor();
  try {
    assert.strictEqual(getInitErr(), null, '初始化不应报错');
    const d = ed.defaultSettings();
    assert.strictEqual(d.fontSize, 14);
    assert.strictEqual(d.tabSize, 4);
    assert.strictEqual(d.lineWrap, true);
    assert.strictEqual(d.lineNumbers, true);
    assert.strictEqual(d.previewFontSize, 16);
    assert.strictEqual(d.lineHeight, 1.7);
    assert.strictEqual(d.maxWidth, 0);
    assert.strictEqual(d.themeMode, 'light');
    assert.strictEqual(d.colorScheme, 'default');
    assert.strictEqual(d.fontScheme, 'system-sans');
    assert.strictEqual(d.defaultView, 'edit');
    assert.strictEqual(d.scrollSync, true);
    assert.strictEqual(d.language, 'zh');
    assert.strictEqual(d.imageInsertMode, 'assets');
    assert.strictEqual(d.imageAssetPath, 'assets');
    assert.strictEqual(d.imageAssetPathMode, 'relative');
    assert.strictEqual(d.outlineWidth, 240);
    assert.strictEqual(d.codeLineNumbers, false);
    assert.strictEqual(d.codeWrap, false);
    assert.strictEqual(d.codeScroll, true, '代码块滚动条默认开启（保持原行为）');
    assert.strictEqual(d.softBreaks, true);
    assert.strictEqual(d.showTrayIcon, true);
    assert.strictEqual(d.closeAction, 'ask');
    assert.strictEqual(d.toolbarCollapsed, false);
    assert.strictEqual(d.sidebarHidden, false);
    assert.ok(Array.isArray(d.customFonts), 'customFonts 应为数组');
    assert.strictEqual(d.customFonts.length, 0, 'customFonts 应为空');
    assert.strictEqual(d.editorFont, '');
    assert.strictEqual(d.previewFont, '');
  } finally { cleanup(w); }
});

test('settings: _validConfigObject 类型校验', async () => {
  const { w, ed } = await makeEditor();
  try {
    assert.strictEqual(ed._validConfigObject(null), null);
    assert.strictEqual(ed._validConfigObject(undefined), null);
    assert.strictEqual(ed._validConfigObject([1, 2, 3]), null, '数组应被拒绝');
    assert.strictEqual(ed._validConfigObject('nope'), null, '字符串应被拒绝');
    assert.deepStrictEqual(ed._validConfigObject({ a: 1 }), { a: 1 });
  } finally { cleanup(w); }
});

test('settings: loadSettings 合并已知字段并保留默认', async () => {
  const { w, ed } = await makeEditor();
  try {
    w.localStorage.setItem('tizumark-settings', JSON.stringify({ tabSize: 2, themeMode: 'dark' }));
    const loaded = ed.loadSettings();
    assert.strictEqual(loaded.tabSize, 2);
    assert.strictEqual(loaded.themeMode, 'dark');
    assert.strictEqual(loaded.fontSize, 14, '未提供字段应保留默认');
    assert.strictEqual(loaded.maxWidth, 0);
  } finally { cleanup(w); }
});

test('settings: loadSettings 对类型不符字段回退默认', async () => {
  const { w, ed } = await makeEditor();
  try {
    w.localStorage.setItem('tizumark-settings', JSON.stringify({ tabSize: '4', lineWrap: 'yes' }));
    const loaded = ed.loadSettings();
    assert.strictEqual(loaded.tabSize, 4, '字符串应回退为 number 默认');
    assert.strictEqual(loaded.lineWrap, true, '字符串应回退为 boolean 默认');
  } finally { cleanup(w); }
});

test('settings: loadSettings 丢弃未知键', async () => {
  const { w, ed } = await makeEditor();
  try {
    w.localStorage.setItem('tizumark-settings', JSON.stringify({ bogusKey: 'hello' }));
    const loaded = ed.loadSettings();
    assert.strictEqual(loaded.bogusKey, undefined, '未知键应被类型校验清为 undefined');
  } finally { cleanup(w); }
});

test('settings: loadSettings 旧版 colorScheme 推断 fontScheme', async () => {
  const { w, ed } = await makeEditor();
  try {
    w.localStorage.setItem('tizumark-settings', JSON.stringify({ colorScheme: 'forest' }));
    const loaded = ed.loadSettings();
    assert.strictEqual(loaded.colorScheme, 'forest');
    assert.strictEqual(loaded.fontScheme, 'system-sans', '旧版无 fontScheme 时应从 colorScheme 推断');
  } finally { cleanup(w); }
});

test('settings: loadSettings 坏 JSON 回退默认', async () => {
  const { w, ed } = await makeEditor();
  try {
    w.localStorage.setItem('tizumark-settings', 'not-json{');
    const loaded = ed.loadSettings();
    assert.strictEqual(loaded.fontSize, 14, '坏 JSON 应回退默认');
    assert.strictEqual(loaded.colorScheme, 'default');
  } finally { cleanup(w); }
});

test('settings: saveSettings 回写 localStorage', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.settings = ed.defaultSettings();
    ed.settings.tabSize = 2;
    ed.saveSettings();
    const stored = JSON.parse(w.localStorage.getItem('tizumark-settings'));
    assert.strictEqual(stored.tabSize, 2);
  } finally { cleanup(w); }
});

test('settings: applyThemeMode dark 设置 data-theme 与 cm 主题', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.settings.themeMode = 'dark';
    ed.settings.colorScheme = 'nord';
    await ed.applyThemeMode();
    assert.strictEqual(w.document.documentElement.getAttribute('data-theme'), 'dark');
    assert.strictEqual(w.document.documentElement.getAttribute('data-color-scheme'), 'nord');
    assert.strictEqual(ed.cm.getOption('theme'), 'material-darker');
  } finally { cleanup(w); }
});

test('settings: applyThemeMode system 跟随 matchMedia(返回 light)', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.settings.themeMode = 'system';
    await ed.applyThemeMode();
    assert.strictEqual(w.document.documentElement.getAttribute('data-theme'), 'light', 'matchMedia 默认 false 应为 light');
  } finally { cleanup(w); }
});

test('settings: applyFontScheme 设置 data-font-scheme', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.settings.fontScheme = 'classic-serif';
    ed.applyFontScheme();
    assert.strictEqual(w.document.documentElement.getAttribute('data-font-scheme'), 'classic-serif');
  } finally { cleanup(w); }
});

test('settings: applyCustomFonts 设置编辑器/预览字体族', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.settings.editorFont = 'cf123';
    ed.settings.previewFont = 'cf456';
    ed.applyCustomFonts();
    assert.ok(ed.cm.getWrapperElement().style.fontFamily.includes('tizumark-custom-cf123'), 'CM 应应用自定义字体 cf123，实际: ' + ed.cm.getWrapperElement().style.fontFamily);
    assert.ok(ed.preview.style.fontFamily.includes('tizumark-custom-cf456'), '预览应应用自定义字体 cf456，实际: ' + ed.preview.style.fontFamily);
  } finally { cleanup(w); }
});

test('settings: applySettings 应用 maxWidth 与代码块选项', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.settings.maxWidth = 800;
    ed.settings.codeLineNumbers = true;
    ed.settings.codeWrap = true;
    await ed.applySettings();
    assert.ok(ed.preview.classList.contains('max-width-active'), 'maxWidth>0 应加 max-width-active');
    assert.strictEqual(ed.preview.style.maxWidth, '800px');
    assert.ok(ed.preview.classList.contains('code-line-numbers'));
    assert.ok(ed.preview.classList.contains('code-wrap'));
  } finally { cleanup(w); }
});

test('settings: applySettings 按 codeScroll 切换 code-no-scroll 类（关闭时撑开高度）', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.settings.codeScroll = false;
    await ed.applySettings();
    assert.ok(ed.preview.classList.contains('code-no-scroll'), 'codeScroll=false 应加 code-no-scroll（高度自适应、不滚动）');
    ed.settings.codeScroll = true;
    await ed.applySettings();
    assert.ok(!ed.preview.classList.contains('code-no-scroll'), 'codeScroll=true 应移除 code-no-scroll（恢复滚动条行为）');
  } finally { cleanup(w); }
});

test('settings: applySettings maxWidth=0 移除限制', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.settings.maxWidth = 0;
    await ed.applySettings();
    assert.ok(!ed.preview.classList.contains('max-width-active'), 'maxWidth=0 不应有 max-width-active');
    assert.strictEqual(ed.preview.style.maxWidth, '');
  } finally { cleanup(w); }
});

test('settings: resetSettings 恢复默认并保留自定义字体', async () => {
  const { w, ed } = await makeEditor();
  try {
    // 预置 resetSettings 操作的设置表单元素，避免 jsdom 下 null 崩溃
    const ids = ['set-font-size', 'font-size-label', 'set-tab-size', 'set-line-wrap', 'set-line-numbers',
      'set-preview-font-size', 'preview-font-size-label', 'set-line-height', 'set-max-width', 'set-theme-mode',
      'set-color-scheme', 'set-font-scheme', 'set-default-view', 'set-scroll-sync', 'set-soft-breaks',
      'set-language', 'settings-image-asset-path', 'setting-image-asset-path-hint-text'];
    for (const id of ids) {
      if (!w.document.getElementById(id)) {
        const el = w.document.createElement('input');
        el.id = id;
        w.document.body.appendChild(el);
      }
    }
    let storeMode = w.document.getElementById('settings-image-store-mode');
    if (!storeMode) { storeMode = w.document.createElement('div'); storeMode.id = 'settings-image-store-mode'; w.document.body.appendChild(storeMode); }
    storeMode.innerHTML = '<input type="radio" value="assets">';
    let pathMode = w.document.getElementById('settings-image-asset-path-mode');
    if (!pathMode) { pathMode = w.document.createElement('div'); pathMode.id = 'settings-image-asset-path-mode'; w.document.body.appendChild(pathMode); }
    pathMode.innerHTML = '<input type="radio" value="relative">';

    ed.settings = ed.defaultSettings();
    ed.settings.customFonts = [{ id: 'cf1', name: 'A', fileName: 'a.ttf', hash: 'h' }];
    ed.settings.tabSize = 8; // 偏离默认
    ed.showConfirmDialog = async () => true;
    ed.renderCustomFontSettings = () => {};
    await ed.resetSettings();
    assert.strictEqual(ed.settings.tabSize, 4, '应回到默认 tabSize');
    assert.strictEqual(ed.settings.customFonts.length, 1, '自定义字体应保留');
    assert.strictEqual(ed.settings.customFonts[0].id, 'cf1');
    assert.strictEqual(JSON.parse(w.localStorage.getItem('tizumark-settings')).tabSize, 4, '恢复默认立即落盘');
    assert.strictEqual(ed.cm.getOption('tabSize'), 4, '恢复默认立即生效');
  } finally { cleanup(w); }
});

test('settings: saveSettings→loadSettings 端到端一致（真往返）', async () => {
  const { w, ed } = await makeEditor();
  try {
    // 构造一份偏离默认的配置
    ed.settings = ed.defaultSettings();
    ed.settings.tabSize = 2;
    ed.settings.themeMode = 'dark';
    ed.settings.colorScheme = 'nord';
    ed.settings.maxWidth = 720;
    ed.settings.customFonts = [{ id: 'cf9', name: 'X', fileName: 'x.ttf', hash: 'h9' }];
    ed.saveSettings();

    // 模拟"重启"：清空内存对象，仅从 localStorage 重新载入
    ed.settings = null;
    const loaded = ed.loadSettings();

    assert.strictEqual(loaded.tabSize, 2, '保存的 tabSize 应原样取回');
    assert.strictEqual(loaded.themeMode, 'dark');
    assert.strictEqual(loaded.colorScheme, 'nord');
    assert.strictEqual(loaded.maxWidth, 720);
    assert.strictEqual(loaded.fontSize, 14, '未改动的字段应仍是默认');
    // customFonts 逐字段比较：JSON 往返后元素键序可能变化，deepStrictEqual 对键序敏感会误报
    assert.strictEqual(loaded.customFonts.length, 1, 'customFonts 应整组保留');
    assert.strictEqual(loaded.customFonts[0].id, 'cf9');
    assert.strictEqual(loaded.customFonts[0].name, 'X');
    assert.strictEqual(loaded.customFonts[0].fileName, 'x.ttf');
    assert.strictEqual(loaded.customFonts[0].hash, 'h9');
    // 持久层内容应与内存一致
    const stored = JSON.parse(w.localStorage.getItem('tizumark-settings'));
    assert.strictEqual(stored.tabSize, 2);
    assert.strictEqual(stored.maxWidth, 720);
  } finally { cleanup(w); }
});

// ====== 应用式语义（2026-08-04 定稿）：面板内改动只改内存与控件显示，
// 点「应用」生效并落盘（面板保持打开）、点「保存」生效+落盘+关闭、取消/× 直接回滚 ======

test('settings: 面板外 saveSettings 正常落盘', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.settings = ed.defaultSettings();
    ed.settings.tabSize = 8;
    ed.saveSettings();
    const stored = JSON.parse(w.localStorage.getItem('tizumark-settings'));
    assert.strictEqual(stored.tabSize, 8, '未打开面板时保存应立即写入');
  } finally { cleanup(w); }
});

test('settings: 面板内修改不生效不落盘，点保存才生效并落盘', async () => {
  const { w, ed } = await makeEditor();
  try {
    assert.strictEqual(w.localStorage.getItem('tizumark-settings'), null, '初始无持久化设置');
    ed.showSettings();
    assert.ok(!w.document.getElementById('settings-dialog').classList.contains('hidden'), '面板应打开');

    const sel = w.document.getElementById('set-tab-size');
    sel.value = '2';
    sel.dispatchEvent(new w.Event('change'));
    assert.strictEqual(ed.settings.tabSize, 2, '内存设置已更新');
    assert.strictEqual(ed.cm.getOption('tabSize'), 4, '未点应用/保存前编辑器不生效');
    assert.strictEqual(w.localStorage.getItem('tizumark-settings'), null, '未点保存不落盘');

    w.document.getElementById('settings-save-btn').dispatchEvent(new w.Event('click'));
    await delay(60); // rAF 让帧 + applySettings + 落盘 + 关闭
    assert.strictEqual(ed.cm.getOption('tabSize'), 2, '保存后编辑器生效');
    const stored = JSON.parse(w.localStorage.getItem('tizumark-settings'));
    assert.strictEqual(stored.tabSize, 2, '保存后落盘');
    assert.ok(w.document.getElementById('settings-dialog').classList.contains('hidden'), '保存后关闭面板');
  } finally { cleanup(w); }
});

test('settings: 点「应用」生效并落盘，面板保持打开', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.showSettings();
    const sel = w.document.getElementById('set-tab-size');
    sel.value = '2';
    sel.dispatchEvent(new w.Event('change'));
    assert.strictEqual(ed.cm.getOption('tabSize'), 4, '应用前不生效');

    w.document.getElementById('settings-apply-btn').dispatchEvent(new w.Event('click'));
    await delay(50); // applySettings + 落盘
    assert.strictEqual(ed.cm.getOption('tabSize'), 2, '应用后编辑器生效');
    assert.strictEqual(JSON.parse(w.localStorage.getItem('tizumark-settings')).tabSize, 2, '应用后落盘');
    assert.ok(!w.document.getElementById('settings-dialog').classList.contains('hidden'), '应用后面板保持打开');
  } finally { cleanup(w); }
});

test('settings: 应用后继续修改再取消，回滚到最近一次应用的状态', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.showSettings();
    const sel = w.document.getElementById('set-tab-size');
    // 第一次改动并应用（生效 2）
    sel.value = '2';
    sel.dispatchEvent(new w.Event('change'));
    w.document.getElementById('settings-apply-btn').dispatchEvent(new w.Event('click'));
    await delay(50);
    assert.strictEqual(ed.cm.getOption('tabSize'), 2, '应用后为 2');

    // 第二次改动（8）不应用直接取消 → 应回滚到应用后的 2，而非打开面板时的 4
    sel.value = '8';
    sel.dispatchEvent(new w.Event('change'));
    assert.strictEqual(ed.settings.tabSize, 8, '内存为 8');
    w.document.getElementById('settings-cancel-btn').dispatchEvent(new w.Event('click'));
    assert.strictEqual(ed.settings.tabSize, 2, '取消回滚到最近一次应用的值 2');
    assert.strictEqual(ed.cm.getOption('tabSize'), 2, '编辑器仍为 2');
    assert.strictEqual(JSON.parse(w.localStorage.getItem('tizumark-settings')).tabSize, 2, '持久层为 2');
  } finally { cleanup(w); }
});

test('settings: 点取消恢复打开前的设置与控件显示，且不落盘', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.showSettings();
    const sel = w.document.getElementById('set-tab-size');
    sel.value = '2';
    sel.dispatchEvent(new w.Event('change'));
    assert.strictEqual(ed.settings.tabSize, 2, '改动已进内存');
    assert.strictEqual(w.localStorage.getItem('tizumark-settings'), null);

    w.document.getElementById('settings-cancel-btn').dispatchEvent(new w.Event('click'));
    assert.strictEqual(ed.settings.tabSize, 4, '取消后内存恢复默认 4');
    assert.strictEqual(ed.cm.getOption('tabSize'), 4, '编辑器从未被改动过（应用式）');
    assert.strictEqual(w.document.getElementById('set-tab-size').value, '4', '取消后控件显示恢复');
    assert.strictEqual(w.localStorage.getItem('tizumark-settings'), null, '取消全程不落盘');
    assert.ok(w.document.getElementById('settings-dialog').classList.contains('hidden'), '取消后关闭面板');
  } finally { cleanup(w); }
});

test('settings: 点 X 关闭等同取消，恢复打开前的设置', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.showSettings();
    const sel = w.document.getElementById('set-tab-size');
    sel.value = '2';
    sel.dispatchEvent(new w.Event('change'));
    assert.strictEqual(ed.settings.tabSize, 2);

    w.document.getElementById('settings-close-x').dispatchEvent(new w.Event('click'));
    assert.strictEqual(ed.settings.tabSize, 4, 'X 关闭后内存恢复默认 4');
    assert.strictEqual(w.localStorage.getItem('tizumark-settings'), null, 'X 关闭不落盘');
    assert.ok(w.document.getElementById('settings-dialog').classList.contains('hidden'));
  } finally { cleanup(w); }
});

test('settings: 点击遮罩层不关闭设置框（只能取消或 × 关闭）', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.showSettings();
    const overlay = w.document.getElementById('settings-dialog');
    overlay.dispatchEvent(new w.Event('click'));
    assert.ok(!overlay.classList.contains('hidden'), '点击遮罩不应关闭设置框');
  } finally { cleanup(w); }
});

test('settings: 面板内恢复默认立即生效并落盘，取消回滚到恢复默认后的状态', async () => {
  const { w, ed } = await makeEditor();
  try {
    // 预置默认设置，再把内存 tabSize 调成 8，模拟"打开面板前用户设置过 8"
    ed.settings = ed.defaultSettings();
    ed.settings.tabSize = 8;
    ed.saveSettings();
    ed.showSettings();

    // 面板内点「恢复默认」→ 立即生效并落盘（等同自动应用一次）
    ed.showConfirmDialog = async () => true;
    ed.renderCustomFontSettings = () => {};
    await ed.resetSettings();
    assert.strictEqual(ed.settings.tabSize, 4, '恢复默认后内存为 4');
    assert.strictEqual(ed.cm.getOption('tabSize'), 4, '恢复默认立即生效');
    assert.strictEqual(JSON.parse(w.localStorage.getItem('tizumark-settings')).tabSize, 4, '恢复默认立即落盘');

    // 此时点取消 → 回滚到最近一次应用/保存后的状态（恢复默认后的 4），而非打开面板前的 8
    w.document.getElementById('settings-cancel-btn').dispatchEvent(new w.Event('click'));
    assert.strictEqual(ed.settings.tabSize, 4, '取消后回到恢复默认后的 4');
    assert.strictEqual(JSON.parse(w.localStorage.getItem('tizumark-settings')).tabSize, 4, '持久层仍为 4');
  } finally { cleanup(w); }
});

// ====== 应用/保存的 loading toast（2026-08-04）：仅应用/保存触发重渲染时显示 ======

test('settings: 点「应用」重渲染期间显示 loading toast，完成后隐藏', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.showSettings();
    const loadingToast = () => w.document.querySelector('#toast-container .settings-loading-toast');
    assert.ok(!loadingToast(), '初始无 loading toast');
    const origApply = ed.applySettings.bind(ed);
    ed.applySettings = async () => {
      await new Promise(r => setTimeout(r, 100)); // 模拟真实重渲染耗时（mermaid 分批渲染）
      await origApply();
    };
    const sel = w.document.getElementById('set-theme-mode');
    sel.value = 'dark';
    sel.dispatchEvent(new w.Event('change')); // 应用式：change 只改内存，不触发重渲染
    assert.ok(!loadingToast(), 'change 不触发重渲染');

    w.document.getElementById('settings-apply-btn').dispatchEvent(new w.Event('click'));
    await delay(30); // 应用按钮先等 rAF 让帧（与保存按钮一致），之后 applyPendingSettings 开始
    assert.ok(loadingToast(), '应用时显示 loading toast');
    await delay(150); // 等 100ms 模拟耗时结束
    assert.ok(!loadingToast(), '完成后隐藏');
  } finally { cleanup(w); }
});

test('settings: 点应用按钮进入 loading 态，应用落盘后恢复，面板保持打开', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.showSettings();
    const applyBtn = w.document.getElementById('settings-apply-btn');
    const sel = w.document.getElementById('set-tab-size');
    sel.value = '2';
    sel.dispatchEvent(new w.Event('change'));

    applyBtn.dispatchEvent(new w.Event('click'));
    assert.ok(applyBtn.disabled, '应用中按钮应禁用');
    assert.ok(applyBtn.classList.contains('is-loading'), '应用中显示按钮 loading');
    await delay(60); // rAF 让帧 + applySettings + 落盘

    assert.ok(!applyBtn.disabled, '应用完成后按钮恢复可用');
    assert.ok(!applyBtn.classList.contains('is-loading'), '应用完成后移除按钮 loading');
    assert.strictEqual(applyBtn.textContent, ed.t('apply'), '应用完成后按钮文案复原');
    const stored = JSON.parse(w.localStorage.getItem('tizumark-settings'));
    assert.strictEqual(stored.tabSize, 2, '应用已落盘');
    assert.ok(!w.document.getElementById('settings-dialog').classList.contains('hidden'), '应用后面板保持打开');
  } finally { cleanup(w); }
});

test('settings: 点「保存」重渲染期间显示 loading toast，完成后关闭', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.showSettings();
    const loadingToast = () => w.document.querySelector('#toast-container .settings-loading-toast');
    const origApply = ed.applySettings.bind(ed);
    ed.applySettings = async () => {
      await new Promise(r => setTimeout(r, 100)); // 模拟重渲染耗时
      await origApply();
    };
    const sel = w.document.getElementById('set-code-wrap');
    sel.checked = true;
    sel.dispatchEvent(new w.Event('change'));
    assert.ok(!loadingToast(), 'change 不触发重渲染');

    w.document.getElementById('settings-save-btn').dispatchEvent(new w.Event('click'));
    await delay(30); // 保存按钮先等 rAF 让帧，之后 applyPendingSettings 开始
    assert.ok(loadingToast(), '保存时显示 loading toast');
    await delay(180); // 100ms 模拟耗时 + 关闭
    assert.ok(!loadingToast(), '完成后隐藏');
    assert.ok(w.document.getElementById('settings-dialog').classList.contains('hidden'), '保存后关闭');
  } finally { cleanup(w); }
});

test('settings: 点保存按钮进入 loading 态，应用落盘后恢复并关闭', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.showSettings();
    const saveBtn = w.document.getElementById('settings-save-btn');
    const sel = w.document.getElementById('set-tab-size');
    sel.value = '2';
    sel.dispatchEvent(new w.Event('change'));

    saveBtn.dispatchEvent(new w.Event('click'));
    assert.ok(saveBtn.disabled, '保存中按钮应禁用');
    assert.ok(saveBtn.classList.contains('is-loading'), '保存中显示按钮 loading');
    await delay(60); // rAF 让帧 + applySettings + 落盘 + 关面板

    assert.ok(!saveBtn.disabled, '保存完成后按钮恢复可用');
    assert.ok(!saveBtn.classList.contains('is-loading'), '保存完成后移除按钮 loading');
    assert.strictEqual(saveBtn.textContent, ed.t('save'), '保存完成后按钮文案复原');
    const stored = JSON.parse(w.localStorage.getItem('tizumark-settings'));
    assert.strictEqual(stored.tabSize, 2, '保存已落盘');
    assert.ok(w.document.getElementById('settings-dialog').classList.contains('hidden'), '保存后关闭面板');
  } finally { cleanup(w); }
});

// ====== 取消恢复：自定义字体/提示文案等独立渲染控件（2026-08-04） ======

test('settings: 自定义字体选择后取消，下拉框恢复原值', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.settings.customFonts = [
      { id: 'cfA', name: 'Font A', fileName: 'a.ttf', hash: 'h1' },
      { id: 'cfB', name: 'Font B', fileName: 'b.ttf', hash: 'h2' },
    ];
    ed.settings.editorFont = 'cfA';
    ed.renderCustomFontSettings(); // 渲染选择器（初始选中 cfA）
    const sel = w.document.getElementById('set-editor-font');
    assert.strictEqual(sel.value, 'cfA', '初始选择 cfA');

    ed.showSettings();
    sel.value = 'cfB';
    sel.dispatchEvent(new w.Event('change'));
    assert.strictEqual(ed.settings.editorFont, 'cfB', '面板内改为 cfB');
    assert.strictEqual(sel.value, 'cfB', '下拉框显示 cfB');

    w.document.getElementById('settings-cancel-btn').dispatchEvent(new w.Event('click'));
    assert.strictEqual(ed.settings.editorFont, 'cfA', '取消后内存恢复 cfA');
    assert.strictEqual(sel.value, 'cfA', '取消后下拉框恢复 cfA');
  } finally { cleanup(w); }
});

test('settings: 图片路径模式切换后取消，提示文案恢复', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.showSettings();
    const hint = w.document.getElementById('setting-image-asset-path-hint-text');
    const radio = w.document.querySelector('#settings-image-asset-path-mode input[value="absolute"]');
    assert.ok(radio, 'absolute 单选应存在');
    const initialText = hint.textContent;
    assert.ok(initialText.length > 0, '初始提示文案非空');

    radio.checked = true;
    radio.dispatchEvent(new w.Event('change'));
    assert.strictEqual(ed.settings.imageAssetPathMode, 'absolute', '面板内改为 absolute');
    assert.notStrictEqual(hint.textContent, initialText, '提示文案已切换');

    w.document.getElementById('settings-cancel-btn').dispatchEvent(new w.Event('click'));
    assert.strictEqual(ed.settings.imageAssetPathMode, 'relative', '取消后模式恢复 relative');
    assert.strictEqual(hint.textContent, initialText, '取消后提示文案恢复');
  } finally { cleanup(w); }
});

// ====== 应用式：滑块/主题等重量级设置不实时生效（2026-08-04） ======

test('settings: 字号滑块拖动只更新数值，应用后才改编辑器字号', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.showSettings();
    const slider = w.document.getElementById('set-font-size');
    slider.value = '18';
    slider.dispatchEvent(new w.Event('input'));
    assert.strictEqual(w.document.getElementById('font-size-label').textContent, '18px', 'label 实时更新');
    assert.strictEqual(ed.cm.getWrapperElement().style.fontSize, '14px', '编辑器字号未变（初始 14）');
    slider.dispatchEvent(new w.Event('change'));
    assert.strictEqual(ed.settings.fontSize, 18, '内存已更新');
    assert.strictEqual(ed.cm.getWrapperElement().style.fontSize, '14px', '应用前编辑器仍 14');

    w.document.getElementById('settings-apply-btn').dispatchEvent(new w.Event('click'));
    await delay(50);
    assert.strictEqual(ed.cm.getWrapperElement().style.fontSize, '18px', '应用后编辑器字号 18');
    assert.strictEqual(JSON.parse(w.localStorage.getItem('tizumark-settings')).fontSize, 18, '应用后落盘');
  } finally { cleanup(w); }
});

test('settings: 主题/配色 change 不触发重渲染，应用后才生效', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.showSettings();
    let themeApplyCount = 0;
    const orig = ed.applyThemeMode.bind(ed);
    ed.applyThemeMode = async () => { themeApplyCount++; await orig(); };

    const sel = w.document.getElementById('set-theme-mode');
    sel.value = 'dark';
    sel.dispatchEvent(new w.Event('change'));
    sel.value = 'light';
    sel.dispatchEvent(new w.Event('change'));
    assert.strictEqual(themeApplyCount, 0, '连续切换 change 不触发重渲染');
    assert.strictEqual(ed.settings.themeMode, 'light', '内存为最后值');
    assert.strictEqual(w.document.documentElement.getAttribute('data-theme'), 'light', '界面主题未变（初始 light）');

    w.document.getElementById('settings-apply-btn').dispatchEvent(new w.Event('click'));
    await delay(50);
    assert.strictEqual(themeApplyCount, 1, '应用只重渲染一次');
    assert.strictEqual(w.document.documentElement.getAttribute('data-theme'), 'light', 'light 仍是 light（dark 被覆盖）');
  } finally { cleanup(w); }
});

// ====== en 模式设置对话框 i18n 完整性（2026-08-04 回归） ======

test('settings: 切换英文后设置对话框无残留中文（除字体预览样例）', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.settings.language = 'en';
    ed.applyLanguage();
    ed.showSettings();

    const dlg = w.document.getElementById('settings-dialog');
    assert.ok(dlg, '设置对话框存在');
    // 标题与 section 标题
    assert.strictEqual(w.document.getElementById('settings-title').textContent, 'Settings');
    const sections = [...dlg.querySelectorAll('.settings-section h3')].map(h => h.textContent);
    assert.deepStrictEqual(sections, ['Basic', 'Editor', 'Preview', 'Behavior', 'Custom Fonts']);
    // 语言 / 主题 / 关闭行为 / 视图 / Tab / 最大宽度 options
    const lang = w.document.getElementById('set-language');
    assert.deepStrictEqual([...lang.options].map(o => o.text), ['Chinese', 'English']);
    const theme = w.document.getElementById('set-theme-mode');
    assert.deepStrictEqual([...theme.options].map(o => o.text), ['Light', 'Dark', 'Follow System']);
    const close = w.document.getElementById('set-close-action');
    assert.deepStrictEqual([...close.options].map(o => o.text), ['Ask every time', 'Quit app', 'Minimize to tray']);
    const view = w.document.getElementById('set-default-view');
    assert.deepStrictEqual([...view.options].map(o => o.text), ['Preview', 'Edit']);
    const tab = w.document.getElementById('set-tab-size');
    assert.deepStrictEqual([...tab.options].map(o => o.text), ['2 spaces', '4 spaces', '8 spaces']);
    const mw = w.document.getElementById('set-max-width');
    assert.strictEqual(mw.options[0].text, 'Unlimited');
    // 遍历文本节点：除 font-preview-sample 外不得含中文
    const leftovers = [];
    const walker = w.document.createTreeWalker(dlg, w.NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      const t = node.textContent.trim();
      if (!/[\u4e00-\u9fff]/.test(t)) continue;
      if (node.parentElement.closest('#font-preview-sample')) continue; // 字体预览样例刻意中文
      leftovers.push(t.slice(0, 40));
    }
    assert.deepStrictEqual(leftovers, [], '设置对话框不应有残留中文，实际: ' + leftovers.join(' | '));
  } finally { cleanup(w); }
});

// ====== 添加字体：立即保存列表，不自动切换选择项、不立即应用（2026-08-06） ======

// 构造 addFontFiles 所需 Tauri 运行时：dialogOpen 返回字体文件，
// appDataDir/ensureDir/fetchImageAsBase64/writeBinaryFile 均可用。
function mockFontImportEnv(w, files) {
  w.TauriApi.dialogOpen = async () => files;
  w.TauriApi.appDataDir = async () => 'C:/mock/appdata';
  w.TauriApi.ensureDir = async () => ({});
  w.TauriApi.fetchImageAsBase64 = async ({ url }) =>
    Buffer.from('font-bytes:' + url).toString('base64');
  w.TauriApi.writeBinaryFile = async () => ({});
  if (!w.requestAnimationFrame) {
    w.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  }
}

test('settings: 添加字体只入列表并立即落盘，不自动切换编辑器/预览字体选择，也不应用', async () => {
  const { w, ed } = await makeEditor();
  try {
    // 预置当前选择项，验证添加后不被改写
    ed.settings.customFonts = [{ id: 'cfOld', name: 'Old Font', fileName: 'old.ttf', hash: 'h0' }];
    ed.settings.editorFont = 'cfOld';
    ed.settings.previewFont = 'cfOld';
    mockFontImportEnv(w, ['C:/fonts/NewFont.ttf']);

    await ed.addFontFiles();

    assert.strictEqual(ed.settings.customFonts.length, 2, 'customFonts 应新增一条');
    const added = ed.settings.customFonts.find(f => f.name === 'NewFont.ttf');
    assert.ok(added, '应含新字体 NewFont.ttf');
    assert.ok(added.id && added.fileName, '新字体应生成 id 与 fileName');

    // 不自动切换选择项
    assert.strictEqual(ed.settings.editorFont, 'cfOld', 'editorFont 应保持原选择');
    assert.strictEqual(ed.settings.previewFont, 'cfOld', 'previewFont 应保持原选择');

    // 不立即应用：CM/预览 fontFamily 不应变为 tizumark-custom-*
    assert.ok(!ed.cm.getWrapperElement().style.fontFamily.includes('tizumark-custom-cf'),
      '添加后不应自动应用字体到编辑器，实际: ' + ed.cm.getWrapperElement().style.fontFamily);
    assert.ok(!ed.preview.style.fontFamily.includes('tizumark-custom-cf'),
      '添加后不应自动应用字体到预览，实际: ' + ed.preview.style.fontFamily);

    // 字体列表已立即落盘
    ed.saveSettings(); // 先确保 localStorage 已有完整设置记录（tabSize=4 等）
    ed.settings.tabSize = 8; // 面板内未应用的改动（内存）
    await ed.addFontFiles();

    const stored = JSON.parse(w.localStorage.getItem('tizumark-settings'));
    assert.strictEqual(stored.customFonts.length, 2, 'customFonts 应立即写入 localStorage');
    assert.strictEqual(stored.customFonts.find(f => f.name === 'NewFont.ttf')?.fileName, added.fileName);
    // 未应用的其他设置不应被 addFontFiles 落盘改动
    assert.strictEqual(stored.tabSize, 4, '未应用的其他设置不应被 addFontFiles 落盘');
  } finally { cleanup(w); }
});

test('settings: 添加字体后取消面板，字体列表保留（快照已同步）', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.settings.customFonts = [];
    ed.settings.editorFont = '';
    ed.settings.previewFont = '';
    mockFontImportEnv(w, ['C:/fonts/Persist.ttf']);

    ed.showSettings(); // 打开面板会生成 _settingsSnapshot
    await ed.addFontFiles();
    assert.strictEqual(ed.settings.customFonts.length, 1, '添加后列表 1 条');

    // 取消面板：字体列表不回滚（快照已同步），选择项保持（本就未变）
    w.document.getElementById('settings-cancel-btn').dispatchEvent(new w.Event('click'));
    assert.strictEqual(ed.settings.customFonts.length, 1, '取消后字体列表应保留');
    assert.strictEqual(ed.settings.customFonts[0].name, 'Persist.ttf');
    assert.strictEqual(ed.settings.editorFont, '', '选择项仍为空');
    assert.strictEqual(ed.settings.previewFont, '', '选择项仍为空');
  } finally { cleanup(w); }
});

test('settings: 添加字体后用户手动选择并应用/保存才生效落盘', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.settings.customFonts = [];
    mockFontImportEnv(w, ['C:/fonts/Chosen.ttf']);
    await ed.addFontFiles();
    const added = ed.settings.customFonts[0];

    // 用户手动把选择项改为新字体（模拟下拉框 change）
    ed.settings.editorFont = added.id;
    ed.settings.previewFont = added.id;
    // 点「应用」→ applyPendingSettings → applySettings + saveSettings 全量落盘
    w.document.getElementById('settings-apply-btn').dispatchEvent(new w.Event('click'));
    await delay(60);

    const stored = JSON.parse(w.localStorage.getItem('tizumark-settings'));
    assert.strictEqual(stored.editorFont, added.id, '应用后 editorFont 落盘为新字体');
    assert.strictEqual(stored.previewFont, added.id, '应用后 previewFont 落盘为新字体');
    assert.strictEqual(stored.customFonts.length, 1);
  } finally { cleanup(w); }
});
