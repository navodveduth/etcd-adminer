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
  let clusterUnavailable = false;
  let denseKeys = false;
  let copyingFolder = false;
  let copiedFolderBatches = 0;
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
      case '/api/clusterinfo':
        if (clusterUnavailable) return json({ message: 'Fixture cluster unavailable' }, 503);
        return json({
          clusterID: '9007199254740993',
          memberID: '99',
          raftTerm: '8',
          nodes: [
            {
              ID: '99',
              name: 'member-a',
              available: true,
              isLeader: 'leader',
              version: '3.6.7',
              dbSize: 1048576,
              dbSizeInUse: 524288,
              clientUrls: ['https://member-a.long-cluster-name.example.test:2379'],
              peerUrls: ['https://member-a:2380'],
            },
            {
              ID: '100',
              name: 'member-b',
              available: false,
              error: 'Endpoint unavailable',
              clientUrls: ['https://member-b:2379'],
            },
          ],
        });
      case '/api/v1/cluster/metrics':
        return json({
          sampledAt: new Date().toISOString(),
          source: 'maintenance',
          alarms: [],
          members: [
            {
              endpoint: 'https://member-a.long-cluster-name.example.test:2379',
              available: true,
              id: '99',
              leader: '99',
              dbSize: 1048576,
              dbInUse: 524288,
              term: '8',
              applyLag: '0',
            },
          ],
        });
      case '/api/users':
        return json(['alice', 'root']);
      case '/api/role':
        return json(['reader', 'root']);
      case '/api/v1/users/detail':
        return json({ name: url.searchParams.get('name'), roles: ['reader'] });
      case '/api/v1/roles':
        return json({ roles: ['reader', 'root'] });
      case '/api/v1/roles/detail':
        return json({
          name: url.searchParams.get('name'),
          permissions: [
            {
              access: 'read',
              scope: 'prefix',
              key: '/app/',
              keyBase64: 'L2FwcC8=',
              rangeEnd: '/app0',
              rangeEndBase64: 'L2FwcDA=',
            },
          ],
        });
      case '/api/v1/folders': {
        const prefix = url.searchParams.get('prefix') ?? '';
        let entries;
        if (backend === 'prod') {
          if (prefix === '') entries = [{ key: '/system', isDirectory: true }];
          else if (prefix === '/system/')
            entries = [{ key: '/system/driver-services', isDirectory: true }];
          else if (prefix === '/system/driver-services/')
            entries = Array.from({ length: 62 }, (_, i) => ({
              key: `/system/driver-services/project-${String(i).padStart(2, '0')}`,
              isDirectory: true,
            }));
          else
            throw new Error(
              'Project descendants should be loaded together through the key-page API',
            );
        } else
          entries =
            prefix === ''
              ? [{ key: '/app', isDirectory: true }]
              : [{ key: '/app/a', isDirectory: false }];
        return json({
          items: entries.map((entry) => ({ ...entry, keyEncoding: 'utf8' })),
          revision: '40',
          hasMore: false,
        });
      }
      case '/api/v1/keys':
        if (backend === 'prod' && url.searchParams.get('limit') === '1000') {
          const prefix = url.searchParams.get('prefix');
          assert.equal(prefix, '/system/driver-services/project-00/');
          return json({
            items: Array.from({ length: 100 }, (_, index) => ({
              key: `${prefix}v1/key-${index}`,
              keyEncoding: 'utf8',
              modRevision: '40',
            })),
            revision: '40',
            hasMore: false,
          });
        }
        return json({
          items: denseKeys
            ? Array.from({ length: 100 }, (_, index) => ({
                key: `/system/automation-services/driver-simulator/v1/t0002/util/driver-waiting-${index}-max-seconds`,
                keyEncoding: 'utf8',
                modRevision: '40',
              }))
            : [{ key: '/app/a', keyEncoding: 'utf8', modRevision: '40' }],
          revision: '40',
          hasMore: false,
        });
      case '/api/keys':
        if (request.method() === 'PUT') {
          const body = request.postDataJSON();
          assert.equal(
            body.key,
            '/system/automation-services/driver-simulator/common/redis/pool-timeout',
          );
          assert.equal(body.value, '5s');
          assert.equal(body.expectedRevision, '0');
          assert.equal(body.lease, undefined);
          return json({ revision: '42' });
        }
        return json({ key: '/app/a', value: `${backend}-value`, modRevision: '40', lease: '0' });
      case '/api/v1/leases':
        return json({ ids: ['123'], truncated: false });
      case '/api/v1/leases/123':
        return json({ id: '123', ttl: 60, grantedTTL: 60, keys: [], keyCount: 0 });
      case '/api/v1/leases/123/renew':
        return json({ id: '123', ttl: 60 });
      case '/api/v1/transfer/batch': {
        const body = request.postDataJSON();
        if (copyingFolder) {
          assert.equal(body.policy, 'create');
          assert.equal(body.operation, 'import');
          assert.ok(
            body.records.every((record) =>
              Buffer.from(record.keyBase64, 'base64').toString().startsWith('/app-copy/'),
            ),
          );
          if (!body.dryRun) copiedFolderBatches++;
        }
        return json({
          applied: !body.dryRun,
          existing: copyingFolder ? 0 : 1,
          revision: '42',
          records: body.records.map((record) => ({
            ...record,
            expectedRevision: copyingFolder ? '0' : '40',
          })),
        });
      }
      case '/api/v1/transfer/export': {
        assert.equal(url.searchParams.get('prefix'), '/app/');
        const next = url.searchParams.get('cursor') === 'folder-page-2';
        return json({
          revision: '40',
          records: [
            {
              keyBase64: Buffer.from(next ? '/app/nested/b' : '/app/a').toString('base64'),
              valueBase64: Buffer.from('exact original value').toString('base64'),
            },
          ],
          hasMore: !next,
          ...(next ? {} : { nextCursor: 'folder-page-2' }),
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
    const card = page.getByRole('article', { name, exact: true });
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
  const actionBounds = await page
    .getByRole('group', { name: 'Save and draft actions' })
    .boundingBox();
  const editorPanelBounds = await page
    .getByRole('region', { name: 'Key value editor' })
    .boundingBox();
  assert.ok(
    Math.abs(
      editorPanelBounds.x + editorPanelBounds.width - actionBounds.x - actionBounds.width - 16,
    ) < 3,
    'Save/Discard/Reload/Copy must align with the right editor corner',
  );
  const nextBounds = await page
    .getByRole('button', { name: 'Next page', exact: true })
    .boundingBox();
  const browserPanelBounds = await page
    .getByRole('region', { name: 'Key browser controls' })
    .boundingBox();
  assert.ok(
    Math.abs(
      browserPanelBounds.x + browserPanelBounds.width - nextBounds.x - nextBounds.width - 16,
    ) < 3,
    'Next page must align with the right browser corner',
  );
  assert.ok(
    (await page.getByRole('button', { name: 'Save', exact: true }).boundingBox()).y <
      (await page.locator('.monaco-editor').boundingBox()).y,
    'Save/Discard actions should be above the editor, not below a tall scroll',
  );
  assert.ok(
    (await page.getByRole('button', { name: 'Refresh keys', exact: true }).boundingBox()).x >
      (await page.getByRole('tab', { name: 'List', exact: true }).boundingBox()).x,
    'Refresh icon should be at the right of the Folder/List tab row',
  );
  await page.locator('.monaco-editor').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('unsaved-development-draft');
  await page.getByRole('button', { name: 'New key', exact: true }).click();
  const createDialog = page.getByRole('dialog', { name: 'New key & value', exact: true });
  await createDialog
    .getByLabel('Full key path', { exact: true })
    .fill('/system/automation-services/driver-simulator/common/redis/pool-timeout');
  await createDialog.getByLabel('Value', { exact: true }).fill('5s');
  await createDialog.getByRole('button', { name: 'Create key', exact: true }).click();
  await createDialog.waitFor({ state: 'hidden' });
  await page.getByText('unsaved-development-draft', { exact: true }).waitFor();
  await page
    .getByRole('alert')
    .filter({ hasText: 'Your editor draft is unchanged.' })
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await page.getByRole('button', { name: 'ETCD Adminer — Connections', exact: true }).click();
  await page.getByRole('button', { name: 'Actions for Development', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Reauthenticate', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill('refreshed-browser-test');
  await page.getByRole('button', { name: 'Authenticate', exact: true }).click();
  await page.getByText('unsaved-development-draft', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
  await openProfile('Production');
  await page.getByRole('status').filter({ hasText: 'Subfolders load on expansion' }).waitFor();
  assert.equal(
    requests.filter((request) => request.backend === 'prod' && request.path === '/api/v1/keys')
      .length,
    0,
    'Folder browsing must not fetch every key page',
  );
  const folders = page.getByRole('tree', { name: 'Key folders', exact: true });
  assert.ok(
    (await folders.getByRole('treeitem', { includeHidden: true }).count()) < 10,
    'Collapsed folder branches must not mount thousands of hidden key rows',
  );
  await page.getByText('system', { exact: true }).click();
  await page.getByText('driver-services', { exact: true }).click();
  await page.getByText('project-00', { exact: true }).waitFor();
  await page.getByText('project-61', { exact: true }).waitFor();
  assert.equal(
    requests.filter((request) => request.backend === 'prod' && request.path === '/api/v1/folders')
      .length,
    3,
    'Only root, system and driver-services should be fetched, never unopened project keys',
  );
  assert.ok(
    (await folders.getByRole('treeitem', { includeHidden: true }).count()) < 150,
    'Opening the projects directory should only mount immediate children',
  );
  assert.equal(
    await folders.evaluate((tree) => {
      let scrollContainers = 0;
      for (
        let element = tree;
        element && element.getAttribute('aria-label') !== 'Key browser controls';
        element = element.parentElement
      ) {
        if (['auto', 'scroll'].includes(getComputedStyle(element).overflowY)) scrollContainers++;
      }
      return scrollContainers;
    }),
    1,
    'Folder browser should have a single vertical scroll owner',
  );
  await page.getByText('project-00', { exact: true }).click();
  await page.getByText('v1', { exact: true }).waitFor();
  const projectKeyRequests = requests.filter(
    (request) => request.backend === 'prod' && request.path === '/api/v1/keys',
  ).length;
  assert.equal(projectKeyRequests, 1, 'Opening one project should fetch only that project subtree');
  await page.getByText('v1', { exact: true }).click();
  await page.getByText('key-0', { exact: true }).waitFor();
  assert.equal(
    requests.filter((request) => request.backend === 'prod' && request.path === '/api/v1/keys')
      .length,
    projectKeyRequests,
    'Expanding v1 must reuse the loaded project summaries',
  );
  assert.equal(
    requests.filter((request) => request.backend === 'prod' && request.path === '/api/v1/folders')
      .length,
    3,
    'Project subfolders must not trigger more folder requests',
  );
  assert.equal(await page.getByRole('button', { name: 'New key', exact: true }).isDisabled(), true);
  assert.equal(
    await page.getByRole('link', { name: 'Roles', exact: true }).getAttribute('aria-disabled'),
    'true',
  );
  await page.getByRole('tab', { name: 'List', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '1 keys on this page' }).waitFor();
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByRole('tab', { name: 'Folder', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Subfolders load on expansion' }).waitFor();
    await page.getByRole('tab', { name: 'List', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '1 keys on this page' }).waitFor();
    assert.equal(
      await page.getByRole('table', { name: 'Keys on this page' }).getByRole('row').count(),
      2,
      'List must use its own bounded page, never the full folder index',
    );
  }
  await page.getByRole('button', { name: '/app/a', exact: true }).click();
  await page.getByText('prod-value', { exact: true }).waitFor();
  await page.getByRole('tab', { name: /Development · dev · alice/ }).click();
  await page.getByText('unsaved-development-draft', { exact: true }).waitFor();
  await page.getByRole('textbox', { name: 'Key prefix', exact: true }).fill('/app/');
  await page
    .getByRole('region', { name: 'Key browser controls', exact: true })
    .getByText('Live updates · Off', { exact: true })
    .click();
  await page.getByRole('checkbox', { name: /Live prefix updates/ }).check();
  await page.getByRole('button', { name: '/app/b', exact: true }).waitFor();
  await page.getByRole('checkbox', { name: /Live prefix updates/ }).uncheck();
  await page
    .getByRole('region', { name: 'Key browser controls', exact: true })
    .getByText('Live updates · Off', { exact: true })
    .click();
  await page.getByRole('link', { name: 'Leases / TTL', exact: true }).click();
  const renewed = page.waitForResponse((response) => response.url().endsWith('/leases/123/renew'));
  await page.getByRole('checkbox', { name: /Automatically renew in this workspace/ }).check();
  await renewed;
  await page.getByRole('link', { name: 'Keys', exact: true }).click();
  await page.getByText('unsaved-development-draft', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
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
  const navigate = async (name) => {
    if (await page.getByRole('button', { name: 'Navigate workspace', exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'Navigate workspace', exact: true }).click();
      await page
        .getByRole('navigation', { name: 'Workspace menu', exact: true })
        .getByRole('link', { name, exact: true })
        .click();
      await page
        .getByRole('navigation', { name: 'Workspace menu', exact: true })
        .waitFor({ state: 'hidden' });
    } else await page.getByRole('link', { name, exact: true }).click();
  };
  const noOverflow = async (label) => {
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      body: document.body.style.cssText,
      elements: [...document.querySelectorAll('body *')]
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.width && bounds.right > window.innerWidth + 1;
        })
        .slice(0, 30)
        .map((element) => ({
          tag: element.tagName,
          class: element.className,
          text: element.textContent.slice(0, 40),
          position: getComputedStyle(element).position,
          right: element.getBoundingClientRect().right,
        })),
    }));
    if (overflow.width > overflow.viewport + 1)
      await page.screenshot({ path: '/tmp/opencode/etcd-layout-overflow.png', fullPage: true });
    assert.ok(
      overflow.width <= overflow.viewport + 1,
      `${label}: page overflow ${JSON.stringify(overflow)}`,
    );
    assert.equal(
      await page.getByRole('heading', { level: 1 }).count(),
      1,
      `${label}: single page heading`,
    );
  };
  await navigate('Keys');
  await page.getByRole('tab', { name: 'Folder', exact: true }).click();
  await page.getByText('app', { exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Duplicate folder…', exact: true }).click();
  copyingFolder = true;
  const folderDialog = page.getByRole('dialog', { name: 'Duplicate folder', exact: true });
  await folderDialog.getByRole('button', { name: 'Preview copy', exact: true }).click();
  await folderDialog.getByText('/app-copy/nested/b', { exact: true }).waitFor();
  const duplicate = folderDialog.getByRole('button', { name: 'Duplicate folder', exact: true });
  assert.equal(await duplicate.isDisabled(), true);
  assert.equal(copiedFolderBatches, 0, 'Preview must not write keys');
  await folderDialog.getByLabel('Type COPY 2 to confirm', { exact: true }).fill('COPY 2');
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    'Folder copy dialog must not overflow the page',
  );
  await duplicate.click();
  await folderDialog.getByText(/2 keys copied to/).waitFor();
  assert.equal(copiedFolderBatches, 2, 'Copy must apply both bounded pages');
  await folderDialog.getByRole('button', { name: 'Done', exact: true }).click();
  copyingFolder = false;
  await page.getByRole('tab', { name: 'List', exact: true }).click();
  // 720px also checks the layout viewport equivalent of a 1440px browser at 200% zoom.
  for (const width of [375, 720, 768, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      const themeButton = page.getByRole('button', {
        name: `Switch to ${theme} theme`,
        exact: true,
      });
      if (await themeButton.count()) await themeButton.click();
      for (const [link, title] of [
        ['Cluster', 'Cluster'],
        ['Metrics', 'Cluster metrics'],
        ['Keys', 'Key browser'],
        ['Import / export', 'Import, export & bulk delete'],
        ['Leases / TTL', 'Leases & expiration'],
        ['Live changes', 'Live changes'],
        ['Users', 'Users'],
        ['Roles', 'Roles & permissions'],
      ]) {
        await navigate(link);
        await page.getByRole('heading', { name: title, exact: true, level: 1 }).waitFor();
        if (link === 'Cluster') await page.getByText('1 / 2', { exact: true }).waitFor();
        if (link === 'Users') {
          const back = page.getByRole('button', { name: 'Back to user directory', exact: true });
          if (await back.isVisible()) await back.click();
          await page.getByRole('button', { name: 'View / edit', exact: true }).first().click();
          await page.getByRole('button', { name: 'Copy username', exact: true }).waitFor();
        }
        await noOverflow(`${link} ${width}px ${theme}`);
        if (link === 'Keys') {
          if (width >= 1280) {
            const browserBounds = await page
              .getByRole('region', { name: 'Key browser controls', exact: true })
              .boundingBox();
            const editorBounds = await page
              .getByRole('region', { name: 'Key value editor', exact: true })
              .boundingBox();
            assert.ok(
              Math.abs(browserBounds.y - editorBounds.y) <= 1,
              'Browser and editor panels must align at the top',
            );
            assert.ok(
              editorBounds.y < 300,
              'Compact key workspace should start near the top, not below a large page introduction',
            );
            const codeBounds = await page.locator('.monaco-editor:visible').boundingBox();
            assert.ok(
              codeBounds.y - editorBounds.y < 260,
              'Editor metadata and top action toolbar should remain compact',
            );
            const saveBounds = await page
              .getByRole('button', { name: 'Save', exact: true })
              .boundingBox();
            assert.ok(
              saveBounds.y < codeBounds.y &&
                saveBounds.y + saveBounds.height < page.viewportSize().height,
              'Save/Discard must remain above the value and within the initial viewport',
            );
          }
          await page.getByRole('button', { name: 'New key', exact: true }).click();
          const dialog = page.getByRole('dialog', { name: 'New key & value', exact: true });
          await dialog.waitFor();
          await page.waitForFunction(() => {
            const container = document
              .querySelector('[role="dialog"]')
              ?.closest('.MuiDialog-container');
            return container && getComputedStyle(container).opacity === '1';
          });
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth + 1,
            ),
            `New key dialog overflow at ${width}px ${theme}`,
          );
          if (theme === 'dark' && [375, 1440].includes(width))
            await page.screenshot({
              path: `/tmp/opencode/etcd-new-key-${width}.png`,
              fullPage: true,
            });
          await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
          await dialog.waitFor({ state: 'hidden' });
        }
        if (link === 'Cluster' && theme === 'dark' && [375, 1440].includes(width))
          await page.screenshot({
            path: `/tmp/opencode/etcd-cluster-${width}.png`,
            fullPage: true,
          });
        if (width === 1440 && theme === 'dark')
          await page.screenshot({
            path: `/tmp/opencode/etcd-${link.replaceAll(/[^a-z]/gi, '-').toLowerCase()}.png`,
            fullPage: true,
          });
      }
      await navigate('Users');
      await page.getByRole('link', { name: 'Create user', exact: true }).click();
      await page.getByRole('heading', { name: 'New user', exact: true }).waitFor();
      await noOverflow(`Create user ${width}px ${theme}`);
      await page.getByRole('button', { name: 'Connections', exact: true }).click();
      await page.getByRole('heading', { name: 'Connections', exact: true }).waitFor();
      await noOverflow(`Connections ${width}px ${theme}`);
      if (theme === 'dark' && [375, 1440].includes(width))
        await page.screenshot({
          path: `/tmp/opencode/etcd-connection-cards-${width}.png`,
          fullPage: true,
        });
      await page.getByRole('link', { name: 'New connection', exact: true }).click();
      await page.getByRole('heading', { name: 'New connection', exact: true }).waitFor();
      await noOverflow(`New connection ${width}px ${theme}`);
      await page.getByRole('button', { name: 'About', exact: true }).click();
      await page.getByRole('heading', { name: 'About ETCD Adminer', exact: true }).waitFor();
      await noOverflow(`About ${width}px ${theme}`);
      await page.getByRole('tab', { name: /Development · dev · alice/ }).click();
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigate('Keys');
  denseKeys = true;
  await page.getByRole('button', { name: 'Refresh keys', exact: true }).click();
  await page
    .getByRole('button', {
      name: '/system/automation-services/driver-simulator/v1/t0002/util/driver-waiting-0-max-seconds',
      exact: true,
    })
    .waitFor();
  const keyList = page.locator('[aria-label="Scrollable key list"]:visible');
  const keyHeader = page
    .getByRole('table', { name: 'Keys on this page', exact: true })
    .getByRole('columnheader', { name: 'Key', exact: true });
  const filterBefore = await page
    .getByRole('textbox', { name: 'Filter this page', exact: true })
    .boundingBox();
  const headerBefore = await keyHeader.boundingBox();
  await keyList.evaluate((element) => {
    element.scrollTop = 240;
  });
  assert.equal(await keyList.evaluate((element) => element.scrollTop), 240);
  const headerAfter = await keyHeader.boundingBox();
  const filterAfter = await page
    .getByRole('textbox', { name: 'Filter this page', exact: true })
    .boundingBox();
  assert.ok(
    Math.abs(headerBefore.y - headerAfter.y) <= 1,
    'Key header must stay pinned while rows scroll',
  );
  assert.equal(filterBefore.y, filterAfter.y, 'Key filter must stay outside the scroll area');
  const background = await keyHeader.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  assert.match(background, /^rgb\(/, `Sticky header must be opaque, got ${background}`);
  const nestedScrollers = await keyList.evaluate((element) => {
    let count = 0;
    for (
      let parent = element.parentElement;
      parent && parent.getAttribute('role') !== 'region';
      parent = parent.parentElement
    ) {
      if (
        ['auto', 'scroll'].includes(getComputedStyle(parent).overflowY) &&
        parent.scrollHeight > parent.clientHeight
      )
        count++;
    }
    return count;
  });
  assert.equal(nestedScrollers, 0, 'Key list must not have nested scroll areas');
  await noOverflow('Scrolled long-key list');
  await page.screenshot({ path: '/tmp/opencode/etcd-key-list-scrolled.png', fullPage: true });
  await navigate('Cluster');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button')].some(
      (button) => button.textContent === 'Refresh members' && !button.disabled,
    ),
  );
  clusterUnavailable = true;
  await page.getByRole('button', { name: 'Refresh members', exact: true }).click();
  await page.getByText(/Last successful inventory is shown below and may be stale/).waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button')].some(
      (button) => button.textContent === 'Refresh members' && !button.disabled,
    ),
  );
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Try again', exact: true }).focus();
  clusterUnavailable = false;
  await page.keyboard.press('Enter');
  await page
    .getByText(/Last successful inventory is shown below and may be stale/)
    .waitFor({ state: 'hidden' });
  const developmentTab = page.getByRole('tab', { name: /Development · dev · alice/ });
  await developmentTab.focus();
  await page.keyboard.press('End');
  assert.equal(
    await page.getByRole('tab', { name: /Production · prod · bob/ }).getAttribute('aria-selected'),
    'true',
  );
  await page.keyboard.press('Home');
  assert.equal(await developmentTab.getAttribute('aria-selected'), 'true');
  await page.getByRole('button', { name: 'Shortcuts', exact: true }).click();
  await page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Close active workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Close workspace', exact: true }).click();
  assert.equal(await page.getByRole('tab', { name: /Development · dev · alice/ }).count(), 0);
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.ok(
    requests.some((request) => request.path.endsWith('/renew') && request.backend === 'dev'),
  );
  console.log(
    'Browser smoke passed: backend-lazy folders for a 6,194-key fixture, single folder scrollbar, repeated List switches, top editor actions/refresh icon, workspace isolation/drafts, RBAC, live keys, renewal, typed confirmations and responsive layouts.',
  );
} finally {
  await browser?.close();
  server.kill();
}
