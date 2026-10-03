import test from 'node:test';
import assert from 'node:assert/strict';
import { MockStore } from '../dist/store.js';
import { findMatchingRoute, pathMatches } from '../dist/matcher.js';

test('matches exact and parameterized paths', () => {
  assert.equal(pathMatches('/users/:id', '/users/42'), true);
  assert.equal(pathMatches('/users/:id', '/users/42/profile'), false);
  assert.equal(pathMatches('/assets/*', '/assets/js/app.js'), true);
});

test('prefers exact, parameter, and wildcard routes in that order regardless of registration order', () => {
  const exact = {
    id: 'exact',
    method: 'GET',
    path: '/users/me',
    statusCode: 200,
    responseBody: 'exact'
  };
  const parameter = {
    id: 'parameter',
    method: 'GET',
    path: '/users/:id',
    statusCode: 200,
    responseBody: 'parameter'
  };
  const wildcard = {
    id: 'wildcard',
    method: 'GET',
    path: '/users/*',
    statusCode: 200,
    responseBody: 'wildcard'
  };

  assert.equal(findMatchingRoute([wildcard, parameter, exact], 'GET', '/users/me')?.id, 'exact');
  assert.equal(findMatchingRoute([exact, wildcard, parameter], 'GET', '/users/42')?.id, 'parameter');
  assert.equal(findMatchingRoute([parameter, exact, wildcard], 'GET', '/users/42/profile')?.id, 'wildcard');
});

test('does not let route order change equivalent-priority matches', () => {
  const first = { id: 'a', method: 'GET', path: '/users/:id', statusCode: 200 };
  const second = { id: 'b', method: 'GET', path: '/users/:id', statusCode: 200 };

  assert.equal(findMatchingRoute([second, first], 'GET', '/users/42')?.id, 'a');
  assert.equal(findMatchingRoute([first, second], 'GET', '/users/42')?.id, 'a');
});

test('keeps matching isolated by HTTP method', () => {
  const getRoute = { id: 'get', method: 'GET', path: '/users/:id', statusCode: 200 };
  const postRoute = { id: 'post', method: 'POST', path: '/users/:id', statusCode: 201 };

  assert.equal(findMatchingRoute([postRoute, getRoute], 'GET', '/users/42')?.id, 'get');
  assert.equal(findMatchingRoute([getRoute, postRoute], 'POST', '/users/42')?.id, 'post');
});

test('records a request as a mock route', () => {
  const store = new MockStore();
  const route = store.record({
    request: { method: 'POST', path: '/orders' },
    response: { statusCode: 201, body: '{"created":true}' }
  });
  assert.equal(route.method, 'POST');
  assert.equal(route.path, '/orders');
  assert.equal(route.statusCode, 201);
  assert.equal(store.get(route.id)?.responseBody, '{"created":true}');
});
