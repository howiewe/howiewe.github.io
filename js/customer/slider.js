// js/customer/slider.js
// 專職管理前台商品詳情彈窗內的圖片輪播互動

window.ProductSlider = (function () {
    let state = {
        wrapper: null,
        dotsContainer: null,
        prevBtn: null,
        nextBtn: null,
        thumbnailsContainer: null,
        currentIndex: 0,
        totalSlides: 0,
        isDragging: false,
        startPosX: 0,
        currentTranslate: 0,
        prevTranslate: 0,
        isSwiping: false,
        onImageClick: null
    };

    function init(elements = {}) {
        state.wrapper = elements.wrapper;
        state.dotsContainer = elements.dotsContainer;
        state.prevBtn = elements.prevBtn;
        state.nextBtn = elements.nextBtn;
        state.thumbnailsContainer = elements.thumbnailsContainer;
        state.onImageClick = elements.onImageClick || null;

        bindEvents();
    }

    function bindEvents() {
        if (state.prevBtn) state.prevBtn.addEventListener('click', prev);
        if (state.nextBtn) state.nextBtn.addEventListener('click', next);

        if (state.wrapper) {
            state.wrapper.addEventListener('mousedown', dragStart);
            state.wrapper.addEventListener('touchstart', dragStart, { passive: true });
            state.wrapper.addEventListener('mouseup', dragEnd);
            state.wrapper.addEventListener('touchend', dragEnd);
            state.wrapper.addEventListener('mouseleave', dragEnd);
            state.wrapper.addEventListener('mousemove', dragMove);
            state.wrapper.addEventListener('touchmove', dragMove, { passive: true });
        }

        if (state.thumbnailsContainer) {
            state.thumbnailsContainer.addEventListener('click', (e) => {
                if (e.target.dataset.index !== undefined) {
                    goTo(parseInt(e.target.dataset.index, 10));
                }
            });
        }

        if (state.dotsContainer) {
            state.dotsContainer.addEventListener('click', (e) => {
                if (e.target.dataset.index !== undefined) {
                    goTo(parseInt(e.target.dataset.index, 10));
                }
            });
        }
    }

    function setup(imageUrls = [], productName = '') {
        if (!state.wrapper) return;

        state.wrapper.innerHTML = '';
        if (state.thumbnailsContainer) state.thumbnailsContainer.innerHTML = '';
        if (state.dotsContainer) state.dotsContainer.innerHTML = '';

        state.totalSlides = imageUrls.length;
        state.currentIndex = 0;

        if (state.totalSlides > 0) {
            imageUrls.forEach((item, index) => {
                const imgUrl = item.url || '';
                const imgSize = item.size || 90;
                state.wrapper.innerHTML += `<div class="slide"><img src="${imgUrl}" alt="${productName} - 圖片 ${index + 1}" style="--img-scale: ${imgSize / 100}; transform: scale(${imgSize / 100});"></div>`;
                if (state.thumbnailsContainer) {
                    state.thumbnailsContainer.innerHTML += `<div class="thumbnail-item ${index === 0 ? 'active' : ''}"><img src="${imgUrl}" data-index="${index}" alt="縮圖 ${index + 1}"></div>`;
                }
                if (state.dotsContainer) {
                    state.dotsContainer.innerHTML += `<div class="dot ${index === 0 ? 'active' : ''}" data-index="${index}"></div>`;
                }
            });

            setTimeout(() => {
                state.wrapper.querySelectorAll('.slide img').forEach((img, idx) => {
                    img.addEventListener('click', (e) => {
                        if (state.isSwiping) return;
                        e.stopPropagation();
                        const currentImg = imageUrls[idx];
                        const currentSize = currentImg ? (currentImg.size || 90) : 90;
                        if (typeof state.onImageClick === 'function') {
                            state.onImageClick(e.target.src, currentSize);
                        }
                    });
                });
            }, 0);
        } else {
            state.wrapper.innerHTML = `<div class="slide"><img src="" alt="無圖片"></div>`;
            state.totalSlides = 1;
        }

        if (state.thumbnailsContainer) {
            if (state.totalSlides <= 1) {
                state.thumbnailsContainer.classList.add('hidden');
            } else {
                state.thumbnailsContainer.classList.remove('hidden');
            }
        }

        state.wrapper.style.transform = 'translateX(0px)';
        updateUI();
    }

    function updateUI() {
        if (state.dotsContainer) {
            state.dotsContainer.querySelectorAll('.dot').forEach((dot, i) => {
                dot.classList.toggle('active', i === state.currentIndex);
            });
            state.dotsContainer.style.display = state.totalSlides > 1 ? 'flex' : 'none';
        }

        if (state.thumbnailsContainer) {
            state.thumbnailsContainer.querySelectorAll('.thumbnail-item').forEach((item, i) => {
                item.classList.toggle('active', i === state.currentIndex);
            });
        }

        if (state.prevBtn) state.prevBtn.style.display = state.totalSlides > 1 ? 'flex' : 'none';
        if (state.nextBtn) state.nextBtn.style.display = state.totalSlides > 1 ? 'flex' : 'none';
    }

    function goTo(index) {
        if (!state.wrapper || state.totalSlides <= 1) return;
        if (index >= state.totalSlides) index = 0;
        if (index < 0) index = state.totalSlides - 1;

        const sliderWidth = state.wrapper.clientWidth;
        state.wrapper.style.transform = `translateX(-${index * sliderWidth}px)`;
        state.currentIndex = index;
        updateUI();
    }

    function next() {
        goTo(state.currentIndex + 1);
    }

    function prev() {
        goTo(state.currentIndex - 1);
    }

    function dragStart(e) {
        if (state.totalSlides <= 1) return;
        state.isDragging = true;
        state.isSwiping = false;
        state.startPosX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        state.wrapper.style.transition = 'none';
        state.prevTranslate = -state.currentIndex * state.wrapper.clientWidth;
    }

    function dragMove(e) {
        if (!state.isDragging) return;
        state.isSwiping = true;
        const currentPosition = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        state.currentTranslate = state.prevTranslate + currentPosition - state.startPosX;
        state.wrapper.style.transform = `translateX(${state.currentTranslate}px)`;
    }

    function dragEnd() {
        if (!state.isDragging || state.totalSlides <= 1) return;
        state.isDragging = false;
        const movedBy = state.currentTranslate - state.prevTranslate;
        state.wrapper.style.transition = 'transform 0.4s ease-in-out';

        if (state.isSwiping) {
            if (movedBy < -50 && state.currentIndex < state.totalSlides - 1) state.currentIndex++;
            if (movedBy > 50 && state.currentIndex > 0) state.currentIndex--;
        }
        goTo(state.currentIndex);
    }

    return {
        init,
        setup,
        goTo,
        next,
        prev
    };
})();
