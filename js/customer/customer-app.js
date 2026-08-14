// js/customer/customer-app.js
// 前台客戶端主調度控制器 (History 狀態同步、產品分頁渲染、分類樹、多層麵包屑與工具列)

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM 元素宣告 ---
    const productList = document.getElementById('product-list');
    const categoryTreeContainer = document.getElementById('category-tree');
    const breadcrumbContainer = document.getElementById('breadcrumb-container');
    const searchBox = document.getElementById('search-box');
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

    // --- 前端狀態管理 ---
    let allCategories = [];
    let currentProducts = [];
    let activeProduct = null;
    let state = {
        currentPage: 1,
        totalPages: 1,
        categoryId: 'all',
        searchTerm: '',
        sortBy: 'price',
        order: 'asc'
    };
    let searchDebounceTimer;

    // --- 輔助函式：HTML 轉義 ---
    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return String(unsafe)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // --- 輔助函式：取得分類祖先鏈 ---
    function getCategoryAncestors(categoryId, categories) {
        if (!categoryId || !categories || categories.length === 0) return [];
        const ancestors = [];
        let currentId = parseInt(categoryId, 10);
        const visited = new Set();
        while (currentId && !visited.has(currentId)) {
            visited.add(currentId);
            const cat = categories.find(c => c.id === currentId);
            if (!cat) break;
            ancestors.unshift(cat);
            currentId = cat.parentId;
        }
        return ancestors;
    }

    // --- 初始化 Slider 與 Lightbox 元件 ---
    if (window.ProductLightbox) {
        ProductLightbox.init({
            modal: imageViewerModal,
            imageEl: viewerImage
        });
    }

    if (window.ProductSlider) {
        ProductSlider.init({
            wrapper: sliderWrapper,
            dotsContainer: sliderDots,
            prevBtn: prevSlideBtn,
            nextBtn: nextSlideBtn,
            thumbnailsContainer: detailThumbnailList,
            onImageClick: (src) => {
                if (window.ProductLightbox) {
                    ProductLightbox.open(src);
                }
            }
        });
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
            const response = await fetch(`/public/products?${params.toString()}`);
            if (!response.ok) throw new Error(`網路回應不正常: ${response.statusText}`);
            const data = await response.json();

            currentProducts = data.products || [];
            state.totalPages = data.pagination?.totalPages || 1;
            state.currentPage = data.pagination?.currentPage || 1;

            renderProducts();
            renderPagination();

        } catch (err) {
            console.error("無法載入產品:", err);
            productList.innerHTML = `<p class="empty-message">無法載入產品資料。<br>請稍後再試。</p>`;
        }
    }

    async function fetchProductById(id) {
        try {
            const response = await fetch(`/public/products/${id}`);
            if (!response.ok) {
                console.error(`找不到 ID 為 ${id} 的產品`);
                return null;
            }
            return await response.json();
        } catch (error) {
            console.error(`抓取產品 ${id} 的資料時發生錯誤:`, error);
            return null;
        }
    }

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

    // --- 渲染函式 ---
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

            cardLink.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.location.pathname !== cardLink.pathname) {
                    history.pushState({ isModal: true, productId: product.id }, '', cardLink.href);
                }
                openDetailModal(product);
            });

            const firstImageObject = (product.imageUrls && product.imageUrls.length > 0) ? product.imageUrls[0] : null;
            const imageUrl = firstImageObject ? firstImageObject.url : '';
            const imageSize = firstImageObject ? firstImageObject.size : 90;
            const priceHtml = (product.price !== null && product.price !== undefined)
                ? `<p class="price">$${product.price}</p>`
                : `<p class="price price-empty">&nbsp;</p>`;

            cardLink.innerHTML = `
                <div class="image-container">
                    <img src="${imageUrl}" class="product-image" alt="${escapeHtml(product.name)}" loading="lazy" style="transform: scale(${imageSize / 100});">
                </div>
                <div class="product-info">
                    <h3>${escapeHtml(product.name)}</h3>
                    ${priceHtml}
                </div>
            `;

            productList.appendChild(cardLink);
        });
    }

    function renderPagination() {
        if (!paginationControls) return;
        paginationControls.innerHTML = '';
        if (state.totalPages <= 1) return;

        const baseUrl = window.location.pathname;

        const prevPage = state.currentPage - 1;
        const prevHref = prevPage > 1 ? `${baseUrl}?page=${prevPage}` : baseUrl;
        const prevBtn = document.createElement('a');
        prevBtn.className = 'btn btn-secondary';
        prevBtn.innerHTML = '&#10094;';
        prevBtn.title = '上一頁';
        if (state.currentPage === 1) {
            prevBtn.classList.add('disabled');
            prevBtn.setAttribute('aria-disabled', 'true');
        } else {
            prevBtn.href = prevHref;
        }

        const pageInfo = document.createElement('div');
        pageInfo.className = 'page-info';
        pageInfo.textContent = `${state.currentPage} / ${state.totalPages}`;

        const nextPage = state.currentPage + 1;
        const nextHref = `${baseUrl}?page=${nextPage}`;
        const nextBtn = document.createElement('a');
        nextBtn.className = 'btn btn-secondary';
        nextBtn.innerHTML = '&#10095;';
        nextBtn.title = '下一頁';
        if (state.currentPage === state.totalPages) {
            nextBtn.classList.add('disabled');
            nextBtn.setAttribute('aria-disabled', 'true');
        } else {
            nextBtn.href = nextHref;
        }

        paginationControls.append(prevBtn, pageInfo, nextBtn);

        paginationControls.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && !link.classList.contains('disabled')) {
                e.preventDefault();
                history.pushState({}, '', link.href);
                handleRouteChange();
            }
        });
    }

    function renderBreadcrumb(items) {
        if (!breadcrumbContainer) return;
        if (!items || items.length === 0) {
            breadcrumbContainer.innerHTML = '';
            return;
        }
        const parts = items.map((item, i) => {
            const isLast = i === items.length - 1;
            if (isLast) {
                return `<span class="breadcrumb-current" aria-current="page">${escapeHtml(item.name)}</span>`;
            }
            return `<a href="${escapeHtml(item.href)}" class="breadcrumb-link">${escapeHtml(item.name)}</a>`;
        });
        breadcrumbContainer.innerHTML = `<ol class="breadcrumb-trail">${parts.map(p => `<li>${p}</li>`).join('<li class="breadcrumb-sep" aria-hidden="true">›</li>')}</ol>`;
    }

    function updateBreadcrumbsAndTitle(product = null) {
        const items = [{ name: '首頁', href: '/' }];

        if (product) {
            items.push({ name: '產品分類', href: '/catalog/category' });
            const ancestors = product.categoryId ? getCategoryAncestors(product.categoryId, allCategories) : [];
            for (const cat of ancestors) {
                items.push({
                    name: cat.name,
                    href: `/catalog/category/${cat.id}/${encodeURIComponent(cat.name)}`
                });
            }
            items.push({ name: product.name });
            document.title = `${product.name} | 光華工業`;
        } else if (state.categoryId !== 'all') {
            items.push({ name: '產品分類', href: '/catalog/category' });
            const ancestors = getCategoryAncestors(state.categoryId, allCategories);
            for (let i = 0; i < ancestors.length; i++) {
                const cat = ancestors[i];
                const isLast = i === ancestors.length - 1;
                if (isLast) {
                    items.push({ name: cat.name });
                    document.title = `${cat.name} | 光華工業`;
                } else {
                    items.push({
                        name: cat.name,
                        href: `/catalog/category/${cat.id}/${encodeURIComponent(cat.name)}`
                    });
                }
            }
        } else {
            items.push({ name: '全部產品' });
            document.title = '全部產品 | 光華工業';
        }

        renderBreadcrumb(items);
    }

    function buildCategoryTree() {
        if (!categoryTreeContainer) return;

        if (categoryTreeContainer.innerHTML.trim() !== '') {
            return;
        }

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
                subHtml += `<li class="${hasChildren ? 'has-children' : ''}"><a href="/catalog/category/${node.id}/${categoryUrlName}"><span>${escapeHtml(node.name)}</span>`;
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
        const path = window.location.pathname;
        const searchParams = new URLSearchParams(window.location.search);
        const hash = window.location.hash;

        // 當網址中沒有 #lightbox 但燈箱開啟時，關閉燈箱
        if (document.body.classList.contains('lightbox-open') && hash !== '#lightbox') {
            if (window.ProductLightbox) ProductLightbox.closeDOM();
        }

        const newPage = parseInt(searchParams.get('page'), 10) || 1;
        const catalogPath = path.startsWith('/catalog') ? path.substring('/catalog'.length) : path;
        const isProductPath = catalogPath.startsWith('/product/');
        const isCategoryPath = catalogPath.startsWith('/category/');
        const isModalOpen = !detailModal.classList.contains('hidden');

        if (isModalOpen && !isProductPath) {
            closeModal(false);
        }

        if (isProductPath) {
            const productId = parseInt(catalogPath.split('/')[2], 10);
            if (!isNaN(productId)) {
                if (!activeProduct || activeProduct.id !== productId) {
                    const product = await fetchProductById(productId);
                    if (product) {
                        if (currentProducts.length === 0) {
                            state.categoryId = product.categoryId || 'all';
                            await fetchProducts();
                        }
                        openDetailModal(product);
                    } else {
                        history.replaceState({}, '光華工業有限公司', '/catalog');
                        state.categoryId = 'all';
                        await fetchProducts();
                        updateBreadcrumbsAndTitle(null);
                    }
                } else if (!isModalOpen) {
                    openDetailModal(activeProduct);
                }
            }
        } else if (isCategoryPath) {
            activeProduct = null;
            const newCategoryId = parseInt(catalogPath.split('/')[2], 10) || 'all';
            if (state.categoryId !== newCategoryId || state.currentPage !== newPage || currentProducts.length === 0) {
                state.categoryId = newCategoryId;
                state.currentPage = newPage;
                await fetchProducts();
            }
            updateBreadcrumbsAndTitle(null);
        } else {
            activeProduct = null;
            if (state.categoryId !== 'all' || currentProducts.length === 0 || state.currentPage !== newPage) {
                state.categoryId = 'all';
                state.currentPage = newPage;
                await fetchProducts();
            }
            updateBreadcrumbsAndTitle(null);
        }

        if (categoryDescriptionContainer) {
            let description = '';
            if (state.categoryId !== 'all') {
                const currentCategory = allCategories.find(c => c.id === state.categoryId);
                if (currentCategory && currentCategory.description) {
                    description = `<p>${escapeHtml(currentCategory.description).replace(/\n/g, '<br>')}</p>`;
                }
            }
            categoryDescriptionContainer.innerHTML = description;
        }

        updateSidebarActiveState();
    }

    function updateSidebarActiveState() {
        const path = window.location.pathname;
        let activeId = 'all';

        if (path.startsWith('/catalog/category/')) {
            activeId = path.split('/')[3];
        } else if (path.startsWith('/catalog/product/')) {
            if (activeProduct && activeProduct.categoryId) {
                activeId = String(activeProduct.categoryId);
            } else if (state.categoryId !== 'all') {
                activeId = String(state.categoryId);
            }
        }

        document.querySelectorAll('#category-tree a').forEach(a => {
            const linkPath = a.getAttribute('href');
            let linkId = 'all';

            if (linkPath && linkPath.startsWith('/catalog/category/')) {
                linkId = linkPath.split('/')[3];
            } else if (linkPath !== '/catalog') {
                linkId = null;
            }

            if (String(activeId) === linkId) {
                a.classList.add('active');

                // 自動展開父層目錄
                let parentLi = a.closest('li');
                while (parentLi) {
                    const parentUl = parentLi.parentElement;
                    if (parentUl && parentUl.tagName === 'UL') {
                        parentUl.classList.remove('hidden');
                        parentUl.style.maxHeight = 'none';
                        const toggleIcon = parentLi.querySelector(':scope > a > .category-toggle-icon');
                        if (toggleIcon) toggleIcon.classList.add('expanded');
                    }
                    parentLi = parentUl ? parentUl.closest('li') : null;
                }
            } else {
                a.classList.remove('active');
            }
        });
    }

    function openDetailModal(product) {
        if (!product || !detailInfo) return;
        activeProduct = product;

        const category = allCategories.find(c => c.id === product.categoryId);
        detailInfo.innerHTML = `
            <h2>${escapeHtml(product.name)}</h2>
            <p class="price">$${product.price}</p>
            <p class="product-description-display">${escapeHtml(product.description || '')}</p>
            <dl class="details-grid">
                <dt>分類</dt><dd>${category ? escapeHtml(category.name) : '未分類'}</dd>
                <dt>編號</dt><dd>${escapeHtml(product.sku || 'N/A')}</dd>
                <dt>EAN-13</dt><dd>${escapeHtml(product.ean13 || 'N/A')}</dd>
            </dl>
            ${product.ean13 ? `<div class="barcode-display"><svg id="detail-barcode"></svg></div>` : ''}
        `;

        if (window.ProductSlider) {
            ProductSlider.setup(product.imageUrls || [], product.name);
        }

        detailModal.classList.remove('hidden');
        document.body.classList.add('modal-open');

        updateBreadcrumbsAndTitle(product);
        updateSidebarActiveState();

        if (product.ean13) {
            setTimeout(() => {
                const barcodeElement = document.getElementById('detail-barcode');
                if (barcodeElement && window.JsBarcode) {
                    try {
                        JsBarcode(barcodeElement, product.ean13, {
                            format: "EAN13",
                            displayValue: true,
                            background: "#ffffff",
                            lineColor: "#000000",
                            height: 50,
                            margin: 10
                        });
                    } catch (e) {
                        console.error('JsBarcode error:', e);
                    }
                }
            }, 0);
        }
    }

    function closeModal(updateHistory = true) {
        detailModal.classList.add('hidden');
        document.body.classList.remove('modal-open');

        if (updateHistory && window.location.pathname.startsWith('/catalog/product/')) {
            if (history.state && history.state.isModal) {
                // 如果是站內點擊卡片開啟的彈窗，直接返回上一頁以恢復原 URL
                history.back();
            } else {
                // 如果是直接開啟商品網址，回到該商品所屬分類或目錄
                let targetUrl = '/catalog';
                if (activeProduct && activeProduct.categoryId) {
                    const cat = allCategories.find(c => c.id === activeProduct.categoryId);
                    if (cat) {
                        targetUrl = `/catalog/category/${cat.id}/${encodeURIComponent(cat.name)}`;
                    }
                }
                history.pushState({}, '', targetUrl);
                activeProduct = null;
                handleRouteChange();
            }
        } else {
            activeProduct = null;
            updateBreadcrumbsAndTitle(null);
            updateSidebarActiveState();
        }
    }

    // --- 初始化事件監聽 ---
    function init() {
        if (searchBox) {
            searchBox.addEventListener('input', () => {
                clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(() => {
                    state.searchTerm = searchBox.value.trim();
                    state.currentPage = 1;
                    fetchProducts();
                }, 300);
            });
        }

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

        if (breadcrumbContainer) {
            breadcrumbContainer.addEventListener('click', e => {
                const link = e.target.closest('a');
                if (!link) return;
                const href = link.getAttribute('href');
                if (href && href.startsWith('/catalog/category/')) {
                    e.preventDefault();
                    if (window.location.pathname !== href) {
                        history.pushState({ path: href }, '', href);
                        handleRouteChange();
                    }
                } else if (href === '/catalog') {
                    e.preventDefault();
                    if (window.location.pathname !== href) {
                        history.pushState({ path: href }, '', href);
                        handleRouteChange();
                    }
                }
            });
        }

        window.addEventListener('popstate', handleRouteChange);

        if (menuToggleBtn) menuToggleBtn.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
        if (pageOverlay) pageOverlay.addEventListener('click', () => document.body.classList.remove('sidebar-open'));

        document.addEventListener('keydown', e => {
            if (detailModal && !detailModal.classList.contains('hidden')) {
                if (e.key === 'Escape') {
                    closeModal(true);
                } else if (window.ProductSlider) {
                    if (e.key === 'ArrowLeft') ProductSlider.prev();
                    if (e.key === 'ArrowRight') ProductSlider.next();
                }
            }
        });

        if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => closeModal(true));
        if (detailModal) detailModal.addEventListener('click', e => { if (e.target === detailModal) closeModal(true); });

        if (searchToggleBtn) {
            searchToggleBtn.addEventListener('click', () => {
                toolbar.classList.add('search-active');
                searchBox.focus();
            });
        }
        if (searchBox) {
            searchBox.addEventListener('blur', () => {
                if (searchBox.value === '') {
                    toolbar.classList.remove('search-active');
                }
            });
        }
        if (categoryToggleBtn) {
            categoryToggleBtn.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
        }

        if (sortBtn) {
            sortBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                sortOptionsContainer.classList.toggle('hidden');
            });
        }
        if (sortOptionsContainer) {
            sortOptionsContainer.addEventListener('click', (e) => {
                e.preventDefault();
                const target = e.target.closest('a');
                if (target) {
                    const newSortBy = target.dataset.value;
                    if (state.sortBy === newSortBy) {
                        sortOptionsContainer.classList.add('hidden');
                        return;
                    }
                    state.sortBy = newSortBy;
                    if (newSortBy === 'updatedAt' || newSortBy === 'createdAt') {
                        state.order = 'desc';
                    } else {
                        state.order = 'asc';
                    }
                    orderToggleBtn.dataset.order = state.order;
                    sortBtnText.textContent = target.textContent;
                    state.currentPage = 1;
                    sortOptionsContainer.classList.add('hidden');
                    fetchProducts();
                }
            });
        }
        if (orderToggleBtn) {
            orderToggleBtn.addEventListener('click', () => {
                state.order = (state.order === 'asc') ? 'desc' : 'asc';
                state.currentPage = 1;
                orderToggleBtn.dataset.order = state.order;
                fetchProducts();
            });
        }
        document.addEventListener('click', () => {
            if (sortOptionsContainer && !sortOptionsContainer.classList.contains('hidden')) {
                sortOptionsContainer.classList.add('hidden');
            }
        });

        if (viewToggleBtn && productList) {
            const savedView = localStorage.getItem('productView') || 'two-columns';
            if (savedView === 'two-columns') {
                productList.classList.add('view-two-columns');
                viewToggleBtn.classList.remove('list-view-active');
            } else {
                productList.classList.remove('view-two-columns');
                viewToggleBtn.classList.add('list-view-active');
            }
            viewToggleBtn.addEventListener('click', () => {
                productList.classList.toggle('view-two-columns');
                const isTwoColumns = productList.classList.contains('view-two-columns');
                viewToggleBtn.classList.toggle('list-view-active', !isTwoColumns);
                localStorage.setItem('productView', isTwoColumns ? 'two-columns' : 'one-column');
            });
        }

        loadInitialData().then(() => {
            handleRouteChange();
        });
    }

    init();
});
