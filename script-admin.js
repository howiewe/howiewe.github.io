// script-admin.js (效能優化版 - 按需載入 - 完整功能)
document.addEventListener('DOMContentLoaded', () => {
    // --- IndexedDB (只快取分類) ---
    const dbName = 'ProductCatalogDB_CF';
    const dbVersion = 2; // 版本升級以移除舊的 'products' store
    function openDB() { return new Promise((resolve, reject) => { const request = indexedDB.open(dbName, dbVersion); request.onerror = event => reject(`DB Error: ${event.target.errorCode}`); request.onsuccess = event => resolve(event.target.result); request.onupgradeneeded = event => { const db = event.target.result; if (db.objectStoreNames.contains('products')) db.deleteObjectStore('products'); if (!db.objectStoreNames.contains('categories')) db.createObjectStore('categories', { keyPath: 'id' }); }; }); }
    function readData(storeName) { return new Promise(async (resolve, reject) => { const db = await openDB(); const tx = db.transaction(storeName, 'readonly'); const store = tx.objectStore(storeName); const req = store.getAll(); req.onerror = event => reject(`Read Error: ${event.target.errorCode}`); req.onsuccess = event => resolve(event.target.result); }); }
    function writeData(storeName, data) { return new Promise(async (resolve, reject) => { const db = await openDB(); const tx = db.transaction(storeName, 'readwrite'); const store = tx.objectStore(storeName); store.clear(); data.forEach(item => store.put(item)); tx.oncomplete = () => resolve(); tx.onerror = event => reject(`Write Error: ${event.target.errorCode}`); }); }

    // --- DOM Elements ---
    const productList = document.getElementById('product-list');
    const searchBox = document.getElementById('search-box');
    const categoryTreeContainer = document.getElementById('category-tree');
    const addNewBtn = document.getElementById('add-new-btn');
    const syncStatus = document.getElementById('sync-status');
    const paginationControls = document.getElementById('pagination-controls');
    // ... 其他所有 Modal、表單、圖片上傳等 DOM 元素宣告保持不變 ...
    const viewToggleBtn = document.getElementById('view-toggle-btn');
    const form = document.getElementById('product-form');
    const formTitle = document.getElementById('form-title');
    const productIdInput = document.getElementById('product-id');
    const themeToggle = document.getElementById('theme-toggle');
    const categorySelect = document.getElementById('product-category-select');
    const editModal = document.getElementById('edit-modal-container');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const deleteBtn = document.getElementById('delete-btn');
    const imageUploadInput = document.getElementById('product-image-upload');
    const mainImagePreview = document.getElementById('main-image-preview');
    const thumbnailListAdmin = document.getElementById('thumbnail-list-admin');
    const imageSizeSlider = document.getElementById('image-size');
    const imageSizeValue = document.getElementById('image-size-value');
    const ean13Input = document.getElementById('product-ean13');
    const pageOverlay = document.getElementById('page-overlay');
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const imageDropzone = document.getElementById('image-dropzone');
    const imageUploadArea = document.getElementById('image-upload-area');
    const addMoreImagesBtn = document.getElementById('add-more-images-btn');
    const cropperModal = document.getElementById('cropper-modal');
    const cropperImage = document.getElementById('cropper-image');
    const cropperStatus = document.getElementById('cropper-status');
    const cropperConfirmBtn = document.getElementById('cropper-confirm-btn');
    const cropperRotateBtn = document.getElementById('cropper-rotate-btn');
    const cropperModalCloseBtn = document.getElementById('cropper-modal-close-btn');
    const manageCategoriesBtn = document.getElementById('manage-categories-btn');
    const categoryModal = document.getElementById('category-modal-container');
    const categoryModalCloseBtn = document.getElementById('category-modal-close-btn');
    const categoryManagerHeader = document.getElementById('category-manager-header');
    const categoryManagerTitle = document.getElementById('category-manager-title');
    const categoryManagerList = document.getElementById('category-manager-list');
    const categoryBackBtn = document.getElementById('category-back-btn');
    const categoryAddBtn = document.getElementById('category-add-btn');

    // --- Global State ---
    let allCategories = [];
    let currentProducts = []; // 【修改】不再儲存所有產品，只儲存當前頁的
    let state = {
        currentPage: 1,
        totalPages: 1,
        categoryId: 'all',
        searchTerm: '',
        // 管理後台預設依更新時間排序
        sortBy: 'updatedAt',
        order: 'desc'
    };
    let searchDebounceTimer;

    // --- 既有但獨立的狀態變數 ---
    let cropper, currentImageItems = [], sortableInstance = null, categorySortableInstance = null;
    let imageProcessingQueue = [];
    let originalQueueLength = 0;
    let categoryManagerHistory = [];
    let currentCategoryManagerParentId = null;

    // --- API Logic (重構) ---
    async function fetchProducts() {
        if (!productList) return;
        productList.innerHTML = '<p class="empty-message">正在載入產品...</p>';
        if (paginationControls) paginationControls.innerHTML = '';
        
        const params = new URLSearchParams({
            page: state.currentPage,
            limit: 20, // 管理後台每頁顯示20個
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
            updateSyncStatus('正在拉取產品...', 'syncing');
            const response = await fetch(`/api/products?${params.toString()}`);
            if (!response.ok) throw new Error(`Server Error: ${response.statusText}`);
            const data = await response.json();

            // 如果刪除了最後一頁的最後一個項目，自動跳回前一頁
            if (data.products.length === 0 && data.pagination.currentPage > 1) {
                state.currentPage--;
                fetchProducts(); // 重新請求前一頁
                return;
            }
            
            currentProducts = data.products;
            state.totalPages = data.pagination.totalPages;
            state.currentPage = data.pagination.currentPage;
            
            renderProducts();
            renderPagination();
            updateSyncStatus('產品已同步', 'synced');
        } catch (error) {
            console.error('Fetch products failed:', error);
            updateSyncStatus('產品同步失敗', 'error');
            showToast(`拉取產品資料失敗: ${error.message}`, 'error');
            productList.innerHTML = '<p class="empty-message">產品載入失敗</p>';
        }
    }

    async function fetchCategories(showSyncing = true) {
        try {
            if (showSyncing) updateSyncStatus('正在拉取分類...', 'syncing');
            const response = await fetch('/api/all-data?t=' + new Date().getTime());
            if (!response.ok) throw new Error(`Server Error: ${response.statusText}`);
            const data = await response.json();
            allCategories = data.categories || [];
            await writeData('categories', allCategories);
            if (showSyncing) updateSyncStatus('分類已同步', 'synced');
            return true;
        } catch (error) {
            console.error('Fetch categories failed:', error);
            if (showSyncing) updateSyncStatus('分類同步失敗', 'error');
            showToast(`拉取分類資料失敗: ${error.message}`, 'error');
            return false;
        }
    }

    // --- 所有寫入型 API 保持不變，但在成功後的回呼中改為呼叫 fetchProducts() ---
    async function saveProduct(productData) {
        try {
            updateSyncStatus('正在儲存產品...', 'syncing');
            const response = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(productData) });
            if (!response.ok) throw new Error(`伺服器錯誤: ${(await response.json()).details || response.statusText}`);
            
            // 【修改】成功後不再操作本地陣列，而是重新從伺服器獲取當前頁
            await fetchProducts(); 
            
            updateSyncStatus('儲存成功', 'synced');
            showToast('產品儲存成功', 'success');
        } catch (error) {
            updateSyncStatus('儲存失敗', 'error');
            showToast(`儲存產品失敗: ${error.message}`, 'error');
            console.error(error);
        }
    }

    async function deleteProductApi(id) {
        if (!confirm('您確定要刪除這個產品嗎？')) return;
        try {
            updateSyncStatus('正在刪除產品...', 'syncing');
            const response = await fetch(`/api/products/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error(`伺服器錯誤: ${(await response.json()).details || response.statusText}`);

            // 【修改】成功後重新獲取資料
            await fetchProducts();

            closeModal(editModal);
            updateSyncStatus('刪除成功', 'synced');
            showToast('產品已刪除', 'info');
        } catch (error) {
            updateSyncStatus('刪除失敗', 'error');
            showToast(`刪除產品失敗: ${error.message}`, 'error');
        }
    }
    
    async function saveCategory(categoryData) {
        try {
            updateSyncStatus('儲存分類中...', 'syncing');
            const response = await fetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(categoryData) });
            if (!response.ok) throw new Error(`伺服器錯誤: ${(await response.json()).error || response.statusText}`);
            
            // 【修改】操作成功後，刷新分類和產品列表
            await fetchCategories(false);
            buildCategoryTree();
            populateCategorySelect();
            renderCategoryManager(currentCategoryManagerParentId, false);
            await fetchProducts();

            updateSyncStatus('儲存成功', 'synced');
        } catch (error) {
            showToast(`儲存分類失敗: ${error.message}`, 'error');
            updateSyncStatus('儲存失敗', 'error');
        }
    }

    async function reorderCategories(reorderData) {
        try {
            updateSyncStatus('正在儲存順序...', 'syncing');
            const response = await fetch('/api/reorder-categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reorderData) });
            if (!response.ok) throw new Error(`伺服器錯誤: ${(await response.json()).error || response.statusText}`);
            
            // 【修改】成功後刷新所有相關UI
            await fetchCategories(false);
            buildCategoryTree();
            populateCategorySelect();
            await fetchProducts();

            showToast('順序已儲存', 'success');
            updateSyncStatus('儲存成功', 'synced');
        } catch (error) {
            showToast(`儲存順序失敗: ${error.message}`, 'error');
            updateSyncStatus('儲存失敗', 'error');
            renderCategoryManager(currentCategoryManagerParentId, false);
        }
    }

    async function removeCategory(id) {
        try {
            const response = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
            if (!response.ok) { const errData = await response.json(); throw new Error(errData.error || '刪除失敗'); }
            
            // 【修改】成功後刷新所有相關UI
            await fetchCategories(false);
            buildCategoryTree();
            populateCategorySelect();
            renderCategoryManager(currentCategoryManagerParentId, false);
            await fetchProducts();
            
        } catch (error) {
            alert(error.message);
        }
    }

    // --- UI & Rendering Logic ---
    function renderProducts() {
        if (!productList) return;
        productList.innerHTML = '';
        if (currentProducts.length === 0) {
            productList.innerHTML = '<p class="empty-message">此條件下無產品。</p>';
            return;
        }
        currentProducts.forEach(product => {
            const card = document.createElement('div');
            card.className = 'product-card';
            // 【修改】點擊卡片時，直接傳遞 product 物件
            card.onclick = () => openProductModal(product);
            const firstImage = (product.imageUrls && product.imageUrls.length > 0) ? product.imageUrls[0] : '';
            card.innerHTML = `<div class="image-container"><img src="${firstImage}" class="product-image" alt="${product.name}" loading="lazy" style="transform: scale(${(product.imageSize || 90) / 100});"></div><div class="product-info"><h3>${product.name}</h3><p class="price">$${product.price}</p></div>`;
            productList.appendChild(card);
        });
    }

    // 【新增】渲染分頁控制項
    function renderPagination() {
        if (!paginationControls) return;
        paginationControls.innerHTML = '';
        if(state.totalPages <= 1) return;

        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn btn-secondary';
        prevBtn.innerHTML = '&#10094;';
        prevBtn.title = '上一頁';
        prevBtn.disabled = state.currentPage === 1;
        prevBtn.addEventListener('click', () => { if (state.currentPage > 1) { state.currentPage--; fetchProducts(); } });

        const pageInfo = document.createElement('div');
        pageInfo.className = 'page-info';
        pageInfo.textContent = `${state.currentPage} / ${state.totalPages}`;

        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-secondary';
        nextBtn.innerHTML = '&#10095;';
        nextBtn.title = '下一頁';
        nextBtn.disabled = state.currentPage === state.totalPages;
        nextBtn.addEventListener('click', () => { if (state.currentPage < state.totalPages) { state.currentPage++; fetchProducts(); } });

        paginationControls.append(prevBtn, pageInfo, nextBtn);
    }
    
    // 【修改】openProductModal 現在直接接收 product 物件
    function openProductModal(product = null) {
        resetForm();
        if (product) {
            // 編輯模式
            formTitle.textContent = '編輯產品';
            productIdInput.value = product.id;
            document.getElementById('product-name').value = product.name;
            document.getElementById('product-sku').value = product.sku;
            ean13Input.value = product.ean13;
            document.getElementById('product-price').value = product.price;
            document.getElementById('product-description').value = product.description;
            categorySelect.value = product.categoryId;
            currentImageItems = product.imageUrls ? product.imageUrls.map(url => ({ url, isNew: false, blob: null })) : [];
            const size = product.imageSize || 90;
            imageSizeSlider.value = size;
            imageSizeValue.textContent = size;
            deleteBtn.classList.remove('hidden');
            deleteBtn.onclick = () => deleteProductApi(product.id);
        } else {
            // 新增模式
            formTitle.textContent = '新增產品';
            if (state.categoryId !== 'all' && state.categoryId !== null) {
                categorySelect.value = state.categoryId;
            }
        }
        updateImageUIState();
        renderAdminImagePreview();
        updateBarcodePreview();
        openModal(editModal);
        initSortable();
    }
    
    // --- 頁面初始化與事件監聽 ---
    async function init() {
        // ... (大部分既有的事件監聽器保持不變) ...

        // 【修改】搜尋框事件，加入 debounce
        if (searchBox) {
            searchBox.addEventListener('input', () => {
                clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(() => {
                    state.searchTerm = searchBox.value.trim();
                    state.currentPage = 1; // 搜尋時重置到第一頁
                    fetchProducts();
                }, 300);
            });
        }
        
        // 【修改】分類樹點擊事件
        if (categoryTreeContainer) {
            categoryTreeContainer.addEventListener('click', e => {
                const link = e.target.closest('a'); if (!link) return;
                const iconClicked = e.target.closest('.category-toggle-icon');
                if (iconClicked) {
                    e.preventDefault();
                    // (折疊邏輯不變)
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
                    document.querySelectorAll('#category-tree a').forEach(a => a.classList.remove('active'));
                    link.classList.add('active');
                    
                    // 更新 state 並重新獲取產品
                    state.categoryId = link.dataset.id === 'all' ? 'all' : parseInt(link.dataset.id);
                    state.currentPage = 1;
                    fetchProducts();

                    if (window.innerWidth <= 767) {
                        document.body.classList.remove('sidebar-open');
                    }
                }
            });
        }
        
        // --- 頁面載入流程 ---
        const currentTheme = localStorage.getItem('theme');
        if (currentTheme === 'dark') document.body.classList.add('dark-mode');
        
        updateSyncStatus('正在初始化...', 'syncing');
        addNewBtn.disabled = true;
        manageCategoriesBtn.disabled = true;

        if (await fetchCategories()) {
            buildCategoryTree();
            populateCategorySelect();
            await fetchProducts(); // 獲取分類後，再獲取第一頁產品
        } else {
            // 嘗試從快取載入分類
            try {
                const localCategories = await readData('categories');
                if (localCategories && localCategories.length > 0) {
                    allCategories = localCategories;
                    buildCategoryTree();
                    populateCategorySelect();
                    await fetchProducts(); // 即使分類來自快取，產品仍需從網路獲取
                    updateSyncStatus('雲端分類連接失敗，已載入本地快取', 'error');
                } else {
                    updateSyncStatus('雲端及本地分類均載入失敗', 'error');
                }
            } catch(e) {
                 updateSyncStatus('載入分類失敗', 'error');
            }
        }
        addNewBtn.disabled = false;
        manageCategoriesBtn.disabled = false;
        
        // 舊有的檢視模式切換 (保持不變)
        if (viewToggleBtn && productList) { const savedView = localStorage.getItem('productView') || 'two-columns'; if (savedView === 'two-columns') { productList.classList.add('view-two-columns'); viewToggleBtn.classList.remove('list-view-active'); } else { productList.classList.remove('view-two-columns'); viewToggleBtn.classList.add('list-view-active'); } viewToggleBtn.addEventListener('click', () => { productList.classList.toggle('view-two-columns'); const isTwoColumns = productList.classList.contains('view-two-columns'); viewToggleBtn.classList.toggle('list-view-active', !isTwoColumns); localStorage.setItem('productView', isTwoColumns ? 'two-columns' : 'one-column'); }); }
    }

    // --- 所有未變更的函式 (helper functions, UI interactions, etc.) ---
    // 為了完整性，將所有其他函式複製於此，它們的內部邏輯大多不變
    
    function updateSyncStatus(message, status) { if (syncStatus) { syncStatus.textContent = message; syncStatus.className = `sync-status ${status}`; } }
    function showToast(message, type = 'info', duration = 3000) { const el = document.getElementById('toast-container'); if (!el) return; const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.textContent = message; el.appendChild(toast); setTimeout(() => toast.classList.add('show'), 10); setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 500); }, duration); }
    function buildCategoryTree() { if (!categoryTreeContainer) return; const categoryMap = new Map(allCategories.map(c => [c.id, { ...c, children: [] }])); const tree = []; for (const category of categoryMap.values()) { if (category.parentId === null) tree.push(category); else if (categoryMap.has(category.parentId)) categoryMap.get(category.parentId).children.push(category); } let html = `<ul><li><a href="#" class="active" data-id="all">所有產品</a></li></ul>`; function createTreeHTML(nodes, depth = 0) { nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)); let subHtml = `<ul class="${depth >= 2 ? 'hidden' : ''}">`; for (const node of nodes) { const hasChildren = node.children && node.children.length > 0; subHtml += `<li class="${hasChildren ? 'has-children' : ''}">`; subHtml += `<a href="#" data-id="${node.id}">`; subHtml += `<span>${node.name}</span>`; if (hasChildren) { subHtml += `<span class="category-toggle-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></span>`; } subHtml += `</a>`; if (hasChildren) { subHtml += createTreeHTML(node.children, depth + 1); } subHtml += '</li>'; } return subHtml + '</ul>'; } categoryTreeContainer.innerHTML = html + createTreeHTML(tree); }
    function populateCategorySelect() { if (!categorySelect) return; const categoryMap = new Map(allCategories.map(c => [c.id, { ...c, children: [] }])); const tree = []; allCategories.forEach(c => { if (c.parentId === null) { tree.push(categoryMap.get(c.id)); } else if (categoryMap.has(c.parentId)) { categoryMap.get(c.parentId).children.push(categoryMap.get(c.id)); } }); tree.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)); let selectOptions = '<option value="" disabled selected>請選擇分類</option>'; function createSelectOptions(nodes, depth = 0) { nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)); nodes.forEach(node => { selectOptions += `<option value="${node.id}">${'—'.repeat(depth)} ${node.name}</option>`; if (node.children.length > 0) { createSelectOptions(node.children, depth + 1); } }); } createSelectOptions(tree); categorySelect.innerHTML = selectOptions; }
    function renderCategoryManager(parentId = null, saveHistory = true) { if (saveHistory) { categoryManagerHistory.push(currentCategoryManagerParentId); } currentCategoryManagerParentId = parentId; if (parentId === null) { categoryManagerTitle.textContent = '分類管理'; categoryBackBtn.classList.add('hidden'); } else { const parent = allCategories.find(c => c.id === parentId); categoryManagerTitle.textContent = parent ? parent.name : '子分類'; categoryBackBtn.classList.remove('hidden'); } const categoriesToShow = allCategories.filter(c => c.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder); categoryManagerList.innerHTML = ''; if (categoriesToShow.length === 0) { categoryManagerList.innerHTML = '<p class="empty-message">此層級下沒有分類</p>'; } else { categoriesToShow.forEach(cat => { const item = document.createElement('div'); item.className = 'cm-item'; item.dataset.id = cat.id; item.innerHTML = `<span class="cm-drag-handle" title="拖曳排序"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg></span><span class="cm-name">${cat.name}</span><div class="cm-actions"><button data-id="${cat.id}" class="action-btn edit-cat-btn" title="編輯名稱">✎</button><button data-id="${cat.id}" class="action-btn delete-cat-btn" title="刪除分類">×</button></div>`; categoryManagerList.appendChild(item); }); } if (categorySortableInstance) categorySortableInstance.destroy(); categorySortableInstance = new Sortable(categoryManagerList, { handle: '.cm-drag-handle', animation: 150, ghostClass: 'sortable-ghost', chosenClass: 'sortable-chosen', onEnd: async (evt) => { const items = Array.from(evt.to.children); const reorderData = items.map((item, index) => ({ id: parseInt(item.dataset.id), sortOrder: index, parentId: currentCategoryManagerParentId })); await reorderCategories(reorderData); } }); }
    async function addCategory() { const name = prompt('請輸入新的分類名稱：'); if (name && name.trim()) await saveCategory({ name: name.trim(), parentId: currentCategoryManagerParentId }); else if (name !== null) alert('分類名稱不能為空！'); }
    async function editCategory(id) { const category = allCategories.find(c => c.id === id); if (!category) return; const newName = prompt('請輸入新的分類名稱：', category.name); if (newName && newName.trim()) await saveCategory({ id: category.id, name: newName.trim(), parentId: category.parentId }); else if (newName !== null) alert('分類名稱不能為空！'); }
    function resetForm() { if (form) form.reset(); productIdInput.value = ''; currentImageItems.forEach(i => { if (i.url && i.url.startsWith('blob:')) URL.revokeObjectURL(i.url); }); currentImageItems = []; imageSizeSlider.value = 90; imageSizeValue.textContent = 90; mainImagePreview.style.transform = 'scale(1)'; deleteBtn.classList.add('hidden'); categorySelect.selectedIndex = 0; updateBarcodePreview(); hideCropperModal(); }
    function openModal(modal) { if (modal) modal.classList.remove('hidden'); }
    function closeModal(modal) { if (modal) modal.classList.add('hidden'); }
    function initSortable() { if (sortableInstance) sortableInstance.destroy(); if (thumbnailListAdmin) try { sortableInstance = new Sortable(thumbnailListAdmin, { animation: 150, filter: '.add-new', onEnd: (evt) => { if (evt.newIndex === currentImageItems.length) return; const item = currentImageItems.splice(evt.oldIndex, 1)[0]; currentImageItems.splice(evt.newIndex, 0, item); renderAdminImagePreview(); } }); } catch (e) { console.error("SortableJS init failed:", e); } }
    function updateImageUIState() { const imageEmptyState = document.getElementById('image-empty-state'); if (currentImageItems.length === 0) { imageEmptyState.classList.remove('hidden'); imageUploadArea.classList.add('hidden'); } else { imageEmptyState.classList.add('hidden'); imageUploadArea.classList.remove('hidden'); } }
    function renderAdminImagePreview() { if (!mainImagePreview) return; thumbnailListAdmin.querySelectorAll('.thumbnail-item:not(.add-new)').forEach(el => el.remove()); if (currentImageItems.length > 0) { mainImagePreview.src = currentImageItems[0].url; mainImagePreview.style.display = 'block'; mainImagePreview.style.transform = `scale(${imageSizeSlider.value / 100})`; currentImageItems.forEach((item, index) => { const thumb = document.createElement('div'); thumb.className = 'thumbnail-item'; if (index === 0) thumb.classList.add('active'); thumb.innerHTML = `<img src="${item.url}" data-index="${index}"><button type="button" class="delete-thumb-btn" data-index="${index}">&times;</button>`; thumbnailListAdmin.insertBefore(thumb, addMoreImagesBtn); }); } else { mainImagePreview.src = ''; mainImagePreview.style.display = 'none'; } updateImageUIState(); }
    function createSquareImageBlob(imageFile) { return new Promise((resolve, reject) => { const url = URL.createObjectURL(imageFile); const img = new Image(); img.onload = () => { const size = Math.max(img.naturalWidth, img.naturalHeight); const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size; const ctx = canvas.getContext('2d'); const x = (size - img.naturalWidth) / 2; const y = (size - img.naturalHeight) / 2; ctx.drawImage(img, x, y); URL.revokeObjectURL(url); canvas.toBlob(blob => { if (blob) resolve(blob); else reject(new Error('Canvas to Blob failed.')); }, 'image/png'); }; img.onerror = (err) => { URL.revokeObjectURL(url); reject(err); }; img.src = url; }); }
    async function handleFileSelection(files) { const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/')); if (imageFiles.length === 0) return; imageProcessingQueue = imageFiles; originalQueueLength = imageFiles.length; processNextImageInQueue(); }
    async function processNextImageInQueue() { if (imageProcessingQueue.length === 0) { hideCropperModal(); return; } const file = imageProcessingQueue.shift(); const processedBlob = await createSquareImageBlob(file); const url = URL.createObjectURL(processedBlob); showCropperModal(url); const currentIndex = originalQueueLength - imageProcessingQueue.length; cropperStatus.textContent = `正在處理: ${currentIndex} / ${originalQueueLength}`; cropperConfirmBtn.textContent = imageProcessingQueue.length > 0 ? '確認並處理下一張' : '完成裁切'; }
    function showCropperModal(imageUrl) { openModal(cropperModal); cropperImage.src = imageUrl; if (cropper) cropper.destroy(); cropper = new Cropper(cropperImage, { aspectRatio: 1, viewMode: 1, autoCropArea: 1, background: false, dragMode: 'move', movable: true }); }
    function hideCropperModal() { closeModal(cropperModal); if (cropper) { const url = cropperImage.src; cropper.destroy(); cropper = null; if (url.startsWith('blob:')) URL.revokeObjectURL(url); cropperImage.src = ''; } imageProcessingQueue = []; originalQueueLength = 0; }
    function updateBarcodePreview() { if (!ean13Input) return; const svg = document.getElementById('barcode-preview'); const value = ean13Input.value; if (value.length >= 12 && value.length <= 13) { try { JsBarcode(svg, value, { format: "EAN13", width: 2, height: 50 }); svg.style.display = 'block'; } catch (e) { svg.style.display = 'none'; } } else { svg.style.display = 'none'; } }
    async function uploadImage(blob, fileName) { try { const response = await fetch(`/api/upload/${fileName}`, { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob }); if (!response.ok) throw new Error(`圖片上傳失敗: ${response.statusText}`); const result = await response.json(); showToast('圖片上傳成功', 'success'); return result.url; } catch (error) { console.error('上傳圖片失敗:', error); showToast(`圖片上傳失敗: ${error.message}`, 'error'); return null; } }
    
    // --- 綁定不變的事件監聽 ---
    if (editModal) editModal.addEventListener('click', (e) => { if (e.target === editModal) closeModal(editModal); });
    if (categoryModal) categoryModal.addEventListener('click', (e) => { if (e.target === categoryModal) closeModal(categoryModal); });
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => closeModal(editModal));
    if (themeToggle) themeToggle.addEventListener('click', () => { document.body.classList.toggle('dark-mode'); localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light'); });
    if (addNewBtn) addNewBtn.addEventListener('click', () => openProductModal());
    if (menuToggleBtn) menuToggleBtn.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
    if (pageOverlay) pageOverlay.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
    if (form) form.addEventListener('submit', async (e) => { e.preventDefault(); const submitBtn = form.querySelector('button[type="submit"]'); submitBtn.disabled = true; submitBtn.textContent = '處理中...'; try { const imagesToUpload = currentImageItems.filter(item => item.isNew && item.blob); let uploadedCount = 0; const uploadPromises = imagesToUpload.map(async item => { const ext = item.blob.type.split('/')[1] || 'webp'; const tempId = productIdInput.value || `new_${Date.now()}`; const fileName = `product-${tempId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}.${ext}`; const uploadedUrl = await uploadImage(item.blob, fileName); uploadedCount++; submitBtn.textContent = `上傳圖片 (${uploadedCount}/${imagesToUpload.length})...`; item.url = uploadedUrl; return uploadedUrl; }); await Promise.all(uploadPromises); submitBtn.textContent = '正在儲存資料...'; const finalImageUrls = currentImageItems.map(item => item.url); const productId = productIdInput.value ? parseInt(productIdInput.value) : null; const data = { id: productId, name: document.getElementById('product-name').value, sku: document.getElementById('product-sku').value, ean13: ean13Input.value, price: parseFloat(document.getElementById('product-price').value), description: document.getElementById('product-description').value, imageUrls: finalImageUrls, imageSize: parseInt(imageSizeSlider.value), categoryId: parseInt(categorySelect.value) }; if (!data.categoryId) { alert("請選擇分類！"); return; } await saveProduct(data); closeModal(editModal); } finally { submitBtn.disabled = false; submitBtn.textContent = '儲存變更'; } });
    [imageDropzone, addMoreImagesBtn].forEach(el => el.addEventListener('click', () => imageUploadInput.click()));
    if (imageUploadInput) imageUploadInput.addEventListener('change', (e) => { handleFileSelection(e.target.files); e.target.value = ''; });
    if (imageDropzone) { ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => imageDropzone.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); }));['dragenter', 'dragover'].forEach(eventName => imageDropzone.addEventListener(eventName, () => imageDropzone.classList.add('dragover')));['dragleave', 'drop'].forEach(eventName => imageDropzone.addEventListener(eventName, () => imageDropzone.classList.remove('dragover'))); imageDropzone.addEventListener('drop', e => handleFileSelection(e.dataTransfer.files)); }
    if (cropperConfirmBtn) cropperConfirmBtn.addEventListener('click', () => { if (!cropper) return; cropperConfirmBtn.disabled = true; cropper.getCroppedCanvas({ width: 1024, height: 1024, imageSmoothingQuality: 'high' }).toBlob((blob) => { if (blob) { const previewUrl = URL.createObjectURL(blob); currentImageItems.push({ url: previewUrl, blob, isNew: true }); renderAdminImagePreview(); } else { showToast('裁切失敗', 'error'); } cropperConfirmBtn.disabled = false; processNextImageInQueue(); }, 'image/webp', 0.85); });
    if (cropperRotateBtn) cropperRotateBtn.addEventListener('click', () => { if (cropper) cropper.rotate(90); });
    if (cropperModalCloseBtn) cropperModalCloseBtn.addEventListener('click', hideCropperModal);
    if (cropperModal) cropperModal.addEventListener('click', (e) => { if (e.target === cropperModal) hideCropperModal(); });
    if (ean13Input) ean13Input.addEventListener('input', updateBarcodePreview);
    if (imageSizeSlider) imageSizeSlider.addEventListener('input', () => { const newSize = imageSizeSlider.value; imageSizeValue.textContent = newSize; if (mainImagePreview) mainImagePreview.style.transform = `scale(${newSize / 100})`; });
    if (thumbnailListAdmin) thumbnailListAdmin.addEventListener('click', e => { const target = e.target.closest('button.delete-thumb-btn, img'); if (!target) return; if (target.classList.contains('delete-thumb-btn')) { const index = parseInt(target.dataset.index); const item = currentImageItems[index]; if (item?.url.startsWith('blob:')) URL.revokeObjectURL(item.url); currentImageItems.splice(index, 1); renderAdminImagePreview(); } if (target.tagName === 'IMG') { const index = parseInt(target.dataset.index); mainImagePreview.src = currentImageItems[index].url; document.querySelectorAll('#thumbnail-list-admin .thumbnail-item').forEach(i => i.classList.remove('active')); target.closest('.thumbnail-item').classList.add('active'); } });
    if (manageCategoriesBtn) manageCategoriesBtn.addEventListener('click', () => { categoryManagerHistory = []; renderCategoryManager(null); openModal(categoryModal); });
    if (categoryModalCloseBtn) categoryModalCloseBtn.addEventListener('click', () => closeModal(categoryModal));
    if (categoryBackBtn) categoryBackBtn.addEventListener('click', () => { const lastParentId = categoryManagerHistory.pop(); renderCategoryManager(lastParentId, false); });
    if (categoryAddBtn) categoryAddBtn.addEventListener('click', addCategory);
    if (categoryManagerList) categoryManagerList.addEventListener('click', (e) => { const target = e.target; const catItem = target.closest('.cm-item'); if (!catItem) return; const id = parseInt(catItem.dataset.id); if (target.classList.contains('cm-name')) { renderCategoryManager(id); } else if (target.closest('.edit-cat-btn')) { editCategory(id); } else if (target.closest('.delete-cat-btn')) { if (confirm('您確定要刪除這個分類嗎？')) removeCategory(id); } });

    // 啟動應用
    init();
});