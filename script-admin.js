document.addEventListener('DOMContentLoaded', () => {
    // --- IndexedDB 幫手函式 (本地快取) ---
    const dbName = 'ProductCatalogDB_CF';
    const dbVersion = 1;
    function openDB() { return new Promise((resolve, reject) => { const request = indexedDB.open(dbName, dbVersion); request.onerror = event => reject(`無法開啟 IndexedDB 資料庫: ${event.target.errorCode}`); request.onsuccess = event => resolve(event.target.result); request.onupgradeneeded = event => { const db = event.target.result; if (!db.objectStoreNames.contains('products')) db.createObjectStore('products', { keyPath: 'id' }); if (!db.objectStoreNames.contains('categories')) db.createObjectStore('categories', { keyPath: 'id' }); }; }); }
    function readData(storeName) { return new Promise(async (resolve, reject) => { const db = await openDB(); const transaction = db.transaction(storeName, 'readonly'); const store = transaction.objectStore(storeName); const request = store.getAll(); request.onerror = event => reject(`無法從 ${storeName} 讀取資料: ${event.target.errorCode}`); request.onsuccess = event => resolve(event.target.result); }); }
    function writeData(storeName, data) { return new Promise(async (resolve, reject) => { const db = await openDB(); const transaction = db.transaction(storeName, 'readwrite'); const store = transaction.objectStore(storeName); store.clear(); data.forEach(item => store.put(item)); transaction.oncomplete = () => resolve(); transaction.onerror = event => reject(`無法寫入資料至 ${storeName}: ${event.target.errorCode}`); }); }

    // --- DOM 元素宣告 (确保所有元素都存在于 admin.html) ---
    const productList = document.getElementById('product-list');
    const form = document.getElementById('product-form');
    const formTitle = document.getElementById('form-title');
    const productIdInput = document.getElementById('product-id');
    const searchBox = document.getElementById('search-box');
    const themeToggle = document.getElementById('theme-toggle');
    const categoryTreeContainer = document.getElementById('category-tree');
    const categorySelect = document.getElementById('product-category-select');
    const editModal = document.getElementById('edit-modal-container');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const addNewBtn = document.getElementById('add-new-btn');
    const deleteBtn = document.getElementById('delete-btn');
    const uploadImageBtn = document.getElementById('upload-image-btn');
    const imageUploadInput = document.getElementById('product-image-upload');
    const mainImagePreview = document.getElementById('main-image-preview');
    const thumbnailListAdmin = document.getElementById('thumbnail-list-admin');
    const imageSizeSlider = document.getElementById('image-size');
    const imageSizeValue = document.getElementById('image-size-value');
    const ean13Input = document.getElementById('product-ean13');
    const pageOverlay = document.getElementById('page-overlay');
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const syncStatus = document.getElementById('sync-status');
    // const pullFromCloudBtn = document.getElementById('pull-from-cloud-btn'); // 此按钮已在最新 HTML 中移除
    const manageCategoriesBtn = document.getElementById('manage-categories-btn');
    const categoryModal = document.getElementById('category-modal-container');
    const categoryModalCloseBtn = document.getElementById('category-modal-close-btn');
    const categoryManagementTree = document.getElementById('category-management-tree');
    const addTopLevelCategoryBtn = document.getElementById('add-toplevel-category-btn');
    const inlineCropperWorkspace = document.getElementById('inline-cropper-workspace');
    const inlineCropperImage = document.getElementById('inline-cropper-image');
    const inlineCropConfirmBtn = document.getElementById('inline-crop-confirm-btn');
    const inlineCropRotateBtn = document.getElementById('inline-crop-rotate-btn');
    const inlineCropCancelBtn = document.getElementById('inline-crop-cancel-btn');
    const imagePreviewArea = document.getElementById('image-preview-area');

    // --- 全域變數 ---
    let allProducts = [], allCategories = [];
    let cropper;
    let currentCategoryId = 'all';
    let currentImageItems = [];
    let sortableInstance = null;
    let isSaving = false;

    // --- 核心 API 邏輯 ---
    async function fetchDataFromCloud() {
        try {
            updateSyncStatus('正在從雲端拉取資料...', 'syncing');
            const response = await fetch('/api/data?t=' + new Date().getTime());
            if (!response.ok) throw new Error(`伺服器錯誤: ${response.statusText}`);
            const data = await response.json();
            allProducts = data.products || [];
            allCategories = data.categories || [];
            await writeData('products', allProducts);
            await writeData('categories', allCategories);
            updateSyncStatus('已與雲端同步', 'synced');
            showToast('已成功從雲端同步最新資料', 'success');
            return true;
        } catch (error) {
            console.error('從 Cloudflare 拉取資料失敗:', error);
            updateSyncStatus('雲端同步失敗', 'error');
            showToast(`拉取雲端資料失敗: ${error.message}`, 'error');
            return false;
        }
    }

    async function saveDataToCloud(showToastMsg = true) {
        if (isSaving) { showToast('正在儲存中，請稍候...', 'info'); return; }
        isSaving = true;
        updateSyncStatus('正在儲存至雲端...', 'syncing');
        try {
            const response = await fetch('/api/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ products: allProducts, categories: allCategories })
            });
            if (!response.ok) throw new Error(`伺服器錯誤: ${response.statusText}`);
            await response.json();
            updateSyncStatus('已儲存至雲端', 'synced');
            if (showToastMsg) showToast('變更已成功儲存至雲端', 'success');
        } catch (error) {
            console.error('儲存至 Cloudflare 失敗:', error);
            updateSyncStatus('儲存至雲端失敗', 'error');
            showToast(`儲存至雲端失敗: ${error.message}`, 'error');
        } finally {
            isSaving = false;
        }
    }

    async function uploadImage(blob, fileName) {
        try {
            const response = await fetch(`/api/upload/${fileName}`, { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob });
            if (!response.ok) throw new Error(`圖片上傳失敗: ${response.statusText}`);
            const result = await response.json();
            showToast('圖片上傳成功', 'success');
            return result.url;
        } catch (error) {
            console.error('上傳圖片失敗:', error);
            showToast(`圖片上傳失敗: ${error.message}`, 'error');
            return null;
        }
    }

    function updateSyncStatus(message, status) {
        if (syncStatus) {
            syncStatus.textContent = message;
            syncStatus.className = `sync-status ${status}`;
        }
    }

    // --- UI 狀態管理 ---
    function setUIState(isReady) {
        if (manageCategoriesBtn) manageCategoriesBtn.disabled = !isReady;
        if (addNewBtn) addNewBtn.disabled = !isReady;
        if (searchBox) searchBox.disabled = !isReady;

        if (isReady) {
            buildCategoryTree();
            renderProducts();
        } else {
            if (productList) productList.innerHTML = '<p class="empty-message">正在從雲端載入資料，請稍候...</p>';
            if (categoryTreeContainer) categoryTreeContainer.innerHTML = '';
            allProducts = [];
            allCategories = [];
        }
    }

    // --- 分類樹 & 產品渲染 ---
    function toggleSidebar() { document.body.classList.toggle('sidebar-open'); }
    function buildCategoryTree() { 
        const categoryMap = new Map(allCategories.map(c => [c.id, { ...c, children: [] }]));
        const tree = [];
        for (const category of categoryMap.values()) {
            if (category.parentId === null) tree.push(category);
            else if (categoryMap.has(category.parentId)) categoryMap.get(category.parentId).children.push(category);
        }
        
        let treeHtml = `<ul><li><a href="#" class="active" data-id="all">所有產品</a></li>`;
        function createTreeHTML(nodes) {
            let subHtml = '<ul>';
            for (const node of nodes) {
                subHtml += `<li><a href="#" data-id="${node.id}">${node.name}</a>`;
                if (node.children.length > 0) subHtml += createTreeHTML(node.children);
                subHtml += '</li>';
            }
            return subHtml + '</ul>';
        }
        if (categoryTreeContainer) categoryTreeContainer.innerHTML = treeHtml + createTreeHTML(tree) + '</ul>';
        
        let selectOptions = '<option value="" disabled selected>請選擇分類</option>';
        function createSelectOptions(nodes, depth = 0) {
            for (const node of nodes) {
                selectOptions += `<option value="${node.id}">${'—'.repeat(depth)} ${node.name}</option>`;
                if (node.children.length > 0) createSelectOptions(node.children, depth + 1);
            }
        }
        createSelectOptions(tree);
        if (categorySelect) categorySelect.innerHTML = selectOptions;
    }
    
    function getCategoryIdsWithChildren(startId) {
        if (startId === 'all') return null;
        const ids = new Set([startId]);
        const queue = [startId];
        while (queue.length > 0) {
            const children = allCategories.filter(c => c.parentId === queue.shift());
            for (const child of children) { ids.add(child.id); queue.push(child.id); }
        }
        return ids;
    }
    
    function renderProducts() {
        if (!productList) return;
        const searchTerm = searchBox.value.toLowerCase();
        const categoryIdsToDisplay = getCategoryIdsWithChildren(currentCategoryId);
        const filteredProducts = allProducts.filter(p => {
            const matchesCategory = categoryIdsToDisplay === null || (p.categoryId && categoryIdsToDisplay.has(p.categoryId));
            const matchesSearch = p.name.toLowerCase().includes(searchTerm);
            return matchesCategory && matchesSearch;
        });
        productList.innerHTML = '';
        if (filteredProducts.length === 0 && addNewBtn && !addNewBtn.disabled) {
            productList.innerHTML = '<p class="empty-message">此分類下無產品。</p>';
            return;
        }
        filteredProducts.forEach(product => {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.onclick = () => {
                const productToEdit = allProducts.find(p => p.id === product.id);
                if (productToEdit) openProductModal(productToEdit);
            };
            const firstImage = (product.imageUrls && product.imageUrls.length > 0) ? product.imageUrls[0] : '';
            card.innerHTML = ` <div class="image-container"><img src="${firstImage}" class="product-image" alt="${product.name}" loading="lazy" style="width: ${product.imageSize || 90}%;"></div> <div class="product-info"><h3>${product.name}</h3><p class="price">$${product.price}</p></div> `;
            productList.appendChild(card);
        });
    }

    // --- 省略其他函式 (updateAndSave, 分類管理, Modal, 表單, 裁切, etc...) ---
    // --- 确保这些函数也存在于你的文件中 ---
    
    async function updateAndSave(storeName, data, triggerRemoteSave = true) {
        if (storeName === 'products') allProducts = data;
        else if (storeName === 'categories') allCategories = data;
        await writeData(storeName, data);
        showToast('變更已儲存至本地', 'info');
        if (storeName === 'categories') buildCategoryTree();
        renderProducts();
        if (triggerRemoteSave) saveDataToCloud();
    }
    
    function buildCategoryManagementTree() { /* ... 之前的代码 ... */ }
    async function addCategory(parentId = null) { /* ... 之前的代码 ... */ }
    async function editCategory(id) { /* ... 之前的代码 ... */ }
    async function deleteCategory(id) { /* ... 之前的代码 ... */ }
    
    function openModal(modal) { modal.classList.remove('hidden'); }
    function closeModal(modal) { modal.classList.add('hidden'); }
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        showToast('开始上传图片...', 'info');
        const uploadPromises = currentImageItems.map(async (item) => {
            if (item.isNew && item.blob) {
                const fileExtension = item.blob.type.split('/')[1] || 'webp';
                const tempId = productIdInput.value || `new_${Date.now()}`;
                const fileName = `product-${tempId}-${Date.now()}.${fileExtension}`;
                return await uploadImage(item.blob, fileName);
            }
            return item.url;
        });
        const finalImageUrls = (await Promise.all(uploadPromises)).filter(url => url);
        showToast('图片处理完成，正在储存产品资料...', 'info');
        const id = productIdInput.value;
        const newProductData = {
            id: id ? parseInt(id) : Date.now(),
            name: document.getElementById('product-name').value,
            sku: document.getElementById('product-sku').value,
            ean13: ean13Input.value,
            price: parseFloat(document.getElementById('product-price').value),
            description: document.getElementById('product-description').value,
            imageUrls: finalImageUrls,
            imageSize: parseInt(imageSizeSlider.value),
            categoryId: parseInt(categorySelect.value)
        };
        if (!newProductData.categoryId) { alert("请选择一个产品分类！"); return; }
        let updatedProducts;
        if (id) {
            updatedProducts = allProducts.map(p => p.id == id ? newProductData : p);
        } else {
            updatedProducts = [...allProducts, newProductData];
        }
        await updateAndSave('products', updatedProducts, true);
        closeModal(editModal);
        hideCropper();
    });

    function openProductModal(product = null) {
        resetForm();
        if (product) {
            formTitle.textContent = '编辑产品';
            productIdInput.value = product.id;
            document.getElementById('product-name').value = product.name;
            document.getElementById('product-sku').value = product.sku;
            ean13Input.value = product.ean13;
            document.getElementById('product-price').value = product.price;
            document.getElementById('product-description').value = product.description;
            categorySelect.value = product.categoryId;
            currentImageItems = product.imageUrls ? product.imageUrls.map(url => ({ url, isNew: false, blob: null })) : [];
            const imageSize = product.imageSize || 90;
            imageSizeSlider.value = imageSize;
            imageSizeValue.textContent = imageSize;
        } else {
            formTitle.textContent = '新增产品';
        }
        renderAdminImagePreview();
        updateBarcodePreview();
        openModal(editModal);
        initSortable();
    }
    
    async function deleteProduct(id) {
        if (confirm('您确定要删除这个产品吗？')) {
            const updatedProducts = allProducts.filter(p => p.id != id);
            await updateAndSave('products', updatedProducts, true);
            showToast('产品已删除', 'info');
            closeModal(editModal);
            hideCropper();
        }
    }
    
    function resetForm() {
        if (form) form.reset();
        if (productIdInput) productIdInput.value = '';
        currentImageItems.forEach(item => { if (item.url.startsWith('blob:')) URL.revokeObjectURL(item.url); });
        currentImageItems = [];
        renderAdminImagePreview();
        if (imageSizeSlider) imageSizeSlider.value = 90;
        if (imageSizeValue) imageSizeValue.textContent = 90;
        if (mainImagePreview) mainImagePreview.style.transform = 'scale(1)';
        if (deleteBtn) deleteBtn.classList.add('hidden');
        if (categorySelect) categorySelect.selectedIndex = 0;
        updateBarcodePreview();
        hideCropper();
    }
    
    function initSortable() { /* ... 之前的代码 ... */ }
    function renderAdminImagePreview() {
        if (!thumbnailListAdmin || !mainImagePreview) return;
        thumbnailListAdmin.innerHTML = '';
        if (currentImageItems.length > 0) {
            mainImagePreview.src = currentImageItems[0].url;
            mainImagePreview.style.display = 'block';
            const currentScale = parseInt(imageSizeSlider.value) / 100;
            mainImagePreview.style.transform = `scale(${currentScale})`;
            deleteBtn.style.display = productIdInput.value ? 'inline-flex' : 'none'; // Show delete button if editing
            currentImageItems.forEach((item, index) => {
                const thumbItem = document.createElement('div');
                thumbItem.className = index === 0 ? 'thumbnail-item active' : 'thumbnail-item';
                thumbItem.innerHTML = `<img src="${item.url}" data-index="${index}" alt="缩图 ${index + 1}"><button type="button" class="delete-thumb-btn" data-index="${index}" title="删除此图">&times;</button>`;
                thumbnailListAdmin.appendChild(thumbItem);
            });
        } else {
            mainImagePreview.src = '';
            mainImagePreview.style.display = 'none';
        }
    }
    
    // ... 裁切逻辑 ...
    function showCropper(file) { /* ... */ }
    function hideCropper() { /* ... */ }

    function updateBarcodePreview() { /* ... */ }
    function showToast(message, type = 'info', duration = 3000) { /* ... */ }

    // --- 初始化函式 ---
    async function init() {
        const closeAndCleanupEditModal = () => { closeModal(editModal); hideCropper(); };
        if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeAndCleanupEditModal);
        if (editModal) editModal.addEventListener('click', (e) => { if (e.target === editModal) closeAndCleanupEditModal(); });
        
        if (themeToggle) themeToggle.addEventListener('click', () => { document.body.classList.toggle('dark-mode'); localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light'); });
        if (addNewBtn) addNewBtn.addEventListener('click', () => openProductModal());
        if (searchBox) searchBox.addEventListener('input', renderProducts);
        if (manageCategoriesBtn) manageCategoriesBtn.addEventListener('click', () => { buildCategoryManagementTree(); openModal(categoryModal); });
        if (categoryModalCloseBtn) categoryModalCloseBtn.addEventListener('click', () => closeModal(categoryModal));
        if (addTopLevelCategoryBtn) addTopLevelCategoryBtn.addEventListener('click', () => addCategory(null));
        if (categoryManagementTree) categoryManagementTree.addEventListener('click', (e) => { const target = e.target.closest('.action-btn'); if (!target) return; const id = parseInt(target.dataset.id); if (target.classList.contains('add-child-btn')) addCategory(id); else if (target.classList.contains('edit-cat-btn')) editCategory(id); else if (target.classList.contains('delete-cat-btn')) deleteCategory(id); });
        if (menuToggleBtn) menuToggleBtn.addEventListener('click', toggleSidebar);
        if (pageOverlay) pageOverlay.addEventListener('click', toggleSidebar);
        if (categoryTreeContainer) categoryTreeContainer.addEventListener('click', e => { e.preventDefault(); const target = e.target.closest('a'); if (target) { document.querySelectorAll('#category-tree a').forEach(a => a.classList.remove('active')); target.classList.add('active'); currentCategoryId = target.dataset.id === 'all' ? 'all' : parseInt(target.dataset.id); renderProducts(); if (window.innerWidth <= 992) toggleSidebar(); } });
        if (uploadImageBtn) uploadImageBtn.addEventListener('click', () => imageUploadInput.click());
        if (imageUploadInput) imageUploadInput.addEventListener('change', (e) => { const file = e.target.files && e.target.files[0]; if (file) showCropper(file); e.target.value = ''; });
        if (inlineCropConfirmBtn) inlineCropConfirmBtn.addEventListener('click', () => { /* ... 之前的裁切确认逻辑 ... */ });
        if (inlineCropRotateBtn) inlineCropRotateBtn.addEventListener('click', () => { if(cropper) cropper.rotate(90); });
        if (inlineCropCancelBtn) inlineCropCancelBtn.addEventListener('click', hideCropper);
        if (ean13Input) ean13Input.addEventListener('input', updateBarcodePreview);
        if (imageSizeSlider) imageSizeSlider.addEventListener('input', () => { const newSize = imageSizeSlider.value; imageSizeValue.textContent = newSize; if (mainImagePreview) { const scaleValue = newSize / 100; mainImagePreview.style.transform = `scale(${scaleValue})`; } });
        if (thumbnailListAdmin) thumbnailListAdmin.addEventListener('click', (e) => { /* ... 之前的缩图点击逻辑 ... */ });

        const currentTheme = localStorage.getItem('theme');
        if (currentTheme === 'dark') document.body.classList.add('dark-mode');
        
        setUIState(false);
        const success = await fetchDataFromCloud();
        if (success) {
            setUIState(true);
        } else {
             try {
                const localProducts = await readData('products');
                const localCategories = await readData('categories');
                if (localProducts && localProducts.length > 0) {
                    allProducts = localProducts;
                    allCategories = localCategories;
                    setUIState(true);
                    updateSyncStatus('雲端連接失敗，已載入本地快取', 'error');
                } else {
                     updateSyncStatus('雲端連接失敗，且無本地快取', 'error');
                }
            } catch (e) {
                 updateSyncStatus('雲端及本地均載入失敗', 'error');
            }
        }
    }

    init();
});