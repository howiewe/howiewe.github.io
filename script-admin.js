document.addEventListener('DOMContentLoaded', () => {
    // --- IndexedDB ---
    const dbName = 'ProductCatalogDB_CF';
    const dbVersion = 1;
    function openDB() { return new Promise((resolve, reject) => { const request = indexedDB.open(dbName, dbVersion); request.onerror = event => reject(`DB Error: ${event.target.errorCode}`); request.onsuccess = event => resolve(event.target.result); request.onupgradeneeded = event => { const db = event.target.result; if (!db.objectStoreNames.contains('products')) db.createObjectStore('products', { keyPath: 'id' }); if (!db.objectStoreNames.contains('categories')) db.createObjectStore('categories', { keyPath: 'id' }); }; }); }
    function readData(storeName) { return new Promise(async (resolve, reject) => { const db = await openDB(); const tx = db.transaction(storeName, 'readonly'); const store = tx.objectStore(storeName); const req = store.getAll(); req.onerror = event => reject(`Read Error: ${event.target.errorCode}`); req.onsuccess = event => resolve(event.target.result); }); }
    function writeData(storeName, data) { return new Promise(async (resolve, reject) => { const db = await openDB(); const tx = db.transaction(storeName, 'readwrite'); const store = tx.objectStore(storeName); store.clear(); data.forEach(item => store.put(item)); tx.oncomplete = () => resolve(); tx.onerror = event => reject(`Write Error: ${event.target.errorCode}`); }); }

    // --- DOM Elements ---
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

    // --- Global State ---
    let allProducts = [], allCategories = [];
    let cropper, currentCategoryId = 'all', currentImageItems = [], sortableInstance = null, isSaving = false;

    // --- API Logic ---
    async function fetchDataFromCloud() {
        try {
            updateSyncStatus('正在從雲端拉取資料...', 'syncing');
            const response = await fetch('/api/data?t=' + new Date().getTime());
            if (!response.ok) throw new Error(`Server Error: ${response.statusText}`);
            const data = await response.json();
            allProducts = data.products || [];
            allCategories = data.categories || [];
            await writeData('products', allProducts);
            await writeData('categories', allCategories);
            updateSyncStatus('已與雲端同步', 'synced');
            return true;
        } catch (error) {
            console.error('Fetch data failed:', error);
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

    // --- UI & Rendering Logic ---
    function updateSyncStatus(message, status) { if (syncStatus) { syncStatus.textContent = message; syncStatus.className = `sync-status ${status}`; } }
    function setUIState(isReady) {
        if (manageCategoriesBtn) manageCategoriesBtn.disabled = !isReady;
        if (addNewBtn) addNewBtn.disabled = !isReady;
        if (searchBox) searchBox.disabled = !isReady;
        if (isReady) {
            buildCategoryTree();
            currentCategoryId = 'all';
            document.querySelectorAll('#category-tree a').forEach(a => a.classList.remove('active'));
            const allLink = document.querySelector('#category-tree a[data-id="all"]');
            if(allLink) allLink.classList.add('active');
            renderProducts();
        } else {
            if (productList) productList.innerHTML = '<p class="empty-message">正在從雲端載入資料...</p>';
            if (categoryTreeContainer) categoryTreeContainer.innerHTML = '';
        }
    }
    function buildCategoryTree() {
        const categoryMap = new Map(allCategories.map(c => [c.id, { ...c, children: [] }]));
        const tree = [];
        for (const category of categoryMap.values()) {
            if (category.parentId === null) tree.push(category);
            else if (categoryMap.has(category.parentId)) categoryMap.get(category.parentId).children.push(category);
        }
        let treeHtml = `<ul><li><a href="#" class="active" data-id="all">所有產品</a></li>`;
        function createTreeHTML(nodes) { let subHtml = '<ul>'; for (const node of nodes) { subHtml += `<li><a href="#" data-id="${node.id}">${node.name}</a>`; if (node.children.length > 0) subHtml += createTreeHTML(node.children); subHtml += '</li>'; } return subHtml + '</ul>'; }
        if (categoryTreeContainer) categoryTreeContainer.innerHTML = treeHtml + createTreeHTML(tree) + '</ul>';
        let selectOptions = '<option value="" disabled selected>請選擇分類</option>';
        function createSelectOptions(nodes, depth = 0) { for (const node of nodes) { selectOptions += `<option value="${node.id}">${'—'.repeat(depth)} ${node.name}</option>`; if (node.children.length > 0) createSelectOptions(node.children, depth + 1); } }
        createSelectOptions(tree);
        if (categorySelect) categorySelect.innerHTML = selectOptions;
    }
    function renderProducts() {
        if (!productList) return;
        const searchTerm = searchBox ? searchBox.value.toLowerCase() : '';
        const getCategoryIdsWithChildren = (startId) => { if (startId === 'all') return null; const ids = new Set([startId]); const queue = [startId]; while(queue.length > 0){ const children = allCategories.filter(c => c.parentId === queue.shift()); for (const child of children) { ids.add(child.id); queue.push(child.id); } } return ids; };
        const categoryIdsToDisplay = getCategoryIdsWithChildren(currentCategoryId);
        const filteredProducts = allProducts.filter(p => {
            const matchesCategory = categoryIdsToDisplay === null || (p.categoryId && categoryIdsToDisplay.has(p.categoryId));
            const matchesSearch = p.name.toLowerCase().includes(searchTerm);
            return matchesCategory && matchesSearch;
        });
        productList.innerHTML = '';
        if (filteredProducts.length === 0) { productList.innerHTML = '<p class="empty-message">此分類下無產品。</p>'; return; }
        filteredProducts.forEach(product => {
            const card = document.createElement('div'); card.className = 'product-card';
            card.onclick = () => { const productToEdit = allProducts.find(p => p.id === product.id); if (productToEdit) openProductModal(productToEdit); };
            const firstImage = (product.imageUrls && product.imageUrls.length > 0) ? product.imageUrls[0] : '';
            card.innerHTML = `<div class="image-container"><img src="${firstImage}" class="product-image" alt="${product.name}" loading="lazy" style="width: ${product.imageSize || 90}%;"></div><div class="product-info"><h3>${product.name}</h3><p class="price">$${product.price}</p></div>`;
            productList.appendChild(card);
        });
    }

    // --- Modal, Form, Cropper, and other functions ---
    async function updateAndSave(storeName, data, triggerRemoteSave = true) { if (storeName === 'products') allProducts = data; else if (storeName === 'categories') allCategories = data; await writeData(storeName, data); if (storeName === 'categories') buildCategoryTree(); renderProducts(); if (triggerRemoteSave) saveDataToCloud(); }
    function buildCategoryManagementTree() { const categoryMap = new Map(allCategories.map(c => [c.id, { ...c, children: [] }])); const tree = []; for (const category of categoryMap.values()) { if (category.parentId === null) tree.push(category); else if (categoryMap.has(category.parentId)) categoryMap.get(category.parentId).children.push(category); } function createTreeHTML(nodes) { let html = '<ul>'; for (const node of nodes) { html += `<li><div class="category-item-content"><span class="category-name">${node.name}</span><div class="category-actions"><button data-id="${node.id}" class="action-btn add-child-btn" title="新增子分類">+</button><button data-id="${node.id}" class="action-btn edit-cat-btn" title="編輯名稱">✎</button><button data-id="${node.id}" class="action-btn delete-cat-btn" title="刪除分類">×</button></div></div>`; if (node.children.length > 0) { html += createTreeHTML(node.children); } html += '</li>'; } return html + '</ul>'; } if(categoryManagementTree) categoryManagementTree.innerHTML = createTreeHTML(tree); }
    async function addCategory(parentId = null) { const name = prompt('請輸入新的分類名稱：'); if (name && name.trim()) { const newCategory = { id: Date.now(), name: name.trim(), parentId }; allCategories.push(newCategory); await updateAndSave('categories', allCategories); buildCategoryManagementTree(); } else if (name !== null) { alert('分類名稱不能為空！'); } }
    async function editCategory(id) { const category = allCategories.find(c => c.id === id); if (!category) return; const newName = prompt('請輸入新的分類名稱：', category.name); if (newName && newName.trim()) { category.name = newName.trim(); await updateAndSave('categories', allCategories); buildCategoryManagementTree(); } else if (newName !== null) { alert('分類名稱不能為空！'); } }
    async function deleteCategory(id) { const hasChildren = allCategories.some(c => c.parentId === id); if (hasChildren) { alert('无法删除！请先删除子分类。'); return; } const isUsed = allProducts.some(p => p.categoryId === id); if (isUsed) { alert('无法删除！尚有产品使用此分类。'); return; } if (confirm('您确定要删除这个分类吗？')) { const updatedCategories = allCategories.filter(c => c.id !== id); await updateAndSave('categories', updatedCategories); buildCategoryManagementTree(); } }
    function openModal(modal) { if (modal) modal.classList.remove('hidden'); }
    function closeModal(modal) { if (modal) modal.classList.add('hidden'); }
    if(form) form.addEventListener('submit', async (e) => { e.preventDefault(); showToast('处理中...', 'info'); const uploadPromises = currentImageItems.map(async item => { if (item.isNew && item.blob) { const ext = item.blob.type.split('/')[1] || 'webp'; const tempId = productIdInput.value || `new_${Date.now()}`; const fileName = `product-${tempId}-${Date.now()}.${ext}`; return uploadImage(item.blob, fileName); } return item.url; }); const finalImageUrls = (await Promise.all(uploadPromises)).filter(Boolean); const id = productIdInput.value; const data = { id: id ? parseInt(id) : Date.now(), name: document.getElementById('product-name').value, sku: document.getElementById('product-sku').value, ean13: ean13Input.value, price: parseFloat(document.getElementById('product-price').value), description: document.getElementById('product-description').value, imageUrls: finalImageUrls, imageSize: parseInt(imageSizeSlider.value), categoryId: parseInt(categorySelect.value) }; if (!data.categoryId) { alert("请选择分类！"); return; } let updated = id ? allProducts.map(p => p.id == id ? data : p) : [...allProducts, data]; await updateAndSave('products', updated, true); closeModal(editModal); hideCropper(); });
    
    // --- BUG FIX STARTS HERE ---
    function openProductModal(product = null) {
        resetForm();
        if (product) {
            // This is EDIT mode
            formTitle.textContent = '编辑产品';
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

            // BUGFIX: Always show delete button in edit mode, regardless of images.
            deleteBtn.classList.remove('hidden');
            deleteBtn.onclick = () => deleteProduct(product.id);

        } else {
            // This is ADD NEW mode
            formTitle.textContent = '新增产品';
            // deleteBtn is already hidden by resetForm()
        }
        
        renderAdminImagePreview(); // This function now only handles images
        updateBarcodePreview();
        openModal(editModal);
        initSortable();
    }
    // --- BUG FIX ENDS HERE ---

    async function deleteProduct(id) { if (confirm('您确定要删除这个产品吗？')) { await updateAndSave('products', allProducts.filter(p => p.id != id), true); showToast('产品已删除', 'info'); closeModal(editModal); hideCropper(); } }
    function resetForm() { if(form) form.reset(); productIdInput.value = ''; currentImageItems.forEach(i => { if(i.url.startsWith('blob:')) URL.revokeObjectURL(i.url); }); currentImageItems = []; renderAdminImagePreview(); imageSizeSlider.value = 90; imageSizeValue.textContent = 90; mainImagePreview.style.transform = 'scale(1)'; deleteBtn.classList.add('hidden'); categorySelect.selectedIndex = 0; updateBarcodePreview(); hideCropper(); }
    function initSortable() { if (sortableInstance) sortableInstance.destroy(); if(thumbnailListAdmin) try { sortableInstance = new Sortable(thumbnailListAdmin, { animation: 150, onEnd: (evt) => { const item = currentImageItems.splice(evt.oldIndex, 1)[0]; currentImageItems.splice(evt.newIndex, 0, item); renderAdminImagePreview(); } }); } catch(e) { console.error("SortableJS init failed:", e); } }
    
    // --- BUG FIX STARTS HERE ---
    function renderAdminImagePreview() {
        if (!thumbnailListAdmin || !mainImagePreview) return;
        thumbnailListAdmin.innerHTML = '';
        if (currentImageItems.length > 0) {
            mainImagePreview.src = currentImageItems[0].url;
            mainImagePreview.style.display = 'block';
            mainImagePreview.style.transform = `scale(${imageSizeSlider.value / 100})`;
            // BUGFIX: Removed logic that controlled delete button from here.
            currentImageItems.forEach((item, index) => {
                const thumb = document.createElement('div');
                thumb.className = index === 0 ? 'thumbnail-item active' : 'thumbnail-item';
                thumb.innerHTML = `<img src="${item.url}" data-index="${index}"><button type="button" class="delete-thumb-btn" data-index="${index}">&times;</button>`;
                thumbnailListAdmin.appendChild(thumb);
            });
        } else {
            mainImagePreview.src = '';
            mainImagePreview.style.display = 'none';
            // BUGFIX: Removed logic that controlled delete button from here.
        }
    }
    // --- BUG FIX ENDS HERE ---

    function showCropper(file) { if (!file.type.startsWith('image/')) { showToast('请选择图片文件', 'error'); return; } const url = URL.createObjectURL(file); imagePreviewArea.classList.add('hidden'); inlineCropperWorkspace.classList.remove('hidden'); inlineCropperImage.onload = () => { if (cropper) cropper.destroy(); cropper = new Cropper(inlineCropperImage, { aspectRatio: 1, viewMode: 1, autoCropArea: .9, background: false }); }; inlineCropperImage.src = url; }
    function hideCropper() { if (cropper) { const url = inlineCropperImage.src; cropper.destroy(); cropper = null; inlineCropperImage.src = ''; if (url.startsWith('blob:')) URL.revokeObjectURL(url); } inlineCropperWorkspace.classList.add('hidden'); imagePreviewArea.classList.remove('hidden'); }
    function updateBarcodePreview() { if(!ean13Input) return; const svg = document.getElementById('barcode-preview'); const value = ean13Input.value; if (value.length >= 12 && value.length <= 13) { try { JsBarcode(svg, value, { format: "EAN13", width: 2, height: 50 }); svg.style.display = 'block'; } catch (e) { svg.style.display = 'none'; } } else { svg.style.display = 'none'; } }
    function showToast(message, type = 'info', duration = 3000) { const el = document.getElementById('toast-container'); if (!el) return; const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.textContent = message; el.appendChild(toast); setTimeout(() => toast.classList.add('show'), 10); setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 500); }, duration); }

    // --- Initialization ---
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
        if (menuToggleBtn) menuToggleBtn.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
        if (pageOverlay) pageOverlay.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
        if (categoryTreeContainer) categoryTreeContainer.addEventListener('click', e => { e.preventDefault(); const target = e.target.closest('a'); if (target) { document.querySelectorAll('#category-tree a').forEach(a => a.classList.remove('active')); target.classList.add('active'); currentCategoryId = target.dataset.id === 'all' ? 'all' : parseInt(target.dataset.id); renderProducts(); if (window.innerWidth <= 992) document.body.classList.remove('sidebar-open'); } });
        if (uploadImageBtn) uploadImageBtn.addEventListener('click', () => imageUploadInput.click());
        if (imageUploadInput) imageUploadInput.addEventListener('change', (e) => { const file = e.target.files && e.target.files[0]; if (file) showCropper(file); e.target.value = ''; });
        if(inlineCropConfirmBtn) inlineCropConfirmBtn.addEventListener('click', () => { if (!cropper) return; inlineCropConfirmBtn.disabled = true; cropper.getCroppedCanvas({ width: 1024, height: 1024, imageSmoothingQuality: 'high', }).toBlob((blob) => { if (blob) { const previewUrl = URL.createObjectURL(blob); currentImageItems.push({ url: previewUrl, blob, isNew: true }); renderAdminImagePreview(); } else { showToast('裁切失敗', 'error'); } hideCropper(); inlineCropConfirmBtn.disabled = false; }, 'image/webp', 0.85); });
        if (inlineCropRotateBtn) inlineCropRotateBtn.addEventListener('click', () => { if (cropper) cropper.rotate(90); });
        if (inlineCropCancelBtn) inlineCropCancelBtn.addEventListener('click', hideCropper);
        if (ean13Input) ean13Input.addEventListener('input', updateBarcodePreview);
        if (imageSizeSlider) imageSizeSlider.addEventListener('input', () => { const newSize = imageSizeSlider.value; imageSizeValue.textContent = newSize; if (mainImagePreview) mainImagePreview.style.transform = `scale(${newSize / 100})`; });
        if (thumbnailListAdmin) thumbnailListAdmin.addEventListener('click', e => { const target = e.target; if (target.classList.contains('delete-thumb-btn')) { const index = parseInt(target.dataset.index); const item = currentImageItems[index]; if (item?.url.startsWith('blob:')) URL.revokeObjectURL(item.url); currentImageItems.splice(index, 1); renderAdminImagePreview(); } if (target.tagName === 'IMG') { const index = parseInt(target.dataset.index); mainImagePreview.src = currentImageItems[index].url; document.querySelectorAll('#thumbnail-list-admin .thumbnail-item').forEach(i => i.classList.remove('active')); target.parentElement.classList.add('active'); } });

        const currentTheme = localStorage.getItem('theme');
        if (currentTheme === 'dark') document.body.classList.add('dark-mode');
        setUIState(false);
        if (await fetchDataFromCloud()) {
            setUIState(true);
        } else {
            try {
                const localProducts = await readData('products');
                const localCategories = await readData('categories');
                if (localProducts && localProducts.length > 0) {
                    allProducts = localProducts;
                    allCategories = localCategories || [];
                    setUIState(true);
                    updateSyncStatus('雲端連接失敗，已載入本地快取', 'error');
                } else { updateSyncStatus('雲端連接失敗，且無本地快取', 'error'); }
            } catch (e) { updateSyncStatus('雲端及本地均載入失敗', 'error'); }
        }
    }
    init();
});