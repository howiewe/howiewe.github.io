// js/admin/idb-cache.js
// 專職管理 IndexedDB 本地分類快取操作

window.AdminIDBCache = (function () {
    const DB_NAME = 'ProductCatalogDB_CF';
    const DB_VERSION = 2;
    const STORE_NAME = 'categories';

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = event => reject(`DB Error: ${event.target.errorCode}`);
            request.onsuccess = event => resolve(event.target.result);
            request.onupgradeneeded = event => {
                const db = event.target.result;
                if (db.objectStoreNames.contains('products')) {
                    db.deleteObjectStore('products');
                }
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
        });
    }

    function readCategoriesCache() {
        return new Promise(async (resolve, reject) => {
            try {
                const db = await openDB();
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const req = store.getAll();
                req.onerror = event => reject(`Read Error: ${event.target.errorCode}`);
                req.onsuccess = event => resolve(event.target.result || []);
            } catch (err) {
                reject(err);
            }
        });
    }

    function writeCategoriesCache(data = []) {
        return new Promise(async (resolve, reject) => {
            try {
                const db = await openDB();
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                store.clear();
                data.forEach(item => store.put(item));
                tx.oncomplete = () => resolve();
                tx.onerror = event => reject(`Write Error: ${event.target.errorCode}`);
            } catch (err) {
                reject(err);
            }
        });
    }

    return {
        openDB,
        readCategoriesCache,
        writeCategoriesCache
    };
})();
