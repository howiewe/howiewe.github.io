// functions/_lib/utils.js

import outputSafety from '../../js/shared/output-utils.js';

export const { escapeHtml: escapeXml, safeImageUrl, imageSize } = outputSafety;

export const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json;charset=UTF-8' }
});
