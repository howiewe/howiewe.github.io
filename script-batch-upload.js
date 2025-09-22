// script-batch-upload.js (D1 修正版)

document.addEventListener('DOMContentLoaded', () => {
    // --- State Management ---
    let state = {
        images: [], // { id, file, previewUrl, status: 'unassigned' | 'selected' | 'assigned', r2Url: null }
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

    // --- PapaParse Library (loaded from CDN, this part is unchanged) ---
    const PAPAPARSE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.2/papaparse.min.js';
    let papaParseLoaded = false;
    function loadPapaParse(callback) {
        if (papaParseLoaded) {
            callback();
            return;
        }
        const script = document.createElement('script');
        script.src = PAPAPARSE_URL;
        script.onload = () => {
            papaParseLoaded = true;
            callback();
        };
        document.head.appendChild(script);
    }

    // --- Rendering Functions (unchanged) ---
    function render() {
        renderImagePool();
        renderDataList();
        updateSubmitButton();
    }
    function renderImagePool() {
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
        if (state.products.length === 0) {
            dataList.innerHTML = `<p class="empty-message">請先上傳 CSV 檔案以載入產品資料</p>`;
            return;
        }
        dataList.innerHTML = '';
        state.products.forEach(prod => {
            const item = document.createElement('div');
            item.className = `data-item ${prod.status}`;
            item.dataset.productId = prod.id;

            const assignedImagesHtml = prod.assignedImageIds
                .map(imgId => state.images.find(i => i.id === imgId)?.previewUrl)
                .filter(Boolean)
                .map(url => `<img src="${url}">`)
                .join('');

            item.innerHTML = `
                <div class="data-item-header">
                    <span class="data-item-status ${prod.status === 'assigned' ? 'assigned' : ''}">${prod.status === 'assigned' ? '✅' : '⚪️'}</span>
                    <span>${prod.data.name} (${prod.data.sku})</span>
                </div>
                <div class="data-item-images">${assignedImagesHtml}</div>
            `;
            item.addEventListener('click', () => handleProductClick(prod.id));
            dataList.appendChild(item);
        });
    }
    function updateSubmitButton() {
        const total = state.products.length;
        const assignedCount = state.products.filter(p => p.status === 'assigned').length;
        
        // 【邏輯修正】可以只上傳部分匹配的產品
        const readyToSubmitCount = state.products.filter(p => p.assignedImageIds.length > 0 || p.status === 'assigned').length;

        finalSubmitBtn.textContent = `完成建檔 (${readyToSubmitCount} / ${total})`;
        // 只要有至少一個產品準備好就可以提交
        finalSubmitBtn.disabled = readyToSubmitCount === 0;
    }

    // --- Event Handlers (unchanged) ---
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
            // 如果產品分配了圖片，就標記為 assigned
            prod.status = 'assigned'; 
        } else if (prod.assignedImageIds.length > 0) {
            prod.assignedImageIds.forEach(imgId => {
                const img = state.images.find(i => i.id === imgId);
                if (img) img.status = 'unassigned';
            });
            prod.assignedImageIds = [];
            // 如果產品的圖片被移除了，就標記回 pending
            prod.status = 'pending';
        }
        render();
    }
    function handleImageFiles(files) {
        Array.from(files).forEach(file => {
            if (!file.type.startsWith('image/')) return;
            const image = {
                id: `img_${Date.now()}_${Math.random()}`,
                file: file,
                previewUrl: URL.createObjectURL(file),
                status: 'unassigned',
                r2Url: null
            };
            state.images.push(image);
        });
        render();
    }

    // --- CSV & Image Upload Logic (unchanged) ---
    imageDropzone.addEventListener('click', () => imageUploadInput.click());
    imageUploadInput.addEventListener('change', (e) => handleImageFiles(e.target.files));
    imageDropzone.addEventListener('dragover', (e) => { e.preventDefault(); imageDropzone.classList.add('dragover'); });
    imageDropzone.addEventListener('dragleave', () => imageDropzone.classList.remove('dragover'));
    imageDropzone.addEventListener('drop', (e) => { e.preventDefault(); imageDropzone.classList.remove('dragover'); handleImageFiles(e.dataTransfer.files); });
    uploadCsvBtn.addEventListener('click', () => csvUploadInput.click());
    csvUploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        loadPapaParse(() => {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                encoding: "UTF-8",
                complete: (results) => {
                    state.products = results.data.map((row, index) => ({
                        id: `prod_${Date.now()}_${index}`,
                        data: row,
                        status: 'pending',
                        assignedImageIds: [],
                    }));
                    render();
                }
            });
        });
        e.target.value = '';
    });

    // --- Final Submit Logic (*** 核心修正處 ***) ---
    finalSubmitBtn.addEventListener('click', async () => {
        finalSubmitBtn.disabled = true;
        
        try {
            // Step 1: 找出所有已分配的圖片並上傳
            const imagesToUpload = state.images.filter(img => img.status === 'assigned');
            finalSubmitBtn.textContent = `上傳圖片 (0/${imagesToUpload.length})...`;

            const uploadPromises = imagesToUpload.map(async (img, index) => {
                const fileName = `batch-${img.id}-${Date.now()}.${img.file.name.split('.').pop() || 'webp'}`;
                try {
                    const response = await fetch(`/api/upload/${fileName}`, { method: 'PUT', body: img.file });
                    if (!response.ok) throw new Error('圖片上傳失敗');
                    const result = await response.json();
                    finalSubmitBtn.textContent = `上傳圖片 (${index + 1}/${imagesToUpload.length})...`;
                    return { success: true, imgId: img.id, url: result.url };
                } catch (e) {
                    return { success: false, imgId: img.id, error: e.message };
                }
            });

            const uploadResults = await Promise.all(uploadPromises);

            // Step 2: 整理最終要提交的產品資料
            finalSubmitBtn.textContent = '正在整理產品資料...';
            
            // 【關鍵修正】
            // 我們只提交那些分配了圖片的產品，或者使用者明確點擊過（即使後來取消圖片）的產品
            const productsToSubmit = state.products
                .filter(p => p.assignedImageIds.length > 0 || p.status === 'assigned')
                .map(prod => {
                    const imageUrls = prod.assignedImageIds
                        .map(id => {
                            const result = uploadResults.find(r => r.imgId === id);
                            return result?.success ? result.url : null;
                        })
                        .filter(Boolean);

                    // 確保所有 CSV 欄位都被包含，特別是 'category' 字串
                    return {
                        ...prod.data, // 這會包含 sku, name, price, category, ean13, description
                        imageUrls    // 加上我們處理好的圖片 URL 陣列
                    };
                });
            
            if (productsToSubmit.length === 0) {
                alert("沒有可提交的產品。請至少為一個產品分配圖片。");
                updateSubmitButton();
                finalSubmitBtn.disabled = false;
                return;
            }

            // Step 3: 將整理好的資料發送到後端
            finalSubmitBtn.textContent = '正在儲存至資料庫...';

            const response = await fetch('/api/batch-create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ products: productsToSubmit }) // 注意，這裡的 key 是 'products'
            });

            if (!response.ok) {
                const errorResult = await response.json();
                throw new Error(errorResult.details || '儲存產品時發生未知錯誤');
            }
            
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

    // --- Init (unchanged) ---
    const currentTheme = localStorage.getItem('theme');
    if (currentTheme === 'dark') document.body.classList.add('dark-mode');
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    });
    render();
});