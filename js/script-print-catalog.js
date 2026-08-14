// script-print-catalog.js (最終修改版)

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements (保持不變) ---
    const categoryTreeWrapper = document.getElementById('category-tree-wrapper');
    const generatePreviewBtn = document.getElementById('generate-preview-btn');
    const downloadPdfBtn = document.getElementById('download-pdf-btn');
    const previewContainer = document.getElementById('preview-container');

    let allCategories = [];

    // --- 【新增】輔助函式 ---

    function shrinkTextToFit(element) {
        // 獲取容器的可用寬度
        const availableWidth = element.clientWidth;
        // 獲取文字內容的實際渲染寬度
        let textWidth = element.scrollWidth;

        // 如果文字已經在容器內，則無需任何操作
        if (textWidth <= availableWidth) {
            return;
        }

        // 獲取當前的字體大小作為起始值
        let currentFontSize = parseFloat(window.getComputedStyle(element).fontSize);

        // 當文字寬度依然超出容器，且字體大小尚未小於下限時，持續循環
        while (textWidth > availableWidth && currentFontSize > 8) { // 設定 8px 為最小字體，避免無法閱讀
            // 每次縮小 0.5px
            currentFontSize -= 0.5;
            element.style.fontSize = currentFontSize + 'px';

            // 重新測量縮小後的文字寬度
            textWidth = element.scrollWidth;
        }
    }

    /**
     * 從一個產品的 categoryId 向上追溯，找到其所屬的「主要分類」(第二層分類)。
     * @param {number} categoryId - 產品自身的分類 ID。
     * @param {Map<number, object>} categoryMap - 用於快速查找的分類 Map。
     * @returns {object | null} - 回傳主要分類的物件，如果找不到則回傳 null。
     */
    function findMainCategory(categoryId, categoryMap) {
        if (!categoryId) return null;
        let current = categoryMap.get(categoryId);
        if (!current) return null;

        // 如果當前分類的父級就是根 (parentId is null)，那它自己就是主要分類。
        if (current.parentId === null) {
            return current;
        }

        let parent = categoryMap.get(current.parentId);

        // 持續向上追溯，直到父分類是根分類為止。
        while (parent && parent.parentId !== null) {
            current = parent;
            parent = categoryMap.get(current.parentId);
        }

        // 此時的 current 就是我們要找的「主要分類」(第二層分類)。
        return current;
    }

    /**
     * 根據分類 ID 產生完整的階層路徑字串。
     * @param {number} categoryId - 目標分類的 ID。
     * @param {Map<number, object>} categoryMap - 分類 Map。
     * @returns {string} - 格式化的路徑字串，例如 "運動用品 - 籃球"。
     */
    function getCategoryPath(categoryId, categoryMap) {
        const path = [];
        let current = categoryMap.get(categoryId);
        while (current) {
            path.unshift(current.name); // 將名稱加到路徑陣列的最前面
            current = categoryMap.get(current.parentId);
        }
        return path.join(' - ');
    }

    // --- 1. 初始化 (保持不變) ---
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

    // --- 2. 建立帶有複選框的分類樹 (保持不變) ---
    function buildCategoryTree() {
        // ... 此函式程式碼不變 ...
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

    // --- 3. 處理複選框的智慧連動 (保持不變) ---
    function handleCheckboxChange(e) {
        // ... 此函式程式碼不變 ...
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

    // --- 4. 產生預覽 (保持不變) ---
    async function handleGeneratePreview() {
        // ... 此函式程式碼不變 ...
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
            // 後端 API 已被修改為會回傳正確排序的產品列表
            const response = await fetch(`/api/products?categoryIds=${selectedIds.join(',')}`);
            if (!response.ok) throw new Error('獲取產品資料失敗');
            const data = await response.json();

            generatePreviewBtn.textContent = '正在排版預覽...';
            renderPreviewPages(data.products); // 呼叫我們重構後的新函式

            downloadPdfBtn.disabled = false;
        } catch (error) {
            previewContainer.innerHTML = `<div class="preview-placeholder"><p class="error">${error.message}</p></div>`;
        } finally {
            generatePreviewBtn.disabled = false;
            generatePreviewBtn.textContent = '產生預覽';
        }
    }


    // --- 5. 【核心修改】渲染預覽頁面的全新邏輯 ---
    function renderPreviewPages(products) {
        previewContainer.innerHTML = '';
        if (products.length === 0) {
            previewContainer.innerHTML = `<div class="preview-placeholder"><p>所選分類下沒有任何產品。</p></div>`;
            return;
        }

        const categoryMap = new Map(allCategories.map(c => [c.id, c]));
        const groupedProducts = new Map();

        // 步驟 1: 將產品按「主要分類」進行分組 (此部分邏輯不變)
        products.forEach(product => {
            const mainCategory = findMainCategory(product.categoryId, categoryMap);
            const mainCategoryId = mainCategory ? mainCategory.id : 'unclassified';
            if (!groupedProducts.has(mainCategoryId)) {
                groupedProducts.set(mainCategoryId, []);
            }
            groupedProducts.get(mainCategoryId).push(product);
        });

        const A4_CONTENT_HEIGHT_LIMIT_PX = 1040; // A4 內容高度限制
        let currentPage, currentContentContainer;

        const startNewPage = () => {
            currentPage = createNewPage();
            currentContentContainer = currentPage.querySelector('.page-content');
            previewContainer.appendChild(currentPage);
        };

        // ▼▼▼ 【核心修改 ①】: 不在迴圈內強制換頁，而是在迴圈開始前，就先建立好第一頁 ▼▼▼
        startNewPage();

        // 步驟 2: 遍歷分好組的產品，進行排版
        groupedProducts.forEach((productsInGroup, mainCategoryId) => {

            // 步驟 2a: 產生分類標題元素
            let titleEl = null; // 先宣告
            if (mainCategoryId !== 'unclassified') {
                const titlePath = getCategoryPath(mainCategoryId, categoryMap);
                titleEl = document.createElement('h2');
                titleEl.className = 'page-category-title';
                titleEl.textContent = titlePath;

                // ▼▼▼ 【核心修改 ②】: 智慧檢查標題是否需要換頁 ▼▼▼
                // 1. 暫時將標題加入當前頁面，以便測量高度
                currentContentContainer.appendChild(titleEl);

                // 2. 測量加入後的高度
                const contentTop = currentContentContainer.getBoundingClientRect().top;
                const titleBottom = titleEl.getBoundingClientRect().bottom;
                const contentHeightAfterTitle = titleBottom - contentTop;

                // 3. 如果加入標題後就超高，則執行換頁
                if (contentHeightAfterTitle > A4_CONTENT_HEIGHT_LIMIT_PX) {
                    currentContentContainer.removeChild(titleEl); // 從舊頁面移除標題
                    startNewPage();                             // 建立一個新頁面
                    currentContentContainer.appendChild(titleEl); // 將標題加入新頁面
                }
            }
            // ▲▲▲ 修改結束 ▲▲▲

            // 步驟 2c: 遍歷該分類下的所有產品 (此部分邏輯不變)
            productsInGroup.forEach(product => {
                const productEl = createProductPrintElement(product);
                currentContentContainer.appendChild(productEl);

                if (product.ean13) {
                    const svgElement = productEl.querySelector('.product-barcode-svg');
                    if (svgElement) {
                        try {
                            JsBarcode(svgElement, product.ean13, {
                                format: "EAN13", width: 1.5, height: 30,
                                fontSize: 14, displayValue: true, margin: 0
                            });
                        } catch (e) { console.error("條碼產生失敗:", e); }
                    }
                }

                const productNameEl = productEl.querySelector('.product-name');
                if (productNameEl) {
                    shrinkTextToFit(productNameEl);
                }

                // 步驟 2d: 檢查單一產品是否需要換頁 (此部分邏輯不變，保留了原有的溢出保護)
                const contentTop = currentContentContainer.getBoundingClientRect().top;
                const lastElementBottom = productEl.getBoundingClientRect().bottom;
                const currentContentHeight = lastElementBottom - contentTop;

                if (currentContentHeight > A4_CONTENT_HEIGHT_LIMIT_PX) {
                    currentContentContainer.removeChild(productEl);
                    startNewPage();
                    currentContentContainer.appendChild(productEl);
                }
            });
        });

        // 步驟 3: 更新所有頁面的頁碼 (此部分邏輯不變)
        const allPages = previewContainer.querySelectorAll('.page');
        allPages.forEach((page, index) => {
            const pageNumberEl = page.querySelector('.page-number-vertical');
            if (pageNumberEl) {
                pageNumberEl.textContent = `第 ${index + 1} / ${allPages.length} 頁`;
            }
        });
    }


    // --- createNewPage 和 createProductPrintElement 函式保持不變 ---
    function createNewPage() {
        const page = document.createElement('div');
        page.className = 'page';
        page.innerHTML = `          
        <div class="page-content"></div>
        <div class="page-number-vertical"></div> 
    `;
        return page;
    }

    function createProductPrintElement(product) {
        const item = document.createElement('div');
        item.className = 'product-item-print';

        let firstImage = (product.imageUrls && product.imageUrls.length > 0) ? product.imageUrls[0].url : '';
        if (firstImage) { firstImage += `?t=${new Date().getTime()}`; }

        const price = product.price ? `$${product.price}` : '價格未定';

        // 【修改】如果 EAN13 存在，則產生一個帶有唯一 ID 的 SVG 元素容器
        const barcodeSvgHtml = product.ean13
            ? `<svg id="barcode-${product.id}-${Math.random()}" class="product-barcode-svg"></svg>`
            : '';

        const skuHtml = product.sku
            ? `<span class="product-sku">${product.sku}</span>`
            : '';

        item.innerHTML = `
        <div class="product-item-print-img">
            <img src="${firstImage}" alt="${product.name}" loading="lazy" crossorigin="anonymous">
        </div>
        <div class="product-item-print-info">
            ${skuHtml}
            <h3 class="product-name">${product.name}</h3>
            ${barcodeSvgHtml}
        </div>
        <p class="product-price">${price}</p>
    `;
        return item;
    }


    // --- 6. 下載 PDF (保持不變) ---
    async function handleDownloadPDF() {
        // ... 此函式程式碼不變 ...
        downloadPdfBtn.disabled = true;
        downloadPdfBtn.textContent = 'PDF 產生中...';

        if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
            alert('錯誤：jsPDF 函式庫沒有正確載入！請檢查 console 錯誤。');
            downloadPdfBtn.disabled = false;
            downloadPdfBtn.textContent = '下載 PDF';
            return;
        }

        const jsPDF = window.jspdf.jsPDF;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pages = previewContainer.querySelectorAll('.page');

        for (let i = 0; i < pages.length; i++) {
            const pageElement = pages[i];
            try {
                const canvas = await html2canvas(pageElement, {
                    scale: 2,
                    useCORS: true,
                    logging: false
                });

                const imgData = canvas.toDataURL('image/png');
                const pdfWidth = 210;
                const pdfHeight = 297;

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