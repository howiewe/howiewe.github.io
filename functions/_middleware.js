import { createAccessGuard } from './_lib/access.js';
import { accessPolicy } from './_lib/access-policy.js';

const guard = createAccessGuard(accessPolicy);

export function onRequest(context) {
    let pathname;
    try {
        // Match the decoded asset path as well as the literal Functions route.
        const decoded = decodeURIComponent(new URL(context.request.url).pathname)
            .replace(/\\/g, '/').replace(/\/+/g, '/');
        pathname = new URL(decoded, context.request.url).pathname.toLowerCase();
    } catch {
        return new Response(null, { status: 400 });
    }
    if (pathname === '/admin' || pathname.startsWith('/admin/')) return guard(context);
    return context.next();
}
