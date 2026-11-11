import { cp, mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { seedSql } from './fixtures.mjs';

const root = process.cwd();
const stage = path.join(root, '.wrangler', `security-test-${Date.now()}`);
const cli = path.join(root, 'node_modules/wrangler/bin/wrangler.js');
await mkdir(stage, { recursive: true });
for (const entry of ['functions', 'js', 'css', 'vendor', 'templates', 'admin',
    'index.html', 'catalog.html', 'catalog-lobby.html', 'robots.txt',
    'admin.html', 'batch-upload.html', 'print-catalog.html']) {
    try { await access(path.join(root, entry)); }
    catch { continue; }
    await cp(path.join(root, entry), path.join(stage, entry), { recursive: true });
}

const issuer = 'http://127.0.0.1:8791';
const audience = 'isolated-security-test';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'local-test-key', alg: 'RS256', use: 'sig' };
const identity = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/cdn-cgi/access/certs') return res.end(JSON.stringify({ keys: [jwk] }));
    if (req.url === '/token') {
        const token = await new SignJWT({ email: 'tester@example.invalid' })
            .setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setIssuer(issuer)
            .setAudience(audience).setSubject('isolated-tester').setIssuedAt().setExpirationTime('10m')
            .sign(privateKey);
        return res.end(JSON.stringify({ token }));
    }
    res.statusCode = 404;
    res.end('{}');
});
await new Promise(resolve => identity.listen(8791, '127.0.0.1', resolve));

// Only the isolated copy trusts this test key. Production has no test-login bypass.
await writeFile(path.join(stage, 'functions/_lib/access-policy.js'),
    `export const accessPolicy = ${JSON.stringify({ issuer, audience })};\n`);
await writeFile(path.join(stage, 'test-image.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#467"/></svg>');
await writeFile(path.join(stage, 'seed.sql'), seedSql);
await writeFile(path.join(stage, '.dev.vars'), 'R2_PUBLIC_URL="http://127.0.0.1:8790/test-images"\n');
await writeFile(path.join(stage, 'wrangler.jsonc'), JSON.stringify({
    name: 'catalog-security-test', compatibility_date: '2025-10-11', pages_build_output_dir: '.',
    d1_databases: [{ binding: 'D1_DB', database_name: 'catalog-security-test', database_id: '00000000-0000-0000-0000-000000000001' }],
    r2_buckets: [{ binding: 'IMAGE_BUCKET', bucket_name: 'catalog-security-test' }],
    vars: { R2_PUBLIC_URL: 'http://127.0.0.1:8790/test-images' }
}));
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false',
    WRANGLER_LOG_PATH: path.join(stage, 'wrangler.log'), XDG_CONFIG_HOME: path.join(stage, 'config') };
const run = args => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd: stage, env, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Wrangler exited ${code}`)));
});
await run(['d1', 'execute', 'catalog-security-test', '--local', '--file', 'seed.sql']);
const worker = spawn(process.execPath, [cli, 'pages', 'dev', '.', '--d1', 'D1_DB=00000000-0000-0000-0000-000000000001', '--r2', 'IMAGE_BUCKET', '--ip', '127.0.0.1',
    '--port', '8790', '--show-interactive-dev-session=false'], { cwd: stage, env, stdio: 'inherit', windowsHide: true });
const stop = () => { worker.kill(); identity.close(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
worker.on('exit', code => { identity.close(); process.exitCode = code || 0; });
