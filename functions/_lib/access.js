import { createRemoteJWKSet, jwtVerify } from 'jose';
import { jsonResponse } from './utils.js';
import { apiMessages } from './messages.js';

function privateResponse(response) {
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function createAccessGuard(policy, keys = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', policy.issuer))) {
    return async function (context) {
        const token = context.request.headers.get('Cf-Access-Jwt-Assertion');
        try {
            if (!token) throw new Error('Missing Access assertion');
            await jwtVerify(token, keys, {
                issuer: policy.issuer, audience: policy.audience, algorithms: ['RS256'],
                requiredClaims: ['exp', 'iat', 'sub']
            });
        } catch {
            return privateResponse(jsonResponse({ error: apiMessages.accessDenied }, 403));
        }

        const { request } = context;
        const origin = request.headers.get('Origin');
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && origin && origin !== new URL(request.url).origin) {
            return privateResponse(jsonResponse({ error: apiMessages.originDenied }, 403));
        }
        return privateResponse(await context.next());
    };
}
