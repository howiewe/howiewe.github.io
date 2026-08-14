// js/admin/script-admin.js
// 後台商品管理主調度控制器 (商品 CRUD、編輯 Modal、多圖裁切上傳、即時條碼與工具列)

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM 元素宣告 ---
    const productList = document.getElementById('product-list');
    const searchBox = document.getElementById('search-box');
    const categoryTreeContainer = document.getElementById('category-tree');
    const addNewBtn = document.getElementById('add-new-btn');
    const paginationControls = document.getElementById('pagination-controls');
    const sortBtn = document.getElementById('sort-btn');
    const sortBtnText = document.getElementById('sort-btn-text');
    const sortOptionsContainer = document.getElementById('sort-options');
    const orderToggleBtn = document.getElementById('order-toggle-btn');
    const viewToggleBtn = document.getElementById('view-toggle-btn');
    const form = document.getElementById('product-form');
    const formTitle = document.getElementById('form-title');
    const productIdInput = document.getElementById('product-id');
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

    // 分類管理 Modal 相關 DOM
    const categoryModal = document.getElementById('category-modal-container');
    const categoryModalCloseBtn = document.getElementById('category-modal-close-btn');
    const categoryManagerHeader = document.getElementById('category-manager-header');
    const categoryManagerTitle = document.getElementById('category-manager-title');
    const categoryManagerList = document.getElementById('category-manager-list');
    const categoryBackBtn = document.getElementById('category-back-btn');
    const categoryAddBtn = document.getElementById('category-add-btn');
    const categoryManagerView = document.getElementById('category-manager-view');
    const categoryEditView = document.getElementById('category-edit-view');
    const categoryEditForm = document.getElementById('category-edit-form');
    const categoryEditIdInput = document.getElementById('category-edit-id');
    const categoryEditNameInput = document.getElementById('category-edit-name');
    const categoryEditDescriptionInput = document.getElementById('category-edit-description');

    // --- 全域狀態 ---
    let allCategories = [];
    let currentProducts = [];
    let state = {
        currentPage: 1,
        totalPages: 1,
        categoryId: 'all',
        searchTerm: '',
        sortBy: 'updatedAt',
        order: 'desc'
    };
    let searchDebounceTimer;
    let cropper = null;
    let currentImageItems = [];
    let sortableInstance = null;
    let imageProcessingQueue = [];
    let originalQueueLength = 0;

    // --- 初始化分類管理模組 ---
    if (window.CategoryManager) {
        CategoryManager.init({
            modal: categoryModal,
            closeBtn: categoryModalCloseBtn,
            header: categoryManagerHeader,
            title: categoryManagerTitle,
            list: categoryManagerList,
            backBtn: categoryBackBtn,
            addBtn: categoryAddBtn,
            managerView: categoryManagerView,
            editView: categoryEditView,
            editForm: categoryEditForm,
            editIdInput: categoryEditIdInput,
            editNameInput: categoryEditNameInput,
            editDescriptionInput: categoryEditDescriptionInput
        }, {
            getAllCategories: () => allCategories,
            onCategoriesChanged: async () => {
                await fetchCategories(false);
                buildCategoryTree();
                populateCategorySelect();
                await fetchProducts();
            },
            showToast: (msg, type) => {
                if (typeof showToast === 'function') {
                    showToast(msg, type);
                }
            }
        });
    }

    // --- API 資料獲取 ---
    async function fetchProducts() {
        if (!productList) return;
        productList.innerHTML = '<p class="empty-message">正在載入產品...</p>';
        if (paginationControls) paginationControls.innerHTML = '';

        const params = new URLSearchParams({
            page: state.currentPage,
            limit: 20,
            sortBy: state.sortBy,
            order: state.order
        });
        if (state.categoryId !== 'all') params.append('categoryId', state.categoryId);
        if (state.searchTerm) params.append('search', state.searchTerm);

        try {
            const response = await fetch(`/api/products?${params.toString()}`);
            if (!response.ok) throw new Error(`Server Error: ${response.statusText}`);
            const data = await response.json();

            if (data.products.length === 0 && data.pagination.currentPage > 1) {
                state.currentPage--;
                fetchProducts();
                return;
            }

            currentProducts = data.products;
            state.totalPages = data.pagination.totalPages;
            state.currentPage = data.pagination.currentPage;

            renderProducts();
            renderPagination();
        } catch (error) {
            console.error('Fetch products failed:', error);
            if (typeof showToast === 'function') showToast(`拉取產品資料失敗: ${error.message}`, 'error');
            productList.innerHTML = '<p class="empty-message">產品載入失敗</p>';
        }
    }

    async function fetchCategories(showToastOnError = true) {
        try {
            const response = await fetch('/api/all-data?t=' + new Date().getTime());
            if (!response.ok) throw new Error(`Server Error: ${response.statusText}`);
            const data = await response.json();
            allCategories = data.categories || [];

            if (window.AdminIDBCache) {
                await AdminIDBCache.writeCategoriesCache(allCategories);
            }
            return true;
        } catch (error) {
            console.error('Fetch categories failed:', error);
            if (showToastOnError && typeof showToast === 'function') {
                showToast(`拉取分類資料失敗: ${error.message}`, 'error');
            }
            return false;
        }
    }

    async function saveProduct(productData) {
        try {
            const response = await fetch('/api/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(productData)
            });
            if (!response.ok) {
                const errJson = await response.json();
                throw new Error(`伺服器錯誤: ${errJson.details || response.statusText}`);
            }
            await fetchProducts();
            if (typeof showToast === 'function') showToast('產品儲存成功', 'success');
        } catch (error) {
            if (typeof showToast === 'function') showToast(`儲存產品失敗: ${error.message}`, 'error');
            console.error(error);
        }
    }

    async function deleteProductApi(id) {
        if (!confirm('您確定要刪除這個產品嗎？')) return;
        try {
            const response = await fetch(`/api/products/${id}`, { method: 'DELETE' });
            if (!response.ok) {
                const errJson = await response.json();
                throw new Error(`伺服器錯誤: ${errJson.details || response.statusText}`);
            }
            await fetchProducts();
            closeModal(editModal);
            if (typeof showToast === 'function') showToast('產品已刪除', 'info');
        } catch (error) {
            if (typeof showToast === 'function') showToast(`刪除產品失敗: ${error.message}`, 'error');
        }
    }

    // --- UI 渲染函式 ---
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
            card.onclick = () => openProductModal(product);

            const firstImageObject = (product.imageUrls && product.imageUrls.length > 0) ? product.imageUrls[0] : null;
            const imageUrl = firstImageObject ? firstImageObject.url : '';
            const imageSize = firstImageObject ? firstImageObject.size : 90;
            const priceHtml = (product.price !== null && product.price !== undefined)
                ? `<p class="price">$${product.price}</p>`
                : `<p class="price price-empty">&nbsp;</p>`;

            card.innerHTML = `<div class="image-container"><img src="${imageUrl}" class="product-image" alt="${product.name}" loading="lazy" style="transform: scale(${imageSize / 100});"></div><div class="product-info"><h3>${product.name}</h3>${priceHtml}</div>`;
            productList.appendChild(card);
        });
    }

    function renderPagination() {
        if (!paginationControls) return;
        paginationControls.innerHTML = '';
        if (state.totalPages <= 1) return;

        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn btn-secondary';
        prevBtn.innerHTML = '&#10094;';
        prevBtn.title = '上一頁';
        prevBtn.disabled = state.currentPage === 1;
        prevBtn.addEventListener('click', () => {
            if (state.currentPage > 1) {
                state.currentPage--;
                fetchProducts();
            }
        });

        const pageInfo = document.createElement('div');
        pageInfo.className = 'page-info';
        pageInfo.textContent = `${state.currentPage} / ${state.totalPages}`;

        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-secondary';
        nextBtn.innerHTML = '&#10095;';
        nextBtn.title = '下一頁';
        nextBtn.disabled = state.currentPage === state.totalPages;
        nextBtn.addEventListener('click', () => {
            if (state.currentPage < state.totalPages) {
                state.currentPage++;
                fetchProducts();
            }
        });

        paginationControls.append(prevBtn, pageInfo, nextBtn);
    }

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

            currentImageItems = product.imageUrls ? product.imageUrls.map(item => ({
                ...item,
                isNew: false,
                blob: null
            })) : [];

            deleteBtn.classList.remove('hidden');
            deleteBtn.onclick = () => deleteProductApi(product.id);
        } else {
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

    function resetForm() {
        if (form) form.reset();
        productIdInput.value = '';
        currentImageItems.forEach(i => {
            if (i.url && i.url.startsWith('blob:')) URL.revokeObjectURL(i.url);
        });
        currentImageItems = [];
        deleteBtn.classList.add('hidden');
        categorySelect.selectedIndex = 0;
        updateBarcodePreview();
        hideCropperModal();
    }

    function renderAdminImagePreview() {
        if (!mainImagePreview) return;
        thumbnailListAdmin.querySelectorAll('.thumbnail-item:not(.add-new)').forEach(el => el.remove());

        if (currentImageItems.length > 0) {
            let activeIndex = currentImageItems.findIndex(item => item.isActive);
            if (activeIndex === -1) {
                activeIndex = 0;
                currentImageItems.forEach((item, index) => item.isActive = (index === 0));
            }
            const activeItem = currentImageItems[activeIndex];
            mainImagePreview.src = activeItem.url;
            mainImagePreview.style.display = 'block';
            mainImagePreview.style.transform = `scale(${activeItem.size / 100})`;
            imageSizeSlider.value = activeItem.size;
            imageSizeValue.textContent = activeItem.size;

            currentImageItems.forEach((item, index) => {
                const thumb = document.createElement('div');
                thumb.className = 'thumbnail-item';
                if (index === activeIndex) thumb.classList.add('active');
                thumb.innerHTML = `<img src="${item.url}" data-index="${index}"><button type="button" class="delete-thumb-btn" data-index="${index}">&times;</button>`;
                thumbnailListAdmin.insertBefore(thumb, addMoreImagesBtn);
            });
        } else {
            mainImagePreview.src = '';
            mainImagePreview.style.display = 'none';
        }
        updateImageUIState();
    }

    function buildCategoryTree() {
        if (!categoryTreeContainer) return;
        const categoryMap = new Map(allCategories.map(c => [c.id, { ...c, children: [] }]));
        const tree = [];
        for (const category of categoryMap.values()) {
            if (category.parentId === null) tree.push(category);
            else if (categoryMap.has(category.parentId)) categoryMap.get(category.parentId).children.push(category);
        }
        let html = `<ul><li><a href="#" class="active" data-id="all">所有產品</a></li></ul>`;
        function createTreeHTML(nodes, depth = 0) {
            nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            let subHtml = `<ul class="${depth >= 2 ? 'hidden' : ''}">`;
            for (const node of nodes) {
                const hasChildren = node.children && node.children.length > 0;
                subHtml += `<li class="${hasChildren ? 'has-children' : ''}">`;
                subHtml += `<a href="#" data-id="${node.id}">`;
                subHtml += `<span>${node.name}</span>`;
                if (hasChildren) {
                    subHtml += `<span class="category-toggle-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></span>`;
                }
                subHtml += `</a>`;
                if (hasChildren) {
                    subHtml += createTreeHTML(node.children, depth + 1);
                }
                subHtml += '</li>';
            }
            return subHtml + '</ul>';
        }
        categoryTreeContainer.innerHTML = html + createTreeHTML(tree);
    }

    function populateCategorySelect() {
        if (!categorySelect) return;
        const categoryMap = new Map(allCategories.map(c => [c.id, { ...c, children: [] }]));
        const tree = [];
        allCategories.forEach(c => {
            if (c.parentId === null) {
                tree.push(categoryMap.get(c.id));
            } else if (categoryMap.has(c.parentId)) {
                categoryMap.get(c.parentId).children.push(categoryMap.get(c.id));
            }
        });
        tree.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

        let selectOptions = '<option value="" disabled selected>請選擇分類</option>';
        function createSelectOptions(nodes, depth = 0) {
            nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            nodes.forEach(node => {
                selectOptions += `<option value="${node.id}">${'—'.repeat(depth)} ${node.name}</option>`;
                if (node.children.length > 0) {
                    createSelectOptions(node.children, depth + 1);
                }
            });
        }
        createSelectOptions(tree);
        categorySelect.innerHTML = selectOptions;
    }

    function openModal(modal) { if (modal) modal.classList.remove('hidden'); }
    function closeModal(modal) { if (modal) modal.classList.add('hidden'); }

    function initSortable() {
        if (sortableInstance) sortableInstance.destroy();
        if (thumbnailListAdmin && window.Sortable) {
            try {
                sortableInstance = new Sortable(thumbnailListAdmin, {
                    animation: 150,
                    draggable: '.thumbnail-item:not(.add-new)',
                    onEnd: (evt) => {
                        const item = currentImageItems.splice(evt.oldIndex, 1)[0];
                        currentImageItems.splice(evt.newIndex, 0, item);
                        renderAdminImagePreview();
                    }
                });
            } catch (e) {
                console.error("SortableJS init failed:", e);
            }
        }
    }

    function updateImageUIState() {
        const imageEmptyState = document.getElementById('image-empty-state');
        if (currentImageItems.length === 0) {
            imageEmptyState.classList.remove('hidden');
            imageUploadArea.classList.add('hidden');
        } else {
            imageEmptyState.classList.add('hidden');
            imageUploadArea.classList.remove('hidden');
        }
    }

    function createSquareImageBlob(imageFile) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(imageFile);
            const img = new Image();
            img.onload = () => {
                const size = Math.max(img.naturalWidth, img.naturalHeight);
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                const x = (size - img.naturalWidth) / 2;
                const y = (size - img.naturalHeight) / 2;
                ctx.drawImage(img, x, y);
                URL.revokeObjectURL(url);
                canvas.toBlob(blob => {
                    if (blob) resolve(blob);
                    else reject(new Error('Canvas to Blob failed.'));
                }, 'image/png');
            };
            img.onerror = (err) => {
                URL.revokeObjectURL(url);
                reject(err);
            };
            img.src = url;
        });
    }

    async function handleFileSelection(files) {
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;
        imageProcessingQueue = imageFiles;
        originalQueueLength = imageFiles.length;
        processNextImageInQueue();
    }

    async function processNextImageInQueue() {
        if (imageProcessingQueue.length === 0) {
            hideCropperModal();
            return;
        }
        const file = imageProcessingQueue.shift();
        try {
            const processedBlob = await createSquareImageBlob(file);
            const url = URL.createObjectURL(processedBlob);
            showCropperModal(url);
            const currentIndex = originalQueueLength - imageProcessingQueue.length;
            cropperStatus.textContent = `正在處理: ${currentIndex} / ${originalQueueLength}`;
            cropperConfirmBtn.textContent = imageProcessingQueue.length > 0 ? '確認並處理下一張' : '完成裁切';
        } catch (e) {
            if (typeof showToast === 'function') showToast('圖片處理失敗，已跳過', 'error');
            processNextImageInQueue();
        }
    }

    function showCropperModal(imageUrl) {
        openModal(cropperModal);
        cropperImage.src = imageUrl;
        if (cropper) cropper.destroy();
        cropper = new Cropper(cropperImage, {
            aspectRatio: 1,
            viewMode: 1,
            background: false,
            dragMode: 'move',
            cropBoxMovable: false,
            cropBoxResizable: false,
            zoomable: true,
            zoomOnWheel: true,
            zoomOnTouch: true,
            autoCropArea: 1,
            movable: true
        });
    }

    function hideCropperModal() {
        closeModal(cropperModal);
        if (cropper) {
            const url = cropperImage.src;
            cropper.destroy();
            cropper = null;
            if (url.startsWith('blob:')) URL.revokeObjectURL(url);
            cropperImage.src = '';
        }
        imageProcessingQueue = [];
        originalQueueLength = 0;
    }

    function updateBarcodePreview() {
        if (!ean13Input) return;
        const svg = document.getElementById('barcode-preview');
        const value = ean13Input.value;
        if (value.length >= 12 && value.length <= 13 && window.JsBarcode) {
            try {
                JsBarcode(svg, value, { format: "EAN13", width: 2, height: 50 });
                svg.style.display = 'block';
            } catch (e) {
                svg.style.display = 'none';
            }
        } else {
            svg.style.display = 'none';
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
            return result.url;
        } catch (error) {
            console.error('上傳圖片失敗:', error);
            if (typeof showToast === 'function') showToast(`圖片上傳失敗: ${error.message}`, 'error');
            return null;
        }
    }

    // --- 事件監聽綁定 ---
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = '處理中...';
            try {
                const categoryIdValue = parseInt(categorySelect.value, 10);
                if (!categoryIdValue) {
                    alert("請選擇一個產品分類！");
                    submitBtn.disabled = false;
                    submitBtn.textContent = '儲存變更';
                    return;
                }

                const imagesToUpload = currentImageItems.filter(item => item.isNew && item.blob);
                let uploadedCount = 0;

                if (imagesToUpload.length > 0) {
                    const uploadPromises = imagesToUpload.map(async item => {
                        const ext = item.blob.type.split('/')[1] || 'webp';
                        const tempId = productIdInput.value || `new_${Date.now()}`;
                        const fileName = `product-${tempId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}.${ext}`;
                        const uploadedUrl = await uploadImage(item.blob, fileName);
                        uploadedCount++;
                        submitBtn.textContent = `上傳圖片 (${uploadedCount}/${imagesToUpload.length})...`;
                        item.url = uploadedUrl;
                        item.isNew = false;
                        item.blob = null;
                    });
                    await Promise.all(uploadPromises);
                }

                submitBtn.textContent = '正在儲存資料...';

                const finalImageUrls = currentImageItems.map(item => ({
                    url: item.url,
                    size: item.size
                }));

                const productId = productIdInput.value ? parseInt(productIdInput.value, 10) : null;
                const data = {
                    id: productId,
                    name: document.getElementById('product-name').value,
                    sku: document.getElementById('product-sku').value,
                    ean13: ean13Input.value,
                    price: parseFloat(document.getElementById('product-price').value),
                    description: document.getElementById('product-description').value,
                    imageUrls: finalImageUrls,
                    categoryId: categoryIdValue
                };

                await saveProduct(data);
                closeModal(editModal);

            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = '儲存變更';
            }
        });
    }

    if (cropperConfirmBtn) {
        cropperConfirmBtn.addEventListener('click', () => {
            if (!cropper) return;
            cropperConfirmBtn.disabled = true;
            cropper.getCroppedCanvas({ width: 1024, height: 1024, imageSmoothingQuality: 'high' }).toBlob((blob) => {
                if (blob) {
                    const previewUrl = URL.createObjectURL(blob);
                    currentImageItems.push({
                        url: previewUrl,
                        blob,
                        isNew: true,
                        size: 100
                    });
                    renderAdminImagePreview();
                } else {
                    if (typeof showToast === 'function') showToast('裁切失敗', 'error');
                }
                cropperConfirmBtn.disabled = false;
                processNextImageInQueue();
            }, 'image/webp', 0.85);
        });
    }

    if (imageSizeSlider) {
        imageSizeSlider.addEventListener('input', () => {
            const newSize = parseInt(imageSizeSlider.value, 10);
            imageSizeValue.textContent = newSize;
            const activeIndex = currentImageItems.findIndex(item => item.isActive);
            if (activeIndex > -1) {
                currentImageItems[activeIndex].size = newSize;
                if (mainImagePreview) mainImagePreview.style.transform = `scale(${newSize / 100})`;
            }
        });
    }

    if (thumbnailListAdmin) {
        thumbnailListAdmin.addEventListener('click', e => {
            const target = e.target.closest('button.delete-thumb-btn, img');
            if (!target) return;
            if (target.classList.contains('delete-thumb-btn')) {
                e.stopPropagation();
                const indexToDelete = parseInt(target.dataset.index, 10);
                const item = currentImageItems[indexToDelete];
                if (item?.url.startsWith('blob:')) URL.revokeObjectURL(item.url);
                const wasActive = item.isActive;
                currentImageItems.splice(indexToDelete, 1);
                if (wasActive && currentImageItems.length > 0) {
                    currentImageItems.forEach(i => i.isActive = false);
                    currentImageItems[0].isActive = true;
                }
                renderAdminImagePreview();
            } else if (target.tagName === 'IMG') {
                const index = parseInt(target.dataset.index, 10);
                currentImageItems.forEach((item, i) => item.isActive = (i === index));
                renderAdminImagePreview();
            }
        });
    }

    async function init() {
        if (searchBox) {
            searchBox.addEventListener('input', () => {
                clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(() => {
                    state.searchTerm = searchBox.value.trim();
                    state.currentPage = 1;
                    fetchProducts();
                }, 300);
            });
        }

        if (categoryTreeContainer) {
            categoryTreeContainer.addEventListener('click', e => {
                const link = e.target.closest('a');
                if (!link) return;
                const iconClicked = e.target.closest('.category-toggle-icon');
                if (iconClicked) {
                    e.preventDefault();
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
                    state.categoryId = link.dataset.id === 'all' ? 'all' : parseInt(link.dataset.id, 10);
                    state.currentPage = 1;
                    fetchProducts();
                    if (window.innerWidth <= 767) {
                        document.body.classList.remove('sidebar-open');
                    }
                }
            });
        }

        if (sortBtn) {
            sortBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                sortOptionsContainer.classList.toggle('hidden');
            });
        }
        if (sortOptionsContainer) {
            sortOptionsContainer.addEventListener('click', (e) => {
                e.preventDefault();
                const target = e.target.closest('a');
                if (target) {
                    const newSortBy = target.dataset.value;
                    if (state.sortBy === newSortBy) {
                        sortOptionsContainer.classList.add('hidden');
                        return;
                    }
                    state.sortBy = newSortBy;
                    if (newSortBy === 'updatedAt' || newSortBy === 'createdAt') {
                        state.order = 'desc';
                    } else {
                        state.order = 'asc';
                    }
                    orderToggleBtn.dataset.order = state.order;
                    sortBtnText.textContent = target.textContent;
                    state.currentPage = 1;
                    sortOptionsContainer.classList.add('hidden');
                    fetchProducts();
                }
            });
        }
        if (orderToggleBtn) {
            orderToggleBtn.addEventListener('click', () => {
                state.order = (state.order === 'asc') ? 'desc' : 'asc';
                state.currentPage = 1;
                orderToggleBtn.dataset.order = state.order;
                fetchProducts();
            });
        }
        document.addEventListener('click', () => {
            if (sortOptionsContainer && !sortOptionsContainer.classList.contains('hidden')) {
                sortOptionsContainer.classList.add('hidden');
            }
        });

        addNewBtn.disabled = true;
        manageCategoriesBtn.disabled = true;

        if (await fetchCategories()) {
            buildCategoryTree();
            populateCategorySelect();
            await fetchProducts();
        } else {
            try {
                if (window.AdminIDBCache) {
                    const localCategories = await AdminIDBCache.readCategoriesCache();
                    if (localCategories && localCategories.length > 0) {
                        allCategories = localCategories;
                        buildCategoryTree();
                        populateCategorySelect();
                        await fetchProducts();
                        if (typeof showToast === 'function') showToast('雲端分類連接失敗，已載入本地快取', 'error');
                    } else {
                        if (typeof showToast === 'function') showToast('雲端及本地分類均載入失敗', 'error');
                    }
                }
            } catch (e) {
                if (typeof showToast === 'function') showToast('載入分類失敗', 'error');
            }
        }

        addNewBtn.disabled = false;
        manageCategoriesBtn.disabled = false;

        if (viewToggleBtn && productList) {
            const savedView = localStorage.getItem('productView') || 'two-columns';
            if (savedView === 'two-columns') {
                productList.classList.add('view-two-columns');
                viewToggleBtn.classList.remove('list-view-active');
            } else {
                productList.classList.remove('view-two-columns');
                viewToggleBtn.classList.add('list-view-active');
            }
            viewToggleBtn.addEventListener('click', () => {
                productList.classList.toggle('view-two-columns');
                const isTwoColumns = productList.classList.contains('view-two-columns');
                viewToggleBtn.classList.toggle('list-view-active', !isTwoColumns);
                localStorage.setItem('productView', isTwoColumns ? 'two-columns' : 'one-column');
            });
        }

        if (editModal) editModal.addEventListener('click', (e) => { if (e.target === editModal) closeModal(editModal); });
        if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => closeModal(editModal));
        if (addNewBtn) addNewBtn.addEventListener('click', () => openProductModal());
        if (menuToggleBtn) menuToggleBtn.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
        if (pageOverlay) pageOverlay.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));

        [imageDropzone, addMoreImagesBtn].forEach(el => {
            if (el) el.addEventListener('click', () => imageUploadInput.click());
        });

        if (imageUploadInput) {
            imageUploadInput.addEventListener('change', (e) => {
                handleFileSelection(e.target.files);
                e.target.value = '';
            });
        }

        if (imageDropzone) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => imageDropzone.addEventListener(eventName, e => {
                e.preventDefault();
                e.stopPropagation();
            }));
            ['dragenter', 'dragover'].forEach(eventName => imageDropzone.addEventListener(eventName, () => imageDropzone.classList.add('dragover')));
            ['dragleave', 'drop'].forEach(eventName => imageDropzone.addEventListener(eventName, () => imageDropzone.classList.remove('dragover')));
            imageDropzone.addEventListener('drop', e => handleFileSelection(e.dataTransfer.files));
        }

        if (cropperRotateBtn) cropperRotateBtn.addEventListener('click', () => { if (cropper) cropper.rotate(90); });
        if (cropperModalCloseBtn) cropperModalCloseBtn.addEventListener('click', hideCropperModal);
        if (cropperModal) cropperModal.addEventListener('click', (e) => { if (e.target === cropperModal) hideCropperModal(); });
        if (ean13Input) ean13Input.addEventListener('input', updateBarcodePreview);

        if (manageCategoriesBtn && window.CategoryManager) {
            manageCategoriesBtn.addEventListener('click', () => {
                CategoryManager.open();
            });
        }
    }

    init();
});
