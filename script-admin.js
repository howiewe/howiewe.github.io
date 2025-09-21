document.addEventListener('DOMContentLoaded', () => {
    // --- IndexedDB 幫手函式 (本地快取) ---
    const dbName = 'ProductCatalogDB_CF';
    const dbVersion = 1;
    function openDB() { return new Promise((resolve, reject) => { const request = indexedDB.open(dbName, dbVersion); request.onerror = event => reject(`無法開啟 IndexedDB 資料庫: ${event.target.errorCode}`); request.onsuccess = event => resolve(event.target.result); request.onupgradeneeded = event => { const db = event.target.result; if (!db.objectStoreNames.contains('products')) db.createObjectStore('products', { keyPath: 'id' }); if (!db.objectStoreNames.contains('categories')) db.createObjectStore('categories', { keyPath: 'id' }); }; }); }
    function readData(storeName) { return new Promise(async (resolve, reject) => { const db = await openDB(); const transaction = db.transaction(storeName, 'readonly'); const store = transaction.objectStore(storeName); const request = store.getAll(); request.onerror = event => reject(`無法從 ${storeName} 讀取資料: ${event.target.errorCode}`); request.onsuccess = event => resolve(event.target.result); }); }
    function writeData(storeName, data) { return new Promise(async (resolve, reject) => { const db = await openDB(); const transaction = db.transaction(storeName, 'readwrite'); const store = transaction.objectStore(storeName); store.clear(); data.forEach(item => store.put(item)); transaction.oncomplete = () => resolve(); transaction.onerror = event => reject(`無法寫入資料至 ${storeName}: ${event.target.errorCode}`); }); }

    // --- DOM 元素宣告 ---
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
    const importBtn = document.getElementById('import-btn');
    const exportBtn = document.getElementById('export-btn');
    const syncStatus = document.getElementById('sync-status');
    const pullFromCloudBtn = document.getElementById('pull-from-cloud-btn');
    const manageCategoriesBtn = document.getElementById('manage-categories-btn');
    const categoryModal = document.getElementById('category-modal-container');
    const categoryModalCloseBtn = document.getElementById('category-modal-close-btn');
    const categoryManagementTree = document.getElementById('category-management-tree');
    const addTopLevelCategoryBtn = document.getElementById('add-toplevel-category-btn');
    // 內聯裁切 DOM 元素
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

    // --- 核心 API 邏輯 (Cloudflare) ---
    async function fetchDataFromCloud() {
        try {
            updateSyncStatus('正在從雲端拉取資料...', 'syncing');
            const response = await fetch('/api/data');
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
        if (isSaving) {
            showToast('正在儲存中，請稍候...', 'info');
            return;
        }
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
            const response = await fetch(`/api/upload/${fileName}`, {
                method: 'PUT',
                headers: { 'Content-Type': blob.type },
                body: blob
            });
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
        if (!syncStatus) return;
        syncStatus.textContent = message;
        syncStatus.className = `sync-status ${status}`;
    }

    // --- UI 狀態管理 ---
    function setUIState(isReady) {
        manageCategoriesBtn.disabled = !isReady;
        if (isReady) {
            addNewBtn.disabled = false;
            importBtn.disabled = false;
            exportBtn.disabled = false;
            searchBox.disabled = false;
            buildCategoryTree();
            renderProducts();
        } else {
            addNewBtn.disabled = true;
            importBtn.disabled = true;
            exportBtn.disabled = true;
            searchBox.disabled = true;
            productList.innerHTML = '<p class="empty-message">正在從雲端載入資料，請稍候...</p>';
            categoryTreeContainer.innerHTML = '';
            allProducts = [];
            allCategories = [];
        }
    }

    // --- 響應式側邊欄 & 分類樹 & 產品渲染 ---
    function toggleSidebar() { document.body.classList.toggle('sidebar-open'); }
    menuToggleBtn.addEventListener('click', toggleSidebar);
    pageOverlay.addEventListener('click', toggleSidebar);
    function buildCategoryTree() { const categoryMap = new Map(allCategories.map(c => [c.id, { ...c, children: [] }])); const tree = []; for (const category of categoryMap.values()) { if (category.parentId === null) tree.push(category); else if (categoryMap.has(category.parentId)) categoryMap.get(category.parentId).children.push(category); } let html = `<ul><li><a href="#" class="active" data-id="all">所有產品</a></li>`; function createTreeHTML(nodes) { let subHtml = '<ul>'; for (const node of nodes) { subHtml += `<li><a href="#" data-id="${node.id}">${node.name}</a>`; if (node.children.length > 0) subHtml += createTreeHTML(node.children); subHtml += '</li>'; } return subHtml + '</ul>'; } categoryTreeContainer.innerHTML = html + createTreeHTML(tree) + '</ul>'; let selectOptions = '<option value="" disabled selected>請選擇分類</option>'; function createSelectOptions(nodes, depth = 0) { for (const node of nodes) { selectOptions += `<option value="${node.id}">${'—'.repeat(depth)} ${node.name}</option>`; if (node.children.length > 0) createSelectOptions(node.children, depth + 1); } } createSelectOptions(tree); categorySelect.innerHTML = selectOptions; }
    categoryTreeContainer.addEventListener('click', e => { e.preventDefault(); const targetLink = e.target.closest('a'); if (targetLink) { document.querySelectorAll('#category-tree a').forEach(a => a.classList.remove('active')); targetLink.classList.add('active'); currentCategoryId = targetLink.dataset.id === 'all' ? 'all' : parseInt(targetLink.dataset.id); renderProducts(); if (window.innerWidth <= 992) toggleSidebar(); } });
    function getCategoryIdsWithChildren(startId) { if (startId === 'all') return null; const ids = new Set([startId]); const queue = [startId]; while (queue.length > 0) { const children = allCategories.filter(c => c.parentId === queue.shift()); for (const child of children) { ids.add(child.id); queue.push(child.id); } } return ids; }
    function renderProducts() { const searchTerm = searchBox.value.toLowerCase(); const categoryIdsToDisplay = getCategoryIdsWithChildren(currentCategoryId); const filteredProducts = allProducts.filter(p => { const matchesCategory = categoryIdsToDisplay === null || (p.categoryId && categoryIdsToDisplay.has(p.categoryId)); const matchesSearch = p.name.toLowerCase().includes(searchTerm); return matchesCategory && matchesSearch; }); productList.innerHTML = ''; if (filteredProducts.length === 0 && addNewBtn.disabled === false) { productList.innerHTML = '<p class="empty-message">此分類下無產品。</p>'; return; } filteredProducts.forEach(product => { const card = document.createElement('div'); card.className = 'product-card'; card.onclick = () => { const productToEdit = allProducts.find(p => p.id === product.id); if (productToEdit) openProductModal(productToEdit); }; const firstImage = (product.imageUrls && product.imageUrls.length > 0) ? product.imageUrls[0] : ''; card.innerHTML = ` <div class="image-container"><img src="${firstImage}" class="product-image" alt="${product.name}" loading="lazy" style="width: ${product.imageSize || 90}%;"></div> <div class="product-info"><h3>${product.name}</h3><p class="price">$${product.price}</p></div> `; productList.appendChild(card); }); }

    // --- 本地與遠端儲存邏輯 ---
    async function updateAndSave(storeName, data, triggerRemoteSave = true) {
        if (storeName === 'products') allProducts = data;
        else if (storeName === 'categories') allCategories = data;

        await writeData(storeName, data);
        showToast('變更已儲存至本地', 'info');

        if (storeName === 'categories') buildCategoryTree();
        renderProducts();

        if (triggerRemoteSave) {
            saveDataToCloud();
        }
    }

    // --- 分類管理 ---
    function buildCategoryManagementTree() { const categoryMap = new Map(allCategories.map(c => [c.id, { ...c, children: [] }])); const tree = []; for (const category of categoryMap.values()) { if (category.parentId === null) tree.push(category); else if (categoryMap.has(category.parentId)) categoryMap.get(category.parentId).children.push(category); } function createTreeHTML(nodes) { let html = '<ul>'; for (const node of nodes) { html += `<li><div class="category-item-content"><span class="category-name">${node.name}</span><div class="category-actions"><button data-id="${node.id}" class="action-btn add-child-btn" title="新增子分類"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14m-7-7h14"/></svg></button><button data-id="${node.id}" class="action-btn edit-cat-btn" title="編輯名稱"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button><button data-id="${node.id}" class="action-btn delete-cat-btn" title="刪除分類"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button></div></div>`; if (node.children.length > 0) { html += createTreeHTML(node.children); } html += '</li>'; } return html + '</ul>'; } categoryManagementTree.innerHTML = createTreeHTML(tree); }
    async function addCategory(parentId = null) { const name = prompt('請輸入新的分類名稱：'); if (name && name.trim()) { const newCategory = { id: Date.now(), name: name.trim(), parentId: parentId }; allCategories.push(newCategory); await updateAndSave('categories', allCategories); buildCategoryManagementTree(); } else if (name !== null) { alert('分類名稱不能為空！'); } }
    async function editCategory(id) { const category = allCategories.find(c => c.id === id); if (!category) return; const newName = prompt('請輸入新的分類名稱：', category.name); if (newName && newName.trim()) { category.name = newName.trim(); await updateAndSave('categories', allCategories); buildCategoryManagementTree(); } else if (newName !== null) { alert('分類名稱不能為空！'); } }
    async function deleteCategory(id) { const hasChildren = allCategories.some(c => c.parentId === id); if (hasChildren) { alert('無法刪除！請先刪除或移動此分類下的所有子分類。'); return; } const isUsed = allProducts.some(p => p.categoryId === id); if (isUsed) { alert('無法刪除！尚有產品使用此分類。'); return; } if (confirm('您確定要刪除這個分類嗎？此操作無法復原。')) { const updatedCategories = allCategories.filter(c => c.id !== id); await updateAndSave('categories', updatedCategories); buildCategoryManagementTree(); } }

    // --- Modal & 表單邏輯 ---
    function openModal(modal) { modal.classList.remove('hidden'); }
    function closeModal(modal) { modal.classList.add('hidden'); }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        showToast('開始上傳圖片...', 'info');
        const uploadPromises = currentImageItems.map(async (item, index) => {
            if (item.isNew && item.blob) {
                const fileExtension = item.blob.type.split('/')[1] || 'webp';
                const tempId = productIdInput.value || `new_${Date.now()}`;
                const fileName = `product-${tempId}-${Date.now()}-${index}.${fileExtension}`;
                return await uploadImage(item.blob, fileName);
            }
            return item.url;
        });
        const finalImageUrls = (await Promise.all(uploadPromises)).filter(url => url);
        showToast('圖片處理完成，正在儲存產品資料...', 'info');

        const id = productIdInput.value;
        const newProductData = { id: id ? parseInt(id) : Date.now(), name: document.getElementById('product-name').value, sku: document.getElementById('product-sku').value, ean13: document.getElementById('product-ean13').value, price: parseFloat(document.getElementById('product-price').value), description: document.getElementById('product-description').value, imageUrls: finalImageUrls, imageSize: parseInt(imageSizeSlider.value), categoryId: parseInt(categorySelect.value) };
        if (!newProductData.categoryId) { alert("請選擇一個產品分類！"); return; }

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
            formTitle.textContent = '編輯產品';
            productIdInput.value = product.id;
            document.getElementById('product-name').value = product.name;
            document.getElementById('product-sku').value = product.sku;
            ean13Input.value = product.ean13;
            document.getElementById('product-price').value = product.price;
            document.getElementById('product-description').value = product.description;
            categorySelect.value = product.categoryId;
            currentImageItems = product.imageUrls ? product.imageUrls.map(url => ({ url: url, isNew: false, blob: null })) : [];
            const imageSize = product.imageSize || 90;
            imageSizeSlider.value = imageSize;
            imageSizeValue.textContent = imageSize;
            const initialScale = imageSize / 100;
            mainImagePreview.style.transform = `scale(${initialScale})`;
            deleteBtn.classList.remove('hidden');
            deleteBtn.onclick = () => deleteProduct(product.id);
        } else {
            formTitle.textContent = '新增產品';
        }
        renderAdminImagePreview();
        updateBarcodePreview();
        openModal(editModal);
        initSortable();
    }

    async function deleteProduct(id) {
        if (confirm('您確定要刪除這個產品嗎？此操作無法復原。')) {
            const updatedProducts = allProducts.filter(p => p.id != id);
            await updateAndSave('products', updatedProducts, true);
            showToast('產品已刪除', 'info');
            closeModal(editModal);
            hideCropper();
        }
    }

    function resetForm() {
        form.reset();
        productIdInput.value = '';
        currentImageItems.forEach(item => { if (item.url.startsWith('blob:')) URL.revokeObjectURL(item.url) });
        currentImageItems = [];
        renderAdminImagePreview();
        imageSizeSlider.value = 90;
        imageSizeValue.textContent = 90;
        mainImagePreview.style.transform = 'scale(1)';
        deleteBtn.classList.add('hidden');
        categorySelect.selectedIndex = 0;
        updateBarcodePreview();
        hideCropper();
    }

    function initSortable() { if (sortableInstance) { sortableInstance.destroy(); } try { sortableInstance = new Sortable(thumbnailListAdmin, { animation: 150, ghostClass: 'sortable-ghost', onEnd: (evt) => { const movedItem = currentImageItems.splice(evt.oldIndex, 1)[0]; currentImageItems.splice(evt.newIndex, 0, movedItem); renderAdminImagePreview(); }, }); } catch (e) { console.error("SortableJS 初始化失敗!", e); showToast('拖曳排序功能載入失敗', 'error'); } }

    function renderAdminImagePreview() {
        thumbnailListAdmin.innerHTML = '';
        if (currentImageItems.length > 0) {
            mainImagePreview.src = currentImageItems[0].url;
            mainImagePreview.style.display = 'block';
            const currentScale = parseInt(imageSizeSlider.value) / 100;
            mainImagePreview.style.transform = `scale(${currentScale})`;
            currentImageItems.forEach((item, index) => {
                const thumbItem = document.createElement('div');
                thumbItem.className = 'thumbnail-item';
                if (index === 0) thumbItem.classList.add('active');
                thumbItem.innerHTML = ` <img src="${item.url}" data-index="${index}" alt="縮圖 ${index + 1}"> <button type="button" class="delete-thumb-btn" data-index="${index}" title="刪除此圖">&times;</button> `;
                thumbnailListAdmin.appendChild(thumbItem);
            });
        } else {
            mainImagePreview.src = '';
            mainImagePreview.style.display = 'none';
        }
    }

    thumbnailListAdmin.addEventListener('click', e => {
        const target = e.target;
        if (target.classList.contains('delete-thumb-btn')) {
            const indexToDelete = parseInt(target.dataset.index);
            const itemToDelete = currentImageItems[indexToDelete];
            if (itemToDelete && itemToDelete.url.startsWith('blob:')) {
                URL.revokeObjectURL(itemToDelete.url);
            }
            currentImageItems.splice(indexToDelete, 1);
            renderAdminImagePreview();
        }
        if (target.tagName === 'IMG') {
            const indexToShow = parseInt(target.dataset.index);
            mainImagePreview.src = currentImageItems[indexToShow].url;
            document.querySelectorAll('#thumbnail-list-admin .thumbnail-item').forEach(item => item.classList.remove('active'));
            target.parentElement.classList.add('active');
        }
    });

    // --- 圖片裁切邏輯 (內聯版本) ---
    function showCropper(file) {
        if (!file || !file.type.startsWith('image/')) {
            showToast('請選擇有效的圖片檔案', 'error');
            return;
        }
        const objectUrl = URL.createObjectURL(file);
        imagePreviewArea.classList.add('hidden');
        inlineCropperWorkspace.classList.remove('hidden');
        inlineCropperImage.onload = () => {
            if (cropper) cropper.destroy();
            cropper = new Cropper(inlineCropperImage, {
                aspectRatio: 1 / 1,
                viewMode: 1,
                autoCropArea: 0.9,
                background: false,
            });
        };
        inlineCropperImage.src = objectUrl;
    }

    function hideCropper() {
        if (cropper) {
            const objectUrl = inlineCropperImage.src;
            cropper.destroy();
            cropper = null;
            inlineCropperImage.src = '';
            if (objectUrl && objectUrl.startsWith('blob:')) URL.revokeObjectURL(objectUrl);
        }
        inlineCropperWorkspace.classList.add('hidden');
        imagePreviewArea.classList.remove('hidden');
    }

    uploadImageBtn.addEventListener('click', () => imageUploadInput.click());

    imageUploadInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
            showCropper(file);
        }
        e.target.value = '';
    });

    inlineCropConfirmBtn.addEventListener('click', () => {
        if (!cropper) return;
        inlineCropConfirmBtn.disabled = true;
        cropper.getCroppedCanvas({
            width: 1024, height: 1024, imageSmoothingQuality: 'high',
        }).toBlob((blob) => {
            if (blob) {
                const previewUrl = URL.createObjectURL(blob);
                currentImageItems.push({ url: previewUrl, blob: blob, isNew: true });
                renderAdminImagePreview();
            } else {
                showToast('裁切失敗，請重試', 'error');
            }
            hideCropper();
            inlineCropConfirmBtn.disabled = false;
        }, 'image/webp', 0.85);
    });

    inlineCropRotateBtn.addEventListener('click', () => { if (cropper) cropper.rotate(90); });
    inlineCropCancelBtn.addEventListener('click', hideCropper);

    // --- EAN13 預覽 & 圖片大小滑桿 ---
    function updateBarcodePreview() { const value = ean13Input.value; const previewSvg = document.getElementById('barcode-preview'); if (value.length >= 12 && value.length <= 13) { try { JsBarcode(previewSvg, value, { format: "EAN13", lineColor: "#000", width: 2, height: 50, displayValue: true }); previewSvg.style.display = 'block'; } catch (e) { previewSvg.style.display = 'none'; } } else { previewSvg.style.display = 'none'; } }
    ean13Input.addEventListener('input', updateBarcodePreview);
    imageSizeSlider.addEventListener('input', () => {
        const newSize = imageSizeSlider.value;
        imageSizeValue.textContent = newSize;
        if (mainImagePreview) {
            const scaleValue = newSize / 100;
            mainImagePreview.style.transform = `scale(${scaleValue})`;
        }
    });

    // script-admin.js

    // --- 導入導出 (CSV 版本) ---
    const importCsvBtn = document.getElementById('import-csv-btn');
    const csvUploadInput = document.getElementById('csv-upload-input');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const importResults = document.getElementById('import-results');

    importCsvBtn.addEventListener('click', () => {
        csvUploadInput.click();
    });

    csvUploadInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        importResults.style.display = 'block';
        importResults.textContent = '正在上傳並處理 CSV 檔案，請稍候... 這可能需要幾分鐘的時間。';
        showToast('開始匯入...', 'info');
        importCsvBtn.disabled = true;

        const formData = new FormData();
        formData.append('csvFile', file);

        try {
            const response = await fetch('/api/import/csv', {
                method: 'POST',
                body: formData, // 直接發送 FormData
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || '匯入失敗');
            }

            let reportText = `匯入完成！\n`;
            reportText += `--------------------\n`;
            reportText += `總共處理行數：${result.totalRows}\n`;
            reportText += `成功新增：${result.successAdded} 筆\n`;
            reportText += `成功更新：${result.successUpdated} 筆\n`;
            reportText += `處理失敗：${result.failed} 筆\n`;

            if (result.errors && result.errors.length > 0) {
                reportText += `\n錯誤詳情：\n`;
                reportText += result.errors.join('\n');
            }

            importResults.textContent = reportText;
            showToast('批次匯入處理完成！', 'success');

            // 匯入成功後，重新從雲端拉取一次最新資料以刷新頁面
            await fetchDataFromCloud();
            buildCategoryTree();
            renderProducts();

        } catch (err) {
            importResults.textContent = `發生錯誤：${err.message}`;
            showToast('匯入失敗，請檢查主控台錯誤', 'error');
            console.error('CSV Import Error:', err);
        } finally {
            e.target.value = ''; // 清空選擇
            importCsvBtn.disabled = false;
        }
    });

    exportCsvBtn.addEventListener('click', async () => {
        showToast('正在產生 CSV 檔案...', 'info');
        try {
            const response = await fetch('/api/export/csv');
            if (!response.ok) {
                throw new Error('匯出失敗');
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'products.csv';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            showToast('CSV 檔案匯出成功！', 'success');
        } catch (err) {
            showToast('匯出失敗！', 'error');
            console.error('CSV Export Error:', err);
        }
    });

    // --- 初始化函式 ---
    async function init() {
        const closeAndCleanupEditModal = () => {
            closeModal(editModal);
            hideCropper();
        };
        modalCloseBtn.addEventListener('click', closeAndCleanupEditModal);
        editModal.addEventListener('click', (e) => { if (e.target === editModal) closeAndCleanupEditModal(); });

        themeToggle.addEventListener('click', () => { document.body.classList.toggle('dark-mode'); localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light'); });
        pullFromCloudBtn.addEventListener('click', async () => {
            if (confirm('確定要從雲端拉取最新資料嗎？這將會覆蓋您目前未儲存的本地變更。')) {
                const success = await fetchDataFromCloud();
                if (success) setUIState(true);
            }
        });
        addNewBtn.addEventListener('click', () => openProductModal());
        searchBox.addEventListener('input', renderProducts);
        manageCategoriesBtn.addEventListener('click', () => { buildCategoryManagementTree(); openModal(categoryModal); });
        categoryModalCloseBtn.addEventListener('click', () => closeModal(categoryModal));
        addTopLevelCategoryBtn.addEventListener('click', () => addCategory(null));
        categoryManagementTree.addEventListener('click', (e) => { const target = e.target.closest('.action-btn'); if (!target) return; const id = parseInt(target.dataset.id); if (target.classList.contains('add-child-btn')) addCategory(id); else if (target.classList.contains('edit-cat-btn')) editCategory(id); else if (target.classList.contains('delete-cat-btn')) deleteCategory(id); });

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
                if (localProducts.length > 0) {
                    allProducts = localProducts;
                    allCategories = localCategories;
                    setUIState(true);
                    updateSyncStatus('雲端連接失敗，已載入本地快取', 'error');
                    showToast('雲端連接失敗，已從本地快取載入資料', 'info');
                } else {
                    updateSyncStatus('雲端連接失敗，且無本地快取', 'error');
                }
            } catch (e) {
                console.error('無法從 IndexedDB 讀取:', e);
                updateSyncStatus('雲端及本地均載入失敗', 'error');
            }
        }
    }

    init();
});