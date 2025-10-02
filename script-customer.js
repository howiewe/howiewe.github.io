// script-customer.js (修正版)

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM 元素宣告 ---
    const viewToggleBtn = document.getElementById('view-toggle-btn');
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
    let lightboxState = {
        scale: 1,
        isPanning: false,
        pointX: 0,
        pointY: 0,
        startX: 0,
        startY: 0,
        didPan: false
    };

    // --- 全域變數 ---
    let allProducts = [], allCategories = [];
    let currentCategoryId = 'all';
    let currentSlideIndex = 0;
    let totalSlides = 0;
    let isDragging = false;
    let startPosX = 0;
    let currentTranslate = 0;
    let prevTranslate = 0;
    let isSwiping = false;

    // --- 資料載入函式 (*** 核心修正處 ***) ---
    async function loadData() {
        try {
            // 在開始獲取前，顯示載入中訊息
            if (productList) {
                productList.innerHTML = '<p class="empty-message">正在載入產品資料...</p>';
            }

            const response = await fetch('/api/all-data?t=' + new Date().getTime());
            if (!response.ok) {
                throw new Error(`網路回應不正常: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            allCategories = data.categories || [];

            // 【關鍵修正】
            // 確保 allProducts 陣列中的每一項的 imageUrls 都是真正的陣列，
            // 而不是從 D1 直接取出的 JSON 字串。
            allProducts = (data.products || []).map(p => {
                let parsedImageUrls = [];
                if (typeof p.imageUrls === 'string' && p.imageUrls.startsWith('[')) {
                    // 如果 imageUrls 是個看起來像陣列的字串，就嘗試解析它
                    try {
                        parsedImageUrls = JSON.parse(p.imageUrls);
                    } catch (e) {
                        console.error(`解析產品 ${p.id} 的 imageUrls 失敗:`, p.imageUrls);
                        parsedImageUrls = []; // 解析失敗則給一個空陣列
                    }
                } else if (Array.isArray(p.imageUrls)) {
                    // 如果它本身就是陣列，就直接使用
                    parsedImageUrls = p.imageUrls;
                }

                return {
                    ...p,
                    imageUrls: parsedImageUrls // 確保回傳的是陣列
                };
            });

            buildCategoryTree();
            renderProducts();
        } catch (err) {
            console.error("無法載入資料:", err);
            if (productList) {
                productList.innerHTML = `<p class="empty-message">無法載入產品資料。<br>請檢查瀏覽器主控台 (F12) 的錯誤訊息，或聯繫管理員。</p>`;
            }
        }
    }

    // --- 響應式側邊欄 & 分類樹 & 產品渲染 (保持不變) ---
    function toggleSidebar() { document.body.classList.toggle('sidebar-open'); }
    if (menuToggleBtn) menuToggleBtn.addEventListener('click', toggleSidebar);
    if (pageOverlay) pageOverlay.addEventListener('click', toggleSidebar);

    function buildCategoryTree() {
        if (!categoryTreeContainer) return;
        const categoryMap = new Map(allCategories.map(c => [c.id, { ...c, children: [] }]));
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

    if (categoryTreeContainer) categoryTreeContainer.addEventListener('click', e => {
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

    function renderProducts() {
        if (!productList) return;
        const searchTerm = searchBox ? searchBox.value.toLowerCase() : '';
        const categoryIdsToDisplay = getCategoryIdsWithChildren(currentCategoryId);

        const filteredProducts = allProducts.filter(p => {
            const matchesCategory = categoryIdsToDisplay === null || (p.categoryId && categoryIdsToDisplay.has(p.categoryId));
            const matchesSearch = p.name.toLowerCase().includes(searchTerm) || (p.sku && p.sku.toLowerCase().includes(searchTerm));
            return matchesCategory && matchesSearch;
        });

        productList.innerHTML = '';
        if (filteredProducts.length === 0) {
            productList.innerHTML = '<p class="empty-message">找不到符合條件的產品。</p>';
            return;
        }

        filteredProducts.forEach(product => {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.onclick = () => openDetailModal(product.id);
            // 這裡現在可以安全地訪問 imageUrls[0]
            const firstImage = (product.imageUrls && product.imageUrls.length > 0) ? product.imageUrls[0] : '';
            card.innerHTML = `
                <div class="image-container"><img src="${firstImage}" class="product-image" alt="${product.name}" loading="lazy" style="transform: scale(${(product.imageSize || 90) / 100});"></div>
                <div class="product-info"><h3>${product.name}</h3><p class="price">$${product.price}</p></div>
            `;
            productList.appendChild(card);
        });
    }

    // --- Slider 邏輯 (保持不變) ---
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
    function dragStart(e) {
        e.preventDefault();
        if (totalSlides <= 1) return;

        isDragging = true;
        isSwiping = false; // 在每次新的觸控/點擊開始時，重置滑動旗標
        startPosX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        sliderWrapper.style.transition = 'none';
        prevTranslate = -currentSlideIndex * sliderWrapper.clientWidth;
    }
    function dragMove(e) {
        if (!isDragging) return;

        isSwiping = true; // 只要手指/滑鼠移動了，就認定為滑動

        const currentPosition = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        currentTranslate = prevTranslate + currentPosition - startPosX;
        sliderWrapper.style.transform = `translateX(${currentTranslate}px)`;
    }
    function dragEnd() {
        if (!isDragging || totalSlides <= 1) return;
        isDragging = false;

        const movedBy = currentTranslate - prevTranslate;
        sliderWrapper.style.transition = 'transform 0.4s ease-in-out';

        // 只有在使用者明確滑動時才切換圖片
        if (isSwiping) {
            if (movedBy < -50 && currentSlideIndex < totalSlides - 1) currentSlideIndex++;
            if (movedBy > 50 && currentSlideIndex > 0) currentSlideIndex--;
        }

        // 無論是否滑動，最後都回到正確的位置
        showSlide(currentSlideIndex);
    }

    // --- 詳情彈窗 (Modal) (保持不變) ---
    function openDetailModal(id) {
        const product = allProducts.find(p => p.id === id);
        if (!product || !detailInfo || !sliderWrapper || !detailThumbnailList || !sliderDots) return;
        const category = allCategories.find(c => c.id === product.categoryId);

        detailInfo.innerHTML = ` <h2>${product.name}</h2> <p class="price">$${product.price}</p> <p>${product.description || ''}</p> <dl class="details-grid"> <dt>分類</dt><dd>${category ? category.name : '未分類'}</dd> <dt>編號</dt><dd>${product.sku || 'N/A'}</dd> <dt>EAN-13</dt><dd>${product.ean13 || 'N/A'}</dd> </dl> ${product.ean13 ? `<div class="barcode-display"><svg id="detail-barcode"></svg></div>` : ''} `;

        sliderWrapper.innerHTML = '';
        detailThumbnailList.innerHTML = '';
        sliderDots.innerHTML = '';

        const imageUrls = product.imageUrls || [];
        totalSlides = imageUrls.length;
        currentSlideIndex = 0;

        if (totalSlides > 0) {
            imageUrls.forEach((url, index) => {
                sliderWrapper.innerHTML += `<div class="slide"><img src="${url}" alt="${product.name} - 圖片 ${index + 1}"></div>`;
                detailThumbnailList.innerHTML += `<div class="thumbnail-item"><img src="${url}" data-index="${index}" alt="產品縮圖 ${index + 1}"></div>`;
                sliderDots.innerHTML += `<div class="dot" data-index="${index}"></div>`;
            });
            setTimeout(() => {
                sliderWrapper.querySelectorAll('.slide img').forEach(img => {
                    img.addEventListener('click', (e) => {
                        if (isSwiping) {
                            return;
                        }
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
        document.documentElement.classList.add('modal-open');

        if (product.ean13) {
            setTimeout(() => {
                const barcodeElement = document.getElementById('detail-barcode');
                if (barcodeElement) try { JsBarcode(barcodeElement, product.ean13, { format: "EAN13", displayValue: true, background: "#ffffff", lineColor: "#000000", height: 50, margin: 10 }); } catch (e) { console.error('JsBarcode error:', e); }
            }, 0);
        }
    }

    function closeModal() {
        if (detailModal) detailModal.classList.add('hidden');
        document.documentElement.classList.remove('modal-open'); // <-- 核心修正：從 .add 改為 .remove
    }

    // script-customer.js

    // ... (放在 closeModal 函式後面)

    // --- 【全新】圖片燈箱功能 ---

    function applyTransform() {
        if (viewerImage) {
            viewerImage.style.transform = `translate(${lightboxState.pointX}px, ${lightboxState.pointY}px) scale(${lightboxState.scale})`;
        }
    }

    function resetLightbox() {
        lightboxState = { scale: 1, isPanning: false, pointX: 0, pointY: 0, startX: 0, startY: 0 };
        applyTransform();
    }

    function openLightbox(url) {
        if (!imageViewerModal || !viewerImage) return;
        viewerImage.setAttribute('src', url);
        imageViewerModal.classList.remove('hidden');
    }

    function closeLightbox() {
        if (!imageViewerModal) return;
        imageViewerModal.classList.add('hidden');
        resetLightbox();
    }

    // 滑鼠滾輪縮放事件
    function handleWheel(e) {
        e.preventDefault();
        const xs = (e.clientX - lightboxState.pointX) / lightboxState.scale;
        const ys = (e.clientY - lightboxState.pointY) / lightboxState.scale;
        const delta = -e.deltaY;

        const newScale = lightboxState.scale * (delta > 0 ? 1.2 : 1 / 1.2);
        lightboxState.scale = Math.max(1, Math.min(newScale, 5)); // 縮放級別限制在 1x 到 5x 之間

        lightboxState.pointX = e.clientX - xs * lightboxState.scale;
        lightboxState.pointY = e.clientY - ys * lightboxState.scale;

        applyTransform();
    }

    // 開始拖曳
    function handleMouseDown(e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.target !== viewerImage) return; // 確保只有點擊圖片才能拖曳
        lightboxState.isPanning = true;
        lightboxState.didPan = false;
        viewerImage.classList.add('panning');
        lightboxState.startX = e.clientX - lightboxState.pointX;
        lightboxState.startY = e.clientY - lightboxState.pointY;
    }

    // 拖曳中
    function handleMouseMove(e) {
        e.preventDefault();
        if (!lightboxState.isPanning) return;
        lightboxState.didPan = true;
        lightboxState.pointX = e.clientX - lightboxState.startX;
        lightboxState.pointY = e.clientY - lightboxState.startY;
        applyTransform();
    }

    // 結束拖曳
    function handleMouseUp(e) {
        e.preventDefault();
        lightboxState.isPanning = false;
        viewerImage.classList.remove('panning');
    }

    // --- 初始化與事件監聽 (保持不變) ---
    function init() {
        if (themeToggle) themeToggle.addEventListener('click', () => { document.body.classList.toggle('dark-mode'); localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light'); });
        if (searchBox) searchBox.addEventListener('input', renderProducts);

        if (prevSlideBtn) prevSlideBtn.addEventListener('click', prevSlide);
        if (nextSlideBtn) nextSlideBtn.addEventListener('click', nextSlide);
        if (sliderWrapper) {
            sliderWrapper.addEventListener('mousedown', dragStart);
            sliderWrapper.addEventListener('touchstart', dragStart, { passive: true });
            sliderWrapper.addEventListener('mouseup', dragEnd);
            sliderWrapper.addEventListener('touchend', dragEnd);
            sliderWrapper.addEventListener('mouseleave', dragEnd);
            sliderWrapper.addEventListener('mousemove', dragMove);
            sliderWrapper.addEventListener('touchmove', dragMove, { passive: true });
        }
        if (detailThumbnailList) detailThumbnailList.addEventListener('click', e => { if (e.target.dataset.index) showSlide(parseInt(e.target.dataset.index)); });
        if (sliderDots) sliderDots.addEventListener('click', e => { if (e.target.dataset.index) showSlide(parseInt(e.target.dataset.index)); });

        document.addEventListener('keydown', e => { if (detailModal && !detailModal.classList.contains('hidden')) { if (e.key === 'ArrowLeft') prevSlide(); if (e.key === 'ArrowRight') nextSlide(); } });
        if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
        if (detailModal) detailModal.addEventListener('click', e => { if (e.target === detailModal) closeModal(); });
        if (imageViewerModal) {
            // 點擊背景關閉燈箱
            imageViewerModal.addEventListener('click', (e) => {
                if (e.target !== viewerImage) {
                    closeLightbox();
                }
            });

            // 監聽圖片上的事件以實現縮放和拖曳
            viewerImage.addEventListener('wheel', handleWheel, { passive: false });
            viewerImage.addEventListener('mousedown', handleMouseDown);
            viewerImage.addEventListener('click', (e) => {
                // 如果使用者只是點擊而沒有拖曳圖片，就關閉燈箱
                if (!lightboxState.didPan) {
                    closeLightbox();
                }
            });
            // 在整個 modal 上監聽 mousemove 和 mouseup，以防止滑鼠移出圖片時拖曳中斷
            imageViewerModal.addEventListener('mousemove', handleMouseMove);
            imageViewerModal.addEventListener('mouseup', handleMouseUp);
            imageViewerModal.addEventListener('mouseleave', handleMouseUp);

        }

        const currentTheme = localStorage.getItem('theme');
        if (currentTheme === 'dark') document.body.classList.add('dark-mode');

        loadData();
        // --- View Toggle Logic ---
        if (viewToggleBtn && productList) {
            // 1. 頁面載入時，讀取 localStorage 的設定，預設為兩欄
            const savedView = localStorage.getItem('productView') || 'two-columns';
            if (savedView === 'two-columns') {
                productList.classList.add('view-two-columns');
                viewToggleBtn.classList.remove('list-view-active');
            } else {
                productList.classList.remove('view-two-columns');
                viewToggleBtn.classList.add('list-view-active');
            }

            // 2. 監聽按鈕點擊事件
            viewToggleBtn.addEventListener('click', () => {
                // 切換 productList 的 class
                productList.classList.toggle('view-two-columns');

                // 檢查當前是否為兩欄模式
                const isTwoColumns = productList.classList.contains('view-two-columns');

                // 切換按鈕 icon 的 class
                viewToggleBtn.classList.toggle('list-view-active', !isTwoColumns);

                // 3. 將使用者的選擇存入 localStorage
                localStorage.setItem('productView', isTwoColumns ? 'two-columns' : 'one-column');
            });
        }
    }

    init();
});