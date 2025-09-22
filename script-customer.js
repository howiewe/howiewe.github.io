// script-customer.js (修正版)

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
    
    // --- 全域變數 ---
    let allProducts = [], allCategories = [];
    let currentCategoryId = 'all';
    let currentSlideIndex = 0;
    let totalSlides = 0;
    let isDragging = false;
    let startPosX = 0;
    let currentTranslate = 0;
    let prevTranslate = 0;

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

    if(categoryTreeContainer) categoryTreeContainer.addEventListener('click', e => {
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
                <div class="image-container"><img src="${firstImage}" class="product-image" alt="${product.name}" loading="lazy" style="width: ${product.imageSize || 100}%;"></div>
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
        if(prevSlideBtn) prevSlideBtn.style.display = totalSlides > 1 ? 'flex' : 'none';
        if(nextSlideBtn) nextSlideBtn.style.display = totalSlides > 1 ? 'flex' : 'none';
        if(sliderDots) sliderDots.style.display = totalSlides > 1 ? 'flex' : 'none';
    }
    function nextSlide() { showSlide(currentSlideIndex + 1); }
    function prevSlide() { showSlide(currentSlideIndex - 1); }
    function dragStart(e) {
        if (totalSlides <= 1) return;
        isDragging = true;
        startPosX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        sliderWrapper.style.transition = 'none';
        prevTranslate = -currentSlideIndex * sliderWrapper.clientWidth;
    }
    function dragMove(e) {
        if (!isDragging) return;
        const currentPosition = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        currentTranslate = prevTranslate + currentPosition - startPosX;
        sliderWrapper.style.transform = `translateX(${currentTranslate}px)`;
    }
    function dragEnd() {
        if (!isDragging || totalSlides <= 1) return;
        isDragging = false;
        const movedBy = currentTranslate - prevTranslate;
        sliderWrapper.style.transition = 'transform 0.4s ease-in-out';
        if (movedBy < -50 && currentSlideIndex < totalSlides - 1) currentSlideIndex++;
        if (movedBy > 50 && currentSlideIndex > 0) currentSlideIndex--;
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
                if (barcodeElement) try { JsBarcode(barcodeElement, product.ean13, { format: "EAN13", displayValue: true, background: "#ffffff", lineColor: "#000000", height: 50, margin: 10 }); } catch (e) { console.error('JsBarcode error:', e); } 
            }, 0);
        }
    }
    
    function closeModal() {
        if(detailModal) detailModal.classList.add('hidden');
        document.body.classList.add('modal-open');
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

        const currentTheme = localStorage.getItem('theme');
        if (currentTheme === 'dark') document.body.classList.add('dark-mode');
        
        loadData();
    }
    
    init();
});