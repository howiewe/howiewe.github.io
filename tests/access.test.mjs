import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { createAccessGuard } from '../functions/_lib/access.js';
import safety from '../js/shared/output-utils.js';

const policy = { issuer: 'https://test.cloudflareaccess.com', audience: 'test-application' };
const { privateKey, publicKey } = await generateKeyPair('RS256');
const wrongKey = (await generateKeyPair('RS256')).privateKey;
const keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256' }] });
const guard = createAccessGuard(policy, keys);

function sign(overrides = {}, key = privateKey) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ iss: policy.issuer, aud: policy.audience, sub: 'tester', iat: now, exp: now + 600, ...overrides })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(key);
}

async function call(token, { method = 'GET', origin } = {}) {
    let called = false;
    const headers = new Headers();
    if (token) headers.set('Cf-Access-Jwt-Assertion', token);
    if (origin) headers.set('Origin', origin);
    const response = await guard({ request: new Request('https://catalog.example/admin/api/products', { method, headers }),
        next: () => { called = true; return new Response('allowed'); } });
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    return { response, called };
}

test('valid Access signatures permit requests, including a same-origin save', async () => {
    const token = await sign();
    for (const options of [{}, { method: 'POST', origin: 'https://catalog.example' }]) {
        const { response, called } = await call(token, options);
        assert.equal(response.status, 200);
        assert.equal(called, true);
    }
});

test('missing, forged, expired, wrong-app and wrong-issuer tokens never reach the handler', async () => {
    const tokens = [undefined, 'forged', await sign({}, wrongKey), await sign({ exp: 1 }),
        await sign({ aud: 'another-application' }), await sign({ iss: 'https://attacker.example' }),
        await sign({ exp: undefined }), await sign({ nbf: Math.floor(Date.now() / 1000) + 3600 })];
    for (const token of tokens) {
        const { response, called } = await call(token);
        assert.equal(response.status, 403);
        assert.equal(called, false);
    }
});

test('a cross-site write is rejected even with a valid Access token', async () => {
    for (const origin of ['https://other.example', 'null']) {
        const { response, called } = await call(await sign(), { method: 'POST', origin });
        assert.equal(response.status, 403);
        assert.equal(called, false);
    }
});

test('output helpers preserve ordinary values and constrain image URLs and sizes', () => {
    assert.equal(safety.escapeHtml(0), '0');
    assert.equal(safety.escapeHtml('A<&"\''), 'A&lt;&amp;&quot;&#39;');
    for (const url of ['javascript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,<script>']) {
        assert.equal(safety.safeImageUrl(url), '');
    }
    for (const url of ['/image.jpg', 'https://images.example/a.jpg']) assert.equal(safety.safeImageUrl(url), url);
    assert.equal(safety.safeImageUrl('blob:https://example.test/1', true), 'blob:https://example.test/1');
    assert.equal(safety.safeImageUrl('data:image/png;base64,YQ==', true), 'data:image/png;base64,YQ==');
    assert.equal(safety.safeImageUrl('data:image/svg+xml,<svg onload=alert(1)>', true), '');
    assert.equal(safety.imageSize('80'), 80);
    for (const size of ['90);color:red', Infinity, 0, -1]) assert.equal(safety.imageSize(size), 90);
});
