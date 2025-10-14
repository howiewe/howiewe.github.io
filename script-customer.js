// script-customer.js (最終整合版 - 支援獨立產品 URL)

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM 元素宣告 (保持不變) ---
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

    // --- 前端狀態管理 (保持不變) ---
    let allCategories = [];
    let currentProducts = [];
    let state = {
        currentPage: 1,
        totalPages: 1,
        categoryId: 'all',
        searchTerm: '',
        sortBy: 'price',
        order: 'asc'
    };
    let searchDebounceTimer;

    // --- UI 互動相關狀態 (保持不變) ---
    let lightboxState = { scale: 1, isPanning: false, pointX: 0, pointY: 0, startX: 0, startY: 0, didPan: false };
    let currentSlideIndex = 0, totalSlides = 0, isDragging = false, startPosX = 0, currentTranslate = 0, prevTranslate = 0, isSwiping = false;


    // --- 【核心修改】全新的前端路由處理函式 ---
    // 這個函式現在是網站的大腦，它會根據當前的 URL 決定要顯示什麼內容。
    async function handleRouteChange() {
        const path = window.location.pathname;

        // 情況一：如果 URL 是 /product/ID/... 的格式
        if (path.startsWith('/product/')) {
            const pathParts = path.split('/'); // e.g., ["", "product", "123", "產品名稱"]
            if (pathParts.length > 2 && !isNaN(parseInt(pathParts[2]))) {
                const productId = parseInt(pathParts[2]);
                
                // 為了讓背景看起來正常，我們先載入產品列表
                // 如果彈窗已開啟，先不要關閉它，等待新資料
                if (!detailModal.classList.contains('hidden')) {
                     // 可以顯示一個載入遮罩在彈窗上
                } else {
                    // 如果是直接訪問，先顯示列表的載入中
                    productList.innerHTML = '<p class="empty-message">正在載入產品...</p>';
                }

                await fetchProducts(); // 載入背景的產品列表
                
                // 接著，專門去抓取這一個產品的詳細資料
                const product = await fetchProductById(productId);
                
                if (product) {
                    // 抓到資料後，打開或更新彈窗
                    openDetailModal(product, false); //傳入 false 表示不要再 pushState
                } else {
                    // 如果 API 找不到這個產品，就導回首頁
                    alert('找不到該產品。');
                    history.replaceState({}, '產品展示', '/');
                    await fetchProducts();
                }
            }
        }
        // 情況二：如果 URL 是 /category/ID/... 的格式 (您原有的邏輯)
        else if (path.startsWith('/category/')) {
            closeModal(false); // 確保從產品頁返回時，彈窗已關閉
            const pathParts = path.split('/');
            const newCategoryId = (pathParts.length > 2 && !isNaN(parseInt(pathParts[2]))) ? parseInt(pathParts[2]) : 'all';
            
            if (state.categoryId !== newCategoryId) {
                state.categoryId = newCategoryId;
                state.currentPage = 1;
                await fetchProducts();
            }
        }
        // 情況三：其他所有情況，都視為首頁
        else {
            closeModal(false); // 確保從產品頁返回時，彈窗已關閉
            if (state.categoryId !== 'all') {
                state.categoryId = 'all';
                state.currentPage = 1;
                await fetchProducts();
            } else if (currentProducts.length === 0) { // 如果是首次載入
                await fetchProducts();
            }
        }
        
        // 無論路由如何變化，都更新側邊欄的選中狀態
        updateSidebarActiveState();
    }
    
    // 【新增】一個小幫手函式，用來更新側邊欄的 active 樣式
    function updateSidebarActiveState() {
        document.querySelectorAll('#category-tree a').forEach(a => {
            const linkPath = a.getAttribute('href');
            // 處理首頁
            if (linkPath === '/' && (state.categoryId === 'all' && !window.location.pathname.startsWith('/category'))) {
                a.classList.add('active');
            }
            // 處理分類頁
            else if (linkPath.startsWith('/category/') && linkPath.split('/')[2] == state.categoryId) {
                 a.classList.add('active');
            }
            else {
                a.classList.remove('active');
            }
        });
    }

    // --- 核心資料獲取函式 ---

    // 【新增函式】專門用來根據 ID 抓取單一產品的資料
    async function fetchProductById(id) {
        try {
            const response = await fetch(`/api/products/${id}`);
            if (!response.ok) throw new Error('Product not found in API');
            const product = await response.json();
            return product;
        } catch (error) {
            console.error(`Failed to fetch product ${id}:`, error);
            return null;
        }
    }

    // fetchProducts 函式保持不變
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
    
    // loadInitialData 保持不變
    async function loadInitialData() {
        try {
            const response = await fetch('/api/all-data?t=' + new Date().getTime());
            if (!response.ok) throw new Error('無法載入分類');
            const data = await response.json();
            allCategories = data.categories || [];
            buildCategoryTree();
        } catch (err) {
            console.error("無法載入分類:", err);
            if (categoryTreeContainer) categoryTreeContainer.innerHTML = '分類載入失敗';
        }
    }

    // --- 渲染函式 (保持不變) ---
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
            // 【修改】這裡的 onclick 會呼叫新版的 openDetailModal
            card.onclick = () => openDetailModal(product, true); 

            const firstImageObject = (product.imageUrls && product.imageUrls.length > 0) ? product.imageUrls[0] : null;
            const imageUrl = firstImageObject ? firstImageObject.url : '';
            const imageSize = firstImageObject ? firstImageObject.size : 90;
            const priceHtml = (product.price !== null && product.price !== undefined)
                ? `<p class="price">$${product.price}</p>`
                : `<p class="price price-empty">&nbsp;</p>`;

            card.innerHTML = `<div class="image-container"><img src="${imageUrl}" class="product-image" alt="${product.name}" loading="lazy" style="transform: scale(${imageSize / 100});"></div><div class="product-info"><h3>${product.name}</h3>${priceHtml}</div>`;
            productList.appendChild(card);
        });
    }
    // renderPagination 和 buildCategoryTree 保持不變
    function renderPagination() { /* ... 您的原始程式碼 ... */ }
    function buildCategoryTree() { /* ... 您的原始程式碼 ... */ }

    // --- Slider & Modal & Lightbox 邏輯 ---

    // 【核心修改】修改 openDetailModal 和 closeModal
    function openDetailModal(product, shouldPushState = true) {
        if (!product || !detailInfo || !sliderWrapper || !detailThumbnailList || !sliderDots) return;
        
        // --- 彈窗內容生成的邏輯完全不變 ---
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
        // --- 彈窗內容生成結束 ---

        // 【新增的 URL 控制邏輯】
        if (shouldPushState) {
            const productUrlName = encodeURIComponent(product.name);
            const newUrl = `/product/${product.id}/${productUrlName}`;
            const newTitle = `${product.name} - 產品展示`;
            // 只有在 URL 真的改變時才 pushState，避免重複
            if (window.location.pathname !== newUrl) {
                history.pushState({ productId: product.id }, newTitle, newUrl);
                document.title = newTitle;
            }
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

    function closeModal(shouldPushState = true) {
        if (detailModal) detailModal.classList.add('hidden');
        document.body.classList.remove('modal-open');

        // 【新增的 URL 控制邏輯】
        // 當手動關閉彈窗時，也把 URL 推回到上一層的分類頁或首頁
        if (shouldPushState && window.location.pathname.startsWith('/product/')) {
            const lastCategoryUrl = `/category/${state.categoryId}/${allCategories.find(c=>c.id === state.categoryId)?.name || ''}`
            const targetUrl = state.categoryId === 'all' ? '/' : lastCategoryUrl;
            history.pushState({}, '產品展示', targetUrl);
            document.title = '光華工業有限公司';
        }
    }

    // --- 其他所有互動函式 (Slider, Lightbox 等) 保持完全不變 ---
    function showSlide(index) { /* ... 您的原始程式碼 ... */ }
    function updateUI() { /* ... 您的原始程式碼 ... */ }
    function nextSlide() { /* ... 您的原始程式碼 ... */ }
    function prevSlide() { /* ... 您的原始程式碼 ... */ }
    function dragStart(e) { /* ... 您的原始程式碼 ... */ }
    function dragMove(e) { /* ... 您的原始程式碼 ... */ }
    function dragEnd() { /* ... 您的原始程式碼 ... */ }
    function applyTransform() { /* ... 您的原始程式碼 ... */ }
    function resetLightbox() { /* ... 您的原始程式碼 ... */ }
    function openLightbox(url) { /* ... 您的原始程式碼 ... */ }
    function closeLightbox() { /* ... 您的原始程式碼 ... */ }
    function getDistance(touches) { /* ... 您的原始程式碼 ... */ }
    function interactionStart(e) { /* ... 您的原始程式碼 ... */ }
    function interactionMove(e) { /* ... 您的原始程式碼 ... */ }
    function interactionEnd(e) { /* ... 您的原始程式碼 ... */ }
    function handleWheel(e) { /* ... 您的原始程式碼 ... */ }


    // --- 初始化與事件監聽 ---
    function init() {
        // ... (您現有的 themeToggle, searchBox 的監聽器保持不變) ...

        if (categoryTreeContainer) {
            categoryTreeContainer.addEventListener('click', e => {
                const link = e.target.closest('a');
                if (!link) return;

                const iconClicked = e.target.closest('.category-toggle-icon');
                if (iconClicked) {
                    // 折疊選單的邏輯不變
                    e.preventDefault();
                    // ... (您現有的折疊邏輯) ...
                } else {
                    // 【修改】點擊分類連結時，使用 pushState 而不是直接跳轉
                    e.preventDefault();
                    const href = link.getAttribute('href');
                    if (window.location.pathname !== href) {
                        history.pushState({ path: href }, '', href);
                        handleRouteChange(); // 呼叫路由處理器
                    }
                    if (window.innerWidth <= 767) {
                        document.body.classList.remove('sidebar-open');
                    }
                }
            });
        }

        // 【修改】popstate 事件現在只會呼叫路由處理器
        window.addEventListener('popstate', handleRouteChange);

        // --- 其他所有事件監聽器保持不變 ---
        if (menuToggleBtn) menuToggleBtn.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
        if (pageOverlay) pageOverlay.addEventListener('click', () => document.body.classList.remove('sidebar-open'));
        if (prevSlideBtn) prevSlideBtn.addEventListener('click', prevSlide);
        if (nextSlideBtn) nextSlideBtn.addEventListener('click', nextSlide);
        if (sliderWrapper) { /* ... 您的原始程式碼 ... */ }
        if (detailThumbnailList) detailThumbnailList.addEventListener('click', e => { if (e.target.dataset.index) showSlide(parseInt(e.target.dataset.index)); });
        if (sliderDots) sliderDots.addEventListener('click', e => { if (e.target.dataset.index) showSlide(parseInt(e.target.dataset.index)); });
        document.addEventListener('keydown', e => { if (detailModal && !detailModal.classList.contains('hidden')) { if (e.key === 'ArrowLeft') prevSlide(); if (e.key === 'ArrowRight') nextSlide(); } });
        // 【修改】 closeModal 現在需要傳入參數
        if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => closeModal(true));
        if (detailModal) detailModal.addEventListener('click', e => { if (e.target === detailModal) closeModal(true); });
        if (imageViewerModal) { /* ... 您的原始程式碼 ... */ }
        if (searchToggleBtn) { /* ... 您的原始程式碼 ... */ }
        if (searchBox) { /* ... 您的原始程式碼 ... */ }
        if (categoryToggleBtn) { /* ... 您的原始程式碼 ... */ }
        if (sortBtn) { /* ... 您的原始程式碼 ... */ }
        if (sortOptionsContainer) { /* ... 您的原始程式碼 ... */ }
        if (orderToggleBtn) { /* ... 您的原始程式碼 ... */ }
        document.addEventListener('click', () => { /* ... 您的原始程式碼 ... */ });
        const currentTheme = localStorage.getItem('theme');
        if (currentTheme === 'dark') document.body.classList.add('dark-mode');
        if (viewToggleBtn && productList) { /* ... 您的原始程式碼 ... */ }

        // 【核心修改】頁面首次載入時的執行順序
        // 1. 先載入所有分類資料
        // 2. 然後呼叫路由處理器，讓它根據當前 URL 決定要顯示什麼
        loadInitialData().then(() => {
            handleRouteChange();
        });
    }

    init();
});