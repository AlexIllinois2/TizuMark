// 渲染管线性能对比：定位最近改动引入的卡顿
// 用法: node scripts/bench-render.js
const fs = require('fs');
const path = require('path');

// 直接 require 源码版本（与 bundle 等价，但 bundle 不含 rehype-sanitize）
const rendererPath = path.resolve(__dirname, '..', 'src', 'unified-renderer.js');
const src = fs.readFileSync(rendererPath, 'utf-8');

// 动态构造 4 个变体，通过修改源码开关
function buildVariant({ noRemarkBreaks, noRehypeSanitize }) {
  let code = src;
  if (noRemarkBreaks) {
    // 把 .use(remarkBreaks) 注释掉
    code = code.replace(/\.use\(remarkBreaks\);/, '; // (remarkBreaks disabled for bench)');
  }
  if (noRehypeSanitize) {
    // 让 rehypeSanitize 强制为 null
    code = code.replace(/rehypeSanitize = require\('rehype-sanitize'\)\.default \|\| require\('rehype-sanitize'\);/,
      'rehypeSanitize = null; // (disabled for bench)');
  }
  const moduleObj = { exports: {} };
  const fn = new Function('module', 'exports', 'require', code + '\nmodule.exports = module.exports;');
  fn(moduleObj, moduleObj.exports, require);
  return moduleObj.exports.renderMarkdown;
}

const md = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'demo.md'), 'utf-8');
console.log(`输入: src/demo.md (${md.length} 字符, ${md.split('\n').length} 行)\n`);

const variants = [
  { name: 'A. 当前完整管线 (remarkBreaks + rehype-sanitize)', opts: {} },
  { name: 'B. 禁用 remarkBreaks', opts: { noRemarkBreaks: true } },
  { name: 'C. 禁用 rehype-sanitize', opts: { noRehypeSanitize: true } },
  { name: 'D. 两者都禁用 (≈ 旧版)', opts: { noRemarkBreaks: true, noRehypeSanitize: true } },
];

const RUNS = 20;
for (const v of variants) {
  const render = buildVariant(v.opts);
  // warmup
  render(md);
  const times = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = process.hrtime.bigint();
    render(md);
    const t1 = process.hrtime.bigint();
    times.push(Number(t1 - t0) / 1e6);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const avg = times.reduce((s, x) => s + x, 0) / times.length;
  const min = times[0], max = times[times.length - 1];
  console.log(`${v.name}`);
  console.log(`   中位 ${median.toFixed(2)}ms | 平均 ${avg.toFixed(2)}ms | min ${min.toFixed(2)}ms | max ${max.toFixed(2)}ms`);
}

// 额外：分别测量 renderMarkdown 内部各阶段耗时（用变体 A，插桩）
console.log('\n--- 内部阶段耗时（变体 A，单次）---');
let code = src;
const instrumented = code
  .replace(/const abbrResult = extractAbbreviations\(content\);/,
    'const __t0 = process.hrtime.bigint(); const abbrResult = extractAbbreviations(content);')
  .replace(/const mathResult = guardMathBlocks\(abbrResult.content\);/,
    'const __t1 = process.hrtime.bigint(); const mathResult = guardMathBlocks(abbrResult.content);')
  .replace(/const alertResult = convertAlerts\(mathResult.content\);/,
    'const __t2 = process.hrtime.bigint(); const alertResult = convertAlerts(mathResult.content);')
  .replace(/let processed = convertDefLists\(alertResult.content\);/,
    'const __t3 = process.hrtime.bigint(); let processed = convertDefLists(alertResult.content);')
  .replace(/processed = convertContainerTables\(processed\);/,
    'const __t4 = process.hrtime.bigint(); processed = convertContainerTables(processed);')
  .replace(/const footnoteResult = extractFootnotes\(processed\);/,
    'const __t5 = process.hrtime.bigint(); const footnoteResult = extractFootnotes(processed);')
  .replace(/html = processor.processSync\(processed\).toString\(\);/,
    'const __t6 = process.hrtime.bigint(); html = processor.processSync(processed).toString(); const __t7 = process.hrtime.bigint();')
  .replace(/html = restoreMathBlocks\(html, placeholders\);/,
    'const __t8 = process.hrtime.bigint(); html = restoreMathBlocks(html, placeholders);')
  .replace(/html = sanitizeHTML\(html\);/,
    'const __t9 = process.hrtime.bigint(); html = sanitizeHTML(html);')
  .replace(/html = renderFootnotes\(html, footnoteDefs\);/,
    'const __t10 = process.hrtime.bigint(); html = renderFootnotes(html, footnoteDefs);')
  .replace(/return html;/, 'const __t11 = process.hrtime.bigint(); console.log(`  extractAbbr: ${(Number(__t1-__t0)/1e6).toFixed(2)}ms`); console.log(`  guardMath: ${(Number(__t2-__t1)/1e6).toFixed(2)}ms`); console.log(`  convertAlerts: ${(Number(__t3-__t2)/1e6).toFixed(2)}ms`); console.log(`  convertDefLists: ${(Number(__t4-__t3)/1e6).toFixed(2)}ms`); console.log(`  convertContainerTables: ${(Number(__t5-__t4)/1e6).toFixed(2)}ms`); console.log(`  extractFootnotes: ${(Number(__t6-__t5)/1e6).toFixed(2)}ms`); console.log(`  unified pipeline: ${(Number(__t7-__t6)/1e6).toFixed(2)}ms`); console.log(`  restoreMath+Alerts: ${(Number(__t8-__t7)/1e6).toFixed(2)}ms`); console.log(`  sanitizeHTML: ${(Number(__t9-__t8)/1e6).toFixed(2)}ms`); console.log(`  convertHighlights+renderFootnotes: ${(Number(__t10-__t9)/1e6).toFixed(2)}ms`); console.log(`  embedAbbr+return: ${(Number(__t11-__t10)/1e6).toFixed(2)}ms`); return html;');

const moduleObj = { exports: {} };
const fn = new Function('module', 'exports', 'require', instrumented + '\nmodule.exports = module.exports;');
fn(moduleObj, moduleObj.exports, require);
moduleObj.exports.renderMarkdown(md);
