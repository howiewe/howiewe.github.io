// script-admin.js
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
    const cropperModal = document.getElementById('cropper-modal-container');
    const cropperImage = document.getElementById('cropper-image');
    const cropConfirmBtn = document.getElementById('crop-confirm-btn');
    const cropCancelBtn = document.getElementById('crop-cancel-btn');
    const cropRotateBtn = document.getElementById('crop-rotate-btn');
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
    function buildCategoryTree() { const categoryMap = new Map(allCategories.map(c => [c.id, { ...c, children: [] }])); const tree = []; for (const category of categoryMap.values()) { if (category.parentId === null) tree.push(category); else if (categoryMap.has(category.parentId)) categoryMap.get(category.parentId).children.push(category); } let html = `<ul><li><a href="#" class="active" data-id="all">所有產品</a></li>`; function createTreeHTML(nodes) { let subHtml = '<ul>'; for (const node of nodes) { subHtml += `<li><a href="#" data-id="${node.id}">${node.name}</a>`; if (node.children.length > 0) subHtml += createTreeHTML(node.children); subHtml += '</li>'; } return subHtml + '</ul>'; } categoryTreeContainer.innerHTML = html + createTreeHTML(tree) + '</ul>'; let selectOptions = '<option value="" disabled>請選擇分類</option>'; function createSelectOptions(nodes, depth = 0) { for (const node of nodes) { selectOptions += `<option value="${node.id}">${'—'.repeat(depth)} ${node.name}</option>`; if (node.children.length > 0) createSelectOptions(node.children, depth + 1); } } createSelectOptions(tree); categorySelect.innerHTML = selectOptions; }
    categoryTreeContainer.addEventListener('click', e => { e.preventDefault(); const targetLink = e.target.closest('a'); if (targetLink) { document.querySelectorAll('#category-tree a').forEach(a => a.classList.remove('active')); targetLink.classList.add('active'); currentCategoryId = targetLink.dataset.id === 'all' ? 'all' : parseInt(targetLink.dataset.id); renderProducts(); if (window.innerWidth <= 992) toggleSidebar(); } });
    function getCategoryIdsWithChildren(startId) { if (startId === 'all') return null; const ids = new Set([startId]); const queue = [startId]; while (queue.length > 0) { const children = allCategories.filter(c => c.parentId === queue.shift()); for (const child of children) { ids.add(child.id); queue.push(child.id); } } return ids; }
    function renderProducts() { const searchTerm = searchBox.value.toLowerCase(); const categoryIdsToDisplay = getCategoryIdsWithChildren(currentCategoryId); const filteredProducts = allProducts.filter(p => { const matchesCategory = categoryIdsToDisplay === null || (p.categoryId && categoryIdsToDisplay.has(p.categoryId)); const matchesSearch = p.name.toLowerCase().includes(searchTerm); return matchesCategory && matchesSearch; }); productList.innerHTML = ''; if (filteredProducts.length === 0 && addNewBtn.disabled === false) { productList.innerHTML = '<p class="empty-message">此分類下無產品。</p>'; return; } filteredProducts.forEach(product => { const card = document.createElement('div'); card.className = 'product-card'; card.onclick = () => openEditModal(product.id); const firstImage = (product.imageUrls && product.imageUrls.length > 0) ? product.imageUrls[0] : ''; card.innerHTML = ` <div class="image-container"><img src="${firstImage}" class="product-image" alt="${product.name}" loading="lazy" style="width: ${product.imageSize || 100}%;"></div> <div class="product-info"><h3>${product.name}</h3><p class="price">$${product.price}</p></div> `; productList.appendChild(card); }); }

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

        // 步驟 1: 上傳所有新圖片
        showToast('開始上傳圖片...', 'info');
        const uploadPromises = currentImageItems.map(async (item, index) => {
            if (item.isNew && item.blob) {
                const fileExtension = item.blob.type.split('/')[1] || 'jpg';
                const tempId = productIdInput.value || `new_${Date.now()}`;
                const fileName = `product-${tempId}-${Date.now()}-${index}.${fileExtension}`;
                const uploadedUrl = await uploadImage(item.blob, fileName);
                return uploadedUrl || item.url; // 如果上傳失敗，保留 blob URL (雖然這不理想)
            }
            return item.url; // 返回舊的 URL
        });
        const finalImageUrls = await Promise.all(uploadPromises);
        showToast('圖片處理完成，正在儲存產品資料...', 'info');

        // 步驟 2: 整理產品資料
        const id = productIdInput.value;
        const newProductData = { id: id ? parseInt(id) : Date.now(), name: document.getElementById('product-name').value, sku: document.getElementById('product-sku').value, ean13: document.getElementById('product-ean13').value, price: parseFloat(document.getElementById('product-price').value), description: document.getElementById('product-description').value, imageUrls: finalImageUrls, imageSize: parseInt(imageSizeSlider.value), categoryId: parseInt(categorySelect.value) };
        if (!newProductData.categoryId) { alert("請選擇一個產品分類！"); return; }

        // 步驟 3: 更新本地產品列表並觸發雲端儲存
        let updatedProducts;
        if (id) {
            updatedProducts = allProducts.map(p => p.id == id ? newProductData : p);
        } else {
            updatedProducts = [...allProducts, newProductData];
        }
        await updateAndSave('products', updatedProducts, true); // true 會觸發 saveDataToCloud

        closeModal(editModal);
    });

    function openEditModal(id) {
        resetForm();
        const product = allProducts.find(p => p.id == id);
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
            renderAdminImagePreview();
            imageSizeSlider.value = product.imageSize || 100;
            imageSizeValue.textContent = imageSizeSlider.value;
            const initialScale = (product.imageSize || 100) / 100;
            mainImagePreview.style.transform = `scale(${initialScale})`;
            deleteBtn.classList.remove('hidden');
            deleteBtn.onclick = () => deleteProduct(product.id);
            updateBarcodePreview();
            openModal(editModal);
            initSortable();
        }
    }

    async function deleteProduct(id) {
        if (confirm('您確定要刪除這個產品嗎？此操作無法復原。')) {
            const updatedProducts = allProducts.filter(p => p.id != id);
            await updateAndSave('products', updatedProducts, true);
            showToast('產品已刪除', 'info');
            closeModal(editModal);
        }
    }

    function resetForm() { form.reset(); productIdInput.value = ''; currentImageItems.forEach(item => { if (item.url.startsWith('blob:')) URL.revokeObjectURL(item.url) }); currentImageItems = []; renderAdminImagePreview(); imageSizeSlider.value = 100; imageSizeValue.textContent = 100; mainImagePreview.style.transform = 'scale(1)'; deleteBtn.classList.add('hidden'); categorySelect.selectedIndex = 0; updateBarcodePreview(); }
    function initSortable() { if (sortableInstance) { sortableInstance.destroy(); } try { sortableInstance = new Sortable(thumbnailListAdmin, { animation: 150, ghostClass: 'sortable-ghost', onEnd: (evt) => { const movedItem = currentImageItems.splice(evt.oldIndex, 1)[0]; currentImageItems.splice(evt.newIndex, 0, movedItem); renderAdminImagePreview(); }, }); } catch (e) { console.error("SortableJS 初始化失敗! 請檢查函式庫是否成功載入。", e); showToast('拖曳排序功能載入失敗', 'error'); } }
    function renderAdminImagePreview() { thumbnailListAdmin.innerHTML = ''; if (currentImageItems.length > 0) { mainImagePreview.src = currentImageItems[0].url; mainImagePreview.style.display = 'block'; currentImageItems.forEach((item, index) => { const thumbItem = document.createElement('div'); thumbItem.className = 'thumbnail-item'; if (index === 0) thumbItem.classList.add('active'); thumbItem.innerHTML = ` <img src="${item.url}" data-index="${index}" alt="縮圖 ${index + 1}"> <button type="button" class="delete-thumb-btn" data-index="${index}" title="刪除此圖">&times;</button> `; thumbnailListAdmin.appendChild(thumbItem); }); } else { mainImagePreview.src = ''; mainImagePreview.style.display = 'none'; } }
    thumbnailListAdmin.addEventListener('click', e => { const target = e.target; if (target.classList.contains('delete-thumb-btn')) { const indexToDelete = parseInt(target.dataset.index); const itemToDelete = currentImageItems[indexToDelete]; if (itemToDelete && itemToDelete.url.startsWith('blob:')) { URL.revokeObjectURL(itemToDelete.url); } currentImageItems.splice(indexToDelete, 1); renderAdminImagePreview(); } if (target.tagName === 'IMG') { const indexToShow = parseInt(target.dataset.index); mainImagePreview.src = currentImageItems[indexToShow].url; document.querySelectorAll('#thumbnail-list-admin .thumbnail-item').forEach(item => item.classList.remove('active')); target.parentElement.classList.add('active'); } });

    // --- 圖片裁切邏輯 (優化版) ---
    uploadImageBtn.addEventListener('click', () => imageUploadInput.click());

    imageUploadInput.addEventListener('change', (e) => {
        // 優化 1：使用 `e.target.files` 陣列，即使只選一個檔案，這樣寫更標準
        const files = e.target.files;
        if (!files || files.length === 0) {
            return;
        }
        const file = files[0];

        // 優化 2：增加檔案類型檢查，防止使用者上傳非圖片檔
        if (!file.type.startsWith('image/')) {
            showToast('請選擇有效的圖片檔案 (jpg, png, webp 等)', 'error');
            e.target.value = ''; // 清空選擇，以便下次能選同一個檔案
            return;
        }

        const objectUrl = URL.createObjectURL(file);

        // 優化 3：將 cropper 的初始化邏輯移到 openModal 之後，確保 DOM 元素可見
        openModal(cropperModal);

        // 確保圖片載入完成後再初始化 Cropper，避免尺寸計算錯誤
        cropperImage.onload = () => {
            if (cropper) {
                cropper.destroy();
            }
            cropper = new Cropper(cropperImage, {
                aspectRatio: 1 / 1,
                viewMode: 1,
                background: false,
                autoCropArea: 1, // 將 1 改為 0.8，讓預設裁切框小一點，使用者更容易看到並調整
                responsive: true,
                checkOrientation: false, // 避免某些手機照片自動旋轉問題
                // 'ready' 事件不是必須的，Cropper 會自動適應
            });
        };

        // cropperImage.src 的設定移到 .onload 事件綁定之後
        cropperImage.src = objectUrl;

        // 優化 4：在 cropperImage 的 error 事件中處理圖片載入失敗
        cropperImage.onerror = () => {
            showToast('無法載入圖片，可能檔案已損壞', 'error');
            closeModal(cropperModal);
            URL.revokeObjectURL(objectUrl);
        };

        e.target.value = '';
    });

    cropConfirmBtn.addEventListener('click', () => {
        if (!cropper) return; // 增加保護

        // 優化 5：在按下按鈕時，短暫禁用它，防止使用者連續點擊
        cropConfirmBtn.disabled = true;

        cropper.getCroppedCanvas({
            width: 1024, // 建議使用 width/height 而不是 maxWidth/maxHeight，確保輸出尺寸一致
            height: 1024,
            imageSmoothingQuality: 'high',
        }).toBlob((blob) => {
            if (!blob) {
                showToast('裁切失敗，請重試', 'error');
                cropConfirmBtn.disabled = false;
                return;
            }

            const previewUrl = URL.createObjectURL(blob);
            currentImageItems.push({ url: previewUrl, blob: blob, isNew: true });
            renderAdminImagePreview();

            closeModal(cropperModal);
            // 優化 6：在 Modal 關閉後再銷毀 Cropper，並重置按鈕狀態
            cropper.destroy();
            cropperImage.src = ''; // 清空圖片源，釋放記憶體
            cropperImage.onload = null; // 移除事件監聽器
            cropperImage.onerror = null;
            cropConfirmBtn.disabled = false;

        }, 'image/webp', 0.85); // 稍微提高品質到 0.85，對於 WebP 來說是個很好的平衡點
    });

    // cropCancelBtn 的邏輯也可以更完整地清理資源
    cropCancelBtn.addEventListener('click', () => {
        closeModal(cropperModal);
        if (cropper) {
            cropper.destroy();
            cropperImage.src = '';
            cropperImage.onload = null;
            cropperImage.onerror = null;
        }
    });

    if (cropRotateBtn) {
        cropRotateBtn.addEventListener('click', () => {
            if (cropper) {
                cropper.rotate(90);
            }
        });
    }
    // --- EAN13 預覽 & 圖片大小滑桿 ---
    function updateBarcodePreview() { const value = ean13Input.value; const previewSvg = document.getElementById('barcode-preview'); if (value.length >= 12 && value.length <= 13) { try { JsBarcode(previewSvg, value, { format: "EAN13", lineColor: "#000", width: 2, height: 50, displayValue: true }); previewSvg.style.display = 'block'; } catch (e) { previewSvg.style.display = 'none'; } } else { previewSvg.style.display = 'none'; } }
    ean13Input.addEventListener('input', updateBarcodePreview);
    imageSizeSlider.addEventListener('input', () => { const newSize = imageSizeSlider.value; imageSizeValue.textContent = newSize; if (mainImagePreview) { const scaleValue = newSize / 100; mainImagePreview.style.transform = `scale(${scaleValue})`; } });

    // --- 導入導出 ---
    importBtn.addEventListener('click', async () => { if (!confirm('匯入將會覆蓋您目前的所有本地資料，並將在下次儲存時同步到雲端，確定要繼續嗎？')) return; try { showToast('請先選擇您的 products.json 檔案', 'info'); const [prodHandle] = await window.showOpenFilePicker({ types: [{ description: '產品 JSON', accept: { 'application/json': ['.json'] } }] }); showToast('接著請選擇您的 categories.json 檔案', 'info'); const [catHandle] = await window.showOpenFilePicker({ types: [{ description: '分類 JSON', accept: { 'application/json': ['.json'] } }] }); const prodFile = await prodHandle.getFile(); const catFile = await catHandle.getFile(); const newProducts = JSON.parse(await prodFile.text()); const newCategories = JSON.parse(await catFile.text()); await updateAndSave('products', newProducts, false); await updateAndSave('categories', newCategories, true); showToast('資料匯入成功！變更已儲存至雲端。', 'success'); setUIState(true); } catch (err) { if (err.name !== 'AbortError') showToast('讀取檔案失敗', 'error'); } });
    exportBtn.addEventListener('click', async () => { try { const prodBlob = new Blob([JSON.stringify(allProducts, null, 2)], { type: 'application/json' }); const catBlob = new Blob([JSON.stringify(allCategories, null, 2)], { type: 'application/json' }); const download = (blob, filename) => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }; download(prodBlob, 'products.json'); download(catBlob, 'categories.json'); showToast('資料已匯出成 JSON 檔案！', 'success'); } catch (err) { showToast('匯出失敗！', 'error'); } });
    function showToast(message, type = 'info', duration = 3000) { const toastContainer = document.getElementById('toast-container'); const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.textContent = message; toastContainer.appendChild(toast); setTimeout(() => toast.classList.add('show'), 10); setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 500); }, duration); }

    // --- 初始化函式 ---
    async function init() {
        // 綁定事件監聽
        themeToggle.addEventListener('click', () => { document.body.classList.toggle('dark-mode'); localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light'); });
        pullFromCloudBtn.addEventListener('click', async () => {
            if (confirm('確定要從雲端拉取最新資料嗎？這將會覆蓋您目前未儲存的本地變更。')) {
                const success = await fetchDataFromCloud();
                if (success) setUIState(true);
            }
        });
        addNewBtn.addEventListener('click', () => { resetForm(); formTitle.textContent = '新增產品'; openModal(editModal); });
        modalCloseBtn.addEventListener('click', () => closeModal(editModal));
        editModal.addEventListener('click', (e) => { if (e.target === editModal) closeModal(editModal); });
        searchBox.addEventListener('input', renderProducts);
        manageCategoriesBtn.addEventListener('click', () => { buildCategoryManagementTree(); openModal(categoryModal); });
        categoryModalCloseBtn.addEventListener('click', () => closeModal(categoryModal));
        addTopLevelCategoryBtn.addEventListener('click', () => addCategory(null));
        categoryManagementTree.addEventListener('click', (e) => { const target = e.target.closest('.action-btn'); if (!target) return; const id = parseInt(target.dataset.id); if (target.classList.contains('add-child-btn')) addCategory(id); else if (target.classList.contains('edit-cat-btn')) editCategory(id); else if (target.classList.contains('delete-cat-btn')) deleteCategory(id); });

        // 頁面啟動時的初始設定
        const currentTheme = localStorage.getItem('theme');
        if (currentTheme === 'dark') document.body.classList.add('dark-mode');

        setUIState(false);
        const success = await fetchDataFromCloud();
        if (success) {
            setUIState(true);
        } else {
            // 嘗試從本地 IndexedDB 載入
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