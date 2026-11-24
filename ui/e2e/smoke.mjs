// Production-bundle browser smoke tests with a deterministic fake HTTP API.
// Real authorization/atomicity is tested separately against disposable etcd.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '4174',
    '--strictPort',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
let browser;
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Preview server startup timed out')), 15000);
    server.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('127.0.0.1:4174')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    server.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Preview exited: ${code}`));
    });
    server.stderr.on('data', (chunk) => process.stderr.write(chunk));
  });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  const requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      'sessions',
      JSON.stringify({
        Development: {
          Name: 'Development',
          BackEnd: 'dev',
          Endpoints: ['http://dev:2379'],
          UserName: 'alice',
          isActive: false,
        },
        Production: {
          Name: 'Production',
          BackEnd: 'prod',
          Endpoints: ['https://prod:2379'],
          UserName: 'bob',
          isActive: false,
        },
      }),
    ),
  );
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const backend = request.headers()['x-backend'];
    const username = Buffer.from(
      (request.headers().authorization ?? '').replace('Basic ', ''),
      'base64',
    )
      .toString()
      .split(':')[0];
    if (url.pathname !== '/api/getconfig') {
      assert.ok(
        (backend === 'dev' && username === 'alice') || (backend === 'prod' && username === 'bob'),
        'request crossed workspace identities',
      );
      requests.push({ path: url.pathname, backend, method: request.method() });
    }
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    switch (url.pathname) {
      case '/api/getconfig':
        return json({
          readOnly: false,
          clusters: [
            { name: 'dev', endpoints: ['http://dev:2379'] },
            { name: 'prod', endpoints: ['https://prod:2379'] },
          ],
        });
      case '/api/auth':
        return json({});
      case '/api/v1/capabilities':
        return json({ administrator: backend === 'dev', read: true, write: backend === 'dev' });
      case '/api/v1/keys':
        return json({
          items: [{ key: '/app/a', keyEncoding: 'utf8', modRevision: '40' }],
          revision: '40',
          hasMore: false,
        });
      case '/api/keys':
        return json({ key: '/app/a', value: `${backend}-value`, modRevision: '40', lease: '0' });
      case '/api/v1/leases':
        return json({ ids: ['123'], truncated: false });
      case '/api/v1/leases/123':
        return json({ id: '123', ttl: 60, grantedTTL: 60, keys: [], keyCount: 0 });
      case '/api/v1/leases/123/renew':
        return json({ id: '123', ttl: 60 });
      case '/api/v1/transfer/batch': {
        const body = request.postDataJSON();
        return json({
          applied: !body.dryRun,
          existing: 1,
          revision: '42',
          records: body.records.map((record) => ({ ...record, expectedRevision: '40' })),
        });
      }
      case '/api/v1/watch':
        return route.fulfill({
          contentType: 'text/event-stream',
          body: 'event: ready\ndata: {"revision":"40"}\n\nevent: changes\ndata: {"revision":"41","events":[{"type":"PUT","key":"/app/b","keyEncoding":"utf8","revision":"41"}]}\n\nevent: reconnect\ndata: {"revision":"41"}\n\n',
        });
      default:
        return json({ message: 'Unexpected test API request' }, 404);
    }
  });
  await page.goto('http://127.0.0.1:4174');
  const openProfile = async (name) => {
    const card = page.locator('.MuiCard-root').filter({ hasText: name });
    await card.getByRole('button', { name: 'Open workspace' }).click();
    const password = page.getByLabel('Password', { exact: true });
    await password.fill('temporary-browser-test');
    await page.getByRole('button', { name: 'Authenticate', exact: true }).click();
    await page.getByRole('heading', { name: 'Key browser', exact: true }).waitFor();
  };
  await openProfile('Development');
  await page.getByRole('tab', { name: 'List', exact: true }).click();
  await page.getByRole('button', { name: '/app/a', exact: true }).click();
  await page.locator('.monaco-editor .view-lines').waitFor();
  await page.locator('.monaco-editor').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('unsaved-development-draft');
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
  await openProfile('Production');
  assert.equal(
    await page.getByRole('link', { name: 'Roles', exact: true }).getAttribute('aria-disabled'),
    'true',
  );
  await page.getByRole('tab', { name: 'List', exact: true }).click();
  await page.getByRole('button', { name: '/app/a', exact: true }).click();
  await page.getByText('prod-value', { exact: true }).waitFor();
  await page.getByRole('tab', { name: /Development · dev · alice/ }).click();
  await page.getByText('unsaved-development-draft', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Key prefix', exact: true }).fill('/app/');
  await page.getByRole('button', { name: 'Apply prefix', exact: true }).click();
  await page.getByRole('checkbox', { name: /Live prefix updates/ }).check();
  await page.getByRole('button', { name: '/app/b', exact: true }).waitFor();
  await page.getByRole('checkbox', { name: /Live prefix updates/ }).uncheck();
  await page.getByRole('link', { name: 'Leases / TTL', exact: true }).click();
  const renewed = page.waitForResponse((response) => response.url().endsWith('/leases/123/renew'));
  await page.getByRole('checkbox', { name: /Automatically renew in this workspace/ }).check();
  await renewed;
  await page.getByRole('link', { name: 'Keys', exact: true }).click();
  await page.getByText('unsaved-development-draft', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Select /app/a', exact: true }).check();
  await page.getByRole('link', { name: /Preview deleting 1 selected keys/ }).click();
  await page.getByRole('button', { name: 'Validate & preview', exact: true }).click();
  const apply = page.getByRole('button', { name: 'Apply atomic batch', exact: true });
  assert.equal(await apply.isDisabled(), true);
  await page
    .getByRole('textbox', { name: 'Type DELETE 1 to confirm', exact: true })
    .fill('DELETE 1');
  await apply.click();
  await page.getByText(/All 1 operations committed atomically/).waitFor();
  await page.getByRole('button', { name: 'Shortcuts', exact: true }).click();
  await page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Close active workspace', exact: true }).click();
  assert.equal(await page.getByRole('tab', { name: /Development · dev · alice/ }).count(), 0);
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.ok(
    requests.some((request) => request.path.endsWith('/renew') && request.backend === 'dev'),
  );
  console.log(
    'Browser smoke passed: workspace identity/drafts, RBAC controls, live keys, renewal, bulk confirmation, shortcuts, close cleanup.',
  );
} finally {
  await browser?.close();
  server.kill();
}
