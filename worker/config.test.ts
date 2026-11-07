// @vitest-environment node
/** Guards the T0018 deployment configuration: environment isolation, routing, no remote ops, no secrets. */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { unstable_readConfig } from 'wrangler';
import { describe, expect, it } from 'vitest';

const read = (env?: string) => unstable_readConfig({ config: 'wrangler.jsonc', ...(env ? { env } : {}) }, { hideWarnings: true });

describe('wrangler.jsonc', () => {
  it('keeps production asset-first with only API paths invoking the Worker', () => {
    const production = read();
    expect(production.name).toBe('gorgonbuilder');
    expect(production.main).toMatch(/worker[\\/]index\.ts$/);
    expect(production.assets).toEqual({
      directory: './dist', binding: 'ASSETS', not_found_handling: 'single-page-application', run_worker_first: ['/api', '/api/*'],
    });
    expect(production.vars).toEqual({ APP_ENV: 'production' });
  });

  it('does not bind or auto-provision a production database in T0018', () => {
    expect(read().d1_databases).toEqual([]);
  });

  it('isolates local and staging Workers and databases', () => {
    const local = read('local');
    const staging = read('staging');
    expect([local.name, staging.name]).toEqual(['gorgonbuilder-local', 'gorgonbuilder-staging']);
    expect([local.vars, staging.vars]).toEqual([{ APP_ENV: 'local' }, { APP_ENV: 'staging' }]);
    expect(local.d1_databases).toEqual([{
      binding: 'DB', database_name: 'gorgonbuilder-local', database_id: '00000000-0000-4000-8000-000000000000', migrations_dir: 'migrations',
    }]);
    expect(staging.d1_databases).toEqual([{
      binding: 'DB', database_name: 'gorgonbuilder-staging', database_id: '477e9b46-bb96-4eca-a5ed-1ee57185fb2a', migrations_dir: 'migrations',
    }]);
    expect(read().previews?.vars).toEqual({ APP_ENV: 'preview' });
    expect(read().previews?.d1_databases).toEqual([]);
    expect(read().compatibility_flags).toContain('nodejs_compat');
    expect(read().observability?.logs?.invocation_logs).toBe(false);
    expect(read().observability?.traces?.enabled).toBe(false);
    expect(read().observability?.redact_query_string).toBe(true);
    expect(local.workers_dev).toBe(false);
    for (const env of [local, staging]) expect(env.assets).toEqual(read().assets);
  });

  it('keeps the auth probe local-only', () => {
    const probe = unstable_readConfig({ config: 'worker/auth-probe/wrangler.jsonc' }, { hideWarnings: true });
    expect(probe.workers_dev).toBe(false);
    expect(probe.preview_urls).toBe(false);
    expect(probe.routes ?? []).toEqual([]);
    expect(probe.d1_databases[0]?.database_id).toMatch(/^00000000-/);
  });
});

describe('automation safety', () => {
  const packageScripts = Object.values((JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }).scripts);
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');

  it('never targets remote D1 or creates Cloudflare resources from scripts or CI', () => {
    for (const text of [...packageScripts, workflow]) {
      expect(text).not.toMatch(/--remote\b/);
      expect(text).not.toMatch(/\bd1 (create|delete|execute)\b/);
    }
    expect(packageScripts.filter(script => /\bd1\b/.test(script)).every(script => /--local\b/.test(script))).toBe(true);
  });

  it('restricts remote staging automation to explicit main dispatch and two environment approvals', () => {
    const staging = readFileSync('.github/workflows/staging.yml', 'utf8');
    expect(staging).toMatch(/workflow_dispatch:/);
    expect(staging).not.toMatch(/^ {2}(pull_request|pull_request_target|push|schedule):/m);
    expect(staging.match(/environment: staging/g)).toHaveLength(2);
    expect(staging.match(/ref: \$\{\{ github.sha \}\}/g)).toHaveLength(2);
    expect(staging).toContain("github.ref == 'refs/heads/main'");
    expect(staging).toContain('needs: preflight');
    expect(staging).toContain('d1 migrations list DB --env staging --remote');
    expect(staging).toContain('d1 time-travel info DB --env staging');
    expect(staging).toContain('d1 migrations apply DB --env staging --remote');
    expect(staging).toContain('wrangler deploy --env staging --name gorgonbuilder-staging');
    expect(staging).not.toMatch(/secrets\.(BETTER_AUTH|DISCORD|GOOGLE)|wrangler secret|d1 create/);
  });

  it('CI only performs Wrangler dry-runs', () => {
    const deploys = workflow.match(/wrangler (deploy|versions upload|secret)[^\n]*/g) ?? [];
    expect(deploys.length).toBeGreaterThan(0);
    for (const command of deploys) expect(command).toMatch(/^wrangler deploy .*--dry-run/);
  });
});

describe('no committed secrets', () => {
  const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);

  it('tracks only the .dev.vars template', () => {
    expect(tracked.filter(file => /(^|\/)\.dev\.vars|(^|\/)\.env(\.|$)/.test(file))).toEqual(['.dev.vars.example']);
    for (const line of readFileSync('.dev.vars.example', 'utf8').split('\n')) {
      expect(line.trim() === '' || line.trimStart().startsWith('#')).toBe(true);
    }
  });

  it('contains no credential-shaped values in text files', () => {
    const patterns = [
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
      /\bGOCSPX-[A-Za-z0-9_-]{10,}/, // Google OAuth client secret
      /\b(?:CLOUDFLARE_API_TOKEN|CF_API_TOKEN|BETTER_AUTH_SECRET|DISCORD_CLIENT_SECRET|GOOGLE_CLIENT_SECRET)\s*[=:]\s*["']?[A-Za-z0-9_+/=-]{16,}/,
      /\bghp_[A-Za-z0-9]{30,}/,
    ];
    const textFiles = tracked.filter(file => /\.(?:ts|tsx|js|mjs|json|jsonc|md|sql|ya?ml|toml|html|css|example|py)$/.test(file)
      && !file.startsWith('src/data/raw/') && statSync(file).size < 2_000_000);
    expect(textFiles.length).toBeGreaterThan(50);
    const hits = textFiles.flatMap(file => {
      const text = readFileSync(file, 'utf8');
      return patterns.filter(pattern => pattern.test(text)).map(pattern => `${file}: ${pattern}`);
    });
    expect(hits).toEqual([]);
  });
});
