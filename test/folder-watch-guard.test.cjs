// 文件夹监听异常兜底测试：Rust watch_folder 回调 panic（catch_unwind 兜住、监听不中断）
// → emit folder-watch-error → 前端弹确认框（重新监听 / 继续使用）。
// 验证：弹窗出现且带 panic 原因 / 确认触发重新监听 / 取消不重挂 / 防重入。
const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, waitForEditor, delay } = require('./helpers/app-env.cjs');

async function makeEditor() {
  const calls = [];
  const { w, tauriListeners } = await buildEnv((cmd) => {
    calls.push(cmd);
    if (cmd === 'get_cli_args') return [];
    return undefined;
  });
  const ed = await waitForEditor(w);
  return { w, ed, calls, tauriListeners };
}

function fireWatchError(tauriListeners, payload) {
  const cbs = tauriListeners['folder-watch-error'];
  assert.ok(cbs && cbs.length >= 1, '应已注册 folder-watch-error 监听');
  return cbs[cbs.length - 1]({ payload });
}

test('watch 异常：弹窗出现且 message 带 panic 原因', async () => {
  const { w, ed, tauriListeners } = await makeEditor();
  try {
    await fireWatchError(tauriListeners, { message: 'boom' });
    await delay(20);
    const dialog = w.document.getElementById('confirm-dialog');
    assert.ok(!dialog.classList.contains('hidden'), '应弹出确认框');
    assert.ok(
      w.document.getElementById('confirm-dialog-title').textContent.includes(ed.t('folderWatchErrorTitle')),
      '标题应来自 i18n',
    );
    assert.ok(
      w.document.getElementById('confirm-dialog-message').textContent.includes('boom'),
      'message 应带 panic 原因',
    );
  } finally { cleanup(w); }
});

test('点击确认：重新监听并提示成功', async () => {
  const { w, ed, calls, tauriListeners } = await makeEditor();
  try {
    ed.workspaceFolder = 'C:/tmp/fake-dir';
    await fireWatchError(tauriListeners, { message: 'boom' });
    await delay(20);
    w.document.getElementById('confirm-dialog-confirm').click();
    await delay(80);
    assert.ok(w.document.getElementById('confirm-dialog').classList.contains('hidden'), '确认后弹窗应关闭');
    assert.ok(calls.includes('watch_folder'), '应重新调用 watch_folder');
    assert.ok(calls.includes('stop_watch'), '重新监听前应先 stopWatch');
    const toasts = w.document.querySelectorAll('#toast-container .toast');
    assert.ok(toasts.length >= 1, '应有成功提示 toast');
  } finally { cleanup(w); }
});

test('点击取消：不重新监听', async () => {
  const { w, ed, calls, tauriListeners } = await makeEditor();
  try {
    ed.workspaceFolder = 'C:/tmp/fake-dir';
    await fireWatchError(tauriListeners, { message: 'boom' });
    await delay(20);
    w.document.getElementById('confirm-dialog-cancel').click();
    await delay(20);
    assert.ok(w.document.getElementById('confirm-dialog').classList.contains('hidden'), '取消后弹窗应关闭');
    assert.ok(!calls.includes('watch_folder'), '取消后不应重新监听');
  } finally { cleanup(w); }
});

test('防重入：弹窗打开期间忽略后续事件', async () => {
  const { w, ed, tauriListeners } = await makeEditor();
  try {
    await fireWatchError(tauriListeners, { message: 'first' });
    await delay(20);
    assert.strictEqual(ed._folderWatchDialogOpen, true, '弹窗打开期间防重入标志应为 true');
    await fireWatchError(tauriListeners, { message: 'second' });
    await delay(20);
    const msg = w.document.getElementById('confirm-dialog-message').textContent;
    assert.ok(msg.includes('first'), '后续事件应被忽略（message 仍为首次内容）');
    assert.ok(!msg.includes('second'), '不应被第二次事件覆盖');
  } finally { cleanup(w); }
});
