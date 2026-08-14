// js/customer/lightbox.js
// 專職管理前台大圖燈箱、雙指縮放、滾輪放大與手勢平移

window.ProductLightbox = (function () {
    let state = {
        modal: null,
        imageEl: null,
        scale: 1,
        isPanning: false,
        pointX: 0,
        pointY: 0,
        startX: 0,
        startY: 0,
        startPointX: 0,
        startPointY: 0,
        didPan: false,
        initialPinchDistance: 0
    };

    function init(elements = {}) {
        state.modal = elements.modal;
        state.imageEl = elements.imageEl;

        bindEvents();
    }

    function bindEvents() {
        if (!state.modal) return;

        state.modal.addEventListener('wheel', handleWheel, { passive: false });
        state.modal.addEventListener('mousedown', interactionStart);
        state.modal.addEventListener('mousemove', interactionMove);
        state.modal.addEventListener('mouseup', interactionEnd);
        state.modal.addEventListener('mouseleave', interactionEnd);
        state.modal.addEventListener('touchstart', interactionStart, { passive: false });
        state.modal.addEventListener('touchmove', interactionMove, { passive: false });
        state.modal.addEventListener('touchend', interactionEnd);
    }

    function applyTransform() {
        if (state.imageEl) {
            window.requestAnimationFrame(() => {
                state.imageEl.style.transform = `translate(${state.pointX}px, ${state.pointY}px) scale(${state.scale})`;
            });
        }
    }

    function reset() {
        state.scale = 1;
        state.isPanning = false;
        state.pointX = 0;
        state.pointY = 0;
        state.startX = 0;
        state.startY = 0;
        state.startPointX = 0;
        state.startPointY = 0;
        state.didPan = false;
        state.initialPinchDistance = 0;
        applyTransform();
    }

    function open(imageUrl) {
        if (!state.modal || !state.imageEl) return;
        state.imageEl.setAttribute('src', imageUrl);
        state.modal.classList.remove('hidden');
        document.body.classList.add('lightbox-open');

        // 加入 #lightbox 到網址，支援上一頁返回關閉
        history.pushState({ lightbox: true }, '', window.location.pathname + window.location.search + '#lightbox');
    }

    function close() {
        if (window.location.hash === '#lightbox') {
            history.back();
        } else {
            closeDOM();
        }
    }

    function closeDOM() {
        if (!state.modal) return;
        state.modal.classList.add('hidden');
        reset();
        document.body.classList.remove('lightbox-open');
    }

    function getDistance(touches) {
        return Math.sqrt(
            Math.pow(touches[0].clientX - touches[1].clientX, 2) +
            Math.pow(touches[0].clientY - touches[1].clientY, 2)
        );
    }

    function interactionStart(e) {
        e.preventDefault();
        state.didPan = false;

        if (e.type === 'mousedown') {
            state.isPanning = true;
            state.startX = e.clientX;
            state.startY = e.clientY;
        } else if (e.type === 'touchstart') {
            if (e.touches.length === 1) {
                state.isPanning = true;
                state.startX = e.touches[0].clientX;
                state.startY = e.touches[0].clientY;
            } else if (e.touches.length >= 2) {
                state.isPanning = false;
                state.initialPinchDistance = getDistance(e.touches);
            }
        }

        state.startPointX = state.pointX;
        state.startPointY = state.pointY;
        if (state.modal) state.modal.classList.add('panning');
    }

    function interactionMove(e) {
        e.preventDefault();
        if (state.isPanning) {
            const currentX = e.type === 'mousemove' ? e.clientX : e.touches[0].clientX;
            const currentY = e.type === 'mousemove' ? e.clientY : e.touches[0].clientY;
            const deltaX = currentX - state.startX;
            const deltaY = currentY - state.startY;

            if (!state.didPan && Math.sqrt(deltaX * deltaX + deltaY * deltaY) > 5) {
                state.didPan = true;
            }

            state.pointX = state.startPointX + deltaX;
            state.pointY = state.startPointY + deltaY;
            applyTransform();
        } else if (e.type === 'touchmove' && e.touches.length >= 2) {
            state.didPan = true;
            const newPinchDistance = getDistance(e.touches);
            const scaleMultiplier = newPinchDistance / state.initialPinchDistance;
            const newScale = state.scale * scaleMultiplier;
            state.scale = Math.max(1, Math.min(newScale, 5));
            applyTransform();
            state.initialPinchDistance = newPinchDistance;
        }
    }

    function interactionEnd(e) {
        e.preventDefault();
        if (!state.didPan) {
            close();
        }
        state.isPanning = false;
        state.initialPinchDistance = 0;
        if (state.modal) state.modal.classList.remove('panning');
    }

    function handleWheel(e) {
        e.preventDefault();
        state.didPan = true;
        const delta = -e.deltaY;
        const newScale = state.scale * (delta > 0 ? 1.2 : 1 / 1.2);
        state.scale = Math.max(1, Math.min(newScale, 5));
        applyTransform();
    }

    return {
        init,
        open,
        close,
        closeDOM
    };
})();
