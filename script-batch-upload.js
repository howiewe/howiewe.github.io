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

    // --- PapaParse Library (loaded from CDN) ---
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

    // --- Rendering Functions ---
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
            dataList.innerHTML = `<p style="color: var(--secondary-color); text-align:center;">请先上传 CSV 档案以载入产品资料</p>`;
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
                    <span class="data-item-status ${prod.status}">${prod.status === 'assigned' ? '✅' : '⚪️'}</span>
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
        const assigned = state.products.filter(p => p.status === 'assigned').length;
        finalSubmitBtn.textContent = `完成建档 (${assigned} / ${total})`;
        finalSubmitBtn.disabled = (assigned !== total) || total === 0;
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
            // Assign selected images to this product
            const selectedImageIds = selectedImages.map(i => i.id);
            prod.assignedImageIds.push(...selectedImageIds);
            selectedImages.forEach(i => i.status = 'assigned');
            prod.status = 'assigned';
        } else if (prod.assignedImageIds.length > 0) {
            // Un-assign images from this product
            prod.assignedImageIds.forEach(imgId => {
                const img = state.images.find(i => i.id === imgId);
                if (img) img.status = 'unassigned';
            });
            prod.assignedImageIds = [];
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

    // --- CSV & Image Upload Logic ---
    imageDropzone.addEventListener('click', () => imageUploadInput.click());
    imageUploadInput.addEventListener('change', (e) => handleImageFiles(e.target.files));
    imageDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        imageDropzone.classList.add('dragover');
    });
    imageDropzone.addEventListener('dragleave', () => imageDropzone.classList.remove('dragover'));
    imageDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        imageDropzone.classList.remove('dragover');
        handleImageFiles(e.dataTransfer.files);
    });

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

    // --- Final Submit Logic ---
    // --- Final Submit Logic (修正版) ---
    finalSubmitBtn.addEventListener('click', async () => {
        finalSubmitBtn.disabled = true;
        finalSubmitBtn.textContent = '处理中 (0%)...';

        try {
            // --- Step 1: Upload all assigned images to R2 ---
            const imagesToUpload = state.images.filter(img => img.status === 'assigned');
            const uploadResults = [];

            for (let i = 0; i < imagesToUpload.length; i++) {
                const img = imagesToUpload[i];
                finalSubmitBtn.textContent = `上传图片 (${i + 1}/${imagesToUpload.length})...`;

                const fileName = `product-${img.id}-${Date.now()}.${img.file.name.split('.').pop() || 'webp'}`;
                try {
                    const response = await fetch(`/api/upload/${fileName}`, { method: 'PUT', body: img.file });
                    if (!response.ok) throw new Error('图片上传失败');
                    const result = await response.json();
                    uploadResults.push({ success: true, imgId: img.id, url: result.url });
                } catch (e) {
                    uploadResults.push({ success: false, imgId: img.id, error: e.message });
                }
            }

            // --- Step 2: Prepare final product data ---
            finalSubmitBtn.textContent = '正在整理产品资料...';

            const finalProducts = state.products
                .filter(p => p.status === 'assigned')
                .map(prod => {
                    // 从上传结果中，找到属于这个产品的所有图片 URL
                    const imageUrls = prod.assignedImageIds
                        .map(id => {
                            const result = uploadResults.find(r => r.imgId === id);
                            // 只加入成功上传的图片
                            return result?.success ? result.url : null;
                        })
                        .filter(Boolean); // 过滤掉上传失败的图片 (null)

                    // 【这就是关键修正】
                    // 我们返回一个包含了 CSV 所有资料(...prod.data) 
                    // 和我们刚刚处理好的图片 URL 列表 (imageUrls) 的新物件。
                    return {
                        ...prod.data,
                        imageUrls
                    };
                });

            // --- Step 3: Send final data to the backend ---
            finalSubmitBtn.textContent = '正在储存至资料库...';

            const response = await fetch('/api/batch-create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ products: finalProducts })
            });

            if (!response.ok) {
                const errorResult = await response.json();
                throw new Error(errorResult.details || '储存产品时发生未知错误');
            }

            alert('批次建档成功！即将返回主管理页面。');
            window.location.href = '/admin.html';

        } catch (e) {
            alert(`发生错误: ${e.message}`);
            // 在出错时重置按钮状态，以便使用者可以重试
            finalSubmitBtn.disabled = false;
            updateSubmitButton(); // 使用 updateSubmitButton 来恢复按钮文字
            console.error("Final Submit Error:", e);
        }
    });

    // --- Init ---
    const currentTheme = localStorage.getItem('theme');
    if (currentTheme === 'dark') document.body.classList.add('dark-mode');
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    });
    render();
});