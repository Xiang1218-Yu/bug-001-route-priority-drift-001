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
    .sort((left, right) => comparePathSpecificity(left.path, right.path) || left.id.localeCompare(right.id));

  return candidates[0];
}

function comparePathSpecificity(leftPath: string, rightPath: string): number {
  const left = pathRanks(leftPath);
  const right = pathRanks(rightPath);

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    // 缺少的段排在通配段之前，使 /users/me 精确结束时优先于 /users/me/*。
    const leftRank = left[index] ?? -1;
    const rightRank = right[index] ?? -1;
    if (leftRank !== rightRank) return rightRank - leftRank;
  }

  return 0;
}

function pathRanks(path: string): number[] {
  return normalizePath(path)
    .split('/')
    .filter(Boolean)
    .map((part) => {
      if (part === '*') return 0;
      if (part.startsWith(':')) return 1;
      return 2;
    });
}
