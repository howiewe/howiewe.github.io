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
    // Slider 元素
    const sliderWrapper = document.getElementById('slider-wrapper');
    const detailThumbnailList = document.getElementById('detail-thumbnail-list');
    const detailInfo = document.getElementById('product-detail-info');
    const prevSlideBtn = document.getElementById('prev-slide-btn');
    const nextSlideBtn = document.getElementById('next-slide-btn');
    const sliderDots = document.getElementById('slider-dots');
    
    // --- 全域變數 ---
    let allProducts = [], allCategories = [];
    let currentCategoryId = 'all';
    // Slider 變數
    let currentSlideIndex = 0;
    let totalSlides = 0;
    let isDragging = false;
    let startPosX = 0;
    let currentTranslate = 0;
    let prevTranslate = 0;

    // --- 響應式側邊欄 & 分類樹 & 產品渲染 ---
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

    // --- Slider 邏輯 ---
    function showSlide(index) {
        if (totalSlides <= 1) return; // 如果只有一張或沒有圖，不執行滑動
        if (index >= totalSlides) index = 0;
        if (index < 0) index = totalSlides - 1;

        const sliderWidth = sliderWrapper.clientWidth;
        sliderWrapper.style.transform = `translateX(-${index * sliderWidth}px)`;
        currentSlideIndex = index;
        updateUI();
    }

    function updateUI() {
        document.querySelectorAll('.dot').forEach((dot, i) => dot.classList.toggle('active', i === currentSlideIndex));
        document.querySelectorAll('#detail-thumbnail-list .thumbnail-item').forEach((item, i) => item.classList.toggle('active', i === currentSlideIndex));
        prevSlideBtn.style.display = totalSlides > 1 ? 'flex' : 'none';
        nextSlideBtn.style.display = totalSlides > 1 ? 'flex' : 'none';
        sliderDots.style.display = totalSlides > 1 ? 'flex' : 'none';
    }

    function nextSlide() { showSlide(currentSlideIndex + 1); }
    function prevSlide() { showSlide(currentSlideIndex - 1); }

    function dragStart(e) {
        if (totalSlides <= 1) return;
        isDragging = true;
        startPosX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        sliderWrapper.style.transition = 'none';
        const sliderWidth = sliderWrapper.clientWidth;
        prevTranslate = -currentSlideIndex * sliderWidth;
    }

    function dragMove(e) {
        if (!isDragging) return;
        const currentPosition = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        currentTranslate = prevTranslate + currentPosition - startPosX;
        sliderWrapper.style.transform = `translateX(${currentTranslate}px)`;
    }

    function dragEnd(e) {
        if (!isDragging || totalSlides <= 1) return;
        isDragging = false;
        const movedBy = currentTranslate - prevTranslate;
        sliderWrapper.style.transition = 'transform 0.4s ease-in-out';
        if (movedBy < -50 && currentSlideIndex < totalSlides - 1) currentSlideIndex++;
        if (movedBy > 50 && currentSlideIndex > 0) currentSlideIndex--;
        showSlide(currentSlideIndex);
    }

    // --- 詳情彈窗 (Modal) ---
    function openDetailModal(id) {
        const product = allProducts.find(p => p.id === id);
        const category = allCategories.find(c => c.id === product.categoryId);
        if (!product) return;
        
        detailInfo.innerHTML = ` <h2>${product.name}</h2> <p class="price">$${product.price}</p> <p>${product.description}</p> <dl class="details-grid"> <dt>分類</dt><dd>${category ? category.name : '未分類'}</dd> <dt>編號</dt><dd>${product.sku}</dd> <dt>EAN-13</dt><dd>${product.ean13 || 'N/A'}</dd> </dl> ${product.ean13 ? `<div class="barcode-display"><svg id="detail-barcode"></svg></div>` : ''} `;
        
        sliderWrapper.innerHTML = '';
        detailThumbnailList.innerHTML = '';
        sliderDots.innerHTML = '';
        
        const imageUrls = product.imageUrls && product.imageUrls.length > 0 ? product.imageUrls : [];
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
        
        detailModal.classList.remove('hidden');
        document.body.classList.add('modal-open');
        setTimeout(() => { if (product.ean13) { const barcodeElement = document.getElementById('detail-barcode'); if (barcodeElement) { try { JsBarcode(barcodeElement, product.ean13, { format: "EAN13", displayValue: true, background: "#ffffff", lineColor: "#000000", height: 50, margin: 10 }); } catch (e) {} } } }, 0);
    }
    
    function closeModal() {
        detailModal.classList.add('hidden');
        document.body.classList.remove('modal-open');
    }

    // --- 初始化與事件監聽 ---
    function init() {
        themeToggle.addEventListener('click', () => { document.body.classList.toggle('dark-mode'); localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light'); });
        searchBox.addEventListener('input', renderProducts);
        
        prevSlideBtn.addEventListener('click', prevSlide);
        nextSlideBtn.addEventListener('click', nextSlide);
        sliderWrapper.addEventListener('mousedown', dragStart);
        sliderWrapper.addEventListener('touchstart', dragStart, { passive: true });
        sliderWrapper.addEventListener('mouseup', dragEnd);
        sliderWrapper.addEventListener('touchend', dragEnd);
        sliderWrapper.addEventListener('mouseleave', dragEnd);
        sliderWrapper.addEventListener('mousemove', dragMove);
        sliderWrapper.addEventListener('touchmove', dragMove, { passive: true });
        detailThumbnailList.addEventListener('click', e => { if (e.target.dataset.index) { showSlide(parseInt(e.target.dataset.index)); } });
        sliderDots.addEventListener('click', e => { if (e.target.dataset.index) { showSlide(parseInt(e.target.dataset.index)); } });
        document.addEventListener('keydown', e => { if (!detailModal.classList.contains('hidden')) { if (e.key === 'ArrowLeft') prevSlide(); if (e.key === 'ArrowRight') nextSlide(); } });
        modalCloseBtn.addEventListener('click', closeModal);
        detailModal.addEventListener('click', e => { if (e.target === detailModal) closeModal(); });

        const currentTheme = localStorage.getItem('theme');
        if (currentTheme === 'dark') document.body.classList.add('dark-mode');
        
        async function loadData() {
            try {
                const [prodRes, catRes] = await Promise.all([
                    fetch('products.json', { cache: 'no-store' }),
                    fetch('categories.json', { cache: 'no-store' })
                ]);
                if (!prodRes.ok || !catRes.ok) throw new Error('網路回應不正常');
                const loadedProducts = await prodRes.json();
                allCategories = await catRes.json();
                allProducts = loadedProducts.map(p => {
                    if (p.imageDataUrl && !p.imageUrls) { p.imageUrls = [p.imageDataUrl]; delete p.imageDataUrl; } 
                    else if (!p.imageUrls) { p.imageUrls = []; }
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