下面给出在 TizuMark 的 dev 分支为“左侧文件树”增加类似 VSCode 的右键菜单（新建文件、新建文件夹、剪切、复制、重命名、删除）并附带常规快捷键的详细、可落地的修改方案。
---
# 一、总体设计
- 目标：在左侧“文件”面板的文件树上，右键任意文件/文件夹节点时弹出上下文菜单，执行以下操作：
  - 新建文件（在当前文件夹下创建，快捷键建议：Ctrl+Alt+N 或先触发新建后根据上下文判定文件/文件夹）
  - 新建文件夹（在当前文件夹下创建，快捷键建议：Ctrl+Shift+N）
  - 剪切（选中项到剪贴板，快捷键：Ctrl+X）
  - 复制（选中项到剪贴板，快捷键：Ctrl+C）
  - 重命名（快捷键：F2）
  - 删除（快捷键：Delete）
- 实现分层：
  - 前端（HTML/CSS/JS）：完成右键菜单 UI、事件监听、用户交互反馈、调用后端；
  - 后端（Rust/Tauri）：提供“重命名、删除、复制/移动”等文件系统指令（前端已有的读/写/列表等指令继续复用）。
- 不改动现有文件树结构和样式，仅增加一个全局上下文菜单容器，并为文件树节点附加右键行为。
## 二、前端实现（HTML/CSS/JS）
### 1) HTML：增加右键菜单容器
在 src/index.html 中的 body 结束前增加一个全局上下文菜单元素（不要放在某个侧边栏内部，以便随时定位）：
```html
<!-- 文件树右键上下文菜单 -->
<div id="file-context-menu" class="context-menu hidden" role="menu" aria-label="文件操作菜单">
  <!-- 新建文件（仅文件夹） -->
  <button class="context-menu-item" data-action="new-file" role="menuitem">
    <span class="icon">📄</span> 新建文件 <span class="shortcut">Ctrl+Alt+N</span>
  </button>
  <!-- 新建文件夹（仅文件夹） -->
  <button class="context-menu-item" data-action="new-folder" role="menuitem">
    <span class="icon">📁</span> 新建文件夹 <span class="shortcut">Ctrl+Shift+N</span>
  </button>
  <div class="dropdown-separator"></div>
  <!-- 剪切 -->
  <button class="context-menu-item" data-action="cut" role="menuitem">
    <span class="icon">✂️</span> 剪切 <span class="shortcut">Ctrl+X</span>
  </button>
  <!-- 复制 -->
  <button class="context-menu-item" data-action="copy" role="menuitem">
    <span class="icon">📋</span> 复制 <span class="shortcut">Ctrl+C</span>
  </button>
  <!-- 重命名 -->
  <button class="context-menu-item" data-action="rename" role="menuitem">
    <span class="icon">✏️</span> 重命名 <span class="shortcut">F2</span>
  </button>
  <!-- 删除 -->
  <button class="context-menu-item" data-action="delete" role="menuitem" style="color:var(--color-danger)">
    <span class="icon">🗑️</span> 删除 <span class="shortcut">Delete</span>
  </button>
</div>
```
说明：上面类名使用了项目已存在的 `.context-menu` 与 `.context-menu-item` 样式体系，并增加了 `.shortcut` 显示快捷键。
### 2) CSS：确保菜单样式与主题一致
在 src/styles.css 中补充/复用样式（项目已有 `.context-menu-item` 与 `.shortcut`，可复用）：
```css
/* 右键菜单容器 */
.context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 180px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: var(--shadow-md);
  padding: 4px 0;
  font-size: 12px;
  color: var(--text-primary);
}
/* 隐藏状态 */
.hidden {
  display: none !important;
}
/* 菜单项：项目已有基础样式，这里只补充快捷键靠右对齐 */
.context-menu-item .shortcut {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-secondary);
  opacity: 0.7;
}
/* 分隔线（已有） */
.dropdown-separator {
  height: 1px;
  background-color: var(--border-color);
  margin: 4px 0;
}
/* 可选：禁止选中 */
.context-menu {
  user-select: none;
  -webkit-user-select: none;
}
```
### 3) JS：右键菜单逻辑与快捷键绑定
下面给出一段可直接在 `src/app.js` 或新增 `src/modules/file-context-menu.js` 中集成的 JS 实现要点：
- 维护“当前右键目标”的元数据（路径、是否文件夹）；
- 实现菜单的显示/隐藏/定位；
- 菜单项点击后的处理流程（前端→后端调用）；
- 支持键盘快捷键触发（Ctrl+X/C/Delete/F2 等）。
示例代码（合并思路）：
```js
// 文件树右键菜单实现
(function () {
  const menu = document.getElementById('file-context-menu');
  if (!menu) return;
  let currentTarget = null; // { path, isDir }
  // 显示菜单
  function showMenu(x, y, target) {
    currentTarget = target;
    menu.classList.remove('hidden');
    // 确保菜单不超出视口
    const rect = menu.getBoundingClientRect();
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const finalX = x + rect.width > winW ? x - rect.width : x;
    const finalY = y + rect.height > winH ? y - rect.height : y;
    menu.style.left = finalX + 'px';
    menu.style.top = finalY + 'px';
    updateMenuState(target.isDir);
  }
  // 隐藏菜单
  function hideMenu() {
    menu.classList.add('hidden');
    currentTarget = null;
  }
  // 根据目标类型启用/禁用某些项
  function updateMenuState(isDir) {
    const items = {
      'new-file': menu.querySelector('[data-action="new-file"]'),
      'new-folder': menu.querySelector('[data-action="new-folder"]')
    };
    // 仅在文件夹上允许“新建文件/文件夹”
    if (isDir) {
      items['new-file'].classList.remove('disabled');
      items['new-folder'].classList.remove('disabled');
    } else {
      items['new-file'].classList.add('disabled');
      items['new-folder'].classList.add('disabled');
    }
  }
  // 在文件树上附加右键事件
  document.addEventListener('contextmenu', (e) => {
    const treeNode = e.target.closest('.tree-node');
    if (!treeNode) return;
    e.preventDefault();
    // 假设 .tree-node 或 .tree-row 上有 data-path 和 data-is-dir
    const path = treeNode.dataset.path || treeNode.getAttribute('data-path');
    const isDir = treeNode.dataset.isDir === 'true' || treeNode.classList.contains('tree-folder');
    if (!path) return;
    showMenu(e.clientX, e.clientY, { path, isDir });
  });
  // 点击其他位置关闭菜单
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) hideMenu();
  });
  // 菜单项动作
  menu.addEventListener('click', async (e) => {
    const item = e.target.closest('.context-menu-item');
    if (!item || item.classList.contains('disabled')) return;
    const action = item.dataset.action;
    if (!currentTarget) return;
    e.stopPropagation();
    hideMenu();
    await handleAction(action, currentTarget.path, currentTarget.isDir);
  });
  // 动作分发（待与后端接口对接）
  async function handleAction(action, path, isDir) {
    switch (action) {
      case 'new-file':
        await promptNewFile(path);
        break;
      case 'new-folder':
        await promptNewFolder(path);
        break;
      case 'cut':
        await copyOrCutToClipboard(path, isDir, true); // true=cut
        break;
      case 'copy':
        await copyOrCutToClipboard(path, isDir, false); // false=copy
        break;
      case 'rename':
        await promptRename(path, isDir);
        break;
      case 'delete':
        await confirmDelete(path, isDir);
        break;
    }
  }
  // 快捷键绑定（全局，在有文件树焦点或选中项时生效）
  document.addEventListener('keydown', async (e) => {
    if (!currentTarget) return;
    if (e.key === 'Delete') {
      e.preventDefault();
      await handleAction('delete', currentTarget.path, currentTarget.isDir);
    } else if (e.key === 'F2') {
      e.preventDefault();
      await handleAction('rename', currentTarget.path, currentTarget.isDir);
    } else if (e.ctrlKey && e.key === 'x') {
      e.preventDefault();
      await handleAction('cut', currentTarget.path, currentTarget.isDir);
    } else if (e.ctrlKey && e.key === 'c') {
      e.preventDefault();
      await handleAction('copy', currentTarget.path, currentTarget.isDir);
    } else if (e.ctrlKey && e.altKey && e.key === 'n') {
      e.preventDefault();
      if (currentTarget.isDir) await handleAction('new-file', currentTarget.path, true);
    } else if (e.ctrlKey && e.shiftKey && e.key === 'N') {
      e.preventDefault();
      if (currentTarget.isDir) await handleAction('new-folder', currentTarget.path, true);
    }
  });
  // 下面是具体交互的示例实现（需要你根据项目现有 dialogs 组件封装）
  async function promptNewFile(parentDir) {
    // 建议使用项目中已有的 dialogs 模块（src/modules/dialogs.js）做输入
    const name = prompt('新建文件名称（含扩展名，如 note.md）：', '');
    if (!name) return;
    const newPath = parentDir ? (parentDir.replace(/\/$/, '') + '/' + name) : name;
    // 调用后端创建空文件
    try {
      await invoke('write_file', { path: newPath, content: '' });
      // 刷新文件树（需触发文件树更新逻辑）
      refreshFileTree();
    } catch (err) {
      console.error(err);
      alert('创建文件失败：' + err);
    }
  }
  async function promptNewFolder(parentDir) {
    const name = prompt('新建文件夹名称：', '');
    if (!name) return;
    const newPath = parentDir ? (parentDir.replace(/\/$/, '') + '/' + name) : name;
    try {
      await invoke('ensure_dir', { path: newPath });
      refreshFileTree();
    } catch (err) {
      console.error(err);
      alert('创建文件夹失败：' + err);
    }
  }
  async function promptRename(path, isDir) {
    const name = path.split('/').pop();
    const newName = prompt('新名称：', name);
    if (!newName || newName === name) return;
    const parentPath = path.substring(0, path.lastIndexOf('/'));
    const newPath = parentPath ? parentPath + '/' + newName : newName;
    try {
      await invoke('rename_path', { from: path, to: newPath });
      refreshFileTree();
    } catch (err) {
      console.error(err);
      alert('重命名失败：' + err);
    }
  }
  async function confirmDelete(path, isDir) {
    const msg = isDir ? `确定要删除文件夹「${path}」及其所有内容吗？` : `确定要删除文件「${path}」吗？`;
    if (!confirm(msg)) return;
    try {
      await invoke('remove_path', { path });
      refreshFileTree();
    } catch (err) {
      console.error(err);
      alert('删除失败：' + err);
    }
  }
  // 剪切/复制状态维护（可放全局变量）
  let clipboardOp = null; // { type: 'cut'|'copy', paths: string[] }
  async function copyOrCutToClipboard(path, isDir, isCut) {
    clipboardOp = { type: isCut ? 'cut' : 'copy', paths: [path] };
    // 可在 UI 显示 Toast 提示
    console.log(isCut ? '已剪切到剪贴板' : '已复制到剪贴板', path);
    // 粘贴逻辑可在右键空白处增加“粘贴”项实现（见后面扩展建议）
  }
  // 刷新文件树的占位实现（调用项目已有刷新接口）
  function refreshFileTree() {
    // 根据项目现有的文件树刷新逻辑调用；可能是重新触发 load 或发送自定义事件
    // 例如：window.dispatchEvent(new CustomEvent('file-tree-refresh'));
  }
  // 简易的 invoke 封装（如项目已有则复用）
  async function invoke(cmd, args) {
    if (window.__TAURI__ && window.__TAURI__.core) {
      return await window.__TAURI__.core.invoke(cmd, args);
    } else {
      console.warn('Tauri invoke 不可用，命令：', cmd, args);
      return Promise.resolve(null);
    }
  }
})();
```
要点说明：
- 文件树节点应当带有 `data-path` 和 `data-is-dir` 属性，或在 class 上区分 `.tree-folder`。现有样式已支持 `.tree-folder` 与 `.tree-row`，请在生成 DOM 时附加上述属性以便脚本识别。
- 快捷键按下时需要判定“当前选中项”；你可以让点击/右键某个节点时更新全局 `currentTarget`，并对其高亮（例如增加 `.selected` 类）。
- 粘贴（Paste）可在上下文菜单中再增加一项“粘贴（Ctrl+V）”，读取 `clipboardOp` 并调用后端“复制/移动”接口（见后端部分）。
## 三、后端实现（Rust/Tauri）
项目已注册的 Tauri 命令包括：`read_file`、`write_file`、`file_meta`、`is_directory`、`list_dir`、`write_binary_file`、`ensure_dir` 等。
为支持右键菜单所需的“重命名、删除、复制/移动”，建议在 `src-tauri/src/lib.rs` 中新增以下命令（需在 `invoke_handler!` 宏中注册）：
- rename_path：重命名文件或文件夹（使用 `std::fs::rename`）
- remove_path：删除文件或递归删除文件夹（使用 `std::fs::remove_file` 和 `std::fs::remove_dir_all`）
- copy_path：复制文件或递归复制文件夹（需要自行实现递归复制；若依赖限制，可先只支持文件复制）
- move_path：移动/重命名（可复用 `rename_path` 或单独封装）
下面给出 Rust 侧新增命令的示例代码（加到 `lib.rs` 内即可）：
```rust
#[tauri::command]
fn rename_path(from: String, to: String) -> Result<(), String> {
    std::fs::rename(&from, &to).map_err(|e| e.to_string())
}
#[tauri::command]
fn remove_path(path: String) -> Result<(), String> {
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.is_dir() {
        std::fs::remove_dir_all(&path).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(&path).map_err(|e| e.to_string())
    }
}
#[tauri::command]
fn copy_path(from: String, to: String) -> Result<(), String> {
    let meta = std::fs::metadata(&from).map_err(|e| e.to_string())?;
    if meta.is_file() {
        std::fs::copy(&from, &to).map_err(|e| e.to_string()).map(|_| ())
    } else {
        // 简易实现：递归复制文件夹
        fn copy_dir(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
            if !dst.exists() {
                std::fs::create_dir_all(dst).map_err(|e| e.to_string())?;
            }
            for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let src_path = entry.path();
                let dst_path = dst.join(entry.file_name());
                if src_path.is_dir() {
                    copy_dir(&src_path, &dst_path)?;
                } else {
                    std::fs::copy(&src_path, &dst_path).map_err(|e| e.to_string())?;
                }
            }
            Ok(())
        }
        copy_dir(std::path::Path::new(&from), std::path::Path::new(&to))
    }
}
// 移动可复用 rename，但语义上更清晰，单独暴露
#[tauri::command]
fn move_path(from: String, to: String) -> Result<(), String> {
    rename_path(from, to)
}
```
随后，在 `invoke_handler!` 中加入这些命令：
```rust
.invoke_handler(tauri::generate_handler![
  // ... 已有命令 ...
  rename_path,
  remove_path,
  copy_path,
  move_path,
])
```
说明：
- 若项目对权限/安全有严格限制，请在 `tauri.conf.json`/`capabilities` 中相应开放文件路径范围（见 `src-tauri/capabilities` 目录）。
- 复制文件夹的实现可以按需简化（例如只支持文件复制），但建议提供上述基础版本以覆盖常见需求。
## 四、集成与验证步骤
1) 前端集成
   - 将 HTML 菜单容器放入 `index.html`；
   - 将 CSS 放入 `styles.css`（可放在文件树相关样式附近）；
   - 将 JS 放入 `app.js` 或新建 `src/modules/file-context-menu.js` 并在 `index.html` 中 `<script>` 引入。
2) 文件树 DOM 增强
   - 在渲染文件树时，确保每个 `.tree-node` 或 `.tree-row` 带有 `data-path`（完整路径）和 `data-is-dir`（true/false）属性，或在 class 上区分 `.tree-folder`；这样右键菜单才能识别目标。
3) 后端编译与前端运行
   - 在 `src-tauri/src/lib.rs` 中新增上述命令并重新注册，执行 `npm run tauri build` 或 `npm run tauri dev` 重新编译；
   - 启动应用，打开左侧“文件”面板，右键文件/文件夹，验证菜单弹出与各功能：
     - 新建文件/文件夹：创建后文件树刷新；
     - 剪切/复制：控制台/日志可见剪贴板状态；
     - 重命名：弹窗输入后名称变更；
     - 删除：确认后移除。
4) 快捷键测试
   - 选中某个文件/文件夹后，按 Delete/F2/Ctrl+X/Ctrl+C，验证对应动作触发。
## 五、交互与 UX 细节建议
- 菜单项“新建文件/新建文件夹”仅在文件夹上可用，右键文件时应置灰（通过 `.disabled` 类实现）。
- 对危险操作（删除）使用二次确认弹窗，样式可复用项目现有 dialogs。
- 粘贴（Paste）可在菜单中增加一项“粘贴”，读取全局 `clipboardOp`：
  - 若类型为 `copy`，调用 `copy_path`；
  - 若类型为 `cut`，调用 `move_path`。
- 考虑加入“复制文件路径”到剪贴板（仅前端实现），方便快速引用。
## 六、风险与注意事项
- 权限：Tauri 对文件系统访问有权限控制，新增命令可能需要在 `capabilities` 中声明（参考 `src-tauri/capabilities` 目录）。
- 跨平台路径：路径拼接与分隔符建议使用 `path` crate 处理，避免手动拼接带来的 Windows/macOS 差异（示例为简化写法，实际工程应使用 `std::path::Path`/`PathBuf`）。
- 误删保护：删除操作请务必确认，并在后端对根目录等关键路径做校验（可选）。
## 七、最终效果
- 左侧文件树任意节点右键出现上下文菜单，布局与风格与现有主题保持一致；
- 每个操作均有直观的图标与快捷键提示；
- 与现有文件树刷新、tab 打开等逻辑平滑对接。
按上述方案执行，即可在 TizuMark 的 dev 分支中为左侧文件树增加类似 VSCode 的右键菜单功能，并附常用快捷键。
