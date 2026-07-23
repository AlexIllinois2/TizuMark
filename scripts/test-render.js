const { renderMarkdown } = require('../src/unified-renderer.js');

// Read the test markdown content
const fs = require('fs');
const md = fs.readFileSync(__dirname + '/test-input.md', 'utf-8');
const html = renderMarkdown(md);
console.log('=== FULL HTML ===');
console.log(html);
