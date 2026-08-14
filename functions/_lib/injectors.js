// functions/_lib/injectors.js
import { escapeXml } from './utils.js';
import { generateMetaTagsHTML } from './seo.js';

export class CategoryLobbyInjector {
    constructor(categories, baseUrl, categoryImages = new Map(), defaultImage = '') {
        this.categories = categories;
        this.baseUrl = baseUrl;
        this.categoryImages = categoryImages;
        this.defaultImage = defaultImage;
    }
    element(element) {
        if (this.categories && this.categories.length > 0) {
            let categoriesHtml = '';

            const topLevelCategories = this.categories
                .filter(c => c.parentId === null && c.name !== '居家用品')
                .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

            const sportsCategory = this.categories.find(c => c.name === '運動用品' && c.parentId === null);
            let specialSubcategories = [];

            if (sportsCategory) {
                specialSubcategories = this.categories
                    .filter(c => c.parentId === sportsCategory.id && c.name !== '居家用品')
                    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            }

            const categoriesToDisplay = topLevelCategories.concat(specialSubcategories);

            categoriesToDisplay.forEach(cat => {
                const categoryUrlName = encodeURIComponent(cat.name);
                const categoryHref = `/catalog/category/${cat.id}/${categoryUrlName}`;
                const description = cat.description ? escapeXml(cat.description.substring(0, 50) + '...') : '點擊查看更多產品';

                const isParent = cat.parentId === null;
                const cardClass = `category-card ${isParent ? 'category-card--parent' : ''}`;
                const imageUrl = this.categoryImages.get(cat.id) || this.defaultImage;

                categoriesHtml += `
                    <a href="${categoryHref}" class="${cardClass}">
                        <div class="category-card-image">
                            <img src="${imageUrl}" alt="光華工業 ${escapeXml(cat.name)} 系列" loading="lazy">
                        </div>
                        <div class="category-card-content">
                            <h3>${escapeXml(cat.name)}</h3>
                            <p>${description}</p>
                        </div>
                    </a>
                `;
            });

            element.setInnerContent(categoriesHtml, { html: true });
        } else {
            element.setInnerContent('<p class="empty-message">目前沒有任何分類。</p>', { html: true });
        }
    }
}

export class FeaturedCategoryInjector {
    constructor(category, imageUrl) {
        this.category = category;
        this.imageUrl = imageUrl;
    }

    element(element) {
        if (!this.category) return;

        const categoryUrlName = encodeURIComponent(this.category.name);
        const categoryHref = `/catalog/category/${this.category.id}/${categoryUrlName}`;
        const description = this.category.description || '探索我們精選的運動用品系列。';

        const html = `
            <a href="${categoryHref}" class="featured-category">
                <div class="featured-image-container">
                    <img src="${this.imageUrl}" alt="${escapeXml(this.category.name)}" class="featured-image" loading="lazy">
                </div>
                <div class="featured-content">
                    <div class="featured-label">Featured Collection</div>
                    <h2 class="featured-title">${escapeXml(this.category.name)}</h2>
                    <p class="featured-description">${escapeXml(description)}</p>
                    <span class="featured-link">
                        立即選購
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                    </span>
                </div>
            </a>
        `;

        element.setInnerContent(html, { html: true });
    }
}

export class HeadRewriter {
    constructor(metaData) { this.metaData = metaData; }
    element(element) { if (this.metaData) element.append(generateMetaTagsHTML(this.metaData), { html: true }); }
}

export class TitleRewriter {
    constructor(title) { this.title = title; }
    element(element) { if (this.title) element.setInnerContent(this.title); }
}

export class StructuredDataInjector {
    constructor(jsonData) { this.jsonData = jsonData; }
    element(element) {
        if (this.jsonData) {
            const scriptContent = JSON.stringify(this.jsonData, null, 2);
            element.append(`<script type="application/ld+json">${scriptContent}<\/script>`, { html: true });
        }
    }
}

// 渲染視覺麵包屑，同時輸出符合 SEO 語意的 <nav> 內容
export class BreadcrumbInjector {
    constructor(items) {
        // items: [{ name, href? }]  最後一項無 href（當前頁）
        this.items = items;
    }
    element(element) {
        if (!this.items || this.items.length === 0) return;
        const parts = this.items.map((item, i) => {
            const isLast = i === this.items.length - 1;
            if (isLast) {
                return `<span class="breadcrumb-current" aria-current="page">${escapeXml(item.name)}</span>`;
            }
            return `<a href="${escapeXml(item.href)}" class="breadcrumb-link">${escapeXml(item.name)}</a>`;
        });
        const html = `<ol class="breadcrumb-trail">${parts.map(p => `<li>${p}</li>`).join('<li class="breadcrumb-sep" aria-hidden="true">›</li>')}</ol>`;
        element.setInnerContent(html, { html: true });
    }
}


export class ContentInjector {
    constructor(selector, content) { this.selector = selector; this.content = content; }
    element(element) { if (this.content) element.setInnerContent(this.content, { html: true }); }
}

export class ProductListInjector {
    constructor(products, categoryName = '') {
        this.products = products;
        this.categoryName = categoryName;
    }
    element(element) {
        if (this.products && this.products.length > 0) {
            let productsHtml = '';
            this.products.forEach(product => {
                const productUrlName = encodeURIComponent(product.name);
                const productHref = `/catalog/product/${product.id}/${productUrlName}`;
                const firstImageObject = (product.imageUrls && product.imageUrls.length > 0) ? product.imageUrls[0] : null;
                const imageUrl = firstImageObject ? firstImageObject.url : '';
                const imageSize = firstImageObject ? firstImageObject.size : 90;
                const altText = this.categoryName
                    ? `${escapeXml(this.categoryName)} - ${escapeXml(product.name)}`
                    : escapeXml(product.name);
                const priceHtml = (product.price !== null && product.price !== undefined) ? `<p class="price">$${product.price}</p>` : `<p class="price price-empty">&nbsp;</p>`;
                productsHtml += `
                    <a href="${productHref}" class="product-card">
                        <div class="image-container"><img src="${imageUrl}" class="product-image" alt="${altText}" loading="lazy" style="transform: scale(${imageSize / 100});"></div>
                        <div class="product-info"><h3>${escapeXml(product.name)}</h3>${priceHtml}</div>
                    </a>
                `;
            });
            element.setInnerContent(productsHtml, { html: true });
        } else {
            element.setInnerContent('<p class="empty-message">找不到符合條件的產品。</p>', { html: true });
        }
    }
}

export class SidebarInjector {
    constructor(categories, activeCategoryId = null) {
        this.categories = categories || [];
        this.activeCategoryId = activeCategoryId;
    }

    element(element) {
        if (this.categories.length === 0) return;

        const categoryMap = new Map(this.categories.map(c => [c.id, { ...c, children: [] }]));
        const tree = [];
        for (const category of categoryMap.values()) {
            if (category.parentId === null) tree.push(category);
            else if (categoryMap.has(category.parentId)) categoryMap.get(category.parentId).children.push(category);
        }

        const isAllActive = this.activeCategoryId === 'all';
        let html = `<ul><li><a href="/catalog" class="${isAllActive ? 'active' : ''}">所有產品</a></li></ul>`;
        html += this.createTreeHTML(tree);

        element.setInnerContent(html, { html: true });
    }

    hasActiveDescendant(node) {
        if (!this.activeCategoryId || this.activeCategoryId === 'all') return false;
        if (node.id === this.activeCategoryId) return true;
        if (node.children && node.children.length > 0) {
            return node.children.some(child => this.hasActiveDescendant(child));
        }
        return false;
    }

    createTreeHTML(nodes, depth = 0) {
        nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        let subHtml = `<ul class="${depth >= 2 ? 'hidden' : ''}">`;
        for (const node of nodes) {
            const hasChildren = node.children && node.children.length > 0;
            const categoryUrlName = encodeURIComponent(node.name);
            const isActive = node.id === this.activeCategoryId;
            const containsActive = this.hasActiveDescendant(node);
            const isExpanded = containsActive;

            subHtml += `<li class="${hasChildren ? 'has-children' : ''}">
                <a href="/catalog/category/${node.id}/${categoryUrlName}" class="${isActive ? 'active' : ''}">
                    <span>${escapeXml(node.name)}</span>`;

            if (hasChildren) {
                subHtml += `<span class="category-toggle-icon ${isExpanded ? 'expanded' : ''}"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></span>`;
            }

            subHtml += `</a>`;

            if (hasChildren) {
                subHtml += this.createTreeHTML(node.children, depth + 1);
            }
            subHtml += '</li>';
        }
        return subHtml + '</ul>';
    }
}

export class HomepageCategoriesInjector {
    constructor(categories, categoryImages, defaultImage) {
        this.categories = categories;
        this.categoryImages = categoryImages;
        this.defaultImage = defaultImage;
    }

    element(element) {
        if (!this.categories || this.categories.length === 0) {
            element.setInnerContent('<p class="empty-message">目前暫無產品分類。</p>', { html: true });
            return;
        }

        let html = '';
        this.categories.forEach(cat => {
            const imageUrl = this.categoryImages.get(cat.id) || this.defaultImage;
            const categoryHref = `/catalog/category/${cat.id}/${encodeURIComponent(cat.name)}`;
            const rawDesc = cat.description || `探索我們精選的${cat.name}系列產品。`;
            const description = escapeXml(rawDesc.length > 60 ? rawDesc.substring(0, 60) + '...' : rawDesc);

            html += `
                <a href="${categoryHref}" class="card">
                    <div class="card-image">
                        <img src="${imageUrl}" alt="光華工業 ${escapeXml(cat.name)} 系列" loading="lazy">
                    </div>
                    <div class="card-content">
                        <h3>${escapeXml(cat.name)}</h3>
                        <p>${description}</p>
                        <span class="card-link-text">查看更多 &rarr;</span>
                    </div>
                </a>
            `;
        });

        element.setInnerContent(html, { html: true });
    }
}
