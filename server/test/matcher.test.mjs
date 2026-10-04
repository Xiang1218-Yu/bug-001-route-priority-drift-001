import test from 'node:test';
import assert from 'node:assert/strict';
import { findMatchingRoute, pathMatches } from '../dist/matcher.js';

function route(id, method, path, extra = {}) {
  return {
    id,
    name: id,
    method,
    path,
    statusCode: 200,
    responseHeaders: {},
    responseBody: id,
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra
  };
}

const baseRoutes = [
  route('wildcard', 'GET', '/users/*'),
  route('param', 'GET', '/users/:id'),
  route('exact', 'GET', '/users/me')
];

test('pathMatches keeps exact/param/wildcard semantics', () => {
  assert.equal(pathMatches('/users/:id', '/users/42'), true);
  assert.equal(pathMatches('/users/:id', '/users/42/profile'), false);
  assert.equal(pathMatches('/users/*', '/users/me'), true);
  assert.equal(pathMatches('/assets/*', '/assets/js/app.js'), true);
});

test('prefers exact path over parameter and wildcard paths', () => {
  assert.equal(findMatchingRoute(baseRoutes, 'GET', '/users/me')?.id, 'exact');
});

test('prefers parameter path over wildcard path', () => {
  assert.equal(findMatchingRoute(baseRoutes, 'GET', '/users/42')?.id, 'param');
});

test('falls back to wildcard for deeper paths', () => {
  assert.equal(findMatchingRoute(baseRoutes, 'GET', '/users/42/profile')?.id, 'wildcard');
});

test('priority does not depend on route creation order', () => {
  for (const shift of [1, 2]) {
    const reordered = [...baseRoutes.slice(shift), ...baseRoutes.slice(0, shift)];
    assert.equal(findMatchingRoute(reordered, 'GET', '/users/me')?.id, 'exact');
    assert.equal(findMatchingRoute(reordered, 'GET', '/users/42')?.id, 'param');
    assert.equal(findMatchingRoute(reordered, 'GET', '/users/42/profile')?.id, 'wildcard');
  }
});

test('identical template routes resolve deterministically regardless of order', () => {
  const a = route('dup-a', 'GET', '/things/:id');
  const b = route('dup-b', 'GET', '/things/:id');
  const first = findMatchingRoute([a, b], 'GET', '/things/7');
  const second = findMatchingRoute([b, a], 'GET', '/things/7');
  assert.equal(first?.id, second?.id);
  assert.equal(first?.id, 'dup-a');
});

test('literal segments outrank parameters in the same position', () => {
  const routes = [
    route('p1', 'GET', '/orgs/:org/users/:id'),
    route('p2', 'GET', '/orgs/acme/users/:id')
  ];
  assert.equal(findMatchingRoute(routes, 'GET', '/orgs/acme/users/3')?.id, 'p2');
  assert.equal(findMatchingRoute([...routes].reverse(), 'GET', '/orgs/acme/users/3')?.id, 'p2');
  assert.equal(findMatchingRoute(routes, 'GET', '/orgs/other/users/3')?.id, 'p1');
});

test('respects HTTP method isolation', () => {
  assert.equal(findMatchingRoute(baseRoutes, 'POST', '/users/me'), undefined);
  const postExact = route('post-exact', 'POST', '/users/me');
  assert.equal(findMatchingRoute([...baseRoutes, postExact], 'POST', '/users/me')?.id, 'post-exact');
  assert.equal(findMatchingRoute([...baseRoutes, postExact], 'GET', '/users/me')?.id, 'exact');
});

test('returns undefined when nothing matches', () => {
  assert.equal(findMatchingRoute(baseRoutes, 'GET', '/orders/1'), undefined);
  assert.equal(findMatchingRoute(baseRoutes, 'GET', '/'), undefined);
});
