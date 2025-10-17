// functions/public/[[path]].js

// --- 統一的 API 響應格式 ---
const response = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json;charset=UTF-8' }
});

// --- API 路由處理 ---
export async function onRequest(context) {
    const { request, env } = context;
    if (!env.D1_DB) {
        return response({ error: '後端環境變數未正確設定' }, 500);
    }

    const url = new URL(request.url);
    // 注意：因為檔案在 /public/ 下，所以第一個路徑片段就是 resource
    const pathSegments = url.pathname.split('/').filter(p => p !== 'public');
    const resource = pathSegments[0];
    const id = pathSegments[1];
    const method = request.method;

    // [安全機制] 強制規定此路徑只接受 GET
    if (method !== 'GET') {
        return response({ error: '此路徑為唯讀。' }, 405);
    }

    try {
        const db = env.D1_DB;
        switch (resource) {
            case 'all-data':
                return await getCategoriesOnly(db);
            case 'products':
                if (id) {
                    return await getProductById(db, id);
                } else {
                    return await getPaginatedProducts(db, url.searchParams);
                }
        }
        return response({ error: `無效的公開 API 路徑: ${url.pathname}` }, 404);
    } catch (e) {
        console.error("Public API Error:", e);
        return response({ error: '伺服器內部錯誤', details: e.message }, 500);
    }
}

// --- 以下是這個檔案需要的「唯讀」函式 ---

async function getCategoriesOnly(db) {
    const categoriesQuery = db.prepare("SELECT * FROM categories ORDER BY parentId, sortOrder ASC");
    const { results } = await categoriesQuery.run();
    return response({ categories: results || [] });
}

async function getPaginatedProducts(db, params) {
    const page = parseInt(params.get('page')) || 1;
    const limit = parseInt(params.get('limit')) || 24;
    const categoryId = params.get('categoryId') ? parseInt(params.get('categoryId')) : null;
    const searchTerm = params.get('search') || '';
    const validSortBy = ['price', 'name', 'createdAt', 'updatedAt'];
    const sortBy = validSortBy.includes(params.get('sortBy')) ? params.get('sortBy') : 'updatedAt';
    const order = params.get('order')?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const offset = (page - 1) * limit;

    let whereClauses = [];
    let bindings = [];
    if (categoryId) {
        const { results: allCategories } = await db.prepare("SELECT id, parentId FROM categories").run();
        const getSubCategoryIds = (startId) => {
            const ids = new Set([startId]);
            const queue = [startId];
            while (queue.length > 0) {
                const currentId = queue.shift();
                const children = allCategories.filter(c => c.parentId === currentId);
                for (const child of children) { ids.add(child.id); queue.push(child.id); }
            }
            return Array.from(ids);
        };
        const categoryIds = getSubCategoryIds(categoryId);
        whereClauses.push(`categoryId IN (${categoryIds.map(() => '?').join(',')})`);
        bindings.push(...categoryIds);
    }
    if (searchTerm) {
        whereClauses.push(`(name LIKE ? OR sku LIKE ?)`);
        bindings.push(`%${searchTerm}%`, `%${searchTerm}%`);
    }
    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const countQueryString = `SELECT COUNT(*) as total FROM products ${whereString}`;
    const dataQueryString = `SELECT * FROM products ${whereString} ORDER BY ${sortBy} ${order} LIMIT ? OFFSET ?`;
    const countQuery = db.prepare(countQueryString).bind(...bindings);
    const dataQuery = db.prepare(dataQueryString).bind(...bindings, limit, offset);

    const [countResult, dataResult] = await db.batch([countQuery, dataQuery]);
    const totalProducts = countResult.results[0].total;
    const totalPages = Math.ceil(totalProducts / limit);
    const products = (dataResult.results || []).map(p => {
        try {
            return { ...p, imageUrls: p.imageUrls ? JSON.parse(p.imageUrls) : [] };
        } catch (e) {
            return { ...p, imageUrls: [] };
        }
    });
    return response({
        products,
        pagination: { currentPage: page, totalPages, totalProducts, limit }
    });
}

async function getProductById(db, id) {
    const query = db.prepare("SELECT * FROM products WHERE id = ?");
    let product = await query.bind(id).first();
    if (!product) {
        return response({ error: 'Product not found' }, 404);
    }
    try {
        product = { ...product, imageUrls: product.imageUrls ? JSON.parse(product.imageUrls) : [] };
    } catch (e) {
        product = { ...product, imageUrls: [] };
    }
    return response(product, 200);
}