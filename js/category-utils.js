// js/category-utils.js
// 分類資料操作的純運算工具函式，前後台通用

/**
 * 將後端回傳的扁平分類陣列（含 id / parentId）轉換為階層式樹狀陣列。
 * @param {Array} categories - 扁平分類陣列
 * @returns {Array} 頂層分類節點組成的樹（每個節點含 children 陣列）
 */
function flatToTree(categories) {
    const categoryMap = new Map(categories.map(c => [c.id, { ...c, children: [] }]));
    const tree = [];
    for (const category of categoryMap.values()) {
        if (category.parentId === null) {
            tree.push(category);
        } else if (categoryMap.has(category.parentId)) {
            categoryMap.get(category.parentId).children.push(category);
        }
    }
    return tree;
}

/**
 * 遞迴產生分類樹的側邊欄 HTML（<ul><li> 結構）。
 * admin 模式下連結為 href="#" data-id，customer 模式為實際 URL。
 * @param {Array} nodes - 樹狀節點陣列（含 children）
 * @param {'admin'|'customer'} mode - 渲染模式
 * @param {number} depth - 遞迴深度（內部使用）
 * @returns {string} HTML 字串
 */
function buildCategoryTreeHTML(nodes, mode = 'customer', depth = 0) {
    nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const chevronSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

    let html = `<ul class="${depth >= 2 ? 'hidden' : ''}">`;
    for (const node of nodes) {
        const hasChildren = node.children && node.children.length > 0;
        const href = mode === 'admin'
            ? `href="#" data-id="${node.id}"`
            : `href="/catalog/category/${node.id}/${encodeURIComponent(node.name)}"`;

        html += `<li class="${hasChildren ? 'has-children' : ''}">`;
        html += `<a ${href}><span>${node.name}</span>`;
        if (hasChildren) {
            html += `<span class="category-toggle-icon">${chevronSVG}</span>`;
        }
        html += `</a>`;
        if (hasChildren) {
            html += buildCategoryTreeHTML(node.children, mode, depth + 1);
        }
        html += `</li>`;
    }
    return html + `</ul>`;
}
