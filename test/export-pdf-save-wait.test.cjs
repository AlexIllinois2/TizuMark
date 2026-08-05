// exportPDF：系统打印 + 确认框警示 回归测试
//
// 设计（2026-08-03 收窄版）：
//   ① 点击导出 → 弹"导出 PDF"确认框，含醒目警示文案（"文件较大时生成 PDF 耗时较长，耐心等待，
//      如果未生成完时打开 pdf 会提示文件损坏"）；
//   ② 用户点确认 → 直接走系统打印对话框（iframe + contentWindow.print()，文字可选中）；
//   ③ afterprint 一触发即收尾（清 iframe / 还原主窗口 title / 隐藏 overlay），不做落盘检测。
//   ④ 30s safetyTimer 兜底异常路径（iframe/print 全程未触发时）。
//
// 撤掉的旧实现（不再断言）：
//   - 应用内 TauriApi.dialogSave 取文件名
//   - TauriApi.fileMeta 轮询 + 写盘判定
//   - beforeprint / longGuard 撤销短兜底
//   - overlay 内 .pdf-loading-sub 副标题（路径）
const test = require('node:test');
const assert = require('node:assert');
const { withEditor, delay } = require('./helpers/app-env.cjs');

// 捕获 iframe + 拦截 30s safetyTimer（其他定时器放行真实执行）。
function installHarness(w) {
  const capturedIframes = [];
  const origCreateElement = w.document.createElement.bind(w.document);
  w.document.createElement = function (tag) {
    const el = origCreateElement(tag);
    if (String(tag).toLowerCase() === 'iframe') capturedIframes.push(el);
    return el;
  };

  const realSetTimeout = w.setTimeout;
  const longTimers = new Map(); // 负数 id -> 回调
  let nextId = -1;
  w.setTimeout = function (fn, ms, ...args) {
    if (ms === 30000) { const id = nextId--; longTimers.set(id, fn); return id; }
    return realSetTimeout.call(this, fn, ms, ...args);
  };
  const realClearTimeout = w.clearTimeout;
  w.clearTimeout = function (id) {
    if (typeof id === 'number' && id < 0) { longTimers.delete(id); return undefined; }
    return realClearTimeout.call(this, id);
  };

  return {
    capturedIframes,
    longTimers,
    fireLongTimers() {
      for (const fn of Array.from(longTimers.values())) fn();
    },
    restore() {
      w.document.createElement = origCreateElement;
      w.setTimeout = realSetTimeout;
      w.clearTimeout = realClearTimeout;
    },
    fireAfterprint(iframe) {
      iframe.contentWindow.dispatchEvent(new w.Event('afterprint'));
    },
  };
}

test('exportPDF: 确认框展示醒目警示文案（不弹应用内保存对话框）', async () => {
  let dialogSaveCalled = 0;
  await withEditor({
    invokeImpl: (cmd) => { if (cmd === 'plugin:dialog|save') dialogSaveCalled += 1; return null; },
  }, async (w, ed) => {
    // 让确认框能拿到真实 showConfirmDialog（带 warning 走通）
    const h = installHarness(w);
    try {
      ed.activeTab.name = 'NOTE.md';
      const exportPromise = ed.exportPDF();
      // 让 exportPDF 走到 await showConfirmDialog 之前
      await delay(5);
      const warnEl = w.document.getElementById('confirm-dialog-warning');
      const warnTextEl = w.document.getElementById('confirm-dialog-warning-text');
      assert.ok(warnEl, '确认框应含 #confirm-dialog-warning 节点');
      assert.ok(!warnEl.classList.contains('hidden'), '传 warning 时警示块必须打开（无 hidden）');
      assert.ok(warnTextEl, '确认框应含 #confirm-dialog-warning-text 节点');
      assert.match(warnTextEl.textContent, /耐心等待/, '警示文案应含"耐心等待"');
      assert.match(warnTextEl.textContent, /未生成完/, '警示文案应含"未生成完"');
      assert.match(warnTextEl.textContent, /文件损坏/, '警示文案应含"文件损坏"');

      // 点确认 → 走系统打印（不再弹应用内保存框）
      w.document.getElementById('confirm-dialog-confirm').click();
      await exportPromise.catch(() => {});

      assert.strictEqual(dialogSaveCalled, 0, '不应再调用应用内保存对话框 plugin:dialog|save');
      assert.ok(h.capturedIframes.length >= 1, '确认后应创建打印 iframe');
    } finally {
      h.restore();
    }
  });
});

test('exportPDF: 用户点取消 → 不创建打印 iframe，不弹应用内保存框', async () => {
  let dialogSaveCalled = 0;
  await withEditor({
    invokeImpl: (cmd) => { if (cmd === 'plugin:dialog|save') dialogSaveCalled += 1; return null; },
  }, async (w, ed) => {
    const h = installHarness(w);
    try {
      ed.activeTab.name = 'NOTE.md';
      const exportPromise = ed.exportPDF();
      await delay(5);
      w.document.getElementById('confirm-dialog-cancel').click();
      await exportPromise.catch(() => {});

      assert.strictEqual(h.capturedIframes.length, 0, '用户取消时不应创建打印 iframe');
      assert.strictEqual(dialogSaveCalled, 0, '用户取消时不应再调 plugin:dialog|save');
    } finally {
      h.restore();
    }
  });
});

test('exportPDF: afterprint 后立即收尾（清 iframe / 还原 title / 隐藏 overlay，不再轮询）', async () => {
  let fileMetaCalled = 0;
  await withEditor({
    invokeImpl: (cmd) => {
      if (cmd === 'file_meta') { fileMetaCalled += 1; return null; }
      return null;
    },
  }, async (w, ed) => {
    ed.showConfirmDialog = async () => true; // 跳过确认
    const h = installHarness(w);
    try {
      ed.activeTab.name = 'NOTE.md';
      w.document.title = 'TizuMark';
      await ed.exportPDF().catch(() => {});

      const iframe = h.capturedIframes[0];
      assert.ok(iframe, '应创建打印 iframe');
      iframe.onload();

      // onload 后主窗口 title 应被临时覆盖
      assert.strictEqual(w.document.title, 'NOTE', 'onload 后主窗口 title 应被覆盖为去扩展名 md 文件名');

      // 触发 afterprint
      h.fireAfterprint(iframe);

      // 立即收尾
      assert.strictEqual(iframe.parentNode, null, 'afterprint 后 iframe 应已清理');
      assert.strictEqual(w.document.title, 'TizuMark', 'afterprint 后主窗口 title 应还原');
      assert.strictEqual(
        w.document.querySelector('.pdf-loading-spinner'),
        null,
        'afterprint 后 loading overlay 应立即隐藏',
      );
      // 关键：afterprint 后不应再调 file_meta（不再轮询）
      // 给一个微任务窗口，确保任何被排队的 poll 都已执行
      await delay(20);
      assert.strictEqual(fileMetaCalled, 0, '新方案不再调用 file_meta（不做落盘轮询）');
    } finally {
      h.restore();
    }
  });
});

test('exportPDF: 无 afterprint 触发时，30s 兜底收尾（清理 iframe + 还原 title）', async () => {
  await withEditor({}, async (w, ed) => {
    ed.showConfirmDialog = async () => true;
    const h = installHarness(w);
    try {
      ed.activeTab.name = '说明文档.md';
      w.document.title = 'TizuMark';
      await ed.exportPDF().catch(() => {});

      const iframe = h.capturedIframes[0];
      assert.ok(iframe && typeof iframe.onload === 'function');
      iframe.onload();
      assert.strictEqual(w.document.title, '说明文档', 'onload 后主窗口 title 应被覆盖');

      // 不触发 afterprint（模拟用户取消/系统未触发）。
      // 现在有 2 个 30s 兜底：exportPDF 的 safetyTimer（仅 hideOverlay）+ _exportViaSystemPrint
      // 的 watchdog（全量收尾）。任一触发都应让 overlay 隐藏 + iframe 清理 + title 还原。
      assert.ok(h.longTimers.size >= 1, '应排队至少 1 个 30s 兜底定时器');
      h.fireLongTimers();

      assert.strictEqual(iframe.parentNode, null, '30s 兜底应移除 iframe');
      assert.strictEqual(w.document.title, 'TizuMark', '30s 兜底应还原主窗口 title');
      assert.strictEqual(
        w.document.querySelector('.pdf-loading-spinner'),
        null,
        '30s 兜底应隐藏 overlay',
      );
    } finally {
      h.restore();
    }
  });
});

test('exportPDF: 系统打印仍走 iframe.print（PDF 文字可选中，非位图）', async () => {
  await withEditor({}, async (w, ed) => {
    ed.showConfirmDialog = async () => true;
    const h = installHarness(w);
    try {
      ed.activeTab.name = 'NOTE.md';
      w.editor.preview.innerHTML = '<p>可选中的正文</p>';
      await ed.exportPDF().catch(() => {});

      const iframe = h.capturedIframes[0];
      assert.ok(iframe, '应创建打印 iframe');
      // srcdoc 是真实 HTML 文本（矢量文字），不是 <img src="data:image/png">（位图 PDF）
      assert.match(iframe.srcdoc, /可选中的正文/, 'srcdoc 应含真实文字节点，保证 PDF 文字可选中');
      assert.ok(!/<img[^>]+data:image\/png;base64,[^"]{500,}/.test(iframe.srcdoc), 'srcdoc 不应是整页位图');

      let printed = 0;
      iframe.contentWindow.print = () => { printed += 1; };
      iframe.onload();
      assert.strictEqual(printed, 1, 'onload 后应调用系统打印 print()');
    } finally {
      h.restore();
    }
  });
});
