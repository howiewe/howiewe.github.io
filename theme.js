document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;

    // 函數：應用指定的主題
    const applyTheme = (theme) => {
        if (theme === 'dark') {
            body.classList.add('dark-mode');
        } else {
            body.classList.remove('dark-mode');
        }
    };

    // 1. 頁面載入時，讀取並應用儲存的主題
    //    預設為淺色模式 'light'
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);

    // 2. 監聽按鈕點擊
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            // 檢查當前是否為深色模式
            const isDarkMode = body.classList.contains('dark-mode');
            
            // 決定新主題
            const newTheme = isDarkMode ? 'light' : 'dark';

            // 應用新主題
            applyTheme(newTheme);
            
            // 儲存新主題到 localStorage
            localStorage.setItem('theme', newTheme);
        });
    }
});