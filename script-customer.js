// script-customer.js (最終整合版：包含所有舊功能 + 彈窗獨立網址路由)
// 最後更新時間：2025-10-14

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM 元素宣告 (所有會用到的 HTML 元素都先在這裡宣告) ---
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
    const categoryDescriptionContainer = document.getElementById('category-description-container');

    // --- 前端狀態管理 (用來記錄網站當前的狀態) ---
    let allCategories = []; // 儲存所有分類資料
    let currentProducts = []; // 只儲存當前頁的產品
    let state = {
        currentPage: 1,
        totalPages: 1,
        categoryId: 'all',
        searchTerm: '',
        sortBy: 'price',
        order: 'asc'
    };
    let searchDebounceTimer; // 用於搜尋輸入的延遲處理，避免頻繁發送請求

    // --- UI 互動相關狀態 (處理輪播圖、燈箱的複雜互動) ---
    let lightboxState = { scale: 1, isPanning: false, pointX: 0, pointY: 0, startX: 0, startY: 0, didPan: false };
    let currentSlideIndex = 0, totalSlides = 0, isDragging = false, startPosX = 0, currentTranslate = 0, prevTranslate = 0, isSwiping = false;

    // --- 核心資料獲取函式 ---

    /**
     * @description 根據目前 `state` 物件中的設定 (頁碼、分類、搜尋等)，向後端 API 請求產品列表資料
     */
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
            const response = await fetch(`/public/products?${params.toString()}`);
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

    /**
     * @description 【新增】根據產品 ID，向後端 API 請求單一產品的詳細資料
     * @param {number} id - 產品的 ID
     * @returns {Promise<object|null>} - 成功時回傳產品物件，失敗時回傳 null
     */
    async function fetchProductById(id) {
        try {
            // 呼叫我們為單一產品新增的 API 端點
            const response = await fetch(`/public/products/${id}`);
            if (!response.ok) {
                console.error(`找不到 ID 為 ${id} 的產品`);
                return null;
            }
            const product = await response.json();
            return product;
        } catch (error) {
            console.error(`抓取產品 ${id} 的資料時發生錯誤:`, error);
            return null;
        }
    }

    /**
     * @description 首次載入頁面時，獲取所有分類資料
     */
    async function loadInitialData() {
        try {
            const response = await fetch('/public/all-data?t=' + new Date().getTime());
            if (!response.ok) throw new Error('無法載入分類');
            const data = await response.json();
            allCategories = data.categories || [];
            buildCategoryTree();
        } catch (err) {
            console.error("無法載入分類:", err);
            if (categoryTreeContainer) categoryTreeContainer.innerHTML = '分類載入失敗';
        }
    }

    // --- 渲染函式 (負責將資料轉換成畫面) ---

    /**
     * @description 將 `currentProducts` 陣列中的產品資料渲染到產品列表區域
     */
    function renderProducts() {
        if (!productList) return;
        productList.innerHTML = '';
        if (currentProducts.length === 0) {
            productList.innerHTML = '<p class="empty-message">找不到符合條件的產品。</p>';
            return;
        }
        currentProducts.forEach(product => {
            const cardLink = document.createElement('a');
            cardLink.className = 'product-card';

            const productUrlName = encodeURIComponent(product.name);
            cardLink.href = `/catalog/product/${product.id}/${productUrlName}`;

            // ▼▼▼ 【核心修正處】▼▼▼
            cardLink.addEventListener('click', (e) => {
                e.preventDefault(); // 1. 阻止瀏覽器直接跳轉

                // 2. 【補回這一步】手動更新瀏覽器的 URL 和歷史紀錄
                //    只有在 URL 真的改變時才執行，避免重複推入歷史紀錄
                if (window.location.pathname !== cardLink.pathname) {
                    history.pushState({ productId: product.id }, '', cardLink.href);
                }

                // 3. 執行我們原有的彈窗函式
                openDetailModal(product);
            });
            // ▲▲▲ 修正結束 ▲▲▲

            const firstImageObject = (product.imageUrls && product.imageUrls.length > 0) ? product.imageUrls[0] : null;
            const imageUrl = firstImageObject ? firstImageObject.url : '';
            const imageSize = firstImageObject ? firstImageObject.size : 90;
            const priceHtml = (product.price !== null && product.price !== undefined)
                ? `<p class="price">$${product.price}</p>`
                : `<p class="price price-empty">&nbsp;</p>`;

            cardLink.innerHTML = `<div class="image-container"><img src="${imageUrl}" class="product-image" alt="${product.name}" loading="lazy" style="transform: scale(${imageSize / 100});"></div><div class="product-info"><h3>${product.name}</h3>${priceHtml}</div>`;

            productList.appendChild(cardLink);
        });
    }

    /**
     * @description 根據 `state` 中的頁碼資訊，渲染分頁控制按鈕
     */
    function renderPagination() {
        if (!paginationControls) return;
        paginationControls.innerHTML = '';
        if (state.totalPages <= 1) return;

        // 獲取當前 URL 的基本路徑 (不含查詢參數)
        const baseUrl = window.location.pathname;

        // --- 上一頁按鈕 ---
        const prevPage = state.currentPage - 1;
        const prevHref = prevPage > 1 ? `${baseUrl}?page=${prevPage}` : baseUrl;
        const prevBtn = document.createElement('a'); // 改為 <a> 標籤
        prevBtn.className = 'btn btn-secondary';
        prevBtn.innerHTML = '&#10094;';
        prevBtn.title = '上一頁';
        if (state.currentPage === 1) {
            prevBtn.classList.add('disabled'); // 使用 class 來表示禁用狀態
            prevBtn.setAttribute('aria-disabled', 'true');
        } else {
            prevBtn.href = prevHref; // 只有在可點擊時才設定 href
        }

        // --- 頁碼資訊 (保持不變) ---
        const pageInfo = document.createElement('div');
        pageInfo.className = 'page-info';
        pageInfo.textContent = `${state.currentPage} / ${state.totalPages}`;

        // --- 下一頁按鈕 ---
        const nextPage = state.currentPage + 1;
        const nextHref = `${baseUrl}?page=${nextPage}`;
        const nextBtn = document.createElement('a'); // 改為 <a> 標籤
        nextBtn.className = 'btn btn-secondary';
        nextBtn.innerHTML = '&#10095;';
        nextBtn.title = '下一頁';
        if (state.currentPage === state.totalPages) {
            nextBtn.classList.add('disabled');
            nextBtn.setAttribute('aria-disabled', 'true');
        } else {
            nextBtn.href = nextHref;
        }

        // 將所有元素加入容器
        paginationControls.append(prevBtn, pageInfo, nextBtn);

        // ▼▼▼ 【核心】為分頁容器加上事件代理 ▼▼▼
        // 我們不在按鈕上單獨綁定事件，而是監聽整個容器的點擊
        paginationControls.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            // 檢查點擊的是否為一個可用的 <a> 連結
            if (link && !link.classList.contains('disabled')) {
                e.preventDefault(); // 阻止頁面刷新
                history.pushState({}, '', link.href); // 更新 URL
                handleRouteChange(); // 觸發路由處理，重新載入內容
            }
        });
    }

    /**
     * @description 根據 `allCategories` 資料，建立左側的分類樹結構
     */
    function buildCategoryTree() {
        // ... (此函式功能不變，保持原樣)
        if (!categoryTreeContainer) return;
        const categoryMap = new Map(allCategories.map(c => [c.id, { ...c, children: [] }]));
        const tree = [];
        for (const category of categoryMap.values()) {
            if (category.parentId === null) tree.push(category);
            else if (categoryMap.has(category.parentId)) categoryMap.get(category.parentId).children.push(category);
        }
        let html = `<ul><li><a href="/catalog" class="active">所有產品</a></li></ul>`;
        function createTreeHTML(nodes, depth = 0) {
            nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            let subHtml = `<ul class="${depth >= 2 ? 'hidden' : ''}">`;
            for (const node of nodes) {
                const hasChildren = node.children && node.children.length > 0;
                const categoryUrlName = encodeURIComponent(node.name);
                subHtml += `<li class="${hasChildren ? 'has-children' : ''}"><a href="/catalog/category/${node.id}/${categoryUrlName}"><span>${node.name}</span>`;
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

    async function handleRouteChange() {
        // 取得路徑和查詢參數
        const path = window.location.pathname;
        const searchParams = new URLSearchParams(window.location.search);

        // ▼▼▼ 【核心修改】從 URL 讀取 page 參數 ▼▼▼
        const newPage = parseInt(searchParams.get('page')) || 1;
        // ▲▲▲

        const catalogPath = path.startsWith('/catalog') ? path.substring('/catalog'.length) : path;
        const isProductPath = catalogPath.startsWith('/product/');
        const isCategoryPath = catalogPath.startsWith('/category/');
        const isModalOpen = !detailModal.classList.contains('hidden');

        // 1. 處理彈窗關閉邏輯 (不變)
        if (isModalOpen && !isProductPath) {
            closeModal(false);
        }

        // 2. 處理資料載入
        if (isProductPath) {
            const productId = parseInt(catalogPath.split('/')[2]);
            if (!isNaN(productId) && !isModalOpen) {
                productList.innerHTML = '<p class="empty-message">正在載入產品...</p>';
                const product = await fetchProductById(productId);
                if (product) {
                    await fetchProducts();
                    openDetailModal(product);
                } else {
                    history.replaceState({}, '產品展示', '/catalog');
                    await fetchProducts();
                }
            }
        } else if (isCategoryPath) {
            const newCategoryId = parseInt(catalogPath.split('/')[2]) || 'all';
            // ▼▼▼ 【核心修改】檢查分類或頁碼是否有變動 ▼▼▼
            if (state.categoryId !== newCategoryId || state.currentPage !== newPage) {
                state.categoryId = newCategoryId;
                state.currentPage = newPage; // 更新 state
                await fetchProducts();
            }
            // ▲▲▲
        } else {
            // ▼▼▼ 【核心修改】檢查分類或頁碼是否有變動 ▼▼▼
            if (state.categoryId !== 'all' || currentProducts.length === 0 || state.currentPage !== newPage) {
                state.categoryId = 'all';
                state.currentPage = newPage; // 更新 state
                await fetchProducts();
            }
            // ▲▲▲
        }

        // 更新分類描述 (邏輯不變)
        if (categoryDescriptionContainer) {
            let description = '';
            if (state.categoryId !== 'all') {
                const currentCategory = allCategories.find(c => c.id === state.categoryId);
                if (currentCategory && currentCategory.description) {
                    description = `<p>${currentCategory.description.replace(/\n/g, '<br>')}</p>`;
                }
            }
            categoryDescriptionContainer.innerHTML = description;
        }

        // 3. 同步側邊欄 UI (邏輯不變)
        updateSidebarActiveState();
    }



    /**
     * @description 更新側邊欄分類的選中 (active) 狀態，使其與目前 URL 匹配
     */
    function updateSidebarActiveState() {
        const path = window.location.pathname;
        let activeId = 'all';

        if (path.startsWith('/catalog/category/')) {
            activeId = path.split('/')[3]; // /catalog/category/ID -> index 3
        }

        document.querySelectorAll('#category-tree a').forEach(a => {
            const linkPath = a.getAttribute('href');
            let linkId = 'all';

            if (linkPath.startsWith('/catalog/category/')) {
                linkId = linkPath.split('/')[3];
            } else if (linkPath !== '/catalog') { // 如果不是目錄首頁，就不是 'all'
                linkId = null; // 避免匹配到不相關的連結
            }

            if (String(activeId) === linkId) {
                a.classList.add('active');
            } else {
                a.classList.remove('active');
            }
        });
    }


    // --- 彈窗、輪播圖、燈箱等互動邏輯 ---

    /**
     * @description 【修改】打開產品詳情彈窗，並更新瀏覽器 URL
     * @param {object} product - 要顯示的產品物件
     */
    function openDetailModal(product) {
        if (!product || !detailInfo) return;

        // --- 第一步：產生彈窗內的 HTML 內容 (這部分邏輯不變) ---
        const category = allCategories.find(c => c.id === product.categoryId);
        detailInfo.innerHTML = ` <h2>${product.name}</h2> <p class="price">$${product.price}</p> <p class="product-description-display">${product.description || ''}</p> <dl class="details-grid"> <dt>分類</dt><dd>${category ? category.name : '未分類'}</dd> <dt>編號</dt><dd>${product.sku || 'N/A'}</dd> <dt>EAN-13</dt><dd>${product.ean13 || 'N/A'}</dd> </dl> ${product.ean13 ? `<div class="barcode-display"><svg id="detail-barcode"></svg></div>` : ''} `;
        sliderWrapper.innerHTML = '';
        detailThumbnailList.innerHTML = '';
        sliderDots.innerHTML = '';
        const imageUrls = product.imageUrls || [];
        totalSlides = imageUrls.length;
        currentSlideIndex = 0;
        if (totalSlides > 0) {
            imageUrls.forEach((item, index) => {
                sliderWrapper.innerHTML += `<div class="slide"><img src="${item.url}" alt="${product.name} - 圖片 ${index + 1}"></div>`;
                detailThumbnailList.innerHTML += `<div class="thumbnail-item"><img src="${item.url}" data-index="${index}" alt="產品縮圖 ${index + 1}"></div>`;
                sliderDots.innerHTML += `<div class="dot" data-index="${index}"></div>`;
            });
            setTimeout(() => { sliderWrapper.querySelectorAll('.slide img').forEach(img => { img.addEventListener('click', (e) => { if (isSwiping) return; e.stopPropagation(); openLightbox(e.target.src); }); }); }, 0);
        } else {
            sliderWrapper.innerHTML = `<div class="slide"><img src="" alt="無圖片"></div>`; totalSlides = 1;
        }

        if (totalSlides <= 1) {
            // 如果圖片只有一張或沒有圖片，就隱藏整個縮圖容器
            detailThumbnailList.classList.add('hidden');
        } else {
            // 如果有多張圖片，就確保縮圖容器是顯示的
            detailThumbnailList.classList.remove('hidden');
        }

        // --- 第三步：顯示彈窗並更新 UI (這部分邏輯不變) ---
        sliderWrapper.style.transform = 'translateX(0px)';
        updateUI();
        detailModal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        if (product.ean13) {
            setTimeout(() => {
                const barcodeElement = document.getElementById('detail-barcode');
                if (barcodeElement) try { JsBarcode(barcodeElement, product.ean13, { format: "EAN13", displayValue: true, background: "#ffffff", lineColor: "#000000", height: 50, margin: 10 }); } catch (e) { console.error('JsBarcode error:', e); }
            }, 0);
        }
    }

    /**
     * @description 【修改】關閉產品詳情彈窗，並在需要時更新 URL
     * @param {boolean} [updateHistory=true] - 是否要更動瀏覽器歷史紀錄。按上一頁時應為 false。
     */
    function closeModal(updateHistory = true) {
        detailModal.classList.add('hidden');
        document.body.classList.remove('modal-open');

        // 【核心修改】如果需要，將 URL 推回上一層 (這裡簡化為推回首頁)
        if (updateHistory && window.location.pathname.startsWith('/catalog/product/')) {
            const newTitle = '光華工業有限公司';
            history.pushState({}, newTitle, '/catalog'); // <--- 改成 /catalog
            document.title = newTitle;
        }
    }

    // --- 以下為所有舊功能的函式和事件監聽，保持不變，確保功能完整 ---

    // 輪播圖與燈箱相關函式 (不變)
    function showSlide(index) { if (!sliderWrapper || totalSlides <= 1) return; if (index >= totalSlides) index = 0; if (index < 0) index = totalSlides - 1; const sliderWidth = sliderWrapper.clientWidth; sliderWrapper.style.transform = `translateX(-${index * sliderWidth}px)`; currentSlideIndex = index; updateUI(); }
    function updateUI() { if (sliderDots) document.querySelectorAll('.dot').forEach((dot, i) => dot.classList.toggle('active', i === currentSlideIndex)); if (detailThumbnailList) document.querySelectorAll('#detail-thumbnail-list .thumbnail-item').forEach((item, i) => item.classList.toggle('active', i === currentSlideIndex)); if (prevSlideBtn) prevSlideBtn.style.display = totalSlides > 1 ? 'flex' : 'none'; if (nextSlideBtn) nextSlideBtn.style.display = totalSlides > 1 ? 'flex' : 'none'; if (sliderDots) sliderDots.style.display = totalSlides > 1 ? 'flex' : 'none'; }
    function nextSlide() { showSlide(currentSlideIndex + 1); }
    function prevSlide() { showSlide(currentSlideIndex - 1); }
    function dragStart(e) { e.preventDefault(); if (totalSlides <= 1) return; isDragging = true; isSwiping = false; startPosX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX; sliderWrapper.style.transition = 'none'; prevTranslate = -currentSlideIndex * sliderWrapper.clientWidth; }
    function dragMove(e) { if (!isDragging) return; isSwiping = true; const currentPosition = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX; currentTranslate = prevTranslate + currentPosition - startPosX; sliderWrapper.style.transform = `translateX(${currentTranslate}px)`; }
    function dragEnd() { if (!isDragging || totalSlides <= 1) return; isDragging = false; const movedBy = currentTranslate - prevTranslate; sliderWrapper.style.transition = 'transform 0.4s ease-in-out'; if (isSwiping) { if (movedBy < -50 && currentSlideIndex < totalSlides - 1) currentSlideIndex++; if (movedBy > 50 && currentSlideIndex > 0) currentSlideIndex--; } showSlide(currentSlideIndex); }
    function applyTransform() { if (viewerImage) window.requestAnimationFrame(() => { viewerImage.style.transform = `translate(${lightboxState.pointX}px, ${lightboxState.pointY}px) scale(${lightboxState.scale})`; }); }
    function resetLightbox() { lightboxState = { scale: 1, isPanning: false, pointX: 0, pointY: 0, startX: 0, startY: 0, startPointX: 0, startPointY: 0, didPan: false, initialPinchDistance: 0 }; applyTransform(); }
    function openLightbox(url) { if (!imageViewerModal || !viewerImage) return; viewerImage.setAttribute('src', url); imageViewerModal.classList.remove('hidden'); document.body.classList.add('lightbox-open'); }
    function closeLightbox() { if (!imageViewerModal) return; imageViewerModal.classList.add('hidden'); resetLightbox(); document.body.classList.remove('lightbox-open'); }
    function getDistance(touches) { return Math.sqrt(Math.pow(touches[0].clientX - touches[1].clientX, 2) + Math.pow(touches[0].clientY - touches[1].clientY, 2)); }
    function interactionStart(e) { e.preventDefault(); lightboxState.didPan = false; if (e.type === 'mousedown') { lightboxState.isPanning = true; lightboxState.startX = e.clientX; lightboxState.startY = e.clientY; } else if (e.type === 'touchstart') { if (e.touches.length === 1) { lightboxState.isPanning = true; lightboxState.startX = e.touches[0].clientX; lightboxState.startY = e.touches[0].clientY; } else if (e.touches.length >= 2) { lightboxState.isPanning = false; lightboxState.initialPinchDistance = getDistance(e.touches); } } lightboxState.startPointX = lightboxState.pointX; lightboxState.startPointY = lightboxState.pointY; if (imageViewerModal) imageViewerModal.classList.add('panning'); }
    function interactionMove(e) { e.preventDefault(); if (lightboxState.isPanning) { const currentX = e.type === 'mousemove' ? e.clientX : e.touches[0].clientX; const currentY = e.type === 'mousemove' ? e.clientY : e.touches[0].clientY; const deltaX = currentX - lightboxState.startX; const deltaY = currentY - lightboxState.startY; if (!lightboxState.didPan && Math.sqrt(deltaX * deltaX + deltaY * deltaY) > 5) lightboxState.didPan = true; lightboxState.pointX = lightboxState.startPointX + deltaX; lightboxState.pointY = lightboxState.startPointY + deltaY; applyTransform(); } else if (e.type === 'touchmove' && e.touches.length >= 2) { lightboxState.didPan = true; const newPinchDistance = getDistance(e.touches); const scaleMultiplier = newPinchDistance / lightboxState.initialPinchDistance; const newScale = lightboxState.scale * scaleMultiplier; lightboxState.scale = Math.max(1, Math.min(newScale, 5)); applyTransform(); lightboxState.initialPinchDistance = newPinchDistance; } }
    function interactionEnd(e) { e.preventDefault(); if (!lightboxState.didPan) closeLightbox(); lightboxState.isPanning = false; lightboxState.initialPinchDistance = 0; if (imageViewerModal) imageViewerModal.classList.remove('panning'); }
    function handleWheel(e) { e.preventDefault(); lightboxState.didPan = true; const delta = -e.deltaY; const newScale = lightboxState.scale * (delta > 0 ? 1.2 : 1 / 1.2); lightboxState.scale = Math.max(1, Math.min(newScale, 5)); applyTransform(); }

    /**
     * @description 網站初始化函式，設定所有事件監聽器
     */
    function init() {
        // 主題切換 (不變)
        if (themeToggle) themeToggle.addEventListener('click', () => { document.body.classList.toggle('dark-mode'); localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light'); });
        const currentTheme = localStorage.getItem('theme');
        if (currentTheme === 'dark') document.body.classList.add('dark-mode');

        // 搜尋功能 (不變)
        if (searchBox) { searchBox.addEventListener('input', () => { clearTimeout(searchDebounceTimer); searchDebounceTimer = setTimeout(() => { state.searchTerm = searchBox.value.trim(); state.currentPage = 1; fetchProducts(); }, 300); }); }

        // 分類樹點擊事件 (修改為使用 pushState)
        if (categoryTreeContainer) {
            categoryTreeContainer.addEventListener('click', e => {
                const link = e.target.closest('a');
                if (!link) return;
                const iconClicked = e.target.closest('.category-toggle-icon');
                if (iconClicked) { // 點擊的是展開/收合的箭頭
                    e.preventDefault();
                    const parentLi = link.parentElement;
                    iconClicked.classList.toggle('expanded');
                    const submenu = parentLi.querySelector('ul');
                    if (submenu) {
                        if (submenu.classList.contains('hidden')) { submenu.classList.remove('hidden'); submenu.style.maxHeight = submenu.scrollHeight + "px"; }
                        else { submenu.style.maxHeight = "0"; setTimeout(() => { submenu.classList.add('hidden'); }, 400); }
                    }
                } else { // 點擊的是分類連結本身
                    e.preventDefault();
                    const href = link.getAttribute('href');
                    // 只有在目標 URL 和目前 URL 不同時，才觸發路由變更
                    if (window.location.pathname !== href) {
                        history.pushState({ path: href }, '', href);
                        handleRouteChange();
                    }
                    if (window.innerWidth <= 767) { document.body.classList.remove('sidebar-open'); }
                }
            });
        }

        // 【核心修改】監聽瀏覽器的前進/後退按鈕事件，並交由路由器處理
        window.addEventListener('popstate', handleRouteChange);

        // 側邊欄、彈窗、輪播圖、燈箱的事件監聽 (不變)
        if (menuToggleBtn) menuToggleBtn.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
        if (pageOverlay) pageOverlay.addEventListener('click', () => document.body.classList.remove('sidebar-open'));
        if (prevSlideBtn) prevSlideBtn.addEventListener('click', prevSlide);
        if (nextSlideBtn) nextSlideBtn.addEventListener('click', nextSlide);
        if (sliderWrapper) { sliderWrapper.addEventListener('mousedown', dragStart); sliderWrapper.addEventListener('touchstart', dragStart, { passive: true }); sliderWrapper.addEventListener('mouseup', dragEnd); sliderWrapper.addEventListener('touchend', dragEnd); sliderWrapper.addEventListener('mouseleave', dragEnd); sliderWrapper.addEventListener('mousemove', dragMove); sliderWrapper.addEventListener('touchmove', dragMove, { passive: true }); }
        if (detailThumbnailList) detailThumbnailList.addEventListener('click', e => { if (e.target.dataset.index) showSlide(parseInt(e.target.dataset.index)); });
        if (sliderDots) sliderDots.addEventListener('click', e => { if (e.target.dataset.index) showSlide(parseInt(e.target.dataset.index)); });
        document.addEventListener('keydown', e => { if (detailModal && !detailModal.classList.contains('hidden')) { if (e.key === 'ArrowLeft') prevSlide(); if (e.key === 'ArrowRight') nextSlide(); } });
        if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => closeModal(true));
        if (detailModal) detailModal.addEventListener('click', e => { if (e.target === detailModal) closeModal(true); });
        if (imageViewerModal) { imageViewerModal.addEventListener('wheel', handleWheel, { passive: false }); imageViewerModal.addEventListener('mousedown', interactionStart); imageViewerModal.addEventListener('mousemove', interactionMove); imageViewerModal.addEventListener('mouseup', interactionEnd); imageViewerModal.addEventListener('mouseleave', interactionEnd); imageViewerModal.addEventListener('touchstart', interactionStart, { passive: false }); imageViewerModal.addEventListener('touchmove', interactionMove, { passive: false }); imageViewerModal.addEventListener('touchend', interactionEnd); }

        // 響應式 Toolbar (搜尋、分類按鈕) (不變)
        if (searchToggleBtn) { searchToggleBtn.addEventListener('click', () => { toolbar.classList.add('search-active'); searchBox.focus(); }); }
        if (searchBox) { searchBox.addEventListener('blur', () => { if (searchBox.value === '') { toolbar.classList.remove('search-active'); } }); }
        if (categoryToggleBtn) { categoryToggleBtn.addEventListener('click', () => document.body.classList.toggle('sidebar-open')); }

        // 排序功能 (不變)
        if (sortBtn) { sortBtn.addEventListener('click', (e) => { e.stopPropagation(); sortOptionsContainer.classList.toggle('hidden'); }); }
        if (sortOptionsContainer) {
            sortOptionsContainer.addEventListener('click', (e) => {
                e.preventDefault();
                const target = e.target.closest('a');
                if (target) {
                    const newSortBy = target.dataset.value;
                    if (state.sortBy === newSortBy) { sortOptionsContainer.classList.add('hidden'); return; }
                    state.sortBy = newSortBy;
                    if (newSortBy === 'updatedAt' || newSortBy === 'createdAt') { state.order = 'desc'; } else { state.order = 'asc'; }
                    orderToggleBtn.dataset.order = state.order;
                    sortBtnText.textContent = target.textContent;
                    state.currentPage = 1;
                    sortOptionsContainer.classList.add('hidden');
                    fetchProducts();
                }
            });
        }
        if (orderToggleBtn) { orderToggleBtn.addEventListener('click', () => { state.order = (state.order === 'asc') ? 'desc' : 'asc'; state.currentPage = 1; orderToggleBtn.dataset.order = state.order; fetchProducts(); }); }
        document.addEventListener('click', () => { if (sortOptionsContainer && !sortOptionsContainer.classList.contains('hidden')) { sortOptionsContainer.classList.add('hidden'); } });

        // 檢視模式切換 (不變)
        if (viewToggleBtn && productList) { const savedView = localStorage.getItem('productView') || 'two-columns'; if (savedView === 'two-columns') { productList.classList.add('view-two-columns'); viewToggleBtn.classList.remove('list-view-active'); } else { productList.classList.remove('view-two-columns'); viewToggleBtn.classList.add('list-view-active'); } viewToggleBtn.addEventListener('click', () => { productList.classList.toggle('view-two-columns'); const isTwoColumns = productList.classList.contains('view-two-columns'); viewToggleBtn.classList.toggle('list-view-active', !isTwoColumns); localStorage.setItem('productView', isTwoColumns ? 'two-columns' : 'one-column'); }); }

        // --- 啟動程序 ---
        // 1. 先載入所有分類資料，以便後續使用
        // 2. 分類載入後，呼叫中央路由器 handleRouteChange，讓它根據當前 URL 決定要顯示什麼
        loadInitialData().then(() => {
            handleRouteChange();
        });
    }

    // 執行初始化函式，讓網站動起來
    init();
});