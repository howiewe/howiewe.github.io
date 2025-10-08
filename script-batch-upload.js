// script-batch-upload.js (整合裁切流程版)

document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    let state = {
        // 【修改】images 陣列現在將儲存處理過的 blob，而非原始 file
        images: [], // { id, blob, previewUrl, status: 'unassigned' | 'selected' | 'assigned', r2Url: null }
        products: [], // { id, data: { sku, name, ... }, status: 'pending' | 'assigned', assignedImageIds: [] }
    };

    // --- DOM Elements ---
    const themeToggle = document.getElementById('theme-toggle');
    const imageDropzone = document.getElementById('image-dropzone');
    const imageUploadInput = document.getElementById('image-upload-input');
    const imagePool = document.getElementById('image-pool');
    const uploadCsvBtn = document.getElementById('upload-csv-btn');
    const csvUploadInput = document.getElementById('csv-upload-input');
    const dataList = document.getElementById('data-list');
    const finalSubmitBtn = document.getElementById('final-submit-btn');

    // --- 【新增】裁切流程相關 DOM 元素 ---
    const cropperModal = document.getElementById('cropper-modal');
    const cropperImage = document.getElementById('cropper-image');
    const cropperStatus = document.getElementById('cropper-status');
    const cropperConfirmBtn = document.getElementById('cropper-confirm-btn');
    const cropperRotateBtn = document.getElementById('cropper-rotate-btn');
    const cropperModalCloseBtn = document.getElementById('cropper-modal-close-btn');

    // --- 【新增】全域狀態變數 ---
    let cropper;
    let imageProcessingQueue = [];
    let originalQueueLength = 0;

    

    // --- Rendering Functions ---
    function render() {
        renderImagePool();
        renderDataList();
        updateSubmitButton();
    }
    function renderImagePool() {
        if (state.images.length === 0) {
            imagePool.innerHTML = `<p class="empty-message">處理完成的圖片將顯示於此</p>`;
            return;
        }
        imagePool.innerHTML = '';
        state.images.forEach(img => {
            const thumb = document.createElement('div');
            thumb.className = `img-thumbnail ${img.status}`;
            thumb.dataset.imageId = img.id;
            thumb.innerHTML = `<img src="${img.previewUrl}" alt="product-image">`;
            if (img.status !== 'assigned') {
                thumb.addEventListener('click', () => handleImageClick(img.id));
            }
            imagePool.appendChild(thumb);
        });
    }
    function renderDataList() {
        if (state.products.length === 0) { dataList.innerHTML = `<p class="empty-message">請先上傳 CSV 檔案以載入產品資料</p>`; return; }
        dataList.innerHTML = '';
        state.products.forEach(prod => {
            const item = document.createElement('div');
            item.className = `data-item ${prod.status}`;
            item.dataset.productId = prod.id;
            const assignedImagesHtml = prod.assignedImageIds.map(imgId => state.images.find(i => i.id === imgId)?.previewUrl).filter(Boolean).map(url => `<img src="${url}">`).join('');
            item.innerHTML = `<div class="data-item-header"><span class="data-item-status ${prod.status === 'assigned' ? 'assigned' : ''}">${prod.status === 'assigned' ? '✅' : '⚪️'}</span><span>${prod.data.name} (${prod.data.sku})</span></div><div class="data-item-images">${assignedImagesHtml}</div>`;
            item.addEventListener('click', () => handleProductClick(prod.id));
            dataList.appendChild(item);
        });
    }
    function updateSubmitButton() {
        const total = state.products.length;
        const readyToSubmitCount = state.products.filter(p => p.assignedImageIds.length > 0 || p.status === 'assigned').length;
        finalSubmitBtn.textContent = `完成建檔 (${readyToSubmitCount} / ${total})`;
        finalSubmitBtn.disabled = readyToSubmitCount === 0;
    }

    // --- Event Handlers ---
    function handleImageClick(imageId) {
        const img = state.images.find(i => i.id === imageId);
        if (!img || img.status === 'assigned') return;
        img.status = (img.status === 'selected') ? 'unassigned' : 'selected';
        render();
    }
    function handleProductClick(productId) {
        const prod = state.products.find(p => p.id === productId);
        const selectedImages = state.images.filter(i => i.status === 'selected');
        if (!prod) return;
        if (selectedImages.length > 0) {
            const selectedImageIds = selectedImages.map(i => i.id);
            prod.assignedImageIds.push(...selectedImageIds);
            selectedImages.forEach(i => i.status = 'assigned');
            prod.status = 'assigned';
        } else if (prod.assignedImageIds.length > 0) {
            prod.assignedImageIds.forEach(imgId => { const img = state.images.find(i => i.id === imgId); if (img) img.status = 'unassigned'; });
            prod.assignedImageIds = [];
            prod.status = 'pending';
        }
        render();
    }
    
    // --- 【全新】多圖裁切流程函式 (從 script-admin.js 移植並修改) ---
    function showToast(message, type = 'info', duration = 3000) { const el = document.getElementById('toast-container'); if (!el) return; const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.textContent = message; el.appendChild(toast); setTimeout(() => toast.classList.add('show'), 10); setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 500); }, duration); }

    function createSquareImageBlob(imageFile) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(imageFile);
            const img = new Image();
            img.onload = () => {
                const size = Math.max(img.naturalWidth, img.naturalHeight);
                const canvas = document.createElement('canvas');
                canvas.width = size; canvas.height = size;
                const ctx = canvas.getContext('2d');
                const x = (size - img.naturalWidth) / 2;
                const y = (size - img.naturalHeight) / 2;
                ctx.drawImage(img, x, y);
                URL.revokeObjectURL(url);
                canvas.toBlob(blob => {
                    if (blob) resolve(blob); else reject(new Error('Canvas to Blob failed.'));
                }, 'image/png');
            };
            img.onerror = (err) => { URL.revokeObjectURL(url); reject(err); };
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
            render(); // 佇列處理完畢後，重新渲染一次圖片池
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
        } catch (error) {
            showToast('圖片處理失敗，已跳過此圖', 'error');
            console.error(error);
            processNextImageInQueue(); // 跳過錯誤的圖片，繼續處理下一張
        }
    }

    function showCropperModal(imageUrl) {
        cropperModal.classList.remove('hidden');
        cropperImage.src = imageUrl;
        if (cropper) cropper.destroy();
        cropper = new Cropper(cropperImage, { aspectRatio: 1, viewMode: 1, autoCropArea: 1, background: false, dragMode: 'move', movable: true });
    }

    function hideCropperModal() {
        cropperModal.classList.add('hidden');
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


    // --- CSV & Image Upload Logic (修改觸發點) ---
    imageDropzone.addEventListener('click', () => imageUploadInput.click());
    imageUploadInput.addEventListener('change', (e) => {
        handleFileSelection(e.target.files); // 【修改】觸發新的裁切流程
        e.target.value = '';
    });
    imageDropzone.addEventListener('dragover', (e) => { e.preventDefault(); imageDropzone.classList.add('dragover'); });
    imageDropzone.addEventListener('dragleave', () => imageDropzone.classList.remove('dragover'));
    imageDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        imageDropzone.classList.remove('dragover');
        handleFileSelection(e.dataTransfer.files); // 【修改】觸發新的裁切流程
    });
    uploadCsvBtn.addEventListener('click', () => csvUploadInput.click());
    csvUploadInput.addEventListener('change', (e) => { const file = e.target.files[0]; if (!file) return; Papa.parse(file, { header: true, skipEmptyLines: true, encoding: "UTF-8", complete: (results) => { state.products = results.data.map((row, index) => ({ id: `prod_${Date.now()}_${index}`, data: row, status: 'pending', assignedImageIds: [] })); render(); } }); e.target.value = ''; });

    // --- Final Submit Logic (*** 核心修正處 ***) ---
    finalSubmitBtn.addEventListener('click', async () => {
        finalSubmitBtn.disabled = true;
        try {
            const assignedImages = state.images.filter(img => img.status === 'assigned' && !img.r2Url);
            finalSubmitBtn.textContent = `上傳圖片 (0/${assignedImages.length})...`;

            const uploadPromises = assignedImages.map(async (img, index) => {
                const fileName = `batch-${img.id}-${Date.now()}.webp`;
                try {
                    // 【修改】上傳的來源從 img.file 改為 img.blob
                    const response = await fetch(`/api/upload/${fileName}`, { method: 'PUT', body: img.blob });
                    if (!response.ok) throw new Error('圖片上傳失敗');
                    const result = await response.json();
                    img.r2Url = result.url; // 將上傳後的 URL 存回 state，避免重複上傳
                    finalSubmitBtn.textContent = `上傳圖片 (${index + 1}/${assignedImages.length})...`;
                    return { success: true, imgId: img.id, url: result.url };
                } catch (e) {
                    return { success: false, imgId: img.id, error: e.message };
                }
            });
            await Promise.all(uploadPromises);

            finalSubmitBtn.textContent = '正在整理產品資料...';
            const productsToSubmit = state.products.filter(p => p.assignedImageIds.length > 0 || p.status === 'assigned').map(prod => {
                const imageUrls = prod.assignedImageIds.map(id => state.images.find(i => i.id === id)?.r2Url).filter(Boolean);
                return { ...prod.data, imageUrls };
            });
            
            if (productsToSubmit.length === 0) {
                alert("沒有可提交的產品。請至少為一個產品分配圖片。");
                updateSubmitButton();
                finalSubmitBtn.disabled = false;
                return;
            }

            finalSubmitBtn.textContent = '正在儲存至資料庫...';
            const response = await fetch('/api/batch-create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ products: productsToSubmit }) });
            if (!response.ok) { const errorResult = await response.json(); throw new Error(errorResult.details || '儲存產品時發生未知錯誤'); }
            
            const result = await response.json();
            alert(`批次建檔成功！\n${result.message}`);
            window.location.href = '/admin.html';

        } catch (e) {
            alert(`發生錯誤: ${e.message}`);
            finalSubmitBtn.disabled = false;
            updateSubmitButton();
            console.error("Final Submit Error:", e);
        }
    });

    // --- Init & Event Listeners for Cropper ---
    function init() {
        const currentTheme = localStorage.getItem('theme');
        if (currentTheme === 'dark') document.body.classList.add('dark-mode');
        themeToggle.addEventListener('click', () => { document.body.classList.toggle('dark-mode'); localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light'); });
        
        // 【新增】裁切 Modal 的事件監聽
        if (cropperConfirmBtn) cropperConfirmBtn.addEventListener('click', () => {
            if (!cropper) return;
            cropperConfirmBtn.disabled = true;
            cropper.getCroppedCanvas({ width: 1024, height: 1024, imageSmoothingQuality: 'high' }).toBlob((blob) => {
                if (blob) {
                    const previewUrl = URL.createObjectURL(blob);
                    // 【修改】將處理好的 blob 存入 state
                    state.images.push({
                        id: `img_${Date.now()}_${Math.random()}`,
                        blob: blob,
                        previewUrl: previewUrl,
                        status: 'unassigned',
                        r2Url: null
                    });
                } else {
                    showToast('裁切失敗', 'error');
                }
                cropperConfirmBtn.disabled = false;
                processNextImageInQueue();
            }, 'image/webp', 0.85);
        });

        if (cropperRotateBtn) cropperRotateBtn.addEventListener('click', () => { if (cropper) cropper.rotate(90); });
        if (cropperModalCloseBtn) cropperModalCloseBtn.addEventListener('click', hideCropperModal);
        if (cropperModal) cropperModal.addEventListener('click', (e) => { if (e.target === cropperModal) hideCropperModal(); });

        render();
    }
    
    init();
});