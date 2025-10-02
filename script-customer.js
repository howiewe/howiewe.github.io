// script-customer.js (已整合排序與全新 Toolbar)

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM 元素宣告 ---
    const productList = document.getElementById('product-list');
    const categoryTreeContainer = document.getElementById('category-tree');
    const searchBox = document.getElementById('search-box');
    const detailModal = document.getElementById('detail-modal-container');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const pageOverlay = document.getElementById('page-overlay');
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const sliderWrapper = document.getElementById('slider-wrapper');
    const detailThumbnailList = document.getElementById('detail-thumbnail-list');
    const detailInfo = document.getElementById('product-detail-info');
    const prevSlideBtn = document.getElementById('prev-slide-btn');
    const nextSlideBtn = document.getElementById('next-slide-btn');
    const sliderDots = document.getElementById('slider-dots');
    const imageViewerModal = document.getElementById('image-viewer-modal');
    const viewerImage = document.getElementById('viewer-image');
    // 【新增】Toolbar 相關元素
    const toolbar = document.getElementById('toolbar');
    const viewToggleBtn = document.getElementById('view-toggle-btn');
    const searchToggleBtn = document.getElementById('search-toggle-btn');
    const categoryToggleBtn = document.getElementById('category-toggle-btn');
    const sortBtn = document.getElementById('sort-btn');
    const sortBtnText = document.getElementById('sort-btn-text');
    const sortOptionsContainer = document.getElementById('sort-options');
    const orderToggleBtn = document.getElementById('order-toggle-btn');

    let lightboxState = { scale: 1, isPanning: false, pointX: 0, pointY: 0, startX: 0, startY: 0, didPan: false };

    // --- 全域變數 ---
    let allProducts = [], allCategories = [];
    let currentCategoryId = 'all';
    // 【新增】排序狀態管理
    let currentSort = {
        key: 'price', // 排序依據: 'price', 'name', 'updatedAt', 'createdAt'
        order: 'asc'  // 排序方向: 'asc' (升序), 'desc' (降序)
    };

    // (Slider 相關變數保持不變)
    let currentSlideIndex = 0, totalSlides = 0, isDragging = false, startPosX = 0, currentTranslate = 0, prevTranslate = 0, isSwiping = false;

    // --- 資料載入函式 (保持不變) ---
    async function loadData() {
        try {
            if (productList) productList.innerHTML = '<p class="empty-message">正在載入產品資料...</p>';
            const response = await fetch('/api/all-data?t=' + new Date().getTime());
            if (!response.ok) throw new Error(`網路回應不正常: ${response.status} ${response.statusText}`);
            const data = await response.json();
            allCategories = data.categories || [];
            allProducts = (data.products || []).map(p => {
                let parsedImageUrls = [];
                if (typeof p.imageUrls === 'string' && p.imageUrls.startsWith('[')) {
                    try { parsedImageUrls = JSON.parse(p.imageUrls); } catch (e) { console.error(`解析產品 ${p.id} 的 imageUrls 失敗:`, p.imageUrls); parsedImageUrls = []; }
                } else if (Array.isArray(p.imageUrls)) { parsedImageUrls = p.imageUrls; }
                return { ...p, imageUrls: parsedImageUrls };
            });
            buildCategoryTree();
            renderProducts(); // 第一次渲染會使用預設排序
        } catch (err) {
            console.error("無法載入資料:", err);
            if (productList) productList.innerHTML = `<p class="empty-message">無法載入產品資料。<br>請檢查網路連線或聯繫管理員。</p>`;
        }
    }

    // --- 分類樹 & 產品渲染 (核心修改處) ---
    // (buildCategoryTree, toggleSidebar, getCategoryIdsWithChildren 保持不變)
    function toggleSidebar() { document.body.classList.toggle('sidebar-open'); }

    // 【全新版本】buildCategoryTree 函數
    function buildCategoryTree() {
        if (!categoryTreeContainer) return;

        const categoryMap = new Map(allCategories.map(c => [c.id, { ...c, children: [] }]));
        const tree = [];
        for (const category of categoryMap.values()) {
            if (category.parentId === null) tree.push(category);
            else if (categoryMap.has(category.parentId)) categoryMap.get(category.parentId).children.push(category);
        }

        // 【修改 A1】將「所有產品」獨立出來，固定在最上方
        let html = `<ul><li><a href="#" class="active" data-id="all">所有產品</a></li></ul>`;

        // 這是遞迴函數，負責產生每一層的 HTML
        function createTreeHTML(nodes, depth = 0) {
            // 先依 sortOrder 排序
            nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

            // 【修改 B1】如果深度大於等於 1 (即第三層)，預設隱藏
            let subHtml = `<ul class="${depth >= 2 ? 'hidden' : ''}">`;

            for (const node of nodes) {
                const hasChildren = node.children && node.children.length > 0;

                // 【修改 B2】如果項目有子分類，就在 li 上加上 'has-children' class
                subHtml += `<li class="${hasChildren ? 'has-children' : ''}">`;
                subHtml += `<a href="#" data-id="${node.id}">`;
                subHtml += `<span>${node.name}</span>`; // 把文字包在 span 裡

                // 【修改 B2】如果項目有子分類，就加上箭頭圖示
                if (hasChildren) {
                    subHtml += `<span class="category-toggle-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></span>`;
                }

                subHtml += `</a>`;

                if (hasChildren) {
                    // 遞迴呼叫，並將深度 +1
                    subHtml += createTreeHTML(node.children, depth + 1);
                }
                subHtml += '</li>';
            }
            return subHtml + '</ul>';
        }

        // 將遞迴產生的樹狀結構，附加到 categoryTreeContainer
        categoryTreeContainer.innerHTML = html + createTreeHTML(tree);
    }

    const getCategoryIdsWithChildren = (startId) => {
        if (startId === 'all') return null;
        const ids = new Set();
        const queue = [startId];
        while (queue.length > 0) {
            const currentId = queue.shift();
            ids.add(currentId);
            const children = allCategories.filter(c => c.parentId === currentId);
            for (const child of children) queue.push(child.id);
        }
        return ids;
    };


    // 【核心修改】 renderProducts 函數現在會先排序再過濾
    function renderProducts() {
        if (!productList) return;

        // 1. 排序 (Sort)
        const sortedProducts = [...allProducts].sort((a, b) => {
            const valA = a[currentSort.key];
            const valB = b[currentSort.key];
            let comparison = 0;

            if (currentSort.key === 'name') {
                comparison = valA.localeCompare(valB, 'zh-Hant');
            } else if (currentSort.key === 'price') {
                comparison = valA - valB;
            } else { // createdAt & updatedAt
                comparison = new Date(valA) > new Date(valB) ? -1 : 1; // 日期越新越大，所以預設是降序
            }
            // 如果是升序，則反轉結果
            return currentSort.order === 'asc' ? comparison : -comparison;
        });

        // 2. 過濾 (Filter)
        const searchTerm = searchBox ? searchBox.value.toLowerCase() : '';
        const categoryIdsToDisplay = getCategoryIdsWithChildren(currentCategoryId);

        const filteredProducts = sortedProducts.filter(p => {
            const matchesCategory = categoryIdsToDisplay === null || (p.categoryId && categoryIdsToDisplay.has(p.categoryId));
            const matchesSearch = p.name.toLowerCase().includes(searchTerm) || (p.sku && p.sku.toLowerCase().includes(searchTerm));
            return matchesCategory && matchesSearch;
        });

        // 3. 渲染 (Render)
        productList.innerHTML = '';
        if (filteredProducts.length === 0) {
            productList.innerHTML = '<p class="empty-message">找不到符合條件的產品。</p>';
            return;
        }

        filteredProducts.forEach(product => {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.onclick = () => openDetailModal(product.id);
            const firstImage = (product.imageUrls && product.imageUrls.length > 0) ? product.imageUrls[0] : '';
            card.innerHTML = `
                <div class="image-container"><img src="${firstImage}" class="product-image" alt="${product.name}" loading="lazy" style="transform: scale(${(product.imageSize || 90) / 100});"></div>
                <div class="product-info"><h3>${product.name}</h3><p class="price">$${product.price}</p></div>
            `;
            productList.appendChild(card);
        });
    }

    // --- Slider & Modal & Lightbox 邏輯 (保持不變) ---
    // (所有 showSlide, updateUI, nextSlide, prevSlide, drag..., openDetailModal, closeModal, openLightbox, closeLightbox 等函式都保持原樣)
    function showSlide(index) {
        if (totalSlides <= 1) return;
        if (index >= totalSlides) index = 0;
        if (index < 0) index = totalSlides - 1;
        const sliderWidth = sliderWrapper.clientWidth;
        sliderWrapper.style.transform = `translateX(-${index * sliderWidth}px)`;
        currentSlideIndex = index;
        updateUI();
    }
    function updateUI() {
        if (sliderDots) document.querySelectorAll('.dot').forEach((dot, i) => dot.classList.toggle('active', i === currentSlideIndex));
        if (detailThumbnailList) document.querySelectorAll('#detail-thumbnail-list .thumbnail-item').forEach((item, i) => item.classList.toggle('active', i === currentSlideIndex));
        if (prevSlideBtn) prevSlideBtn.style.display = totalSlides > 1 ? 'flex' : 'none';
        if (nextSlideBtn) nextSlideBtn.style.display = totalSlides > 1 ? 'flex' : 'none';
        if (sliderDots) sliderDots.style.display = totalSlides > 1 ? 'flex' : 'none';
    }
    function nextSlide() { showSlide(currentSlideIndex + 1); }
    function prevSlide() { showSlide(currentSlideIndex - 1); }
    function dragStart(e) { e.preventDefault(); if (totalSlides <= 1) return; isDragging = true; isSwiping = false; startPosX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX; sliderWrapper.style.transition = 'none'; prevTranslate = -currentSlideIndex * sliderWrapper.clientWidth; }
    function dragMove(e) { if (!isDragging) return; isSwiping = true; const currentPosition = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX; currentTranslate = prevTranslate + currentPosition - startPosX; sliderWrapper.style.transform = `translateX(${currentTranslate}px)`; }
    function dragEnd() { if (!isDragging || totalSlides <= 1) return; isDragging = false; const movedBy = currentTranslate - prevTranslate; sliderWrapper.style.transition = 'transform 0.4s ease-in-out'; if (isSwiping) { if (movedBy < -50 && currentSlideIndex < totalSlides - 1) currentSlideIndex++; if (movedBy > 50 && currentSlideIndex > 0) currentSlideIndex--; } showSlide(currentSlideIndex); }
    function openDetailModal(id) {
        const product = allProducts.find(p => p.id === id);
        if (!product || !detailInfo || !sliderWrapper || !detailThumbnailList || !sliderDots) return;
        const category = allCategories.find(c => c.id === product.categoryId);
        detailInfo.innerHTML = ` <h2>${product.name}</h2> <p class="price">$${product.price}</p> <p>${product.description || ''}</p> <dl class="details-grid"> <dt>分類</dt><dd>${category ? category.name : '未分類'}</dd> <dt>編號</dt><dd>${product.sku || 'N/A'}</dd> <dt>EAN-13</dt><dd>${product.ean13 || 'N/A'}</dd> </dl> ${product.ean13 ? `<div class="barcode-display"><svg id="detail-barcode"></svg></div>` : ''} `;
        sliderWrapper.innerHTML = ''; detailThumbnailList.innerHTML = ''; sliderDots.innerHTML = '';
        const imageUrls = product.imageUrls || [];
        totalSlides = imageUrls.length; currentSlideIndex = 0;
        if (totalSlides > 0) { imageUrls.forEach((url, index) => { sliderWrapper.innerHTML += `<div class="slide"><img src="${url}" alt="${product.name} - 圖片 ${index + 1}"></div>`; detailThumbnailList.innerHTML += `<div class="thumbnail-item"><img src="${url}" data-index="${index}" alt="產品縮圖 ${index + 1}"></div>`; sliderDots.innerHTML += `<div class="dot" data-index="${index}"></div>`; }); setTimeout(() => { sliderWrapper.querySelectorAll('.slide img').forEach(img => { img.addEventListener('click', (e) => { if (isSwiping) { return; } e.stopPropagation(); openLightbox(e.target.src); }); }); }, 0); } else { sliderWrapper.innerHTML = `<div class="slide"><img src="" alt="無圖片"></div>`; totalSlides = 1; }
        sliderWrapper.style.transform = 'translateX(0px)'; updateUI();
        if (detailModal) detailModal.classList.remove('hidden'); document.body.classList.add('modal-open');
        if (product.ean13) { setTimeout(() => { const barcodeElement = document.getElementById('detail-barcode'); if (barcodeElement) try { JsBarcode(barcodeElement, product.ean13, { format: "EAN13", displayValue: true, background: "#ffffff", lineColor: "#000000", height: 50, margin: 10 }); } catch (e) { console.error('JsBarcode error:', e); } }, 0); }
    }
    function closeModal() { if (detailModal) detailModal.classList.add('hidden'); document.body.classList.remove('modal-open'); }
    function applyTransform() { if (viewerImage) { viewerImage.style.transform = `translate(${lightboxState.pointX}px, ${lightboxState.pointY}px) scale(${lightboxState.scale})`; } }
    function resetLightbox() { lightboxState = { scale: 1, isPanning: false, pointX: 0, pointY: 0, startX: 0, startY: 0 }; applyTransform(); }
    function openLightbox(url) { if (!imageViewerModal || !viewerImage) return; viewerImage.setAttribute('src', url); imageViewerModal.classList.remove('hidden'); }
    function closeLightbox() { if (!imageViewerModal) return; imageViewerModal.classList.add('hidden'); resetLightbox(); }
    function handleWheel(e) { e.preventDefault(); const xs = (e.clientX - lightboxState.pointX) / lightboxState.scale; const ys = (e.clientY - lightboxState.pointY) / lightboxState.scale; const delta = -e.deltaY; const newScale = lightboxState.scale * (delta > 0 ? 1.2 : 1 / 1.2); lightboxState.scale = Math.max(1, Math.min(newScale, 5)); lightboxState.pointX = e.clientX - xs * lightboxState.scale; lightboxState.pointY = e.clientY - ys * lightboxState.scale; applyTransform(); }
    function handleMouseDown(e) { e.preventDefault(); e.stopPropagation(); if (e.target !== viewerImage) return; lightboxState.isPanning = true; lightboxState.didPan = false; viewerImage.classList.add('panning'); lightboxState.startX = e.clientX - lightboxState.pointX; lightboxState.startY = e.clientY - lightboxState.pointY; }
    function handleMouseMove(e) { e.preventDefault(); if (!lightboxState.isPanning) return; lightboxState.didPan = true; lightboxState.pointX = e.clientX - lightboxState.startX; lightboxState.pointY = e.clientY - lightboxState.startY; applyTransform(); }
    function handleMouseUp(e) { e.preventDefault(); lightboxState.isPanning = false; viewerImage.classList.remove('panning'); }

    // --- 初始化與事件監聽 ---
    function init() {
        // (原有事件監聽...)
        if (themeToggle) themeToggle.addEventListener('click', () => { document.body.classList.toggle('dark-mode'); localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light'); });
        if (searchBox) searchBox.addEventListener('input', renderProducts);
        // 【全新版本】分類樹的點擊事件
        if (categoryTreeContainer) {
            categoryTreeContainer.addEventListener('click', e => {
                const link = e.target.closest('a');
                if (!link) return; // 如果點的不是連結，就什麼都不做

                // 【核心邏輯】判斷點擊的是否為箭頭圖示區域
                const iconClicked = e.target.closest('.category-toggle-icon');

                // --- 情況一：如果點擊的是箭頭圖示 ---
                if (iconClicked) {
                    e.preventDefault(); // 阻止連結的默認跳轉行為

                    const parentLi = link.parentElement;

                    // 執行展開/收合
                    iconClicked.classList.toggle('expanded');
                    const submenu = parentLi.querySelector('ul');
                    if (submenu) {
                        if (submenu.classList.contains('hidden')) {
                            submenu.classList.remove('hidden');
                            submenu.style.maxHeight = submenu.scrollHeight + "px";
                        } else {
                            submenu.style.maxHeight = "0";
                            setTimeout(() => {
                                submenu.classList.add('hidden');
                            }, 400);
                        }
                    }
                }
                // --- 情況二：如果點擊的是連結的其他部分 (例如文字) ---
                else {
                    e.preventDefault(); // 同樣阻止連結的默認跳轉行為

                    // 執行篩選產品
                    document.querySelectorAll('#category-tree a').forEach(a => a.classList.remove('active'));
                    link.classList.add('active');
                    currentCategoryId = link.dataset.id === 'all' ? 'all' : parseInt(link.dataset.id);
                    renderProducts();

                    // 手機版上，點擊篩選後自動關閉側邊欄
                    if (window.innerWidth <= 767) {
                        toggleSidebar();
                    }
                }
            });
        }
        // (Slider & Modal & Lightbox 事件監聽...)
        if (menuToggleBtn) menuToggleBtn.addEventListener('click', toggleSidebar);
        if (pageOverlay) pageOverlay.addEventListener('click', toggleSidebar);
        if (prevSlideBtn) prevSlideBtn.addEventListener('click', prevSlide);
        if (nextSlideBtn) nextSlideBtn.addEventListener('click', nextSlide);
        if (sliderWrapper) { sliderWrapper.addEventListener('mousedown', dragStart); sliderWrapper.addEventListener('touchstart', dragStart, { passive: true }); sliderWrapper.addEventListener('mouseup', dragEnd); sliderWrapper.addEventListener('touchend', dragEnd); sliderWrapper.addEventListener('mouseleave', dragEnd); sliderWrapper.addEventListener('mousemove', dragMove); sliderWrapper.addEventListener('touchmove', dragMove, { passive: true }); }
        if (detailThumbnailList) detailThumbnailList.addEventListener('click', e => { if (e.target.dataset.index) showSlide(parseInt(e.target.dataset.index)); });
        if (sliderDots) sliderDots.addEventListener('click', e => { if (e.target.dataset.index) showSlide(parseInt(e.target.dataset.index)); });
        document.addEventListener('keydown', e => { if (detailModal && !detailModal.classList.contains('hidden')) { if (e.key === 'ArrowLeft') prevSlide(); if (e.key === 'ArrowRight') nextSlide(); } });
        if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
        if (detailModal) detailModal.addEventListener('click', e => { if (e.target === detailModal) closeModal(); });
        if (imageViewerModal) { imageViewerModal.addEventListener('click', (e) => { if (e.target !== viewerImage) { closeLightbox(); } }); viewerImage.addEventListener('wheel', handleWheel, { passive: false }); viewerImage.addEventListener('mousedown', handleMouseDown); viewerImage.addEventListener('click', (e) => { if (!lightboxState.didPan) { closeLightbox(); } }); imageViewerModal.addEventListener('mousemove', handleMouseMove); imageViewerModal.addEventListener('mouseup', handleMouseUp); imageViewerModal.addEventListener('mouseleave', handleMouseUp); }

        // --- 【全新】Toolbar 事件監聽 ---

        // 手機版：搜尋按鈕切換
        if (searchToggleBtn) {
            searchToggleBtn.addEventListener('click', () => {
                toolbar.classList.add('search-active');
                searchBox.focus();
            });
        }
        // 手機版：搜尋框失焦後自動收合
        if (searchBox) {
            searchBox.addEventListener('blur', () => {
                if (searchBox.value === '') {
                    toolbar.classList.remove('search-active');
                }
            });
        }

        // 手機版：分類按鈕
        if (categoryToggleBtn) {
            categoryToggleBtn.addEventListener('click', toggleSidebar);
        }

        // 排序按鈕：顯示/隱藏選項
        if (sortBtn) {
            sortBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // 防止觸發下面的 document 點擊事件
                sortOptionsContainer.classList.toggle('hidden');
            });
        }

        // 排序選項：點擊後更新排序
        if (sortOptionsContainer) {
            sortOptionsContainer.addEventListener('click', (e) => {
                e.preventDefault();
                const target = e.target.closest('a');
                if (target) {
                    currentSort.key = target.dataset.value;
                    sortBtnText.textContent = target.textContent;
                    sortOptionsContainer.classList.add('hidden');
                    renderProducts();
                }
            });
        }

        // 升降序按鈕：切換排序方向
        if (orderToggleBtn) {
            orderToggleBtn.addEventListener('click', () => {
                currentSort.order = (currentSort.order === 'asc') ? 'desc' : 'asc';
                orderToggleBtn.dataset.order = currentSort.order;
                renderProducts();
            });
        }

        // 點擊頁面其他地方，隱藏排序選項
        document.addEventListener('click', () => {
            if (sortOptionsContainer && !sortOptionsContainer.classList.contains('hidden')) {
                sortOptionsContainer.classList.add('hidden');
            }
        });


        // --- 頁面載入流程 ---
        const currentTheme = localStorage.getItem('theme');
        if (currentTheme === 'dark') document.body.classList.add('dark-mode');

        loadData();

        if (viewToggleBtn && productList) {
            const savedView = localStorage.getItem('productView') || 'two-columns';
            if (savedView === 'two-columns') { productList.classList.add('view-two-columns'); viewToggleBtn.classList.remove('list-view-active'); }
            else { productList.classList.remove('view-two-columns'); viewToggleBtn.classList.add('list-view-active'); }
            viewToggleBtn.addEventListener('click', () => {
                productList.classList.toggle('view-two-columns');
                const isTwoColumns = productList.classList.contains('view-two-columns');
                viewToggleBtn.classList.toggle('list-view-active', !isTwoColumns);
                localStorage.setItem('productView', isTwoColumns ? 'two-columns' : 'one-column');
            });
        }
    }

    init();
});