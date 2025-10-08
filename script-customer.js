// script-customer.js (效能優化版 - 按需載入 - 完整功能)

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM 元素宣告 ---
    const productList = document.getElementById('product-list');
    const categoryTreeContainer = document.getElementById('category-tree');
    const searchBox = document.getElementById('search-box');
    const themeToggle = document.getElementById('theme-toggle');
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const pageOverlay = document.getElementById('page-overlay');
    const toolbar = document.getElementById('toolbar');
    const viewToggleBtn = document.getElementById('view-toggle-btn');
    const searchToggleBtn = document.getElementById('search-toggle-btn');
    const categoryToggleBtn = document.getElementById('category-toggle-btn');
    const sortBtn = document.getElementById('sort-btn');
    const sortBtnText = document.getElementById('sort-btn-text');
    const sortOptionsContainer = document.getElementById('sort-options');
    const orderToggleBtn = document.getElementById('order-toggle-btn');
    const paginationControls = document.getElementById('pagination-controls');
    const detailModal = document.getElementById('detail-modal-container');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const sliderWrapper = document.getElementById('slider-wrapper');
    const detailThumbnailList = document.getElementById('detail-thumbnail-list');
    const detailInfo = document.getElementById('product-detail-info');
    const prevSlideBtn = document.getElementById('prev-slide-btn');
    const nextSlideBtn = document.getElementById('next-slide-btn');
    const sliderDots = document.getElementById('slider-dots');
    const imageViewerModal = document.getElementById('image-viewer-modal');
    const viewerImage = document.getElementById('viewer-image');

    // --- 前端狀態管理 ---
    let allCategories = [];
    let currentProducts = []; // 只儲存當前頁的產品
    let state = {
        currentPage: 1,
        totalPages: 1,
        categoryId: 'all',
        searchTerm: '',
        sortBy: 'price',
        order: 'asc'
    };
    let searchDebounceTimer;

    // --- UI 互動相關狀態 ---
    let lightboxState = { scale: 1, isPanning: false, pointX: 0, pointY: 0, startX: 0, startY: 0, didPan: false };
    let currentSlideIndex = 0, totalSlides = 0, isDragging = false, startPosX = 0, currentTranslate = 0, prevTranslate = 0, isSwiping = false;

    function handleRouteChange() {
        const path = window.location.pathname;
        let categoryId = 'all'; // 預設為 "所有產品"

        // 檢查路徑是否以 '/category/' 開頭
        if (path.startsWith('/category/')) {
            const pathParts = path.split('/');
            // pathParts 範例: ["", "category", "5", "跳繩"]
            // 我們需要第三個部分，也就是 ID
            if (pathParts.length > 2 && !isNaN(parseInt(pathParts[2]))) {
                categoryId = parseInt(pathParts[2]);
            }
        }

        // 如果當前頁面的分類和從 URL 解析出的分類不同，就更新頁面
        if (state.categoryId !== categoryId) {
            state.categoryId = categoryId;
            state.currentPage = 1; // 切換分類時，重置到第一頁
            fetchProducts(); // 呼叫 API 重新獲取產品

            // 更新側邊欄的 'active' 樣式，讓使用者知道現在在哪個分類
            document.querySelectorAll('#category-tree a').forEach(a => {
                const linkPath = a.getAttribute('href');
                const linkId = linkPath.split('/')[2]; // 從 href="/category/5/..." 中取出 5

                if (String(state.categoryId) === linkId || (state.categoryId === 'all' && linkPath === '/')) {
                    a.classList.add('active');
                } else {
                    a.classList.remove('active');
                }
            });
        }
    }

    // --- 核心資料獲取函式 ---
    async function fetchProducts() {
        if (!productList) return;
        productList.innerHTML = '<p class="empty-message">正在載入產品資料...</p>';
        if (paginationControls) paginationControls.innerHTML = '';

        const params = new URLSearchParams({
            page: state.currentPage,
            limit: 24,
            sortBy: state.sortBy,
            order: state.order
        });
        if (state.categoryId !== 'all') {
            params.append('categoryId', state.categoryId);
        }
        if (state.searchTerm) {
            params.append('search', state.searchTerm);
        }

        try {
            const response = await fetch(`/api/products?${params.toString()}`);
            if (!response.ok) throw new Error(`網路回應不正常: ${response.statusText}`);
            const data = await response.json();

            currentProducts = data.products;
            state.totalPages = data.pagination.totalPages;
            state.currentPage = data.pagination.currentPage;

            renderProducts();
            renderPagination();

        } catch (err) {
            console.error("無法載入產品:", err);
            productList.innerHTML = `<p class="empty-message">無法載入產品資料。<br>請稍後再試。</p>`;
        }
    }

    async function loadInitialData() {
        try {
            const response = await fetch('/api/all-data?t=' + new Date().getTime());
            if (!response.ok) throw new Error('無法載入分類');
            const data = await response.json();
            allCategories = data.categories || [];
            buildCategoryTree();
            fetchProducts();
        } catch (err) {
            console.error("無法載入分類:", err);
            if (categoryTreeContainer) categoryTreeContainer.innerHTML = '分類載入失敗';
        }
    }

    // --- 渲染函式 ---
    function renderProducts() {
        if (!productList) return;
        productList.innerHTML = '';
        if (currentProducts.length === 0) {
            productList.innerHTML = '<p class="empty-message">找不到符合條件的產品。</p>';
            return;
        }
        currentProducts.forEach(product => {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.onclick = () => openDetailModal(product);

            // ▼▼▼ *** 核心修正 *** ▼▼▼
            // 1. 取得第一張圖片的物件
            const firstImageObject = (product.imageUrls && product.imageUrls.length > 0) ? product.imageUrls[0] : null;
            // 2. 從物件中分別取出 url 和 size，如果物件不存在則提供預設值
            const imageUrl = firstImageObject ? firstImageObject.url : ''; // <-- 修正點：使用 .url
            const imageSize = firstImageObject ? firstImageObject.size : 90;
            // ▲▲▲ *** 修正結束 *** ▲▲▲

            card.innerHTML = `<div class="image-container"><img src="${imageUrl}" class="product-image" alt="${product.name}" loading="lazy" style="transform: scale(${imageSize / 100});"></div><div class="product-info"><h3>${product.name}</h3><p class="price">$${product.price}</p></div>`;
            productList.appendChild(card);
        });
    }

    function renderPagination() {
        if (!paginationControls) return;
        paginationControls.innerHTML = ''; // 清空舊的分頁
        if (state.totalPages <= 1) return;

        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn btn-secondary';
        prevBtn.innerHTML = '&#10094;';
        prevBtn.title = '上一頁';
        prevBtn.disabled = state.currentPage === 1;
        prevBtn.addEventListener('click', () => {
            if (state.currentPage > 1) {
                state.currentPage--;
                fetchProducts();
            }
        });

        const pageInfo = document.createElement('div');
        pageInfo.className = 'page-info';
        pageInfo.textContent = `${state.currentPage} / ${state.totalPages}`;

        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-secondary';
        nextBtn.innerHTML = '&#10095;';
        nextBtn.title = '下一頁';
        nextBtn.disabled = state.currentPage === state.totalPages;
        nextBtn.addEventListener('click', () => {
            if (state.currentPage < state.totalPages) {
                state.currentPage++;
                fetchProducts();
            }
        });

        paginationControls.append(prevBtn, pageInfo, nextBtn);
    }

    function buildCategoryTree() {
        if (!categoryTreeContainer) return;
        const categoryMap = new Map(allCategories.map(c => [c.id, { ...c, children: [] }]));
        const tree = [];
        for (const category of categoryMap.values()) {
            if (category.parentId === null) tree.push(category);
            else if (categoryMap.has(category.parentId)) categoryMap.get(category.parentId).children.push(category);
        }

        // 【修改】"所有產品" 的連結指向根目錄 "/"
        let html = `<ul><li><a href="/" class="active">所有產品</a></li></ul>`;

        function createTreeHTML(nodes, depth = 0) {
            nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            let subHtml = `<ul class="${depth >= 2 ? 'hidden' : ''}">`;
            for (const node of nodes) {
                const hasChildren = node.children && node.children.length > 0;

                // 【修改】產生新的 URL 格式: /category/ID/名稱
                const categoryUrlName = encodeURIComponent(node.name);
                subHtml += `<li class="${hasChildren ? 'has-children' : ''}">
                          <a href="/category/${node.id}/${categoryUrlName}">
                              <span>${node.name}</span>`;

                if (hasChildren) {
                    subHtml += `<span class="category-toggle-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></span>`;
                }
                subHtml += `</a>`;
                if (hasChildren) {
                    subHtml += createTreeHTML(node.children, depth + 1);
                }
                subHtml += '</li>';
            }
            return subHtml + '</ul>';
        }
        categoryTreeContainer.innerHTML = html + createTreeHTML(tree);
    }

    // --- Slider & Modal & Lightbox 邏輯 (完整版) ---
    function showSlide(index) { if (!sliderWrapper || totalSlides <= 1) return; if (index >= totalSlides) index = 0; if (index < 0) index = totalSlides - 1; const sliderWidth = sliderWrapper.clientWidth; sliderWrapper.style.transform = `translateX(-${index * sliderWidth}px)`; currentSlideIndex = index; updateUI(); }
    function updateUI() { if (sliderDots) document.querySelectorAll('.dot').forEach((dot, i) => dot.classList.toggle('active', i === currentSlideIndex)); if (detailThumbnailList) document.querySelectorAll('#detail-thumbnail-list .thumbnail-item').forEach((item, i) => item.classList.toggle('active', i === currentSlideIndex)); if (prevSlideBtn) prevSlideBtn.style.display = totalSlides > 1 ? 'flex' : 'none'; if (nextSlideBtn) nextSlideBtn.style.display = totalSlides > 1 ? 'flex' : 'none'; if (sliderDots) sliderDots.style.display = totalSlides > 1 ? 'flex' : 'none'; }
    function nextSlide() { showSlide(currentSlideIndex + 1); }
    function prevSlide() { showSlide(currentSlideIndex - 1); }
    function dragStart(e) { e.preventDefault(); if (totalSlides <= 1) return; isDragging = true; isSwiping = false; startPosX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX; sliderWrapper.style.transition = 'none'; prevTranslate = -currentSlideIndex * sliderWrapper.clientWidth; }
    function dragMove(e) { if (!isDragging) return; isSwiping = true; const currentPosition = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX; currentTranslate = prevTranslate + currentPosition - startPosX; sliderWrapper.style.transform = `translateX(${currentTranslate}px)`; }
    function dragEnd() { if (!isDragging || totalSlides <= 1) return; isDragging = false; const movedBy = currentTranslate - prevTranslate; sliderWrapper.style.transition = 'transform 0.4s ease-in-out'; if (isSwiping) { if (movedBy < -50 && currentSlideIndex < totalSlides - 1) currentSlideIndex++; if (movedBy > 50 && currentSlideIndex > 0) currentSlideIndex--; } showSlide(currentSlideIndex); }

    function openDetailModal(product) {
        if (!product || !detailInfo || !sliderWrapper || !detailThumbnailList || !sliderDots) return;
        const category = allCategories.find(c => c.id === product.categoryId);
        detailInfo.innerHTML = ` <h2>${product.name}</h2> <p class="price">$${product.price}</p> <p class="product-description-display">${product.description || ''}</p> <dl class="details-grid"> <dt>分類</dt><dd>${category ? category.name : '未分類'}</dd> <dt>編號</dt><dd>${product.sku || 'N/A'}</dd> <dt>EAN-13</dt><dd>${product.ean13 || 'N/A'}</dd> </dl> ${product.ean13 ? `<div class="barcode-display"><svg id="detail-barcode"></svg></div>` : ''} `;

        sliderWrapper.innerHTML = '';
        detailThumbnailList.innerHTML = '';
        sliderDots.innerHTML = '';

        const imageUrls = product.imageUrls || [];
        totalSlides = imageUrls.length;
        currentSlideIndex = 0;

        if (totalSlides > 0) {
            // ▼▼▼ *** 核心修正 *** ▼▼▼
            // 迴圈中的變數從 url 改為 item，因為現在陣列裡的是物件
            imageUrls.forEach((item, index) => {
                // 從 item 物件中提取 .url 屬性給 src
                sliderWrapper.innerHTML += `<div class="slide"><img src="${item.url}" alt="${product.name} - 圖片 ${index + 1}"></div>`;
                detailThumbnailList.innerHTML += `<div class="thumbnail-item"><img src="${item.url}" data-index="${index}" alt="產品縮圖 ${index + 1}"></div>`;
                sliderDots.innerHTML += `<div class="dot" data-index="${index}"></div>`;
            });
            // ▲▲▲ *** 修正結束 *** ▲▲▲

            setTimeout(() => {
                sliderWrapper.querySelectorAll('.slide img').forEach(img => {
                    img.addEventListener('click', (e) => {
                        if (isSwiping) return;
                        e.stopPropagation();
                        openLightbox(e.target.src);
                    });
                });
            }, 0);
        } else {
            sliderWrapper.innerHTML = `<div class="slide"><img src="" alt="無圖片"></div>`;
            totalSlides = 1;
        }

        sliderWrapper.style.transform = 'translateX(0px)';
        updateUI();
        if (detailModal) detailModal.classList.remove('hidden');
        document.body.classList.add('modal-open');

        if (product.ean13) {
            setTimeout(() => {
                const barcodeElement = document.getElementById('detail-barcode');
                if (barcodeElement) try {
                    JsBarcode(barcodeElement, product.ean13, { format: "EAN13", displayValue: true, background: "#ffffff", lineColor: "#000000", height: 50, margin: 10 });
                } catch (e) { console.error('JsBarcode error:', e); }
            }, 0);
        }
    }

    function closeModal() { if (detailModal) detailModal.classList.add('hidden'); document.body.classList.remove('modal-open'); }

    function applyTransform() { if (viewerImage) window.requestAnimationFrame(() => { viewerImage.style.transform = `translate(${lightboxState.pointX}px, ${lightboxState.pointY}px) scale(${lightboxState.scale})`; }); }
    function resetLightbox() { lightboxState = { scale: 1, isPanning: false, pointX: 0, pointY: 0, startX: 0, startY: 0, startPointX: 0, startPointY: 0, didPan: false, initialPinchDistance: 0 }; applyTransform(); }
    function openLightbox(url) { if (!imageViewerModal || !viewerImage) return; viewerImage.setAttribute('src', url); imageViewerModal.classList.remove('hidden'); document.body.classList.add('lightbox-open'); }
    function closeLightbox() { if (!imageViewerModal) return; imageViewerModal.classList.add('hidden'); resetLightbox(); document.body.classList.remove('lightbox-open'); }
    function getDistance(touches) { return Math.sqrt(Math.pow(touches[0].clientX - touches[1].clientX, 2) + Math.pow(touches[0].clientY - touches[1].clientY, 2)); }

    function interactionStart(e) { e.preventDefault(); lightboxState.didPan = false; if (e.type === 'mousedown') { lightboxState.isPanning = true; lightboxState.startX = e.clientX; lightboxState.startY = e.clientY; } else if (e.type === 'touchstart') { if (e.touches.length === 1) { lightboxState.isPanning = true; lightboxState.startX = e.touches[0].clientX; lightboxState.startY = e.touches[0].clientY; } else if (e.touches.length >= 2) { lightboxState.isPanning = false; lightboxState.initialPinchDistance = getDistance(e.touches); } } lightboxState.startPointX = lightboxState.pointX; lightboxState.startPointY = lightboxState.pointY; if (imageViewerModal) imageViewerModal.classList.add('panning'); }
    function interactionMove(e) {
        e.preventDefault();
        if (lightboxState.isPanning) {
            // 單指拖曳平移的邏輯 (保持不變)
            const currentX = e.type === 'mousemove' ? e.clientX : e.touches[0].clientX;
            const currentY = e.type === 'mousemove' ? e.clientY : e.touches[0].clientY;
            const deltaX = currentX - lightboxState.startX;
            const deltaY = currentY - lightboxState.startY;
            if (!lightboxState.didPan && Math.sqrt(deltaX * deltaX + deltaY * deltaY) > 5) lightboxState.didPan = true;
            lightboxState.pointX = lightboxState.startPointX + deltaX;
            lightboxState.pointY = lightboxState.startPointY + deltaY;
            applyTransform();
        } else if (e.type === 'touchmove' && e.touches.length >= 2) {
            // 【核心修改】雙指縮放的邏輯
            lightboxState.didPan = true;
            const newPinchDistance = getDistance(e.touches);
            const scaleMultiplier = newPinchDistance / lightboxState.initialPinchDistance;
            const newScale = lightboxState.scale * scaleMultiplier;

            // 更新縮放比例，並限制在 1倍 到 5倍 之間
            lightboxState.scale = Math.max(1, Math.min(newScale, 5));

            // 同樣地，不再計算雙指的中點來移動圖片，只更新縮放
            applyTransform();

            // 更新初始距離以進行下一次計算
            lightboxState.initialPinchDistance = newPinchDistance;
        }
    }
    function interactionEnd(e) { e.preventDefault(); if (!lightboxState.didPan) closeLightbox(); lightboxState.isPanning = false; lightboxState.initialPinchDistance = 0; if (imageViewerModal) imageViewerModal.classList.remove('panning'); }
    function handleWheel(e) {
        e.preventDefault();
        lightboxState.didPan = true;
        const delta = -e.deltaY; // 獲取滾動方向

        // 計算新的縮放比例
        const newScale = lightboxState.scale * (delta > 0 ? 1.2 : 1 / 1.2);

        // 將縮放比例限制在 1倍 到 5倍 之間
        lightboxState.scale = Math.max(1, Math.min(newScale, 5));

        // 【核心修改】不再計算滑鼠位置，直接套用新的縮放比例。
        // 圖片的平移位置 (pointX, pointY) 在縮放時保持不變。
        // 真正的縮放原點將由 CSS 的 transform-origin: center center; 決定。
        applyTransform();
    }

    // --- 初始化與事件監聽 ---
    function init() {
        if (themeToggle) themeToggle.addEventListener('click', () => { document.body.classList.toggle('dark-mode'); localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light'); });
        if (searchBox) { searchBox.addEventListener('input', () => { clearTimeout(searchDebounceTimer); searchDebounceTimer = setTimeout(() => { state.searchTerm = searchBox.value.trim(); state.currentPage = 1; fetchProducts(); }, 300); }); }

        if (categoryTreeContainer) {
            categoryTreeContainer.addEventListener('click', e => {
                const link = e.target.closest('a');
                if (!link) return;

                const iconClicked = e.target.closest('.category-toggle-icon');
                if (iconClicked) {
                    e.preventDefault();
                    const parentLi = link.parentElement;
                    iconClicked.classList.toggle('expanded');
                    const submenu = parentLi.querySelector('ul');
                    if (submenu) {
                        if (submenu.classList.contains('hidden')) {
                            submenu.classList.remove('hidden');
                            submenu.style.maxHeight = submenu.scrollHeight + "px";
                        } else {
                            submenu.style.maxHeight = "0";
                            setTimeout(() => { submenu.classList.add('hidden'); }, 400);
                        }
                    }
                } else {
                    e.preventDefault();
                    const href = link.getAttribute('href');
                    if (window.location.pathname !== href) {
                        history.pushState({ path: href }, '', href);
                        handleRouteChange();
                    }
                    if (window.innerWidth <= 767) {
                        document.body.classList.remove('sidebar-open');
                    }
                }
            });
        }

        window.addEventListener('popstate', handleRouteChange);

        if (menuToggleBtn) menuToggleBtn.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
        if (pageOverlay) pageOverlay.addEventListener('click', () => document.body.classList.remove('sidebar-open'));
        if (prevSlideBtn) prevSlideBtn.addEventListener('click', prevSlide);
        if (nextSlideBtn) nextSlideBtn.addEventListener('click', nextSlide);
        if (sliderWrapper) { sliderWrapper.addEventListener('mousedown', dragStart); sliderWrapper.addEventListener('touchstart', dragStart, { passive: true }); sliderWrapper.addEventListener('mouseup', dragEnd); sliderWrapper.addEventListener('touchend', dragEnd); sliderWrapper.addEventListener('mouseleave', dragEnd); sliderWrapper.addEventListener('mousemove', dragMove); sliderWrapper.addEventListener('touchmove', dragMove, { passive: true }); }
        if (detailThumbnailList) detailThumbnailList.addEventListener('click', e => { if (e.target.dataset.index) showSlide(parseInt(e.target.dataset.index)); });
        if (sliderDots) sliderDots.addEventListener('click', e => { if (e.target.dataset.index) showSlide(parseInt(e.target.dataset.index)); });
        document.addEventListener('keydown', e => { if (detailModal && !detailModal.classList.contains('hidden')) { if (e.key === 'ArrowLeft') prevSlide(); if (e.key === 'ArrowRight') nextSlide(); } });
        if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
        if (detailModal) detailModal.addEventListener('click', e => { if (e.target === detailModal) closeModal(); });
        if (imageViewerModal) { imageViewerModal.addEventListener('wheel', handleWheel, { passive: false }); imageViewerModal.addEventListener('mousedown', interactionStart); imageViewerModal.addEventListener('mousemove', interactionMove); imageViewerModal.addEventListener('mouseup', interactionEnd); imageViewerModal.addEventListener('mouseleave', interactionEnd); imageViewerModal.addEventListener('touchstart', interactionStart, { passive: false }); imageViewerModal.addEventListener('touchmove', interactionMove, { passive: false }); imageViewerModal.addEventListener('touchend', interactionEnd); }
        if (searchToggleBtn) { searchToggleBtn.addEventListener('click', () => { toolbar.classList.add('search-active'); searchBox.focus(); }); }
        if (searchBox) { searchBox.addEventListener('blur', () => { if (searchBox.value === '') { toolbar.classList.remove('search-active'); } }); }
        if (categoryToggleBtn) { categoryToggleBtn.addEventListener('click', () => document.body.classList.toggle('sidebar-open')); }
        if (sortBtn) { sortBtn.addEventListener('click', (e) => { e.stopPropagation(); sortOptionsContainer.classList.toggle('hidden'); }); }
        if (sortOptionsContainer) { sortOptionsContainer.addEventListener('click', (e) => { e.preventDefault(); const target = e.target.closest('a'); if (target) { state.sortBy = target.dataset.value; state.currentPage = 1; sortBtnText.textContent = target.textContent; sortOptionsContainer.classList.add('hidden'); fetchProducts(); } }); }
        if (orderToggleBtn) { orderToggleBtn.addEventListener('click', () => { state.order = (state.order === 'asc') ? 'desc' : 'asc'; state.currentPage = 1; orderToggleBtn.dataset.order = state.order; fetchProducts(); }); }
        document.addEventListener('click', () => { if (sortOptionsContainer && !sortOptionsContainer.classList.contains('hidden')) { sortOptionsContainer.classList.add('hidden'); } });
        const currentTheme = localStorage.getItem('theme');
        if (currentTheme === 'dark') document.body.classList.add('dark-mode');
        if (viewToggleBtn && productList) { const savedView = localStorage.getItem('productView') || 'two-columns'; if (savedView === 'two-columns') { productList.classList.add('view-two-columns'); viewToggleBtn.classList.remove('list-view-active'); } else { productList.classList.remove('view-two-columns'); viewToggleBtn.classList.add('list-view-active'); } viewToggleBtn.addEventListener('click', () => { productList.classList.toggle('view-two-columns'); const isTwoColumns = productList.classList.contains('view-two-columns'); viewToggleBtn.classList.toggle('list-view-active', !isTwoColumns); localStorage.setItem('productView', isTwoColumns ? 'two-columns' : 'one-column'); }); }

        loadInitialData().then(() => {
            handleRouteChange();
        });
    }

    init();
});