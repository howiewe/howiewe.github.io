(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.OutputSafety = factory();
})(globalThis, function () {
    function escapeHtml(value) {
        const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return String(value ?? '').replace(/[&<>"']/g, character => entities[character]);
    }

    function safeImageUrl(value, allowLocal = false) {
        if (typeof value !== 'string' || !value.trim()) return '';
        const url = value.trim();
        try {
            const parsed = new URL(url, 'https://image.invalid/');
            if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return url;
            if (allowLocal && parsed.protocol === 'blob:') return url;
            if (allowLocal && /^data:image\/(?:png|jpeg|webp|gif|avif);base64,[a-z0-9+/=]+$/i.test(url)) return url;
        } catch { }
        return '';
    }

    function imageSize(value) {
        const size = Number(value);
        return Number.isFinite(size) && size > 0 ? size : 90;
    }

    return Object.freeze({ escapeHtml, safeImageUrl, imageSize });
});
