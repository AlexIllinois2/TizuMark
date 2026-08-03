// exportHTML / exportPDF 代码块换行回归测试
// 根因：
//   - HTML 导出内联 <style> 的 `pre` 规则只有 `overflow-x: auto`、没有 `white-space` 换行，
//     导致长代码行不换行、出现横向滚动条（用户："导出 html 时，代码框里没有换行了"）。
//   - PDF 导出 printCSS 块完全没有 `pre` 规则，代码块直接继承 styles.css 的默认
//     `white-space: pre`（不换行），打印时既有横向又有竖向滚动条，代码看不全
//     （用户："导出PDF，代码带有横向竖向滚动条，没法看全代码了"）。
// 修复：
//   - HTML：`pre` 加 `white-space: pre-wrap; word-wrap/word-break: break-word;` 并把
//     `overflow-x: auto` 改为 `overflow: visible`。
//   - PDF：printCSS 显式加 `.preview-content pre { white-space: pre-wrap !important; ... overflow: visible !important; }`。
const test = require('node:test');
const assert = require('node:assert');
const { withEditor } = require('./helpers/app-env.cjs');

test('exportHTML: 代码块 pre 换行且不出现横向滚动（无 overflow-x: auto）', async () => {
  const captured = {};
  await withEditor({ invokeImpl: (cmd, args) => {
    if (cmd === 'plugin:dialog|save') return '/tmp/out.html';
    if (cmd === 'write_file') { captured.content = args.content; return undefined; }
    return null;
  } }, async (w, ed) => {
    ed.activeTab.filePath = '/docs/note.md';
    w.editor.preview.innerHTML =
      '<pre><code>function longLineDemo() {\n  const x = "这是一行非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常长的代码，需要换行才能看全";\n}</code></pre>';

    await ed.exportHTML();

    assert.ok(captured.content, '应写出 HTML');
    const c = captured.content;
    // 只取 pre 规则的 CSS（避免误判 .mermaid-container / .math-display 上的 overflow-x: auto）
    const preRule = /pre\s*\{[^}]*\}/.exec(c);
    assert.ok(preRule, '导出 HTML 应含 pre { } 规则');
    const pre = preRule[0];
    // 换行规则应进入导出的 pre CSS
    assert.ok(pre.includes('white-space: pre-wrap'), '导出 HTML 的 pre 应包含 white-space: pre-wrap（换行）');
    // 不应再有导致横向滚动的 overflow-x: auto（作用于 pre 本身）
    assert.ok(!/overflow-x:\s*auto/.test(pre), '导出 HTML 的 pre 不应含 overflow-x: auto（否则仍横向滚动）');
    assert.ok(/overflow:\s*visible/.test(pre), '导出 HTML 的 pre 溢出应可见（不裁切）');
    // 关键：导出 HTML 必须有 .code-line 行结构 CSS，否则 code-block.js 输出的
    // <span class="code-line"> 默认 inline → 全部挤到一行（用户："格式都没了"）。
    assert.ok(/\.code-line\s*\{[^}]*display:\s*flex/.test(c), '导出 HTML 应让 .code-line display:flex（每行独占一行）');
    assert.ok(/\.code-line-text\s*\{[^}]*white-space:\s*pre-wrap/.test(c), '导出 HTML 应让 .code-line-text 换行');
    assert.ok(/\.code-scroll\s*\{[^}]*overflow:\s*visible/.test(c), '导出 HTML 的 .code-scroll 应可见（无滚动条）');
  });
});

test('exportHTML: code.hljs 背景透明（修复"内白外灰"——与 styles.css / printCSS 同源）', async () => {
  // 根因：导出 HTML 内联 hljs 主题，.hljs 元素带 background:#fff（specificity 0,1,0）。
  // 模板里 pre code{background:none} (0,0,2) 特异性不够，输给了 .hljs，白底盖在 pre 灰底上。
  // 修复：导出 HTML 模板内联 `pre code.hljs, pre code .hljs { background: transparent !important }`。
  // 与 styles.css 1615-1621、printCSS 6124-6127 形成"预览 / PDF / 导出 HTML"三处同源覆盖。
  const captured = {};
  await withEditor({ invokeImpl: (cmd, args) => {
    if (cmd === 'plugin:dialog|save') return '/tmp/out.html';
    if (cmd === 'write_file') { captured.content = args.content; return undefined; }
    return null;
  } }, async (w, ed) => {
    ed.activeTab.filePath = '/docs/note.md';
    w.editor.preview.innerHTML = '<pre><code class="hljs language-js">const x = 1;</code></pre>';
    await ed.exportHTML();
    assert.ok(captured.content, '应写出 HTML');
    const c = captured.content;
    assert.ok(
      /pre\s+code\.hljs\s*,\s*pre\s+code\s+\.hljs\s*\{[^}]*background:\s*transparent\s*!important/.test(c),
      '导出 HTML 应让 pre code.hljs, pre code .hljs 背景透明（!important 压住 hljs 主题 #fff）',
    );
    // 防退化：模板里 pre code 不能退回 background:none —— 同特异性会被 .hljs 反压
    assert.ok(
      !/pre\s+code\s*\{[^}]*background:\s*none\b/.test(c),
      '导出 HTML 的 pre code 不能再用 background:none（specificity 不如 .hljs）',
    );
  });
});

test('exportHTML: 代码块 pre 背景是明显浅灰（非极浅/接近白）', async () => {
  // 用户反馈：导出 HTML 代码块背景 #f0efee 在白底页面下接近白色，看不出是"代码块灰底"。
  // 改为 #e8e8e8 明显的浅灰，一眼可辨；同时与软件预览 --code-bg（#eeedec 默认）接近。
  const captured = {};
  await withEditor({ invokeImpl: (cmd, args) => {
    if (cmd === 'plugin:dialog|save') return '/tmp/out.html';
    if (cmd === 'write_file') { captured.content = args.content; return undefined; }
    return null;
  } }, async (w, ed) => {
    ed.activeTab.filePath = '/docs/note.md';
    await ed.exportHTML();
    assert.ok(captured.content);
    const c = captured.content;
    const preRule = /pre\s*\{[^}]*\}/.exec(c);
    assert.ok(preRule, '应含 pre { } 规则');
    const pre = preRule[0];
assert.ok(/#f6f5f4/i.test(pre), 'pre 背景应为 #f6f5f4（与 details/blockquote/toc-wrapper 同灰）');
  // 防回归：不要退回 #fff/#f0efee/#e8e8e8 等极浅/接近白或过深的色值
  assert.ok(!/#f0efee/i.test(pre), 'pre 背景不应是 #f0efee（在白底页面下接近白）');
  assert.ok(!/#fff[^\d]/i.test(pre) && !/background:\s*#fff\b/i.test(pre), 'pre 背景不应是 #fff');
  assert.ok(!/#e8e8e8/i.test(pre), 'pre 背景不应退回 #e8e8e8（已统一为 #f6f5f4）');
  });
});

test('exportPDF: printCSS 显式让 pre 换行且溢出可见（无滚动条）', async () => {
  await withEditor({}, async (w, ed) => {
    ed.showConfirmDialog = async () => true;
    // 捕获 exportPDF 创建的 iframe 及其 srcdoc（打印 HTML 含 printCSS）
    const capturedIframes = [];
    const origCreateElement = w.document.createElement.bind(w.document);
    w.document.createElement = function (tag) {
      const el = origCreateElement(tag);
      if (String(tag).toLowerCase() === 'iframe') capturedIframes.push(el);
      return el;
    };
    try {
      ed.activeTab.name = 'DEMO.md';
      await ed.exportPDF().catch(() => {});
      assert.ok(capturedIframes.length >= 1, 'exportPDF 应创建 iframe');
      const iframe = capturedIframes[0];
      assert.ok(iframe.srcdoc, 'iframe 应通过 srcdoc 承载打印 HTML');

      const doc = iframe.srcdoc;
      // printCSS 中的 pre 规则应强制换行 + 溢出可见
      assert.ok(
        doc.includes('.preview-content pre { white-space: pre-wrap !important'),
        'printCSS 应含 .preview-content pre 换行规则',
      );
      assert.ok(
        doc.includes('overflow: visible !important'),
        'printCSS 的 pre 应 overflow: visible（无滚动条）',
      );
      // 打印 HTML 内不应出现会触发横向滚动的 overflow-x: auto（作用于 pre）
      assert.ok(
        !/pre\s*\{[^}]*overflow-x:\s*auto/.test(doc),
        '打印 HTML 的 pre 不应含 overflow-x: auto',
      );
      // 关键：导出 PDF 必须显式块级化 .code-line 行结构（不依赖 styles.css）
      assert.ok(
        /\.code-line\s*\{[^}]*display:\s*flex\s*!important/.test(doc),
        'printCSS 应让 .code-line display:flex !important（每行独占一行）',
      );
      assert.ok(
        /\.code-line-text\s*\{[^}]*white-space:\s*pre-wrap\s*!important/.test(doc),
        'printCSS 应让 .code-line-text 换行',
      );
      assert.ok(
        /\.code-scroll\s*\{[^}]*overflow:\s*visible\s*!important/.test(doc),
        'printCSS 的 .code-scroll 应可见（无滚动条）',
      );
    } finally {
      w.document.createElement = origCreateElement;
    }
  });
});

test('styles.css: .hljs 元素背景透明——统一用 pre 的 --code-bg（修复"内白外灰"）', async () => {
  // 根因：hljs 主题（github.css）里 .hljs 元素带 background:#ffffff；
  // pre 内是 display:block + padding:1em，会在 pre 的 var(--code-bg) 灰色之上叠一层白底，
  // 形成"灰色外框 + 白色内框"的双层背景。用户在 PDF 导出后尤其明显（"灰色中有白色"）。
  // 修复：styles.css 加 .preview-content pre code.hljs / .hljs { background: transparent }。
  const fs = require('fs');
  const css = fs.readFileSync(require('path').join(__dirname, '../src/styles.css'), 'utf8');
  assert.ok(
    /\.preview-content\s+pre\s+code\.hljs[\s\S]{0,200}background:\s*transparent\s*!important/.test(css),
    'styles.css 应让 .preview-content pre code.hljs 背景透明（!important 覆盖 hljs 主题白底）',
  );
  // 不能只覆盖 .hljs 而漏掉 pre code.hljs（hljs 主题里 pre code.hljs 才是 pre 内主块）
  assert.ok(
    /\.preview-content\s+pre\s+\.hljs[\s\S]{0,200}background:\s*transparent\s*!important/.test(css),
    'styles.css 应让 .preview-content pre .hljs 背景透明',
  );
});

test('exportPDF: printCSS 同步覆盖 .hljs 背景——PDF 与软件统一灰色', async () => {
  // 与上一条对称：导出 iframe 注入了 appCSS（styles.css 文本）+ hljsCSS（hljs 主题），
  // 必须由 printCSS 显式覆盖，否则 hljs 主题的 #ffffff 仍会盖住 pre 的灰色。
  await withEditor({}, async (w, ed) => {
    ed.showConfirmDialog = async () => true;
    const capturedIframes = [];
    const origCreateElement = w.document.createElement.bind(w.document);
    w.document.createElement = function (tag) {
      const el = origCreateElement(tag);
      if (String(tag).toLowerCase() === 'iframe') capturedIframes.push(el);
      return el;
    };
    try {
      ed.activeTab.name = 'NOTE.md';
      await ed.exportPDF().catch(() => {});
      const doc = capturedIframes[0].srcdoc;
      assert.ok(
        /\.preview-content\s+pre\s+code\.hljs[\s\S]{0,200}background:\s*transparent\s*!important/.test(doc),
        'printCSS 应让 .preview-content pre code.hljs 背景透明',
      );
      assert.ok(
        /\.preview-content\s+pre\s+\.hljs[\s\S]{0,200}background:\s*transparent\s*!important/.test(doc),
        'printCSS 应让 .preview-content pre .hljs 背景透明',
      );
    } finally {
      w.document.createElement = origCreateElement;
    }
  });
});
