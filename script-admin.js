// 注意：這份檔案整合了所有優化，包括 Blob/Object URL 處理、相對路徑儲存等
document.addEventListener('DOMContentLoaded', () => {
    // 【新增】輔助函式：將 Data URL 轉換為 Blob 物件，以相容舊的匯入格式
    function dataURLtoBlob(dataurl) {
        const arr = dataurl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type: mime });
    }

    // --- IndexedDB 幫手函式 (不變) ---
    const dbName = 'ProductCatalogDB';
    const dbVersion = 1;
    function openDB() { return new Promise((resolve, reject) => { const request = indexedDB.open(dbName, dbVersion); request.onerror = event => reject(`無法開啟 IndexedDB 資料庫: ${event.target.errorCode}`); request.onsuccess = event => resolve(event.target.result); request.onupgradeneeded = event => { const db = event.target.result; if (!db.objectStoreNames.contains('products')) db.createObjectStore('products', { keyPath: 'id' }); if (!db.objectStoreNames.contains('categories')) db.createObjectStore('categories', { keyPath: 'id' }); }; }); }
    function readData(storeName) { return new Promise(async (resolve, reject) => { const db = await openDB(); const transaction = db.transaction(storeName, 'readonly'); const store = transaction.objectStore(storeName); const request = store.getAll(); request.onerror = event => reject(`無法從 ${storeName} 讀取資料: ${event.target.errorCode}`); request.onsuccess = event => resolve(event.target.result); }); }
    function writeData(storeName, data) { return new Promise(async (resolve, reject) => { const db = await openDB(); const transaction = db.transaction(storeName, 'readwrite'); const store = transaction.objectStore(storeName); store.clear(); data.forEach(item => store.put(item)); transaction.oncomplete = () => resolve(); transaction.onerror = event => reject(`無法寫入資料至 ${storeName}: ${event.target.errorCode}`); }); }

    // --- DOM 元素宣告 (不變) ---
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
    const githubTokenInput = document.getElementById('github-token');
    const githubRepoInput = document.getElementById('github-repo');
    const saveGithubSettingsBtn = document.getElementById('save-github-settings-btn');
    const syncToGithubBtn = document.getElementById('sync-to-github-btn');
    const pullFromGithubBtn = document.getElementById('pull-from-github-btn');
    const manageCategoriesBtn = document.getElementById('manage-categories-btn');
    const categoryModal = document.getElementById('category-modal-container');
    const categoryModalCloseBtn = document.getElementById('category-modal-close-btn');
    const categoryManagementTree = document.getElementById('category-management-tree');
    const addTopLevelCategoryBtn = document.getElementById('add-toplevel-category-btn');

    // --- 全域變數 (currentImageUrls 結構改變) ---
    let allProducts = [], allCategories = [];
    let cropper;
    let currentCategoryId = 'all';
    let currentImageItems = []; // 改為儲存物件 { url: '...', blob: Blob, isNew: true }
    let sortableInstance = null;

    // --- UI 狀態管理 (不變) ---
    function setUIState(isReady) {
        manageCategoriesBtn.disabled = !isReady;
        if (isReady) {
            addNewBtn.disabled = false;
            syncToGithubBtn.disabled = false;
            importBtn.disabled = false;
            exportBtn.disabled = false;
            searchBox.disabled = false;
        } else {
            addNewBtn.disabled = true;
            syncToGithubBtn.disabled = true;
            importBtn.disabled = true;
            exportBtn.disabled = true;
            searchBox.disabled = true;
            productList.innerHTML = '<p class="empty-message">請先設定 GitHub Token/Repo 並拉取 (Pull) 資料以開始編輯。</p>';
            categoryTreeContainer.innerHTML = '';
            allProducts = [];
            allCategories = [];
        }
    }

    // --- 響應式側邊欄 & 分類樹 & 產品渲染 (不變) ---
    function toggleSidebar() { document.body.classList.toggle('sidebar-open'); }
    menuToggleBtn.addEventListener('click', toggleSidebar);
    pageOverlay.addEventListener('click', toggleSidebar);
    function buildCategoryTree() { const categoryMap = new Map(allCategories.map(c => [c.id, {...c, children: []}])); const tree = []; for (const category of categoryMap.values()) { if (category.parentId === null) tree.push(category); else if (categoryMap.has(category.parentId)) categoryMap.get(category.parentId).children.push(category); } let html = `<ul><li><a href="#" class="active" data-id="all">所有產品</a></li>`; function createTreeHTML(nodes) { let subHtml = '<ul>'; for (const node of nodes) { subHtml += `<li><a href="#" data-id="${node.id}">${node.name}</a>`; if (node.children.length > 0) subHtml += createTreeHTML(node.children); subHtml += '</li>'; } return subHtml + '</ul>'; } categoryTreeContainer.innerHTML = html + createTreeHTML(tree) + '</ul>'; let selectOptions = '<option value="" disabled>請選擇分類</option>'; function createSelectOptions(nodes, depth = 0) { for (const node of nodes) { selectOptions += `<option value="${node.id}">${'—'.repeat(depth)} ${node.name}</option>`; if (node.children.length > 0) createSelectOptions(node.children, depth + 1); } } createSelectOptions(tree); categorySelect.innerHTML = selectOptions; }
    categoryTreeContainer.addEventListener('click', e => { e.preventDefault(); const targetLink = e.target.closest('a'); if (targetLink) { document.querySelectorAll('#category-tree a').forEach(a => a.classList.remove('active')); targetLink.classList.add('active'); currentCategoryId = targetLink.dataset.id === 'all' ? 'all' : parseInt(targetLink.dataset.id); renderProducts(); if (window.innerWidth <= 992) toggleSidebar(); } });
    function getCategoryIdsWithChildren(startId) { if (startId === 'all') return null; const ids = new Set([startId]); const queue = [startId]; while (queue.length > 0) { const children = allCategories.filter(c => c.parentId === queue.shift()); for (const child of children) { ids.add(child.id); queue.push(child.id); } } return ids; }
    function renderProducts() { const searchTerm = searchBox.value.toLowerCase(); const categoryIdsToDisplay = getCategoryIdsWithChildren(currentCategoryId); const filteredProducts = allProducts.filter(p => { const matchesCategory = categoryIdsToDisplay === null || (p.categoryId && categoryIdsToDisplay.has(p.categoryId)); const matchesSearch = p.name.toLowerCase().includes(searchTerm); return matchesCategory && matchesSearch; }); productList.innerHTML = ''; if (filteredProducts.length === 0 && addNewBtn.disabled === false) { productList.innerHTML = '<p class="empty-message">此分類下無產品。</p>'; return; } filteredProducts.forEach(product => { const card = document.createElement('div'); card.className = 'product-card'; card.onclick = () => openEditModal(product.id); const firstImage = (product.imageUrls && product.imageUrls.length > 0) ? product.imageUrls[0] : ''; card.innerHTML = ` <div class="image-container"><img src="${firstImage}" class="product-image" alt="${product.name}" loading="lazy" style="width: ${product.imageSize || 100}%;"></div> <div class="product-info"><h3>${product.name}</h3><p class="price">$${product.price}</p></div> `; productList.appendChild(card); }); }

    // --- 自動儲存 (至 IndexedDB) (不變) ---
    async function updateAndSave(storeName, data, showSuccessToast = true) { if (storeName === 'products') { allProducts = data; } else if (storeName === 'categories') { allCategories = data; } await writeData(storeName, data); if (showSuccessToast) showToast('變更已自動儲存至本地', 'success'); if (storeName === 'categories') { buildCategoryTree(); } renderProducts(); }
    
    // --- 分類管理 (不變) ---
    function buildCategoryManagementTree() { const categoryMap = new Map(allCategories.map(c => [c.id, {...c, children: []}])); const tree = []; for (const category of categoryMap.values()) { if (category.parentId === null) tree.push(category); else if (categoryMap.has(category.parentId)) categoryMap.get(category.parentId).children.push(category); } function createTreeHTML(nodes) { let html = '<ul>'; for (const node of nodes) { html += `<li><div class="category-item-content"><span class="category-name">${node.name}</span><div class="category-actions"><button data-id="${node.id}" class="action-btn add-child-btn" title="新增子分類"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14m-7-7h14"/></svg></button><button data-id="${node.id}" class="action-btn edit-cat-btn" title="編輯名稱"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button><button data-id="${node.id}" class="action-btn delete-cat-btn" title="刪除分類"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button></div></div>`; if (node.children.length > 0) { html += createTreeHTML(node.children); } html += '</li>'; } return html + '</ul>'; } categoryManagementTree.innerHTML = createTreeHTML(tree); }
    async function addCategory(parentId = null) { const name = prompt('請輸入新的分類名稱：'); if (name && name.trim()) { const newCategory = { id: Date.now(), name: name.trim(), parentId: parentId }; allCategories.push(newCategory); await updateAndSave('categories', allCategories); buildCategoryManagementTree(); } else if (name !== null) { alert('分類名稱不能為空！'); } }
    async function editCategory(id) { const category = allCategories.find(c => c.id === id); if (!category) return; const newName = prompt('請輸入新的分類名稱：', category.name); if (newName && newName.trim()) { category.name = newName.trim(); await updateAndSave('categories', allCategories); buildCategoryManagementTree(); } else if (newName !== null) { alert('分類名稱不能為空！'); } }
    async function deleteCategory(id) { const hasChildren = allCategories.some(c => c.parentId === id); if (hasChildren) { alert('無法刪除！請先刪除或移動此分類下的所有子分類。'); return; } const isUsed = allProducts.some(p => p.categoryId === id); if (isUsed) { alert('無法刪除！尚有產品使用此分類。'); return; } if (confirm('您確定要刪除這個分類嗎？此操作無法復原。')) { const updatedCategories = allCategories.filter(c => c.id !== id); await updateAndSave('categories', updatedCategories); buildCategoryManagementTree(); } }

    // --- Modal & 表單邏輯 (修改) ---
    function openModal(modal) { modal.classList.remove('hidden'); }
    function closeModal(modal) { modal.classList.add('hidden'); }
    form.addEventListener('submit', async (e) => { e.preventDefault(); const id = productIdInput.value; const finalImageUrls = currentImageItems.map(item => item.url); const newProductData = { id: id ? parseInt(id) : Date.now(), name: document.getElementById('product-name').value, sku: document.getElementById('product-sku').value, ean13: document.getElementById('product-ean13').value, price: parseFloat(document.getElementById('product-price').value), description: document.getElementById('product-description').value, imageUrls: finalImageUrls, imageSize: parseInt(imageSizeSlider.value), categoryId: parseInt(categorySelect.value) }; if(!newProductData.categoryId) { alert("請選擇一個產品分類！"); return; } let updatedProducts; if (id) { updatedProducts = allProducts.map(p => p.id == id ? newProductData : p); } else { updatedProducts = [...allProducts, newProductData]; } await updateAndSave('products', updatedProducts); closeModal(editModal); });
    function openEditModal(id) { resetForm(); const product = allProducts.find(p => p.id == id); if (product) { formTitle.textContent = '編輯產品'; productIdInput.value = product.id; document.getElementById('product-name').value = product.name; document.getElementById('product-sku').value = product.sku; ean13Input.value = product.ean13; document.getElementById('product-price').value = product.price; document.getElementById('product-description').value = product.description; categorySelect.value = product.categoryId; currentImageItems = product.imageUrls ? product.imageUrls.map(url => ({ url: url, isNew: false })) : []; renderAdminImagePreview(); imageSizeSlider.value = product.imageSize || 100; imageSizeValue.textContent = imageSizeSlider.value; const initialScale = (product.imageSize || 100) / 100; mainImagePreview.style.transform = `scale(${initialScale})`; deleteBtn.classList.remove('hidden'); deleteBtn.onclick = () => deleteProduct(product.id); updateBarcodePreview(); openModal(editModal); initSortable(); } }
    async function deleteProduct(id) { if (confirm('您確定要刪除這個產品嗎？此操作無法復原。')) { const updatedProducts = allProducts.filter(p => p.id != id); await updateAndSave('products', updatedProducts, false); showToast('產品已從本地刪除', 'info'); closeModal(editModal); } }
    function resetForm() { form.reset(); productIdInput.value = ''; currentImageItems.forEach(item => { if (item.url.startsWith('blob:')) URL.revokeObjectURL(item.url) }); currentImageItems = []; renderAdminImagePreview(); imageSizeSlider.value = 100; imageSizeValue.textContent = 100; mainImagePreview.style.transform = 'scale(1)'; deleteBtn.classList.add('hidden'); categorySelect.selectedIndex = 0; updateBarcodePreview(); }
    function initSortable() { if (sortableInstance) { sortableInstance.destroy(); } try { sortableInstance = new Sortable(thumbnailListAdmin, { animation: 150, ghostClass: 'sortable-ghost', onEnd: (evt) => { const movedItem = currentImageItems.splice(evt.oldIndex, 1)[0]; currentImageItems.splice(evt.newIndex, 0, movedItem); renderAdminImagePreview(); }, }); } catch(e) { console.error("SortableJS 初始化失敗! 請檢查函式庫是否成功載入。", e); showToast('拖曳排序功能載入失敗', 'error'); } }
    function renderAdminImagePreview() { thumbnailListAdmin.innerHTML = ''; if (currentImageItems.length > 0) { mainImagePreview.src = currentImageItems[0].url; mainImagePreview.style.display = 'block'; currentImageItems.forEach((item, index) => { const thumbItem = document.createElement('div'); thumbItem.className = 'thumbnail-item'; if (index === 0) thumbItem.classList.add('active'); thumbItem.innerHTML = ` <img src="${item.url}" data-index="${index}" alt="縮圖 ${index + 1}"> <button type="button" class="delete-thumb-btn" data-index="${index}" title="刪除此圖">&times;</button> `; thumbnailListAdmin.appendChild(thumbItem); }); } else { mainImagePreview.src = ''; mainImagePreview.style.display = 'none'; } }
    thumbnailListAdmin.addEventListener('click', e => { const target = e.target; if (target.classList.contains('delete-thumb-btn')) { const indexToDelete = parseInt(target.dataset.index); const itemToDelete = currentImageItems[indexToDelete]; if (itemToDelete && itemToDelete.url.startsWith('blob:')) { URL.revokeObjectURL(itemToDelete.url); } currentImageItems.splice(indexToDelete, 1); renderAdminImagePreview(); } if (target.tagName === 'IMG') { const indexToShow = parseInt(target.dataset.index); mainImagePreview.src = currentImageItems[indexToShow].url; document.querySelectorAll('#thumbnail-list-admin .thumbnail-item').forEach(item => item.classList.remove('active')); target.parentElement.classList.add('active'); } });
    
    // --- 【優化版】圖片裁切邏輯 ---
    uploadImageBtn.addEventListener('click', () => imageUploadInput.click());
    imageUploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const objectUrl = URL.createObjectURL(file);
        cropperImage.src = objectUrl;
        
        openModal(cropperModal);
        if(cropper) cropper.destroy();
        cropper = new Cropper(cropperImage, {
            aspectRatio: NaN, viewMode: 1, background: false, autoCropArea: 1,
            ready: function () { this.cropper.setCropBoxData({ left: 0, top: 0, width: this.cropper.getImageData().naturalWidth, height: this.cropper.getImageData().naturalHeight }); },
            destroy: () => { URL.revokeObjectURL(objectUrl); }
        });
        e.target.value = '';
    });
    cropConfirmBtn.addEventListener('click', () => {
    const canvas = cropper.getCroppedCanvas({ maxWidth: 1024, maxHeight: 1024, imageSmoothingQuality: 'high' });
    // 改回輸出 JPEG 的 Data URL
    currentImageUrls.push(canvas.toDataURL('image/jpeg', 0.8)); 
    renderAdminImagePreview();
    closeModal(cropperModal);
});
    cropCancelBtn.addEventListener('click', () => closeModal(cropperModal));
    if (cropRotateBtn) { cropRotateBtn.addEventListener('click', () => { if (cropper) { cropper.rotate(90); } }); }
    
    // --- EAN13 預覽 & 圖片大小滑桿 (不變) ---
    function updateBarcodePreview() { const value = ean13Input.value; const previewSvg = document.getElementById('barcode-preview'); if (value.length >= 12 && value.length <= 13) { try { JsBarcode(previewSvg, value, { format: "EAN13", lineColor: "#000", width: 2, height: 50, displayValue: true }); previewSvg.style.display = 'block'; } catch (e) { previewSvg.style.display = 'none'; } } else { previewSvg.style.display = 'none'; } }
    ean13Input.addEventListener('input', updateBarcodePreview);
    imageSizeSlider.addEventListener('input', () => { const newSize = imageSizeSlider.value; imageSizeValue.textContent = newSize; if(mainImagePreview) { const scaleValue = newSize / 100; mainImagePreview.style.transform = `scale(${scaleValue})`; } });

    // --- 【Cloudflare Pages 優化版】GitHub API 相關邏輯 ---
    function saveGithubSettings() { const token = githubTokenInput.value; const repo = githubRepoInput.value; if (token && repo) { localStorage.setItem('githubToken', token); localStorage.setItem('githubRepo', repo); showToast('GitHub 設定已儲存!', 'success'); pullFromGithubBtn.disabled = false; } else { showToast('Token 和儲存庫不能為空', 'error'); } }
    function loadGithubSettings() { const token = localStorage.getItem('githubToken') || ''; const repo = localStorage.getItem('githubRepo') || ''; githubTokenInput.value = token; githubRepoInput.value = repo; if (!token || !repo) { pullFromGithubBtn.disabled = true; } }
    
    async function syncToGithub() {
    const token = localStorage.getItem('githubToken');
    const repo = localStorage.getItem('githubRepo');
    if (!token || !repo) {
        showToast('請先儲存您的 GitHub 設定', 'error');
        return;
    }
    if (!confirm('確定要將目前的本地資料覆蓋到 GitHub 儲存庫嗎？此操作無法復原。')) return;

    syncToGithubBtn.disabled = true;
    syncToGithubBtn.querySelector('svg').style.display = 'none';
    syncToGithubBtn.append(' 推送中...');

    try {
        const imagesPath = 'images';
        // 這是關鍵：我們不再依賴全域變數，而是重新處理 allProducts
        let productsToSync = JSON.parse(JSON.stringify(allProducts)); 
        
        // 輔助函式：將 Canvas 轉為 Blob 的 Promise 版本
        const canvasToBlob = (canvas) => {
            return new Promise(resolve => {
                canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.8);
            });
        };

        console.log('步驟 1: 掃描並上傳新圖片...');
        for (const product of productsToSync) {
            if (!product.imageUrls || product.imageUrls.length === 0) continue;

            for (let i = 0; i < product.imageUrls.length; i++) {
                const url = product.imageUrls[i];
                
                // 只處理新的 Data URL 圖片
                if (url.startsWith('data:image')) {
                    // 【重要邏輯】直接從 Data URL 創建圖片和 Canvas 來獲取 Blob
                    const blob = dataURLtoBlob(url);
                    const fileExtension = blob.type.split('/')[1] || 'png';
                    const fileName = `product-${product.id}-${Date.now()}-${i}.${fileExtension}`;
                    const filePath = `${imagesPath}/${fileName}`;

                    showToast(`正在上傳圖片 ${fileName}...`, 'info');
                    console.log(`上傳新圖片至: ${filePath}`);
                    
                    const response = await updateGithubFile(token, repo, filePath, `Upload image ${fileName}`, blob);
                    
                    // 【重要修正】確保儲存的是 Cloudflare Pages 需要的相對路徑
                    product.imageUrls[i] = `/${filePath}`;
                    showToast(`圖片 ${fileName} 上傳成功!`, 'success');
                }
            }
        }

        console.log('步驟 2: 圖片處理完成，正在推送 JSON 資料...');
        await updateGithubFile(token, repo, 'products.json', '更新產品資料', JSON.stringify(productsToSync, null, 2));
        showToast('products.json 推送成功!', 'info');
        
        await updateGithubFile(token, repo, 'categories.json', '更新分類資料', JSON.stringify(allCategories, null, 2));
        showToast('categories.json 推送成功!', 'info');
        
        // 用包含了新 URL 的資料來更新本地狀態
        allProducts = productsToSync;
        await updateAndSave('products', allProducts, false);

        showToast('所有資料已成功同步至 GitHub!', 'success');

    } catch (error) {
        console.error('GitHub 同步失敗:', error);
        showToast(`推送失敗: ${error.message}`, 'error');
    } finally {
        requestAnimationFrame(() => {
            syncToGithubBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style="display: inline-block;"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z"/></svg> Push (推送本地變更)';
            syncToGithubBtn.disabled = false;
        });
    }
}

    async function updateGithubFile(token, repo, path, message, content) {
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}`;
    const headers = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' };
    let sha;
    try {
        const getFileResponse = await fetch(apiUrl, { headers, cache: 'no-store' });
        if (getFileResponse.ok) {
            sha = (await getFileResponse.json()).sha;
        } else if (getFileResponse.status !== 404) {
            throw new Error(`獲取檔案 SHA 失敗: ${getFileResponse.statusText}`);
        }
    } catch (e) {
        throw new Error(`網路錯誤或無法獲取檔案 SHA: ${e.message}`);
    }

    const getBase64 = (fileOrString) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(fileOrString instanceof Blob ? fileOrString : new Blob([fileOrString]));
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = (error) => reject(error);
    });
    
    const encodedContent = await getBase64(content);
    const body = { message, content };
    if (sha) body.sha = sha;

    const updateResponse = await fetch(apiUrl, { method: 'PUT', headers, body: JSON.stringify(body) });
    if (!updateResponse.ok) {
        throw new Error(`更新 ${path} 失敗: ${(await updateResponse.json()).message}`);
    }
    return await updateResponse.json();
}

    async function pullFromGithub() { const token = localStorage.getItem('githubToken'); const repo = localStorage.getItem('githubRepo'); if (!token || !repo) { showToast('請先儲存您的 GitHub 設定', 'error'); return; } if (!confirm('確定要從 GitHub 拉取最新資料嗎？這將會覆蓋您目前未同步的本地變更。')) return; pullFromGithubBtn.disabled = true; pullFromGithubBtn.querySelector('svg').style.display = 'none'; pullFromGithubBtn.append(' 拉取中...'); try { const categoriesContent = await readGithubFile(token, repo, 'categories.json'); const newCategories = JSON.parse(categoriesContent); showToast('已成功拉取 categories.json', 'info'); const productsContent = await readGithubFile(token, repo, 'products.json'); const newProducts = JSON.parse(productsContent); showToast('已成功拉取 products.json', 'info'); await updateAndSave('categories', newCategories, false); await updateAndSave('products', newProducts, false); setUIState(true); showToast('資料拉取並同步至本地成功！', 'success'); } catch (error) { console.error('從 GitHub 拉取失敗:', error); showToast(`拉取失敗: ${error.message}`); } finally { requestAnimationFrame(() => { pullFromGithubBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg> Pull (拉取線上資料)'; pullFromGithubBtn.disabled = false; }); } }
    
    async function readGithubFile(token, repo, path) {
        const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}`;
        const headers = { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' };
        const response = await fetch(apiUrl, { headers, cache: 'no-store' });
        if (response.status === 404) return '[]';
        if (!response.ok) throw new Error(`讀取 ${path} 失敗: ${response.statusText}`);
        const data = await response.json();
        return data.content ? decodeURIComponent(escape(atob(data.content))) : '[]';
    }

    // --- 本機匯入/匯出邏輯 (不變) ---
    importBtn.addEventListener('click', async () => { if (!confirm('匯入將會覆蓋您目前的所有本地資料，確定要繼續嗎？')) return; try { showToast('請先選擇您的 products.json 檔案', 'info'); const [prodHandle] = await window.showOpenFilePicker({ types: [{ description: '產品 JSON', accept: { 'application/json': ['.json'] } }] }); showToast('接著請選擇您的 categories.json 檔案', 'info'); const [catHandle] = await window.showOpenFilePicker({ types: [{ description: '分類 JSON', accept: { 'application/json': ['.json'] } }] }); const prodFile = await prodHandle.getFile(); const catFile = await catHandle.getFile(); const newProducts = JSON.parse(await prodFile.text()); const newCategories = JSON.parse(await catFile.text()); await updateAndSave('products', newProducts, false); await updateAndSave('categories', newCategories, false); showToast('資料匯入並覆蓋成功！', 'success'); setUIState(true); } catch (err) { if (err.name !== 'AbortError') showToast('讀取檔案失敗', 'error'); } });
    exportBtn.addEventListener('click', async () => { try { const prodBlob = new Blob([JSON.stringify(allProducts, null, 2)], { type: 'application/json' }); const catBlob = new Blob([JSON.stringify(allCategories, null, 2)], { type: 'application/json' }); const download = (blob, filename) => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }; download(prodBlob, 'products.json'); download(catBlob, 'categories.json'); showToast('資料已匯出成 JSON 檔案！', 'success'); } catch (err) { showToast('匯出失敗！', 'error'); } });
    
    // --- UI/UX & 初始化 (不變) ---
    function showToast(message, type = 'info', duration = 3000) { const toastContainer = document.getElementById('toast-container'); const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.textContent = message; toastContainer.appendChild(toast); setTimeout(() => toast.classList.add('show'), 10); setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 500); }, duration); }
    
    async function init() {
        // 綁定通用事件
        themeToggle.addEventListener('click', () => { document.body.classList.toggle('dark-mode'); localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light'); });
        saveGithubSettingsBtn.addEventListener('click', saveGithubSettings);
        syncToGithubBtn.addEventListener('click', syncToGithub);
        pullFromGithubBtn.addEventListener('click', pullFromGithub);
        addNewBtn.addEventListener('click', () => { resetForm(); formTitle.textContent = '新增產品'; openModal(editModal); });
        modalCloseBtn.addEventListener('click', () => closeModal(editModal));
        editModal.addEventListener('click', (e) => { if (e.target === editModal) closeModal(editModal); });
        searchBox.addEventListener('input', renderProducts);
        
        // 綁定分類管理事件
        manageCategoriesBtn.addEventListener('click', () => { buildCategoryManagementTree(); openModal(categoryModal); });
        categoryModalCloseBtn.addEventListener('click', () => closeModal(categoryModal));
        addTopLevelCategoryBtn.addEventListener('click', () => addCategory(null));
        categoryManagementTree.addEventListener('click', (e) => { const target = e.target.closest('.action-btn'); if (!target) return; const id = parseInt(target.dataset.id); if (target.classList.contains('add-child-btn')) addCategory(id); else if (target.classList.contains('edit-cat-btn')) editCategory(id); else if (target.classList.contains('delete-cat-btn')) deleteCategory(id); });

        // 頁面啟動時的初始設定
        const currentTheme = localStorage.getItem('theme');
        if (currentTheme === 'dark') document.body.classList.add('dark-mode');
        
        loadGithubSettings();
        setUIState(false);
    }

    init();
});