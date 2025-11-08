document.addEventListener('DOMContentLoaded', () => {
    // --- 1. SVG 圖示模板 (只在這裡寫一次！) ---
    const sunIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-sun"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
    const moonIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon-moon"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

    // --- 2. 找到所有需要放置按鈕的容器 ---
    //    我們在 HTML 中用一個特殊的 class 來標記這些位置
    const buttonContainers = document.querySelectorAll('.theme-toggle-placeholder');

    if (buttonContainers.length > 0) {
        // --- 3. 創建統一的按鈕 HTML 結構 ---
        const buttonHTML = `
            <button id="theme-toggle" title="切換深色/淺色模式">
                ${sunIconSVG}
                ${moonIconSVG}
            </button>
        `;

        // --- 4. 將按鈕放入所有找到的容器中 ---
        buttonContainers.forEach(container => {
            container.innerHTML = buttonHTML;
        });
    }

    // --- 5. 綁定事件邏輯 (和之前一樣，但現在能確保按鈕存在) ---
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;

    const applyTheme = (theme) => {
        if (theme === 'dark') {
            body.classList.add('dark-mode');
        } else {
            body.classList.remove('dark-mode');
        }
    };

    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isDarkMode = body.classList.contains('dark-mode');
            const newTheme = isDarkMode ? 'light' : 'dark';
            applyTheme(newTheme);
            localStorage.setItem('theme', newTheme);
        });
    }
});