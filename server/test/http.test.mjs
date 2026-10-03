import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PORT = '0';
const { server } = await import('../dist/index.js');

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

const address = server.address();
if (!address || typeof address === 'string') throw new Error('测试服务器未能正常启动');
const baseUrl = `http://127.0.0.1:${address.port}`;

async function createMock(route) {
  const response = await fetch(`${baseUrl}/api/mocks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(route)
  });
  assert.equal(response.status, 201);
  return response.json();
}

await createMock({
  name: '用户通配路由',
  method: 'GET',
  path: '/users/*',
  statusCode: 200,
  responseHeaders: { 'content-type': 'text/plain; charset=utf-8', 'x-route': 'wildcard' },
  responseBody: 'wildcard'
});
await createMock({
  name: '用户参数路由',
  method: 'GET',
  path: '/users/:id',
  statusCode: 202,
  responseHeaders: { 'content-type': 'text/plain; charset=utf-8', 'x-route': 'parameter' },
  responseBody: 'parameter'
});
await createMock({
  name: '当前用户',
  method: 'GET',
  path: '/users/me',
  statusCode: 200,
  responseHeaders: { 'content-type': 'text/plain; charset=utf-8', 'x-route': 'exact' },
  responseBody: 'exact'
});
await createMock({
  name: '创建当前用户',
  method: 'POST',
  path: '/users/me',
  statusCode: 201,
  responseHeaders: { 'content-type': 'text/plain; charset=utf-8', 'x-route': 'post-exact' },
  responseBody: 'post-exact'
});

async function replay(method, path) {
  const response = await fetch(`${baseUrl}/api/replay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, path })
  });
  return { status: response.status, payload: await response.json() };
}

async function mockRequest(method, path) {
  const response = await fetch(`${baseUrl}/mock${path}`, { method });
  return {
    status: response.status,
    body: await response.text(),
    routeHeader: response.headers.get('x-route')
  };
}

test('replay and mock use the same exact, parameter, and wildcard priority', async () => {
  const cases = [
    { path: '/users/me', body: 'exact', routeHeader: 'exact', status: 200 },
    { path: '/users/42', body: 'parameter', routeHeader: 'parameter', status: 202 },
    { path: '/users/42/profile', body: 'wildcard', routeHeader: 'wildcard', status: 200 }
  ];

  for (const testCase of cases) {
    const replayed = await replay('GET', testCase.path);
    const mocked = await mockRequest('GET', testCase.path);

    assert.equal(replayed.status, 200);
    assert.equal(replayed.payload.matched, true);
    assert.equal(replayed.payload.response.statusCode, testCase.status);
    assert.equal(replayed.payload.response.body, testCase.body);
    assert.equal(replayed.payload.response.headers['x-route'], testCase.routeHeader);
    assert.deepEqual(
      { status: mocked.status, body: mocked.body, routeHeader: mocked.routeHeader },
      { status: testCase.status, body: testCase.body, routeHeader: testCase.routeHeader }
    );
  }
});

test('keeps HTTP methods isolated', async () => {
  const getMock = await mockRequest('GET', '/users/me');
  const postMock = await mockRequest('POST', '/users/me');

  assert.equal(getMock.body, 'exact');
  assert.equal(postMock.status, 201);
  assert.equal(postMock.body, 'post-exact');
});

test('preserves unmatched 404 responses for replay and mock', async () => {
  const replayed = await replay('GET', '/missing');
  const mocked = await mockRequest('GET', '/missing');

  assert.equal(replayed.status, 404);
  assert.equal(replayed.payload.matched, false);
  assert.equal(mocked.status, 404);
});

test.after(async () => {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
});
