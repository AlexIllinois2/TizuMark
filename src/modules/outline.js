// 大纲（目录）抽取：从 app.js 的 updateOutline 拆出纯计算与渲染部分。
// 设计：纯函数不依赖 DOM 或 this，依赖通过 opts 注入（headingToId / escapeHtml），
// 与 preview-post.js 的注入风格一致，降低改动爆炸半径。
//   - extractHeadings(content, { headingToId }): 从 markdown 文本提取标题（跳过代码块、解析 #、去重 id）
//   - buildOutlineTree(headings): 按层级组织成树
//   - renderOutlineHtml(tree, { escapeHtml }): 生成大纲 DOM 的 HTML 字符串

function extractHeadings(content, opts) {
  const headingToId = opts && opts.headingToId;
  const lines = (content || '').split('\n');
  const headings = [];
  const idCount = {};
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (match) {
      const level = match[1].length;
      const text = match[2].replace(/[*`~\[\]]/g, '').trim();
      const baseId = headingToId ? headingToId(text) : text;
      const n = idCount[baseId] || 0;
      idCount[baseId] = n + 1;
      const id = n === 0 ? baseId : baseId + '-' + (n + 1);
      headings.push({ level, text, id, line: i });
    }
  }
  return headings;
}

function buildOutlineTree(headings) {
  const root = { level: 0, children: [] };
  const stack = [root];
  for (const h of headings) {
    const node = { ...h, children: [], expanded: true };
    while (stack.length > 1 && stack[stack.length - 1].level >= h.level) {
      stack.pop();
    }
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return root.children;
}

function renderOutlineHtml(tree, opts) {
  const escapeHtml = (opts && opts.escapeHtml) || ((s) => s);
  const renderTree = (nodes) => {
    let html = '';
    for (const node of nodes) {
      const hasChildren = node.children.length > 0;
      html += '<div class="outline-item-wrapper">';
      html += `<div class="outline-item level-${node.level}" data-id="${node.id}" data-line="${node.line}">`;
      if (hasChildren) {
        html += '<span class="outline-toggle">▼</span>';
      }
      html += `<span class="outline-label">${escapeHtml(node.text)}</span>`;
      html += '</div>';
      if (hasChildren) {
        html += `<div class="outline-children">${renderTree(node.children)}</div>`;
      }
      html += '</div>';
    }
    return html;
  };
  return renderTree(tree);
}

const Outline = { extractHeadings, buildOutlineTree, renderOutlineHtml };

// 浏览器：作为独立 <script> 加载，挂到全局 Outline
if (typeof window !== 'undefined' && typeof module === 'undefined') {
  window.Outline = Outline;
}
// Node（测试 / 构建）：CommonJS 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Outline;
}
