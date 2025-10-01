// script-admin.js (全新分類管理 + 拖曳排序功能版)
document.addEventListener('DOMContentLoaded', () => {
 // --- IndexedDB (快取機制) ---
 const dbName = 'ProductCatalogDB_CF';
 const dbVersion = 1;
 function openDB() { return new Promise((resolve, reject) => { const request = indexedDB.open(dbName, dbVersion); request.onerror = event => reject(`DB Error: ${event.target.errorCode}`); request.onsuccess = event => resolve(event.target.result); request.onupgradeneeded = event => { const db = event.target.result; if (!db.objectStoreNames.contains('products')) db.createObjectStore('products', { keyPath: 'id' }); if (!db.objectStoreNames.contains('categories')) db.createObjectStore('categories', { keyPath: 'id' }); }; }); }
 function readData(storeName) { return new Promise(async (resolve, reject) => { const db = await openDB(); const tx = db.transaction(storeName, 'readonly'); const store = tx.objectStore(storeName); const req = store.getAll(); req.onerror = event => reject(`Read Error: ${event.target.errorCode}`); req.onsuccess = event => resolve(event.target.result); }); }
 function writeData(storeName, data) { return new Promise(async (resolve, reject) => { const db = await openDB(); const tx = db.transaction(storeName, 'readwrite'); const store = tx.objectStore(storeName); store.clear(); data.forEach(item => store.put(item)); tx.oncomplete = () => resolve(); tx.onerror = event => reject(`Write Error: ${event.target.errorCode}`); }); }

 // --- DOM Elements ---
 const viewToggleBtn = document.getElementById('view-toggle-btn');
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
 const imageUploadInput = document.getElementById('product-image-upload');
 const mainImagePreview = document.getElementById('main-image-preview');
 const thumbnailListAdmin = document.getElementById('thumbnail-list-admin');
 const imageSizeSlider = document.getElementById('image-size');
 const imageSizeValue = document.getElementById('image-size-value');
 const ean13Input = document.getElementById('product-ean13');
 const pageOverlay = document.getElementById('page-overlay');
 const menuToggleBtn = document.getElementById('menu-toggle-btn');
 const syncStatus = document.getElementById('sync-status');
 const imageDropzone = document.getElementById('image-dropzone');
 const imageUploadArea = document.getElementById('image-upload-area');
 const addMoreImagesBtn = document.getElementById('add-more-images-btn');
 const cropperModal = document.getElementById('cropper-modal');
 const cropperImage = document.getElementById('cropper-image');
 const cropperStatus = document.getElementById('cropper-status');
 const cropperConfirmBtn = document.getElementById('cropper-confirm-btn');
 const cropperRotateBtn = document.getElementById('cropper-rotate-btn');
 const cropperModalCloseBtn = document.getElementById('cropper-modal-close-btn');

 // --- 【全新】分類管理介面 DOM 元素 ---
 const manageCategoriesBtn = document.getElementById('manage-categories-btn');
 const categoryModal = document.getElementById('category-modal-container');
 const categoryModalCloseBtn = document.getElementById('category-modal-close-btn');
 const categoryManagerHeader = document.getElementById('category-manager-header');
 const categoryManagerTitle = document.getElementById('category-manager-title');
 const categoryManagerList = document.getElementById('category-manager-list');
 const categoryBackBtn = document.getElementById('category-back-btn');
 const categoryAddBtn = document.getElementById('category-add-btn');

 // --- Global State ---
 let allProducts = [], allCategories = [];
 let cropper, currentCategoryId = 'all', currentImageItems = [], sortableInstance = null, categorySortableInstance = null;
 let imageProcessingQueue = [];
 let originalQueueLength = 0;
 // 【全新】分類管理狀態
 let categoryManagerHistory = []; // 用於下鑽返回的歷史堆疊
 let currentCategoryManagerParentId = null; // 當前顯示的分類的 parentId

 // --- API Logic (部分修改) ---
 async function fetchDataFromCloud(showSyncing = true) { 
 try {
 if (showSyncing) updateSyncStatus('正在從雲端拉取資料...', 'syncing');
 const response = await fetch('/api/all-data?t=' + new Date().getTime());
 if (!response.ok) throw new Error(`Server Error: ${response.statusText}`);
 const data = await response.json();
 allProducts = data.products || [];
 allCategories = data.categories || [];
 await writeData('products', allProducts);
 await writeData('categories', allCategories);
 if (showSyncing) updateSyncStatus('已與雲端同步', 'synced');
 return true;
 } catch (error) {
 console.error('Fetch data failed:', error);
 if (showSyncing) updateSyncStatus('雲端同步失敗', 'error');
 showToast(`拉取雲端資料失敗: ${error.message}`, 'error');
 return false;
 }
 }
 // ... (uploadImage, saveProduct, deleteProductApi 保持不變)
 async function uploadImage(blob, fileName) { /* ... */ try { const response = await fetch(`/api/upload/${fileName}`, { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob }); if (!response.ok) throw new Error(`圖片上傳失敗: ${response.statusText}`); const result = await response.json(); showToast('圖片上傳成功', 'success'); return result.url; } catch (error) { console.error('上傳圖片失敗:', error); showToast(`圖片上傳失敗: ${error.message}`, 'error'); return null; } }
 async function saveProduct(productData) { /* ... */ try { updateSyncStatus('正在儲存產品...', 'syncing'); const response = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(productData) }); if (!response.ok) throw new Error(`伺服器錯誤: ${(await response.json()).details || response.statusText}`); const savedProduct = await response.json(); const index = allProducts.findIndex(p => p.id === savedProduct.id); if (index > -1) { allProducts[index] = savedProduct; } else { allProducts.unshift(savedProduct); } await writeData('products', allProducts); renderProducts(); updateSyncStatus('儲存成功', 'synced'); showToast('產品儲存成功', 'success'); } catch (error) { updateSyncStatus('儲存失敗', 'error'); showToast(`儲存產品失敗: ${error.message}`, 'error'); console.error(error); } }
 async function deleteProductApi(id) { /* ... */ if (!confirm('您確定要刪除這個產品嗎？')) return; try { updateSyncStatus('正在刪除產品...', 'syncing'); const response = await fetch(`/api/products/${id}`, { method: 'DELETE' }); if (!response.ok) throw new Error(`伺服器錯誤: ${(await response.json()).details || response.statusText}`); allProducts = allProducts.filter(p => p.id !== id); await writeData('products', allProducts); renderProducts(); closeModal(editModal); updateSyncStatus('刪除成功', 'synced'); showToast('產品已刪除', 'info'); } catch (error) { updateSyncStatus('刪除失敗', 'error'); showToast(`刪除產品失敗: ${error.message}`, 'error'); } }
 
 // 【修改】saveCategory 現在只負責新增和改名
 async function saveCategory(categoryData) {
 try {
 updateSyncStatus('儲存分類中...', 'syncing');
 const response = await fetch('/api/categories', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(categoryData)
 });
 if (!response.ok) throw new Error(`伺服器錯誤: ${(await response.json()).error || response.statusText}`);
 
 // 操作成功後，重新從雲端拉取最新資料並刷新所有相關 UI
 await fetchDataFromCloud(false);
 buildCategoryTree(); // 更新側邊欄
 renderCategoryManager(currentCategoryManagerParentId, false); // 刷新當前分類管理列表
 updateSyncStatus('儲存成功', 'synced');

 } catch (error) {
 showToast(`儲存分類失敗: ${error.message}`, 'error');
 updateSyncStatus('儲存失敗', 'error');
 }
 }

 // 【新增】呼叫新的 reorder API
 async function reorderCategories(reorderData) {
 try {
 updateSyncStatus('正在儲存順序...', 'syncing');
 const response = await fetch('/api/reorder-categories', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(reorderData)
 });
 if (!response.ok) throw new Error(`伺服器錯誤: ${(await response.json()).error || response.statusText}`);
 await fetchDataFromCloud(false); // 成功後，靜默更新本地資料
 showToast('順序已儲存', 'success');
 updateSyncStatus('儲存成功', 'synced');
 } catch (error) {
 showToast(`儲存順序失敗: ${error.message}`, 'error');
 updateSyncStatus('儲存失敗', 'error');
 // 排序失敗時，最好刷新一下，避免前端顯示與後端不一致
 renderCategoryManager(currentCategoryManagerParentId, false);
 }
 }

 async function removeCategory(id) {
 try {
 const response = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
 if (!response.ok) {
 const errData = await response.json();
 throw new Error(errData.error || '刪除失敗');
 }
 await fetchDataFromCloud(false);
 buildCategoryTree();
 renderCategoryManager(currentCategoryManagerParentId, false);
 } catch (error) {
 alert(error.message);
 }
 }

 // --- UI & Rendering Logic (部分保留，部分重寫) ---
 function updateSyncStatus(message, status) { if (syncStatus) { syncStatus.textContent = message; syncStatus.className = `sync-status ${status}`; } }
 function setUIState(isReady) { if (manageCategoriesBtn) manageCategoriesBtn.disabled = !isReady; if (addNewBtn) addNewBtn.disabled = !isReady; if (searchBox) searchBox.disabled = !isReady; if (isReady) { buildCategoryTree(); currentCategoryId = 'all'; document.querySelectorAll('#category-tree a').forEach(a => a.classList.remove('active')); const allLink = document.querySelector('#category-tree a[data-id="all"]'); if (allLink) allLink.classList.add('active'); renderProducts(); } else { if (productList) productList.innerHTML = '<p class="empty-message">正在從雲端載入資料...</p>'; if (categoryTreeContainer) categoryTreeContainer.innerHTML = ''; } }
 
 // 【修改】buildCategoryTree 現在只負責左側邊欄和下拉選單
 function buildCategoryTree() {
 const categoryMap = new Map(allCategories.map(c => [c.id, { ...c, children: [] }]));
 const tree = [];
 allCategories.forEach(c => {
 if (c.parentId === null) tree.push(categoryMap.get(c.id));
 else if (categoryMap.has(c.parentId)) categoryMap.get(c.parentId).children.push(categoryMap.get(c.id));
 });
 
 const sortNodes = (nodes) => nodes.sort((a, b) => a.sortOrder - b.sortOrder);
 sortNodes(tree);
 tree.forEach(node => sortNodes(node.children));

 let treeHtml = `<ul><li><a href="#" class="active" data-id="all">所有產品</a></li>`;
 function createTreeHTML(nodes) {
 let subHtml = '<ul>';
 sortNodes(nodes).forEach(node => {
 subHtml += `<li><a href="#" data-id="${node.id}">${node.name}</a>`;
 if (node.children.length > 0) subHtml += createTreeHTML(node.children);
 subHtml += '</li>';
 });
 return subHtml + '</ul>';
 }
 if (categoryTreeContainer) categoryTreeContainer.innerHTML = treeHtml + createTreeHTML(tree) + '</ul>';
 
 let selectOptions = '<option value="" disabled selected>請選擇分類</option>';
 function createSelectOptions(nodes, depth = 0) {
 sortNodes(nodes).forEach(node => {
 selectOptions += `<option value="${node.id}">${'—'.repeat(depth)} ${node.name}</option>`;
 if (node.children.length > 0) createSelectOptions(node.children, depth + 1);
 });
 }
 createSelectOptions(tree);
 if (categorySelect) categorySelect.innerHTML = selectOptions;
 }
 
 // ... (renderProducts 保持不變)
 function renderProducts() { /* ... */ if (!productList) return; const searchTerm = searchBox ? searchBox.value.toLowerCase() : ''; const getCategoryIdsWithChildren = (startId) => { if (startId === 'all') return null; const ids = new Set(); const queue = [startId]; while (queue.length > 0) { const currentId = queue.shift(); ids.add(currentId); const children = allCategories.filter(c => c.parentId === currentId); for (const child of children) queue.push(child.id); } return ids; }; const categoryIdsToDisplay = getCategoryIdsWithChildren(currentCategoryId); const filteredProducts = allProducts.filter(p => { const matchesCategory = categoryIdsToDisplay === null || (p.categoryId && categoryIdsToDisplay.has(p.categoryId)); const matchesSearch = p.name.toLowerCase().includes(searchTerm) || (p.sku && p.sku.toLowerCase().includes(searchTerm)); return matchesCategory && matchesSearch; }); productList.innerHTML = ''; if (filteredProducts.length === 0) { productList.innerHTML = '<p class="empty-message">此分類下無產品。</p>'; return; } filteredProducts.forEach(product => { const card = document.createElement('div'); card.className = 'product-card'; card.onclick = () => { const productToEdit = allProducts.find(p => p.id === product.id); if (productToEdit) openProductModal(productToEdit); }; const firstImage = (product.imageUrls && product.imageUrls.length > 0) ? product.imageUrls[0] : ''; card.innerHTML = `<div class="image-container"><img src="${firstImage}" class="product-image" alt="${product.name}" loading="lazy" style="transform: scale(${(product.imageSize || 90) / 100});"></div><div class="product-info"><h3>${product.name}</h3><p class="price">$${product.price}</p></div>`; productList.appendChild(card); }); }

 // --- 【全新】分類管理介面核心邏輯 ---
 function renderCategoryManager(parentId = null, saveHistory = true) {
 if (saveHistory) {
 categoryManagerHistory.push(currentCategoryManagerParentId);
 }
 currentCategoryManagerParentId = parentId;

 // 更新 Header
 if (parentId === null) {
 categoryManagerTitle.textContent = '分類管理';
 categoryBackBtn.classList.add('hidden');
 } else {
 const parent = allCategories.find(c => c.id === parentId);
 categoryManagerTitle.textContent = parent ? parent.name : '子分類';
 categoryBackBtn.classList.remove('hidden');
 }

 // 渲染列表
 const categoriesToShow = allCategories
 .filter(c => c.parentId === parentId)
 .sort((a, b) => a.sortOrder - b.sortOrder);
 
 categoryManagerList.innerHTML = '';
 if (categoriesToShow.length === 0) {
 categoryManagerList.innerHTML = '<p class="empty-message">此層級下沒有分類</p>';
 } else {
 categoriesToShow.forEach(cat => {
 const item = document.createElement('div');
 item.className = 'cm-item';
 item.dataset.id = cat.id;
 item.innerHTML = `
 <span class="cm-drag-handle" title="拖曳排序">
 <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
 </span>
 <span class="cm-name">${cat.name}</span>
 <div class="cm-actions">
 <button data-id="${cat.id}" class="action-btn edit-cat-btn" title="編輯名稱">✎</button>
 <button data-id="${cat.id}" class="action-btn delete-cat-btn" title="刪除分類">×</button>
 </div>
 `;
 categoryManagerList.appendChild(item);
 });
 }
 
 // 初始化 SortableJS
 if (categorySortableInstance) categorySortableInstance.destroy();
 categorySortableInstance = new Sortable(categoryManagerList, {
 handle: '.cm-drag-handle',
 animation: 150,
 ghostClass: 'sortable-ghost',
 chosenClass: 'sortable-chosen',
 onEnd: async (evt) => {
 const items = Array.from(evt.to.children);
 const reorderData = items.map((item, index) => ({
 id: parseInt(item.dataset.id),
 sortOrder: index,
 parentId: currentCategoryManagerParentId
 }));
 // 呼叫新的 API 來儲存順序
 await reorderCategories(reorderData);
 }
 });
 }

 async function addCategory() {
 const name = prompt('請輸入新的分類名稱：');
 if (name && name.trim()) {
 await saveCategory({ name: name.trim(), parentId: currentCategoryManagerParentId });
 } else if (name !== null) {
 alert('分類名稱不能為空！');
 }
 }

 async function editCategory(id) {
 const category = allCategories.find(c => c.id === id);
 if (!category) return;
 const newName = prompt('請輸入新的分類名稱：', category.name);
 if (newName && newName.trim()) {
 await saveCategory({ id: category.id, name: newName.trim(), parentId: category.parentId });
 } else if (newName !== null) {
 alert('分類名稱不能為空！');
 }
 }

 // --- Modal & Form Logic (保持不變) ---
 if (form) form.addEventListener('submit', async (e) => { e.preventDefault(); const submitBtn = form.querySelector('button[type="submit"]'); submitBtn.disabled = true; submitBtn.textContent = '處理中...'; try { const imagesToUpload = currentImageItems.filter(item => item.isNew && item.blob); let uploadedCount = 0; const uploadPromises = imagesToUpload.map(async item => { const ext = item.blob.type.split('/')[1] || 'webp'; const tempId = productIdInput.value || `new_${Date.now()}`; const fileName = `product-${tempId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}.${ext}`; const uploadedUrl = await uploadImage(item.blob, fileName); uploadedCount++; submitBtn.textContent = `上傳圖片 (${uploadedCount}/${imagesToUpload.length})...`; item.url = uploadedUrl; return uploadedUrl; }); await Promise.all(uploadPromises); submitBtn.textContent = '正在儲存資料...'; const finalImageUrls = currentImageItems.map(item => item.url); const productId = productIdInput.value ? parseInt(productIdInput.value) : null; const data = { id: productId, name: document.getElementById('product-name').value, sku: document.getElementById('product-sku').value, ean13: ean13Input.value, price: parseFloat(document.getElementById('product-price').value), description: document.getElementById('product-description').value, imageUrls: finalImageUrls, imageSize: parseInt(imageSizeSlider.value), categoryId: parseInt(categorySelect.value) }; if (!data.categoryId) { alert("請選擇分類！"); return; } await saveProduct(data); closeModal(editModal); } finally { submitBtn.disabled = false; submitBtn.textContent = '儲存變更'; } });
 function openProductModal(product = null) { resetForm(); if (product) { formTitle.textContent = '編輯產品'; productIdInput.value = product.id; document.getElementById('product-name').value = product.name; document.getElementById('product-sku').value = product.sku; ean13Input.value = product.ean13; document.getElementById('product-price').value = product.price; document.getElementById('product-description').value = product.description; categorySelect.value = product.categoryId; currentImageItems = product.imageUrls ? product.imageUrls.map(url => ({ url, isNew: false, blob: null })) : []; const size = product.imageSize || 90; imageSizeSlider.value = size; imageSizeValue.textContent = size; deleteBtn.classList.remove('hidden'); deleteBtn.onclick = () => deleteProductApi(product.id); } else { formTitle.textContent = '新增產品'; } updateImageUIState(); renderAdminImagePreview(); updateBarcodePreview(); openModal(editModal); initSortable(); }
 function resetForm() { if (form) form.reset(); productIdInput.value = ''; currentImageItems.forEach(i => { if (i.url && i.url.startsWith('blob:')) URL.revokeObjectURL(i.url); }); currentImageItems = []; imageSizeSlider.value = 90; imageSizeValue.textContent = 90; mainImagePreview.style.transform = 'scale(1)'; deleteBtn.classList.add('hidden'); categorySelect.selectedIndex = 0; updateBarcodePreview(); hideCropperModal(); }
 function openModal(modal) { if (modal) modal.classList.remove('hidden'); }
 function closeModal(modal) { if (modal) modal.classList.add('hidden'); }
 function initSortable() { if (sortableInstance) sortableInstance.destroy(); if (thumbnailListAdmin) try { sortableInstance = new Sortable(thumbnailListAdmin, { animation: 150, filter: '.add-new', onEnd: (evt) => { if (evt.newIndex === currentImageItems.length) return; const item = currentImageItems.splice(evt.oldIndex, 1)[0]; currentImageItems.splice(evt.newIndex, 0, item); renderAdminImagePreview(); } }); } catch (e) { console.error("SortableJS init failed:", e); } }
 
 // --- 圖片上傳與裁切邏輯 (保持不變) ---
 function updateImageUIState() { /* ... */ const imageEmptyState = document.getElementById('image-empty-state'); if (currentImageItems.length === 0) { imageEmptyState.classList.remove('hidden'); imageUploadArea.classList.add('hidden'); } else { imageEmptyState.classList.add('hidden'); imageUploadArea.classList.remove('hidden'); } }
 function renderAdminImagePreview() { /* ... */ if (!mainImagePreview) return; thumbnailListAdmin.querySelectorAll('.thumbnail-item:not(.add-new)').forEach(el => el.remove()); if (currentImageItems.length > 0) { mainImagePreview.src = currentImageItems[0].url; mainImagePreview.style.display = 'block'; mainImagePreview.style.transform = `scale(${imageSizeSlider.value / 100})`; currentImageItems.forEach((item, index) => { const thumb = document.createElement('div'); thumb.className = 'thumbnail-item'; if (index === 0) thumb.classList.add('active'); thumb.innerHTML = `<img src="${item.url}" data-index="${index}"><button type="button" class="delete-thumb-btn" data-index="${index}">&times;</button>`; thumbnailListAdmin.insertBefore(thumb, addMoreImagesBtn); }); } else { mainImagePreview.src = ''; mainImagePreview.style.display = 'none'; } updateImageUIState(); }
 function createSquareImageBlob(imageFile) { /* ... */ return new Promise((resolve, reject) => { const url = URL.createObjectURL(imageFile); const img = new Image(); img.onload = () => { const size = Math.max(img.naturalWidth, img.naturalHeight); const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size; const ctx = canvas.getContext('2d'); const x = (size - img.naturalWidth) / 2; const y = (size - img.naturalHeight) / 2; ctx.drawImage(img, x, y); URL.revokeObjectURL(url); canvas.toBlob(blob => { if (blob) { resolve(blob); } else { reject(new Error('Canvas to Blob failed.')); } }, 'image/png'); }; img.onerror = (err) => { URL.revokeObjectURL(url); reject(err); }; img.src = url; }); }
 async function handleFileSelection(files) { /* ... */ const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/')); if (imageFiles.length === 0) return; imageProcessingQueue = imageFiles; originalQueueLength = imageFiles.length; processNextImageInQueue(); }
 async function processNextImageInQueue() { /* ... */ if (imageProcessingQueue.length === 0) { hideCropperModal(); return; } const file = imageProcessingQueue.shift(); const processedBlob = await createSquareImageBlob(file); const url = URL.createObjectURL(processedBlob); showCropperModal(url); const currentIndex = originalQueueLength - imageProcessingQueue.length; cropperStatus.textContent = `正在處理: ${currentIndex} / ${originalQueueLength}`; cropperConfirmBtn.textContent = imageProcessingQueue.length > 0 ? '確認並處理下一張' : '完成裁切'; }
 function showCropperModal(imageUrl) { /* ... */ openModal(cropperModal); cropperImage.src = imageUrl; if (cropper) cropper.destroy(); cropper = new Cropper(cropperImage, { aspectRatio: 1, viewMode: 1, autoCropArea: 1, background: false, dragMode: 'move', movable: true }); }
 function hideCropperModal() { /* ... */ closeModal(cropperModal); if (cropper) { const url = cropperImage.src; cropper.destroy(); cropper = null; if (url.startsWith('blob:')) URL.revokeObjectURL(url); cropperImage.src = ''; } imageProcessingQueue = []; originalQueueLength = 0; }
 function updateBarcodePreview() { /* ... */ if (!ean13Input) return; const svg = document.getElementById('barcode-preview'); const value = ean13Input.value; if (value.length >= 12 && value.length <= 13) { try { JsBarcode(svg, value, { format: "EAN13", width: 2, height: 50 }); svg.style.display = 'block'; } catch (e) { svg.style.display = 'none'; } } else { svg.style.display = 'none'; } }
 function showToast(message, type = 'info', duration = 3000) { /* ... */ const el = document.getElementById('toast-container'); if (!el) return; const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.textContent = message; el.appendChild(toast); setTimeout(() => toast.classList.add('show'), 10); setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 500); }, duration); }

 // --- Initialization & Event Listeners ---
 async function init() {
 // --- 舊有事件監聽 ---
 if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => closeModal(editModal));
 if (themeToggle) themeToggle.addEventListener('click', () => { document.body.classList.toggle('dark-mode'); localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light'); });
 if (addNewBtn) addNewBtn.addEventListener('click', () => openProductModal());
 if (searchBox) searchBox.addEventListener('input', renderProducts);
 if (menuToggleBtn) menuToggleBtn.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
 if (pageOverlay) pageOverlay.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
 if (categoryTreeContainer) categoryTreeContainer.addEventListener('click', e => { e.preventDefault(); const target = e.target.closest('a'); if (target) { document.querySelectorAll('#category-tree a').forEach(a => a.classList.remove('active')); target.classList.add('active'); currentCategoryId = target.dataset.id === 'all' ? 'all' : parseInt(target.dataset.id); renderProducts(); if (window.innerWidth <= 768) document.body.classList.remove('sidebar-open'); } });
 // (圖片上傳相關的舊有事件監聽...)
 [imageDropzone, addMoreImagesBtn].forEach(el => el.addEventListener('click', () => imageUploadInput.click()));
 if (imageUploadInput) imageUploadInput.addEventListener('change', (e) => { handleFileSelection(e.target.files); e.target.value = ''; });
 if (imageDropzone) { ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => imageDropzone.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); })); ['dragenter', 'dragover'].forEach(eventName => imageDropzone.addEventListener(eventName, () => imageDropzone.classList.add('dragover'))); ['dragleave', 'drop'].forEach(eventName => imageDropzone.addEventListener(eventName, () => imageDropzone.classList.remove('dragover'))); imageDropzone.addEventListener('drop', e => handleFileSelection(e.dataTransfer.files)); }
 if (cropperConfirmBtn) cropperConfirmBtn.addEventListener('click', () => { if (!cropper) return; cropperConfirmBtn.disabled = true; cropper.getCroppedCanvas({ width: 1024, height: 1024, imageSmoothingQuality: 'high' }).toBlob((blob) => { if (blob) { const previewUrl = URL.createObjectURL(blob); currentImageItems.push({ url: previewUrl, blob, isNew: true }); renderAdminImagePreview(); } else { showToast('裁切失敗', 'error'); } cropperConfirmBtn.disabled = false; processNextImageInQueue(); }, 'image/webp', 0.85); });
 if (cropperRotateBtn) cropperRotateBtn.addEventListener('click', () => { if (cropper) cropper.rotate(90); });
 if (cropperModalCloseBtn) cropperModalCloseBtn.addEventListener('click', hideCropperModal);
 if (cropperModal) cropperModal.addEventListener('click', (e) => { if (e.target === cropperModal) hideCropperModal(); });
 if (ean13Input) ean13Input.addEventListener('input', updateBarcodePreview);
 if (imageSizeSlider) imageSizeSlider.addEventListener('input', () => { const newSize = imageSizeSlider.value; imageSizeValue.textContent = newSize; if (mainImagePreview) mainImagePreview.style.transform = `scale(${newSize / 100})`; });
 if (thumbnailListAdmin) thumbnailListAdmin.addEventListener('click', e => { const target = e.target.closest('button.delete-thumb-btn, img'); if (!target) return; if (target.classList.contains('delete-thumb-btn')) { const index = parseInt(target.dataset.index); const item = currentImageItems[index]; if (item?.url.startsWith('blob:')) URL.revokeObjectURL(item.url); currentImageItems.splice(index, 1); renderAdminImagePreview(); } if (target.tagName === 'IMG') { const index = parseInt(target.dataset.index); mainImagePreview.src = currentImageItems[index].url; document.querySelectorAll('#thumbnail-list-admin .thumbnail-item').forEach(i => i.classList.remove('active')); target.closest('.thumbnail-item').classList.add('active'); } });

 // --- 【全新】分類管理介面事件監聽 ---
 if (manageCategoriesBtn) manageCategoriesBtn.addEventListener('click', () => {
 categoryManagerHistory = []; // 重置歷史
 renderCategoryManager(null); // 從最上層開始
 openModal(categoryModal);
 });
 if (categoryModalCloseBtn) categoryModalCloseBtn.addEventListener('click', () => closeModal(categoryModal));
 if (categoryBackBtn) categoryBackBtn.addEventListener('click', () => {
 const lastParentId = categoryManagerHistory.pop();
 renderCategoryManager(lastParentId, false); // 返回時不儲存歷史
 });
 if (categoryAddBtn) categoryAddBtn.addEventListener('click', addCategory);
 if (categoryManagerList) categoryManagerList.addEventListener('click', (e) => {
 const target = e.target;
 const catItem = target.closest('.cm-item');
 if (!catItem) return;
 const id = parseInt(catItem.dataset.id);
 if (target.classList.contains('cm-name')) {
 // 點擊名稱，進入下一層
 renderCategoryManager(id);
 } else if (target.closest('.edit-cat-btn')) {
 editCategory(id);
 } else if (target.closest('.delete-cat-btn')) {
 if (confirm('您確定要刪除這個分類嗎？相關產品將變為「未分類」。')) {
 removeCategory(id);
 }
 }
 });

 // --- 頁面載入流程 ---
 const currentTheme = localStorage.getItem('theme');
 if (currentTheme === 'dark') document.body.classList.add('dark-mode');
 setUIState(false);
 if (await fetchDataFromCloud()) { setUIState(true); } else { try { const localProducts = await readData('products'); const localCategories = await readData('categories'); if (localProducts && localProducts.length > 0) { allProducts = localProducts; allCategories = localCategories || []; setUIState(true); updateSyncStatus('雲端連接失敗，已載入本地快取', 'error'); } else { updateSyncStatus('雲端連接失敗，且無本地快取', 'error'); } } catch (e) { updateSyncStatus('雲端及本地均載入失敗', 'error'); } }
 if (viewToggleBtn && productList) { const savedView = localStorage.getItem('productView') || 'two-columns'; if (savedView === 'two-columns') { productList.classList.add('view-two-columns'); viewToggleBtn.classList.remove('list-view-active'); } else { productList.classList.remove('view-two-columns'); viewToggleBtn.classList.add('list-view-active'); } viewToggleBtn.addEventListener('click', () => { productList.classList.toggle('view-two-columns'); const isTwoColumns = productList.classList.contains('view-two-columns'); viewToggleBtn.classList.toggle('list-view-active', !isTwoColumns); localStorage.setItem('productView', isTwoColumns ? 'two-columns' : 'one-column'); }); }
 }
 init();
});