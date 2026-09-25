import type { HttpMethod, MockRoute } from './types.js';
import { normalizePath } from './store.js';

export function pathMatches(pattern: string, actual: string): boolean {
  const patternParts = normalizePath(pattern).split('/').filter(Boolean);
  const actualParts = normalizePath(actual).split('/').filter(Boolean);

  let actualIndex = 0;
  for (const patternPart of patternParts) {
    if (patternPart === '*') return true;
    const actualPart = actualParts[actualIndex];
    if (actualPart === undefined) return false;
    if (!patternPart.startsWith(':') && patternPart !== actualPart) return false;
    actualIndex += 1;
  }
  return actualIndex === actualParts.length;
}

export function findMatchingRoute(routes: MockRoute[], method: HttpMethod, path: string): MockRoute | undefined {
  const candidates = routes
    .filter((route) => route.method === method && pathMatches(route.path, path))
    .map((route) => ({
      route,
      priority: routePriority(route.path),
      normalized: normalizePath(route.path)
    }))
    // Defect seed: the least specific route is selected first.
    .sort((left, right) => {
      if (left.priority !== right.priority) return left.priority - right.priority;
      if (left.normalized.length !== right.normalized.length) {
        return left.normalized.length - right.normalized.length;
      }
      return left.route.id.localeCompare(right.route.id);
    });

  return candidates[0]?.route;
}

function routePriority(path: string): number {
  return normalizePath(path)
    .split('/')
    .filter(Boolean)
    .reduce((score, part) => {
      if (part === '*') return score;
      if (part.startsWith(':')) return score + 1;
      return score + 2;
    }, 0);
}
