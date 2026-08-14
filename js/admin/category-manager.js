// js/admin/category-manager.js
// 專職管理後台分類管理 Modal、雙視圖切換 (列表 ⇄ 編輯)、Sortable 拖曳排序與分類 CRUD

window.CategoryManager = (function () {
    let elements = {};
    let config = {
        getAllCategories: () => [],
        onCategoriesChanged: async () => {},
        showToast: (msg, type) => {}
    };

    let historyStack = [];
    let currentParentId = null;
    let sortableInstance = null;

    function init(domElements = {}, options = {}) {
        elements = domElements;
        config = { ...config, ...options };

        bindEvents();
    }

    function bindEvents() {
        if (elements.closeBtn) {
            elements.closeBtn.addEventListener('click', close);
        }

        if (elements.modal) {
            elements.modal.addEventListener('click', (e) => {
                if (e.target === elements.modal) close();
            });
        }

        if (elements.backBtn) {
            elements.backBtn.addEventListener('click', handleBack);
        }

        if (elements.addBtn) {
            elements.addBtn.addEventListener('click', () => switchToEditView());
        }

        if (elements.list) {
            elements.list.addEventListener('click', handleListClick);
        }

        if (elements.editForm) {
            elements.editForm.addEventListener('submit', handleFormSubmit);
        }
    }

    function open() {
        historyStack = [];
        currentParentId = null;
        renderList(null, false);
        switchToManagerView();
        if (elements.modal) elements.modal.classList.remove('hidden');
    }

    function close() {
        if (elements.modal) elements.modal.classList.add('hidden');
    }

    function renderList(parentId = null, saveHistory = true) {
        if (saveHistory) {
            historyStack.push(currentParentId);
        }
        currentParentId = parentId;

        const allCategories = config.getAllCategories();

        if (parentId === null) {
            if (elements.title) elements.title.textContent = '分類管理';
            if (elements.backBtn) elements.backBtn.classList.add('hidden');
        } else {
            const parent = allCategories.find(c => c.id === parentId);
            if (elements.title) elements.title.textContent = parent ? parent.name : '子分類';
            if (elements.backBtn) elements.backBtn.classList.remove('hidden');
        }

        const categoriesToShow = allCategories
            .filter(c => c.parentId === parentId)
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

        if (!elements.list) return;

        elements.list.innerHTML = '';
        if (categoriesToShow.length === 0) {
            elements.list.innerHTML = '<p class="empty-message">此層級下沒有分類</p>';
        } else {
            categoriesToShow.forEach(cat => {
                const item = document.createElement('div');
                item.className = 'cm-item';
                item.dataset.id = cat.id;
                item.innerHTML = `
                    <span class="cm-drag-handle" title="拖曳排序">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="5" r="1"></circle>
                            <circle cx="12" cy="12" r="1"></circle>
                            <circle cx="12" cy="19" r="1"></circle>
                        </svg>
                    </span>
                    <span class="cm-name">${cat.name}</span>
                    <div class="cm-actions">
                        <button data-id="${cat.id}" class="action-btn edit-cat-btn" title="編輯名稱">✎</button>
                        <button data-id="${cat.id}" class="action-btn delete-cat-btn" title="刪除分類">×</button>
                    </div>
                `;
                elements.list.appendChild(item);
            });
        }

        initSortable();
    }

    function initSortable() {
        if (sortableInstance) sortableInstance.destroy();
        if (elements.list && window.Sortable) {
            sortableInstance = new Sortable(elements.list, {
                handle: '.cm-drag-handle',
                animation: 150,
                ghostClass: 'sortable-ghost',
                chosenClass: 'sortable-chosen',
                onEnd: async (evt) => {
                    const items = Array.from(evt.to.children);
                    const reorderData = items.map((item, index) => ({
                        id: parseInt(item.dataset.id, 10),
                        sortOrder: index,
                        parentId: currentParentId
                    }));
                    await reorderCategories(reorderData);
                }
            });
        }
    }

    function switchToEditView(category = {}) {
        if (elements.editForm) elements.editForm.reset();

        if (category.id) {
            if (elements.title) elements.title.textContent = '編輯分類';
            if (elements.editIdInput) elements.editIdInput.value = category.id;
            if (elements.editNameInput) elements.editNameInput.value = category.name || '';
            if (elements.editDescriptionInput) elements.editDescriptionInput.value = category.description || '';
        } else {
            if (elements.title) elements.title.textContent = '新增分類';
            if (elements.editIdInput) elements.editIdInput.value = '';
        }

        if (elements.backBtn) elements.backBtn.classList.remove('hidden');
        if (elements.addBtn) elements.addBtn.classList.add('hidden');

        if (elements.managerView) elements.managerView.classList.add('hidden');
        if (elements.editView) elements.editView.classList.remove('hidden');
    }

    function switchToManagerView() {
        const parentId = currentParentId;
        const allCategories = config.getAllCategories();

        if (parentId === null) {
            if (elements.title) elements.title.textContent = '分類管理';
            if (elements.backBtn) elements.backBtn.classList.add('hidden');
        } else {
            const parent = allCategories.find(c => c.id === parentId);
            if (elements.title) elements.title.textContent = parent ? parent.name : '子分類';
            if (elements.backBtn) elements.backBtn.classList.remove('hidden');
        }

        if (elements.addBtn) elements.addBtn.classList.remove('hidden');

        if (elements.editView) elements.editView.classList.add('hidden');
        if (elements.managerView) elements.managerView.classList.remove('hidden');
    }

    function handleBack() {
        if (elements.editView && !elements.editView.classList.contains('hidden')) {
            switchToManagerView();
        } else {
            const lastParentId = historyStack.pop();
            renderList(lastParentId, false);
            switchToManagerView();
        }
    }

    function handleListClick(e) {
        const target = e.target;
        const catItem = target.closest('.cm-item');
        if (!catItem) return;
        const id = parseInt(catItem.dataset.id, 10);
        const allCategories = config.getAllCategories();

        if (target.classList.contains('cm-name')) {
            renderList(id);
        } else if (target.closest('.edit-cat-btn')) {
            const category = allCategories.find(c => c.id === id);
            if (category) {
                switchToEditView(category);
            }
        } else if (target.closest('.delete-cat-btn')) {
            if (confirm('您確定要刪除這個分類嗎？相關產品將變為「未分類」。')) {
                removeCategory(id);
            }
        }
    }

    async function handleFormSubmit(e) {
        e.preventDefault();
        const name = elements.editNameInput ? elements.editNameInput.value.trim() : '';
        if (!name) {
            alert('分類名稱不能為空！');
            return;
        }

        const categoryData = {
            id: elements.editIdInput && elements.editIdInput.value ? parseInt(elements.editIdInput.value, 10) : null,
            name: name,
            description: elements.editDescriptionInput ? elements.editDescriptionInput.value.trim() : '',
            parentId: currentParentId
        };

        await saveCategory(categoryData);
        renderList(currentParentId, false);
        switchToManagerView();
    }

    async function saveCategory(categoryData) {
        try {
            const response = await fetch('/api/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(categoryData)
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || response.statusText);
            }

            await config.onCategoriesChanged();
            config.showToast('分類儲存成功', 'success');
        } catch (error) {
            config.showToast(`儲存分類失敗: ${error.message}`, 'error');
        }
    }

    async function reorderCategories(reorderData) {
        try {
            const response = await fetch('/api/reorder-categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reorderData)
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || response.statusText);
            }

            await config.onCategoriesChanged();
            config.showToast('順序已儲存', 'success');
        } catch (error) {
            config.showToast(`儲存順序失敗: ${error.message}`, 'error');
            renderList(currentParentId, false);
        }
    }

    async function removeCategory(id) {
        try {
            const response = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || '刪除失敗');
            }
            await config.onCategoriesChanged();
            renderList(currentParentId, false);
            config.showToast('分類已刪除', 'info');
        } catch (error) {
            alert(error.message);
        }
    }

    return {
        init,
        open,
        close,
        renderList,
        switchToEditView,
        switchToManagerView
    };
})();
