document.addEventListener('DOMContentLoaded', () => {
    // --- DOM 元素 ---
    const productList = document.getElementById('product-list');
    const categoryTreeContainer = document.getElementById('category-tree');
    const searchBox = document.getElementById('search-box');
    const detailModal = document.getElementById('detail-modal-container');
    const detailMainImage = document.getElementById('detail-main-image');
    const detailThumbnailList = document.getElementById('detail-thumbnail-list');
    const detailInfo = document.getElementById('product-detail-info');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const pageOverlay = document.getElementById('page-overlay');
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    
    // --- 全域變數 ---
    let allProducts = [], allCategories = [];
    let currentCategoryId = 'all';

    // --- 響應式側邊欄 & 分類樹 & 產品渲染 (無變動) ---
    function toggleSidebar() { document.body.classList.toggle('sidebar-open'); }
    menuToggleBtn.addEventListener('click', toggleSidebar);
    pageOverlay.addEventListener('click', toggleSidebar);

    function buildCategoryTree() {
        const categoryMap = new Map(allCategories.map(c => [c.id, {...c, children: []}]));
        const tree = [];
        for (const category of categoryMap.values()) {
            if (category.parentId === null) tree.push(category);
            else if (categoryMap.has(category.parentId)) categoryMap.get(category.parentId).children.push(category);
        }
        let html = `<ul><li><a href="#" class="active" data-id="all">所有產品</a></li>`;
        function createTreeHTML(nodes) {
            let subHtml = '<ul>';
            for (const node of nodes) {
                subHtml += `<li><a href="#" data-id="${node.id}">${node.name}</a>`;
                if (node.children.length > 0) subHtml += createTreeHTML(node.children);
                subHtml += '</li>';
            }
            return subHtml + '</ul>';
        }
        categoryTreeContainer.innerHTML = html + createTreeHTML(tree) + '</ul>';
    }

    categoryTreeContainer.addEventListener('click', e => {
        e.preventDefault();
        const targetLink = e.target.closest('a');
        if (targetLink) {
            document.querySelectorAll('#category-tree a').forEach(a => a.classList.remove('active'));
            targetLink.classList.add('active');
            currentCategoryId = targetLink.dataset.id === 'all' ? 'all' : parseInt(targetLink.dataset.id);
            renderProducts();
            if (window.innerWidth <= 992) toggleSidebar();
        }
    });

    function getCategoryIdsWithChildren(startId) {
        if (startId === 'all') return null;
        const ids = new Set([startId]);
        const queue = [startId];
        while (queue.length > 0) {
            const children = allCategories.filter(c => c.parentId === queue.shift());
            for (const child of children) {
                ids.add(child.id);
                queue.push(child.id);
            }
        }
        return ids;
    }

    function renderProducts() {
        const searchTerm = searchBox.value.toLowerCase();
        const categoryIdsToDisplay = getCategoryIdsWithChildren(currentCategoryId);
        const filteredProducts = allProducts.filter(p => {
            const matchesCategory = categoryIdsToDisplay === null || (p.categoryId && categoryIdsToDisplay.has(p.categoryId));
            const matchesSearch = p.name.toLowerCase().includes(searchTerm);
            return matchesCategory && matchesSearch;
        });
        productList.innerHTML = '';
        if (filteredProducts.length === 0) {
            productList.innerHTML = '<p class="empty-message">此分類下無產品。</p>';
            return;
        }
        filteredProducts.forEach(product => {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.onclick = () => openDetailModal(product.id);
            const firstImage = (product.imageUrls && product.imageUrls.length > 0) ? product.imageUrls[0] : '';
            card.innerHTML = `
                <div class="image-container"><img src="${firstImage}" class="product-image" alt="${product.name}" loading="lazy" style="width: ${product.imageSize || 100}%;"></div>
                <div class="product-info"><h3>${product.name}</h3><p class="price">$${product.price}</p></div>
            `;
            productList.appendChild(card);
        });
    }
    
    // --- 詳情彈窗 (Modal) & 事件 (無變動) ---
    function openDetailModal(id) {
        const product = allProducts.find(p => p.id === id);
        const category = allCategories.find(c => c.id === product.categoryId);
        if (!product) return;
        
        detailInfo.innerHTML = `
            <h2>${product.name}</h2>
            <p class="price">$${product.price}</p>
            <p>${product.description}</p>
            <dl class="details-grid">
                <dt>分類</dt><dd>${category ? category.name : '未分類'}</dd>
                <dt>編號</dt><dd>${product.sku}</dd>
                <dt>EAN-13</dt><dd>${product.ean13 || 'N/A'}</dd>
            </dl>
            ${product.ean13 ? `<div class="barcode-display"><svg id="detail-barcode"></svg></div>` : ''}
        `;
        
        detailThumbnailList.innerHTML = '';
        if (product.imageUrls && product.imageUrls.length > 0) {
            detailMainImage.src = product.imageUrls[0];
            detailMainImage.alt = product.name;
            product.imageUrls.forEach((url, index) => {
                const thumbItem = document.createElement('div');
                thumbItem.className = 'thumbnail-item';
                if (index === 0) thumbItem.classList.add('active');
                thumbItem.innerHTML = `<img src="${url}" data-index="${index}" alt="產品縮圖 ${index + 1}">`;
                detailThumbnailList.appendChild(thumbItem);
            });
        } else {
            detailMainImage.src = '';
            detailMainImage.alt = '無圖片';
        }
        
        detailModal.classList.remove('hidden');
        
        setTimeout(() => {
            if (product.ean13) {
                const barcodeElement = document.getElementById('detail-barcode');
                if (barcodeElement) {
                    try {
                        JsBarcode(barcodeElement, product.ean13, {
                            format: "EAN13", displayValue: true, background: "#ffffff",
                            lineColor: "#000000", height: 50, margin: 10
                        });
                    } catch (e) { console.error(`無法生成條碼: ${product.ean13}`, e); }
                }
            }
        }, 0);
    }
    
    detailThumbnailList.addEventListener('click', e => {
        if(e.target.tagName === 'IMG') {
            detailMainImage.src = e.target.src;
            document.querySelectorAll('#detail-thumbnail-list .thumbnail-item').forEach(item => item.classList.remove('active'));
            e.target.parentElement.classList.add('active');
        }
    });

    // --- 初始化與事件監聽 ---
    function init() {
        const currentTheme = localStorage.getItem('theme');
        if (currentTheme === 'dark') document.body.classList.add('dark-mode');
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
        });
        
        modalCloseBtn.addEventListener('click', () => detailModal.classList.add('hidden'));
        detailModal.addEventListener('click', e => { 
            if (e.target === detailModal) detailModal.classList.add('hidden');
        });
        
        searchBox.addEventListener('input', renderProducts);

        // ===== 核心修正: 恢復最簡單直接的 fetch 邏輯 =====
        async function loadData() {
            try {
                // 加上時間戳，確保每次都讀取最新檔案，避免瀏覽器快取問題
                const cacheBuster = `?t=${new Date().getTime()}`;
                const [prodRes, catRes] = await Promise.all([
                    fetch(`products.json${cacheBuster}`),
                    fetch(`categories.json${cacheBuster}`)
                ]);

                if (!prodRes.ok || !catRes.ok) throw new Error('網路回應不正常');
                
                const loadedProducts = await prodRes.json();
                allCategories = await catRes.json();
                
                // 資料遷移，確保舊的 imageDataUrl 格式相容
                allProducts = loadedProducts.map(p => {
                    if (p.imageDataUrl && !p.imageUrls) {
                        p.imageUrls = [p.imageDataUrl];
                        delete p.imageDataUrl;
                    } else if (!p.imageUrls) {
                        p.imageUrls = [];
                    }
                    return p;
                });
                
                buildCategoryTree();
                renderProducts();
            } catch (err) {
                console.error("無法載入資料:", err);
                productList.innerHTML = '<p class="empty-message">無法載入產品資料，請稍後再試。</p>';
            }
        }
        
        loadData();
    }
    
    init();
});