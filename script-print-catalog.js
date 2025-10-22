// script-print-catalog.js

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const categoryTreeWrapper = document.getElementById('category-tree-wrapper');
    const generatePreviewBtn = document.getElementById('generate-preview-btn');
    const downloadPdfBtn = document.getElementById('download-pdf-btn');
    const previewContainer = document.getElementById('preview-container');

    let allCategories = [];

    // --- 1. 初始化 ---
    async function init() {
        try {
            const response = await fetch('/api/all-data');
            if (!response.ok) throw new Error('無法載入分類資料');
            const data = await response.json();
            allCategories = data.categories || [];
            buildCategoryTree();
        } catch (error) {
            categoryTreeWrapper.innerHTML = `<p class="empty-message error">${error.message}</p>`;
        }

        generatePreviewBtn.addEventListener('click', handleGeneratePreview);
        downloadPdfBtn.addEventListener('click', handleDownloadPDF);
    }

    // --- 2. 建立帶有複選框的分類樹 ---
    function buildCategoryTree() {
        const categoryMap = new Map(allCategories.map(c => [c.id, { ...c, children: [] }]));
        const tree = [];
        for (const category of categoryMap.values()) {
            if (category.parentId === null) tree.push(category);
            else if (categoryMap.has(category.parentId)) categoryMap.get(category.parentId).children.push(category);
        }

        function createTreeHTML(nodes, depth = 0) {
            nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            let ul = document.createElement('ul');
            if (depth > 0) ul.style.paddingLeft = '20px';

            nodes.forEach(node => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <input type="checkbox" id="cat-${node.id}" data-id="${node.id}">
                    <label for="cat-${node.id}">${node.name}</label>
                `;
                if (node.children.length > 0) {
                    li.appendChild(createTreeHTML(node.children, depth + 1));
                }
                ul.appendChild(li);
            });
            return ul;
        }

        categoryTreeWrapper.innerHTML = '';
        categoryTreeWrapper.appendChild(createTreeHTML(tree));
        categoryTreeWrapper.addEventListener('change', handleCheckboxChange);
    }

    // --- 3. 處理複選框的智慧連動 ---
    function handleCheckboxChange(e) {
        if (e.target.type !== 'checkbox') return;
        const checkbox = e.target;
        const isChecked = checkbox.checked;
        const li = checkbox.closest('li');

        // 勾選/取消所有子項目
        const childCheckboxes = li.querySelectorAll('input[type="checkbox"]');
        childCheckboxes.forEach(child => child.checked = isChecked);

        // 更新父項目的狀態
        let parentLi = li.parentElement.closest('li');
        while (parentLi) {
            const parentCheckbox = parentLi.querySelector('input[type="checkbox"]');
            const siblings = Array.from(parentLi.querySelector('ul').children);
            const checkedSiblings = siblings.filter(s => s.querySelector('input[type="checkbox"]').checked).length;

            if (checkedSiblings === 0) {
                parentCheckbox.checked = false;
                parentCheckbox.indeterminate = false;
            } else if (checkedSiblings === siblings.length) {
                parentCheckbox.checked = true;
                parentCheckbox.indeterminate = false;
            } else {
                parentCheckbox.checked = false;
                parentCheckbox.indeterminate = true;
            }
            parentLi = parentLi.parentElement.closest('li');
        }
    }

    // --- 4. 產生預覽 ---
    async function handleGeneratePreview() {
        generatePreviewBtn.disabled = true;
        generatePreviewBtn.textContent = '正在載入資料...';
        downloadPdfBtn.disabled = true;

        const selectedIds = Array.from(categoryTreeWrapper.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => cb.dataset.id);

        if (selectedIds.length === 0) {
            alert('請至少選擇一個分類！');
            generatePreviewBtn.disabled = false;
            generatePreviewBtn.textContent = '產生預覽';
            return;
        }

        try {
            const response = await fetch(`/api/products?categoryIds=${selectedIds.join(',')}&limit=500`);
            if (!response.ok) throw new Error('獲取產品資料失敗');
            const data = await response.json();

            generatePreviewBtn.textContent = '正在排版預覽...';
            renderPreviewPages(data.products);

            downloadPdfBtn.disabled = false;
        } catch (error) {
            previewContainer.innerHTML = `<div class="preview-placeholder"><p class="error">${error.message}</p></div>`;
        } finally {
            generatePreviewBtn.disabled = false;
            generatePreviewBtn.textContent = '產生預覽';
        }
    }

    // --- 5. 渲染預覽頁面 (核心排版邏輯) ---
    function renderPreviewPages(products) {
        previewContainer.innerHTML = '';
        if (products.length === 0) {
            previewContainer.innerHTML = `<div class="preview-placeholder"><p>所選分類下沒有任何產品。</p></div>`;
            return;
        }

        // A4 紙張在 96 DPI 下約為 1123px，我們預留頁首頁尾空間
        const A4_CONTENT_HEIGHT_LIMIT_PX = 1000;

        let currentPage;
        let currentContentContainer;

        // 建立新頁面的輔助函式，避免重複程式碼
        const startNewPage = () => {
            currentPage = createNewPage();
            currentContentContainer = currentPage.querySelector('.page-content');
            previewContainer.appendChild(currentPage);
        };

        startNewPage(); // 開始第一頁

        products.forEach(product => {
            const productEl = createProductPrintElement(product);
            currentContentContainer.appendChild(productEl);

            // --- 【核心修正】使用 getBoundingClientRect 來進行精確判斷 ---

            // 1. 取得內容容器 (.page-content) 的頂部在視圖中的位置
            const contentTop = currentContentContainer.getBoundingClientRect().top;

            // 2. 取得剛剛加入的最後一個產品元素的底部在視圖中的位置
            const lastElementBottom = productEl.getBoundingClientRect().bottom;

            // 3. 計算最後一個元素的實際渲染位置是否超出了我們設定的單頁高度限制
            const currentContentHeight = lastElementBottom - contentTop;

            if (currentContentHeight > A4_CONTENT_HEIGHT_LIMIT_PX) {
                // 如果超出了限制
                currentContentContainer.removeChild(productEl); // 從當前頁面移除這個放不下的產品
                startNewPage(); // 建立一個全新的頁面
                currentContentContainer.appendChild(productEl); // 將產品放入新頁面
            }
        });

        // 更新所有頁面的頁碼
        const allPages = previewContainer.querySelectorAll('.page');
        allPages.forEach((page, index) => {
            const pageNumberEl = page.querySelector('.page-number');
            if (pageNumberEl) {
                pageNumberEl.textContent = `第 ${index + 1} / ${allPages.length} 頁`;
            }
        });
    }

    function createNewPage() {
        const page = document.createElement('div');
        page.className = 'page';
        page.innerHTML = `
            <div class="page-header">產品目錄</div>
            <div class="page-content"></div>
            <div class="page-footer"><span class="page-number"></span></div>
        `;
        return page;
    }

    function createProductPrintElement(product) {
        const item = document.createElement('div');
        item.className = 'product-item-print';

        let firstImage = (product.imageUrls && product.imageUrls.length > 0) ? product.imageUrls[0].url : 'placeholder.jpg';
        if (firstImage.startsWith('https://')) {
            firstImage += `?v=${new Date().getTime()}`;
        }
        const price = product.price ? `$${product.price}` : '價格未定';

        item.innerHTML = `
            <div class="product-item-print-img">
                <img src="${firstImage}" alt="${product.name}" loading="lazy" crossorigin="anonymous">
            </div>
            <div class="product-item-print-info">
                <h3 class="product-name">${product.name}</h3>
                <p class="product-price">${price}</p>
            </div>
        `;
        return item;
    }


    // --- 6. 下載 PDF ---
    async function handleDownloadPDF() {
        downloadPdfBtn.disabled = true;
        downloadPdfBtn.textContent = 'PDF 產生中...';

        const jsPDF = window.jspdf.jsPDF;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pages = previewContainer.querySelectorAll('.page');

        for (let i = 0; i < pages.length; i++) {
            const pageElement = pages[i];
            try {
                const canvas = await html2canvas(pageElement, {
                    scale: 2, // 提高解析度
                    useCORS: true,
                    logging: false
                });

                const imgData = canvas.toDataURL('image/png');
                const pdfWidth = 210; // A4 寬度 (mm)
                const pdfHeight = 297; // A4 高度 (mm)

                if (i > 0) {
                    pdf.addPage();
                }
                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
                downloadPdfBtn.textContent = `正在處理第 ${i + 1} / ${pages.length} 頁...`;

            } catch (error) {
                console.error(`處理第 ${i + 1} 頁時發生錯誤:`, error);
                alert(`產生第 ${i + 1} 頁的 PDF 時失敗，請檢查控制台錯誤訊息。`);
                downloadPdfBtn.disabled = false;
                downloadPdfBtn.textContent = '下載 PDF';
                return;
            }
        }

        pdf.save('產品目錄.pdf');

        downloadPdfBtn.disabled = false;
        downloadPdfBtn.textContent = '下載 PDF';
    }

    init();
});