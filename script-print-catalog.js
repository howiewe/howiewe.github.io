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
        while(parentLi) {
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

        const A4_PAGE_HEIGHT_PX = 1056; // 模擬 A4 高度 (297mm @ 96dpi * 3.53) - 邊距
        const PAGE_PADDING_PX = 40;
        const CONTENT_HEIGHT_LIMIT = A4_PAGE_HEIGHT_PX - (PAGE_PADDING_PX * 2);

        let currentPage = createNewPage();
        previewContainer.appendChild(currentPage);

        products.forEach(product => {
            const productEl = createProductPrintElement(product);
            currentPage.appendChild(productEl);

            // 檢查是否超出一頁的高度
            if (currentPage.scrollHeight > CONTENT_HEIGHT_LIMIT) {
                currentPage.removeChild(productEl); // 從目前頁面移除
                currentPage = createNewPage();      // 建立新頁面
                previewContainer.appendChild(currentPage);
                currentPage.appendChild(productEl);    // 加入到新頁面
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
        
        const firstImage = (product.imageUrls && product.imageUrls.length > 0) ? product.imageUrls[0].url : 'placeholder.jpg';
        const price = product.price ? `$${product.price}` : '價格未定';

        item.innerHTML = `
            <div class="product-item-print-img">
                <img src="${firstImage}" alt="${product.name}" loading="lazy">
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

        const { jsPDF } = window.jspdf;
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
                console.error(`處理第 ${i+1} 頁時發生錯誤:`, error);
                alert(`產生第 ${i+1} 頁的 PDF 時失敗，請檢查控制台錯誤訊息。`);
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