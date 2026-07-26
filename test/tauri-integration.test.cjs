// Tauri 集成路径测试：drag-drop 文件拖放 / file-open 二次实例 / EULA / 窗口控制 /
// 更新检查 / exportHTML / 图片粘贴（assets 与 base64 两种模式）
const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, delay, waitForEditor } = require('./helpers/app-env.cjs');

async function makeEnv(invokeImpl) {
  const { w, tauriListeners } = await buildEnv({ captureInitErr: true, invokeImpl });
  const ed = await waitForEditor(w);
  return { w, ed, listeners: tauriListeners };
}

function fire(listeners, name, payload) {
  const cbs = listeners[name] || [];
  return Promise.all(cbs.map((cb) => cb({ payload })));
}

test('tauri: drag-drop 拖入文件打开新标签', async () => {
  const { w, ed, listeners } = await makeEnv(async (cmd, args) => {
    if (cmd === 'read_file') return '# 拖入的文档';
    if (cmd === 'get_cli_args') return [];
    if (cmd === 'app_data_dir') return 'C:/tmp/tizumark-data';
    return undefined;
  });
  try {
    assert.ok(listeners['tauri://drag-drop'], '应注册 tauri://drag-drop 监听');
    const before = ed.tabs.length;
    await fire(listeners, 'tauri://drag-drop', { paths: ['C:/t/dnd.md'] });
    await delay(50);
    assert.strictEqual(ed.tabs.length, before + 1, '应新增标签');
    const tab = ed.tabs.find((t) => t.filePath === 'C:/t/dnd.md');
    assert.ok(tab, '标签路径应为拖入文件');
    assert.strictEqual(tab.content, '# 拖入的文档');
  } finally { cleanup(w); }
});

test('tauri: drag-enter/leave 切换拖放遮罩', async () => {
  const { w, ed, listeners } = await makeEnv();
  try {
    const app = w.document.querySelector('.app') || w.document.getElementById('app');
    const overlay = w.document.getElementById('drag-overlay');
    assert.ok(overlay, '应有拖放遮罩元素');
    await fire(listeners, 'tauri://drag-over', { paths: ['C:/x.md'] });
    assert.ok(!overlay.classList.contains('hidden'), '拖入时遮罩应显示');
    await fire(listeners, 'tauri://drag-leave', {});
    assert.ok(overlay.classList.contains('hidden'), '拖离时遮罩应隐藏');
  } finally { cleanup(w); }
});

test('tauri: file-open 事件（二次实例传参）打开文件并跳过 - 开头参数', async () => {
  const reads = [];
  const { w, ed, listeners } = await makeEnv(async (cmd, args) => {
    if (cmd === 'read_file') { reads.push(args.path); return '内容'; }
    if (cmd === 'get_cli_args') return [];
    if (cmd === 'app_data_dir') return 'C:/tmp/tizumark-data';
    return undefined;
  });
  try {
    assert.ok(listeners['file-open'], '应注册 file-open 监听');
    ed.applyViewMode = () => {};
    await fire(listeners, 'file-open', ['-flag', 'C:/t/second.md']);
    await delay(50);
    assert.ok(!reads.includes('-flag'), '- 开头参数应跳过');
    assert.ok(ed.tabs.some((t) => t.filePath === 'C:/t/second.md'), '应打开传入文件');
  } finally { cleanup(w); }
});

test('tauri: EULA 已接受时对话框隐藏且初始化继续', async () => {
  const { w, ed } = await makeEnv();
  try {
    const dlg = w.document.getElementById('eula-dialog');
    assert.ok(dlg, '应有 EULA 对话框元素');
    assert.ok(dlg.classList.contains('hidden'), '已接受 EULA 应隐藏对话框');
    assert.ok(ed, '编辑器应完成初始化');
    assert.strictEqual(w.localStorage.getItem('tizumark-eula-accepted'), 'true');
  } finally { cleanup(w); }
});

test('tauri: 窗口控制 minimize/toggleMaximize 调用对应窗口 API', async () => {
  const { w, ed } = await makeEnv();
  try {
    const calls = [];
    let maximized = false;
    w.__TAURI__.window.getCurrentWindow = () => ({
      minimize: async () => calls.push('minimize'),
      maximize: async () => { calls.push('maximize'); maximized = true; },
      unmaximize: async () => { calls.push('unmaximize'); maximized = false; },
      isMaximized: async () => maximized,
    });
    await ed.minimizeWindow();
    assert.deepStrictEqual(calls, ['minimize']);
    await ed.toggleMaximize();
    assert.ok(calls.includes('maximize'), '未最大化时应调用 maximize');
    await ed.toggleMaximize();
    assert.ok(calls.includes('unmaximize'), '已最大化时应调用 unmaximize');
  } finally { cleanup(w); }
});

test('tauri: checkUpdate 无更新显示最新 / 有更新填充版本与说明', async () => {
  let updateResult = null;
  const { w, ed } = await makeEnv(async (cmd) => {
    if (cmd === 'plugin:updater|check') return updateResult;
    if (cmd === 'get_cli_args') return [];
    if (cmd === 'app_data_dir') return 'C:/tmp/tizumark-data';
    return undefined;
  });
  try {
    // 无更新
    await ed.checkUpdate(true);
    assert.strictEqual(ed.pendingUpdate ?? null, null, '无更新不应设置 pendingUpdate');
    // 有更新
    updateResult = { version: '9.9.9', body: '修复了一些问题', rid: 42 };
    await ed.checkUpdate(true);
    assert.strictEqual(w.document.getElementById('update-new-version').textContent, '9.9.9');
    assert.strictEqual(ed.pendingUpdate.version, '9.9.9');
    assert.strictEqual(ed.pendingUpdateRid, 42);
    const btn = w.document.getElementById('update-action');
    assert.strictEqual(btn.dataset.state, 'download', '按钮应处于下载状态');
  } finally { cleanup(w); }
});

test('tauri: exportHTML 组装完整 HTML 并写文件', async () => {
  const calls = [];
  const { w, ed } = await makeEnv(async (cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === 'plugin:dialog|save') return 'C:/out/doc.html';
    if (cmd === 'get_cli_args') return [];
    if (cmd === 'app_data_dir') return 'C:/tmp/tizumark-data';
    return undefined;
  });
  try {
    w.fetch = async () => ({ ok: false }); // jsdom 无 fetch，样式内联步骤降级
    await ed.addTab('doc.md', '# 导出标题\n\n正文', 'C:/out/doc.md');
    ed.preview.innerHTML = '<h1>导出标题</h1><p>正文</p><button class="copy-btn">复制</button>';
    await ed.exportHTML();
    const write = calls.find((c) => c.cmd === 'write_file');
    assert.ok(write, '应调用 write_file');
    assert.strictEqual(write.args.path, 'C:/out/doc.html');
    assert.ok(write.args.content.startsWith('<!DOCTYPE html>'), '应为完整 HTML 文档');
    assert.ok(write.args.content.includes('导出标题'), '应包含预览内容');
    assert.ok(!write.args.content.includes('copy-btn'), '复制按钮应被剔除');
    assert.ok(write.args.content.includes('<title>doc.md</title>'), '标题应为文件名');
  } finally { cleanup(w); }
});

test('tauri: exportHTML 用户取消对话框时不写文件', async () => {
  const calls = [];
  const { w, ed } = await makeEnv(async (cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === 'plugin:dialog|save') return null;
    if (cmd === 'get_cli_args') return [];
    if (cmd === 'app_data_dir') return 'C:/tmp/tizumark-data';
    return undefined;
  });
  try {
    w.fetch = async () => ({ ok: false });
    await ed.exportHTML();
    assert.ok(!calls.some((c) => c.cmd === 'write_file'), '取消后不应写文件');
  } finally { cleanup(w); }
});

test('tauri: 粘贴图片 assets 模式保存到附件目录并插入 img 标签', async () => {
  const calls = [];
  const { w, ed } = await makeEnv(async (cmd, args) => {
    calls.push({ cmd, args });
    if (cmd === 'save_image_to_assets') return { filename: 'img_001.png', width: 32, height: 16 };
    if (cmd === 'get_cli_args') return [];
    if (cmd === 'app_data_dir') return 'C:/tmp/tizumark-data';
    return undefined;
  });
  try {
    await ed.addTab('doc.md', '', 'C:/notes/doc.md');
    ed.settings.imageInsertMode = 'assets';
    const file = {
      type: 'image/png',
      arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer,
    };
    await ed.handlePasteImage(file);
    const save = calls.find((c) => c.cmd === 'save_image_to_assets');
    assert.ok(save, '应调用 save_image_to_assets');
    // app.js 在 jsdom realm 中执行，数组原型跨 realm，需按值比较
    assert.strictEqual(JSON.stringify(save.args.bytes), '[137,80,78,71]', '字节应透传');
    assert.strictEqual(save.args.ext, 'png');
    assert.ok(save.args.assetsDir.includes('C:/notes'), '附件目录应基于文档目录');
    const doc = ed.cm.getValue();
    assert.ok(doc.includes('<img src="assets/img_001.png" width="32" height="16"'), '应插入带尺寸的 img 标签');
  } finally { cleanup(w); }
});

test('tauri: 粘贴图片 assets 模式下未保存文档提示先保存', async () => {
  const { w, ed } = await makeEnv();
  try {
    const toasts = [];
    ed.showToast = (m) => toasts.push(m);
    ed.settings.imageInsertMode = 'assets';
    // 默认标签无 filePath
    await ed.handlePasteImage({ type: 'image/png', arrayBuffer: async () => new ArrayBuffer(0) });
    assert.ok(toasts.length > 0, '应提示需先保存');
    assert.strictEqual(ed.cm.getValue(), '', '不应插入任何内容');
  } finally { cleanup(w); }
});

test('tauri: 粘贴图片 base64 模式插入 data URL', async () => {
  const { w, ed } = await makeEnv();
  try {
    ed.settings.imageInsertMode = 'base64';
    const file = new w.Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    await ed.handlePasteImage(file);
    const doc = ed.cm.getValue();
    assert.ok(/!\[image\]\(data:image\/png;base64,[A-Za-z0-9+/=]+\)/.test(doc), '应插入 base64 data URL 图片');
  } finally { cleanup(w); }
});
