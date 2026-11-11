// functions/_lib/seo.js

import { escapeXml as escape, safeImageUrl } from './utils.js';

export function generateMetaTagsHTML(data) {
    const description = (data.description || '').substring(0, 160);
    const canonicalUrl = data.url || '';
    const imageUrl = safeImageUrl(data.image);
    return `
        <link rel="canonical" href="${escape(canonicalUrl)}" />
        <meta name="description" content="${escape(description)}" />
        <meta property="og:title" content="${escape(data.title)}" />
        <meta property="og:description" content="${escape(description)}" />
        <meta property="og:image" content="${escape(imageUrl)}" />
        <meta property="og:url" content="${escape(canonicalUrl)}" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="光華工業有限公司" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="${escape(data.title)}" />
        <meta name="twitter:description" content="${escape(description)}" />
        <meta name="twitter:image" content="${escape(imageUrl)}" />
    `;
}
