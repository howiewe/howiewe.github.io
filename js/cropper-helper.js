// js/cropper-helper.js
// Cropper.js 裁切佇列的共用邏輯，admin 與 batch-upload 共用。
// 依賴：全域 Cropper（vendor/js/cropper.min.js）、showToast（js/ui-utils.js）

/**
 * 將圖片 File 補白成正方形並回傳 PNG Blob。
 * @param {File} imageFile
 * @returns {Promise<Blob>}
 */
function createSquareImageBlob(imageFile) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(imageFile);
        const img = new Image();
        img.onload = () => {
            const size = Math.max(img.naturalWidth, img.naturalHeight);
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, (size - img.naturalWidth) / 2, (size - img.naturalHeight) / 2);
            URL.revokeObjectURL(url);
            canvas.toBlob(blob => {
                if (blob) resolve(blob);
                else reject(new Error('Canvas to Blob failed.'));
            }, 'image/png');
        };
        img.onerror = (err) => { URL.revokeObjectURL(url); reject(err); };
        img.src = url;
    });
}

/**
 * 多圖裁切佇列控制器。
 * 封裝「選取多圖 → 正方形補白 → Cropper 彈窗逐一裁切 → 回調」的完整流程。
 *
 * @param {object} options
 * @param {HTMLElement} options.cropperModal     - 裁切 Modal 容器元素
 * @param {HTMLImageElement} options.cropperImage - Modal 內的 <img> 元素
 * @param {HTMLElement} options.cropperStatus    - 顯示「X / Y」進度的文字元素
 * @param {HTMLButtonElement} options.cropperConfirmBtn - 確認按鈕
 * @param {HTMLButtonElement} options.cropperRotateBtn  - 旋轉按鈕
 * @param {Function} options.onConfirm  - 每張確認後的回調 (blob: Blob) => void
 * @param {Function} [options.onQueueDone] - 整個佇列處理完畢後的回調 () => void
 */
function CropperQueue({ cropperModal, cropperImage, cropperStatus, cropperConfirmBtn, cropperRotateBtn, onConfirm, onQueueDone }) {
    let cropper = null;
    let queue = [];
    let originalLength = 0;

    function _showModal(imageUrl) {
        cropperModal.classList.remove('hidden');
        cropperImage.src = imageUrl;
        if (cropper) cropper.destroy();
        cropper = new Cropper(cropperImage, {
            aspectRatio: 1,
            viewMode: 1,
            background: false,
            dragMode: 'move',
            cropBoxMovable: false,
            cropBoxResizable: false,
            zoomable: true,
            zoomOnWheel: true,
            zoomOnTouch: true,
            autoCropArea: 1,
            movable: true
        });
    }

    function _hideModal() {
        cropperModal.classList.add('hidden');
        if (cropper) {
            const url = cropperImage.src;
            cropper.destroy();
            cropper = null;
            if (url.startsWith('blob:')) URL.revokeObjectURL(url);
            cropperImage.src = '';
        }
        queue = [];
        originalLength = 0;
    }

    async function _processNext() {
        if (queue.length === 0) {
            _hideModal();
            if (onQueueDone) onQueueDone();
            return;
        }
        const file = queue.shift();
        try {
            const blob = await createSquareImageBlob(file);
            const url = URL.createObjectURL(blob);
            _showModal(url);
            const current = originalLength - queue.length;
            cropperStatus.textContent = `正在處理: ${current} / ${originalLength}`;
            cropperConfirmBtn.textContent = queue.length > 0 ? '確認並處理下一張' : '完成裁切';
        } catch (e) {
            showToast('圖片處理失敗，已跳過', 'error');
            _processNext();
        }
    }

    // 外部呼叫：啟動佇列
    function start(files) {
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;
        queue = imageFiles;
        originalLength = imageFiles.length;
        _processNext();
    }

    // 確認按鈕點擊
    cropperConfirmBtn.addEventListener('click', () => {
        if (!cropper) return;
        cropper.getCroppedCanvas({ imageSmoothingQuality: 'high' }).toBlob(blob => {
            if (blob) onConfirm(blob);
            _processNext();
        }, 'image/png');
    });

    // 旋轉按鈕點擊
    if (cropperRotateBtn) {
        cropperRotateBtn.addEventListener('click', () => {
            if (cropper) cropper.rotate(90);
        });
    }

    return { start, hide: _hideModal };
}
