document.addEventListener('DOMContentLoaded', () => {
    // --- IndexedDB & DOM Declarations ---
    // (省略了这部分，和上一版完全一样，无需改动)
    const dbName = 'ProductCatalogDB_CF';
    const dbVersion = 1;
    function openDB() { return new Promise((resolve, reject) => { const request = indexedDB.open(dbName, dbVersion); request.onerror = event => reject(`無法開啟 IndexedDB 資料庫: ${event.target.errorCode}`); request.onsuccess = event => resolve(event.target.result); request.onupgradeneeded = event => { const db = event.target.result; if (!db.objectStoreNames.contains('products')) db.createObjectStore('products', { keyPath: 'id' }); if (!db.objectStoreNames.contains('categories')) db.createObjectStore('categories', { keyPath: 'id' }); }; }); }
    function readData(storeName) { return new Promise(async (resolve, reject) => { const db = await openDB(); const transaction = db.transaction(storeName, 'readonly'); const store = transaction.objectStore(storeName); const request = store.getAll(); request.onerror = event => reject(`無法從 ${storeName} 讀取資料: ${event.target.errorCode}`); request.onsuccess = event => resolve(event.target.result); }); }
    function writeData(storeName, data) { return new Promise(async (resolve, reject) => { const db = await openDB(); const transaction = db.transaction(storeName, 'readwrite'); const store = transaction.objectStore(storeName); store.clear(); data.forEach(item => store.put(item)); transaction.oncomplete = () => resolve(); transaction.onerror = event => reject(`無法寫入資料至 ${storeName}: ${event.target.errorCode}`); }); }

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

    // (省略了所有函数定义，和上一版完全一样，无需改动)
    // ...
    // ... (所有函数 handleGet, handlePost, openProductModal, etc. 都在这里) ...
    // ...
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

    function setUIState(isReady) {
        if (manageCategoriesBtn) manageCategoriesBtn.disabled = !isReady;
        if (addNewBtn) addNewBtn.disabled = !isReady;
        if (searchBox) searchBox.disabled = !isReady;

        if (isReady) {
            // 确保在渲染前，分类资料已经准备好
            buildCategoryTree();
            // 主动将分类设定为 'all' 并触发一次渲染，确保初次载入
            currentCategoryId = 'all';
            renderProducts();
        } else {
            if (productList) productList.innerHTML = '<p class="empty-message">正在从云端载入资料，请稍候...</p>';
            if (categoryTreeContainer) categoryTreeContainer.innerHTML = '';
            allProducts = [];
            allCategories = [];
        }
    }
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
    async function updateAndSave(storeName, data, triggerRemoteSave = true) {
        if (storeName === 'products') allProducts = data;
        else if (storeName === 'categories') allCategories = data;
        await writeData(storeName, data);
        showToast('變更已儲存至本地', 'info');
        if (storeName === 'categories') buildCategoryTree();
        renderProducts();
        if (triggerRemoteSave) saveDataToCloud();
    }
    function buildCategoryManagementTree() { const categoryMap = new Map(allCategories.map(c => [c.id, { ...c, children: [] }])); const tree = []; for (const category of categoryMap.values()) { if (category.parentId === null) tree.push(category); else if (categoryMap.has(category.parentId)) categoryMap.get(category.parentId).children.push(category); } function createTreeHTML(nodes) { let html = '<ul>'; for (const node of nodes) { html += `<li><div class="category-item-content"><span class="category-name">${node.name}</span><div class="category-actions"><button data-id="${node.id}" class="action-btn add-child-btn" title="新增子分類"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14m-7-7h14"/></svg></button><button data-id="${node.id}" class="action-btn edit-cat-btn" title="編輯名稱"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button><button data-id="${node.id}" class="action-btn delete-cat-btn" title="刪除分類"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button></div></div>`; if (node.children.length > 0) { html += createTreeHTML(node.children); } html += '</li>'; } return html + '</ul>'; } if (categoryManagementTree) categoryManagementTree.innerHTML = createTreeHTML(tree); }
    async function addCategory(parentId = null) { const name = prompt('請輸入新的分類名稱：'); if (name && name.trim()) { const newCategory = { id: Date.now(), name: name.trim(), parentId: parentId }; allCategories.push(newCategory); await updateAndSave('categories', allCategories); buildCategoryManagementTree(); } else if (name !== null) { alert('分類名稱不能為空！'); } }
    async function editCategory(id) { const category = allCategories.find(c => c.id === id); if (!category) return; const newName = prompt('請輸入新的分類名稱：', category.name); if (newName && newName.trim()) { category.name = newName.trim(); await updateAndSave('categories', allCategories); buildCategoryManagementTree(); } else if (newName !== null) { alert('分類名稱不能為空！'); } }
    async function deleteCategory(id) { const hasChildren = allCategories.some(c => c.parentId === id); if (hasChildren) { alert('無法刪除！請先刪除或移動此分類下的所有子分類。'); return; } const isUsed = allProducts.some(p => p.categoryId === id); if (isUsed) { alert('無法刪除！尚有產品使用此分類。'); return; } if (confirm('您確定要刪除這個分類嗎？此操作無法復原。')) { const updatedCategories = allCategories.filter(c => c.id !== id); await updateAndSave('categories', updatedCategories); buildCategoryManagementTree(); } }
    function openModal(modal) { if (modal) modal.classList.remove('hidden'); }
    function closeModal(modal) { if (modal) modal.classList.add('hidden'); }
    if (form) form.addEventListener('submit', async (e) => {
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
        const newProductData = { id: id ? parseInt(id) : Date.now(), name: document.getElementById('product-name').value, sku: document.getElementById('product-sku').value, ean13: ean13Input.value, price: parseFloat(document.getElementById('product-price').value), description: document.getElementById('product-description').value, imageUrls: finalImageUrls, imageSize: parseInt(imageSizeSlider.value), categoryId: parseInt(categorySelect.value) };
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
    function initSortable() { if (sortableInstance) { sortableInstance.destroy(); } if (thumbnailListAdmin) { try { sortableInstance = new Sortable(thumbnailListAdmin, { animation: 150, ghostClass: 'sortable-ghost', onEnd: (evt) => { const movedItem = currentImageItems.splice(evt.oldIndex, 1)[0]; currentImageItems.splice(evt.newIndex, 0, movedItem); renderAdminImagePreview(); }, }); } catch (e) { console.error("SortableJS 初始化失敗!", e); } } }
    function renderAdminImagePreview() {
        if (!thumbnailListAdmin || !mainImagePreview) return;
        thumbnailListAdmin.innerHTML = '';
        if (currentImageItems.length > 0) {
            mainImagePreview.src = currentImageItems[0].url;
            mainImagePreview.style.display = 'block';
            const currentScale = parseInt(imageSizeSlider.value) / 100;
            mainImagePreview.style.transform = `scale(${currentScale})`;
            deleteBtn.classList.remove('hidden');
            currentImageItems.forEach((item, index) => {
                const thumbItem = document.createElement('div');
                thumbItem.className = index === 0 ? 'thumbnail-item active' : 'thumbnail-item';
                thumbItem.innerHTML = `<img src="${item.url}" data-index="${index}" alt="缩图 ${index + 1}"><button type="button" class="delete-thumb-btn" data-index="${index}" title="删除此图">&times;</button>`;
                thumbnailListAdmin.appendChild(thumbItem);
            });
        } else {
            mainImagePreview.src = '';
            mainImagePreview.style.display = 'none';
            deleteBtn.classList.add('hidden');
        }
    }
    if (thumbnailListAdmin) thumbnailListAdmin.addEventListener('click', e => { const target = e.target; if (target.classList.contains('delete-thumb-btn')) { const indexToDelete = parseInt(target.dataset.index); const itemToDelete = currentImageItems[indexToDelete]; if (itemToDelete && itemToDelete.url.startsWith('blob:')) { URL.revokeObjectURL(itemToDelete.url); } currentImageItems.splice(indexToDelete, 1); renderAdminImagePreview(); } if (target.tagName === 'IMG') { const indexToShow = parseInt(target.dataset.index); mainImagePreview.src = currentImageItems[indexToShow].url; document.querySelectorAll('#thumbnail-list-admin .thumbnail-item').forEach(item => item.classList.remove('active')); target.parentElement.classList.add('active'); } });
    function showCropper(file) {
        if (!file || !file.type.startsWith('image/')) { showToast('請選擇有效的圖片檔案', 'error'); return; }
        const objectUrl = URL.createObjectURL(file);
        imagePreviewArea.classList.add('hidden');
        inlineCropperWorkspace.classList.remove('hidden');
        inlineCropperImage.onload = () => { if (cropper) cropper.destroy(); cropper = new Cropper(inlineCropperImage, { aspectRatio: 1 / 1, viewMode: 1, autoCropArea: 0.9, background: false, }); };
        inlineCropperImage.src = objectUrl;
    }
    function hideCropper() { if (cropper) { const objectUrl = inlineCropperImage.src; cropper.destroy(); cropper = null; inlineCropperImage.src = ''; if (objectUrl && objectUrl.startsWith('blob:')) URL.revokeObjectURL(objectUrl); } inlineCropperWorkspace.classList.add('hidden'); imagePreviewArea.classList.remove('hidden'); }
    if (inlineCropConfirmBtn) inlineCropConfirmBtn.addEventListener('click', () => { if (!cropper) return; inlineCropConfirmBtn.disabled = true; cropper.getCroppedCanvas({ width: 1024, height: 1024, imageSmoothingQuality: 'high', }).toBlob((blob) => { if (blob) { const previewUrl = URL.createObjectURL(blob); currentImageItems.push({ url: previewUrl, blob: blob, isNew: true }); renderAdminImagePreview(); } else { showToast('裁切失敗，請重試', 'error'); } hideCropper(); inlineCropConfirmBtn.disabled = false; }, 'image/webp', 0.85); });
    if (inlineCropRotateBtn) inlineCropRotateBtn.addEventListener('click', () => { if (cropper) cropper.rotate(90); });
    if (inlineCropCancelBtn) inlineCropCancelBtn.addEventListener('click', hideCropper);
    function updateBarcodePreview() { /* ... */ }
    function showToast(message, type = 'info', duration = 3000) { const toastContainer = document.getElementById('toast-container'); const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.textContent = message; toastContainer.appendChild(toast); setTimeout(() => toast.classList.add('show'), 10); setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 500); }, duration); }

    // --- 初始化函式 ---
    async function init() {
        // 安全地绑定所有事件
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
        if (categoryTreeContainer) categoryTreeContainer.addEventListener('click', e => {
            e.preventDefault();
            const target = e.target.closest('a');
            if (target) {
                document.querySelectorAll('#category-tree a').forEach(a => a.classList.remove('active'));
                target.classList.add('active');
                currentCategoryId = target.dataset.id === 'all' ? 'all' : parseInt(target.dataset.id);
                renderProducts();
                if (window.innerWidth <= 992) toggleSidebar();
            }
        });
        if (uploadImageBtn) uploadImageBtn.addEventListener('click', () => imageUploadInput.click());
        if (imageUploadInput) imageUploadInput.addEventListener('change', (e) => { const file = e.target.files && e.target.files[0]; if (file) showCropper(file); e.target.value = ''; });
        if (ean13Input) ean13Input.addEventListener('input', updateBarcodePreview);
        if (imageSizeSlider) imageSizeSlider.addEventListener('input', () => { const newSize = imageSizeSlider.value; imageSizeValue.textContent = newSize; if (mainImagePreview) { const scaleValue = newSize / 100; mainImagePreview.style.transform = `scale(${scaleValue})`; } });

        // 裁切相关的事件绑定也放在这里
        if (inlineCropConfirmBtn) inlineCropConfirmBtn.addEventListener('click', () => { if (!cropper) return; inlineCropConfirmBtn.disabled = true; cropper.getCroppedCanvas({ width: 1024, height: 1024, imageSmoothingQuality: 'high', }).toBlob((blob) => { if (blob) { const previewUrl = URL.createObjectURL(blob); currentImageItems.push({ url: previewUrl, blob: blob, isNew: true }); renderAdminImagePreview(); } else { showToast('裁切失敗，請重試', 'error'); } hideCropper(); inlineCropConfirmBtn.disabled = false; }, 'image/webp', 0.85); });
        if (inlineCropRotateBtn) inlineCropRotateBtn.addEventListener('click', () => { if (cropper) cropper.rotate(90); });
        if (inlineCropCancelBtn) inlineCropCancelBtn.addEventListener('click', hideCropper);
        if (thumbnailListAdmin) thumbnailListAdmin.addEventListener('click', e => { const target = e.target; if (target.classList.contains('delete-thumb-btn')) { const indexToDelete = parseInt(target.dataset.index); const itemToDelete = currentImageItems[indexToDelete]; if (itemToDelete && itemToDelete.url.startsWith('blob:')) { URL.revokeObjectURL(itemToDelete.url); } currentImageItems.splice(indexToDelete, 1); renderAdminImagePreview(); } if (target.tagName === 'IMG') { const indexToShow = parseInt(target.dataset.index); mainImagePreview.src = currentImageItems[indexToShow].url; document.querySelectorAll('#thumbnail-list-admin .thumbnail-item').forEach(item => item.classList.remove('active')); target.parentElement.classList.add('active'); } });

        // --- 启动流程 ---
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