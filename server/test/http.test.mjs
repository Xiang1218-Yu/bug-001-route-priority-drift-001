import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.PORT = '4123';
const { server } = await import('../dist/index.js');

const baseUrl = `http://localhost:${process.env.PORT}`;

async function createMock(input) {
  const response = await fetch(`${baseUrl}/api/mocks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  assert.equal(response.status, 201);
  const payload = await response.json();
  return payload.data;
}

async function replay(method, path) {
  const response = await fetch(`${baseUrl}/api/replay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, path })
  });
  return { status: response.status, payload: await response.json() };
}

before(async () => {
  // 宽 → 窄 的创建顺序：验证优先级不受创建顺序影响
  await createMock({
    name: '用户通配',
    method: 'GET',
    path: '/users/*',
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    responseBody: 'wildcard-body'
  });
  await createMock({
    name: '当前用户',
    method: 'GET',
    path: '/users/me',
    statusCode: 200,
    responseHeaders: { 'content-type': 'application/json' },
    responseBody: 'exact-body'
  });
  await createMock({
    name: '用户参数',
    method: 'GET',
    path: '/users/:id',
    statusCode: 202,
    responseHeaders: { 'content-type': 'application/json', 'x-mock': 'param' },
    responseBody: 'param-body'
  });
});

after(() => {
  server.close();
});

test('GET /mock/users/me hits the exact route', async () => {
  const response = await fetch(`${baseUrl}/mock/users/me`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'exact-body');
});

test('GET /mock/users/42 hits the parameter route', async () => {
  const response = await fetch(`${baseUrl}/mock/users/42`);
  assert.equal(response.status, 202);
  assert.equal(response.headers.get('x-mock'), 'param');
  assert.equal(await response.text(), 'param-body');
});

test('GET /mock/users/42/profile falls back to the wildcard route', async () => {
  const response = await fetch(`${baseUrl}/mock/users/42/profile`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'wildcard-body');
});

test('/api/replay and /mock return consistent results', async () => {
  const replayed = await replay('GET', '/users/me');
  assert.equal(replayed.status, 200);
  assert.equal(replayed.payload.matched, true);
  assert.equal(replayed.payload.response.statusCode, 200);
  assert.equal(replayed.payload.response.body, 'exact-body');

  const mockResponse = await fetch(`${baseUrl}/mock/users/me`);
  assert.equal(mockResponse.status, replayed.payload.response.statusCode);
  assert.equal(await mockResponse.text(), replayed.payload.response.body);

  for (const [key, value] of Object.entries(replayed.payload.response.headers)) {
    assert.equal(mockResponse.headers.get(key), value);
  }

  const replayedParam = await replay('GET', '/users/42');
  const mockParam = await fetch(`${baseUrl}/mock/users/42`);
  assert.equal(replayedParam.payload.route.path, '/users/:id');
  assert.equal(mockParam.status, replayedParam.payload.response.statusCode);
  assert.equal(await mockParam.text(), replayedParam.payload.response.body);
});

test('keeps HTTP method isolation', async () => {
  const postReplay = await replay('POST', '/users/me');
  assert.equal(postReplay.status, 404);
  assert.equal(postReplay.payload.matched, false);

  const postMock = await fetch(`${baseUrl}/mock/users/me`, { method: 'POST' });
  assert.equal(postMock.status, 404);
});

test('preserves the original 404 behavior', async () => {
  const missingReplay = await replay('GET', '/nope/does/not/exist');
  assert.equal(missingReplay.status, 404);
  assert.equal(missingReplay.payload.matched, false);

  const missingMock = await fetch(`${baseUrl}/mock/nope/does/not/exist`);
  assert.equal(missingMock.status, 404);

  const missingApi = await fetch(`${baseUrl}/api/unknown-endpoint`);
  assert.equal(missingApi.status, 404);

  const outsideMock = await fetch(`${baseUrl}/some/root/path`);
  assert.equal(outsideMock.status, 404);
});
