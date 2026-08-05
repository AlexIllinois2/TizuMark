// 中文（非 ASCII）图片路径修复验证。
// 根因：unified 渲染器会把图片 src 中的非 ASCII 字符做 percent-encode
// （如 图片/截图.png → %E5%9B%BE%E7%89%87/%E6%88%AA%E5%9B%BE.png）。
// image-processor 必须解码还原成真实路径再交给 Rust 读盘，否则找不到文件 → 裂图。
// 英文路径不被编码，解码为 no-op（行为不变）。

const assert = require('assert');
const { JSDOM } = require('jsdom');
const { processImages } = require('../src/modules/image-processor.js');

// 渲染器产物：中文被 percent-encode（保留 / 与 : 等分隔符）
const encRel = '%E5%9B%BE%E7%89%87/%E6%88%AA%E5%9B%BE.png';
const decRel = '图片/截图.png';
const encAbs = 'D:/' + encodeURIComponent('我的文档') + '/' + encodeURIComponent('图.png');
const decAbs = 'D:/我的文档/图.png';

function makePreview(html) {
  const dom = new JSDOM(`<!DOCTYPE html><body><div id="preview">${html}</div></body></html>`,
    { url: 'http://localhost/' });
  return dom.window.document.getElementById('preview');
}

async function runCase(srcAttr, activeTab) {
  const preview = makePreview(`<img src="${srcAttr}">`);
  const recorded = [];
  await processImages(preview, {
    activeTab,
    imageCache: new Map(),
    tauri: {
      fetchImageAsBase64: async ({ url }) => { recorded.push(url); return 'QQ=='; },
    },
    getCachedImageURL: (d) => d,
    getRenderGeneration: () => 0,
  });
  return recorded;
}

(async () => {
  let fail = 0, pass = 0;
  const bump = (ok, msg) => {
    if (ok) { pass++; console.log('  ✅', msg); }
    else { fail++; console.error('  ❌', msg); }
  };

  // 1) 相对中文路径：渲染器编码 → 必须解码成真实路径交给 Rust
  {
    const dir = 'D:/我的文档';
    const activeTab = { filePath: dir + '/笔记.md', isBundled: false };
    const recorded = await runCase(encRel, activeTab);
    const expected = dir + '/' + decRel;
    bump(recorded.length === 1 && recorded[0] === expected,
      `相对中文路径应解码: got ${JSON.stringify(recorded)} want ${JSON.stringify([expected])}`);
  }

  // 2) 绝对/ file:// 中文路径：解码后走 Rust 读盘（非 file:// 前缀残留）
  {
    const activeTab = { filePath: null, isBundled: false };
    const recorded = await runCase('file://' + encAbs, activeTab);
    bump(recorded.length === 1 && recorded[0] === decAbs,
      `file:// 中文绝对路径应解码: got ${JSON.stringify(recorded)} want ${JSON.stringify([decAbs])}`);
  }

  // 3) 纯 ASCII 路径：解码应为 no-op（原本行为不变，英文图正常显示）
  {
    const dir = 'D:/docs';
    const activeTab = { filePath: dir + '/note.md', isBundled: false };
    const recorded = await runCase('images/en.png', activeTab);
    bump(recorded.length === 1 && recorded[0] === dir + '/images/en.png',
      `ASCII 路径 no-op: got ${JSON.stringify(recorded)}`);
  }

  // 4) 加载失败时：fail() 应清空 src → alt 文本可渲染（不再被 TRANSPARENT_PIXEL 遮挡）
  {
    const preview = makePreview('<img src="missing.png" alt="测试替代文本">');
    const img = preview.querySelector('img');
    await processImages(preview, {
      activeTab: { filePath: 'D:/test/note.md', isBundled: false },
      imageCache: new Map(),
      tauri: {
        fetchImageAsBase64: async () => { throw new Error('ENOENT'); },
      },
      getCachedImageURL: (d) => d,
      getRenderGeneration: () => 0,
    });
    bump(!img.hasAttribute('src'), `加载失败后 img 应无 src 属性（让 alt 显示）, src="${img.src}"`);
    bump(img.alt.includes('测试替代文本') && img.alt.includes('[加载失败]'),
      `alt 应含原文本+失败标记, got "${img.alt}"`);
  }

  console.log(`\n========== 中文图片路径：✅ ${pass} 通过 / ❌ ${fail} 失败 ==========`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('测试运行异常:', e); process.exit(2); });
