// js/ui-utils.js
// 前後台通用的 UI 工具函式，以全域形式掛載，供各頁面 script 使用

function showToast(message, type = 'info', duration = 3000) {
    const el = document.getElementById('toast-container');
    if (!el) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    el.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }, duration);
}
