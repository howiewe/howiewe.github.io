// functions/_lib/r2.js
import { jsonResponse } from './utils.js';

export async function handleImageUpload(context, fileName) {
    const { request, env } = context;
    const { IMAGE_BUCKET, R2_PUBLIC_URL } = env;
    if (!fileName) return jsonResponse({ error: '缺少檔名' }, 400);
    const object = await IMAGE_BUCKET.put(fileName, request.body, { httpMetadata: { contentType: request.headers.get('content-type') }, });
    const publicUrl = `${R2_PUBLIC_URL}/${object.key}`;
    return jsonResponse({ message: '上傳成功', url: publicUrl, key: object.key });
}

export async function deleteR2ImagesByUrls(IMAGE_BUCKET, R2_PUBLIC_URL, urls) {
    if (!urls || urls.length === 0) return;
    const keysToDelete = urls.map(url => {
        if (url && url.startsWith(R2_PUBLIC_URL)) {
            return url.substring(R2_PUBLIC_URL.length + 1);
        }
        return null;
    }).filter(Boolean);

    if (keysToDelete.length > 0) {
        try {
            await IMAGE_BUCKET.delete(keysToDelete);
        } catch (r2Error) {
            console.error("清理 R2 孤兒檔案失敗:", r2Error);
        }
    }
}
