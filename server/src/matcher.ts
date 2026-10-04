import type { HttpMethod, MockRoute } from './types.js';
import { normalizePath } from './store.js';

// 单个路径段的特异性：字面量 > :参数 > *通配
const LITERAL = 2;
const PARAM = 1;
const WILDCARD = 0;
// 缺失段（更短的模式）比任何实际段都不具体
const MISSING = -1;

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
    // HTTP 方法隔离：只有方法完全相同的路由才参与匹配
    .filter((route) => route.method === method && pathMatches(route.path, path))
    .map((route) => ({ route, specificity: routeSpecificity(route.path) }));

  candidates.sort((left, right) => {
    const specificityOrder = compareSpecificity(left.specificity, right.specificity);
    if (specificityOrder !== 0) return specificityOrder;
    // 同形路由（如两个完全相同的模板）做与注册顺序无关的稳定裁决
    if (left.route.id === right.route.id) return 0;
    return left.route.id < right.route.id ? -1 : 1;
  });

  return candidates[0]?.route;
}

type SegmentRank = typeof LITERAL | typeof PARAM | typeof WILDCARD;

function routeSpecificity(path: string): SegmentRank[] {
  return normalizePath(path)
    .split('/')
    .filter(Boolean)
    .map((part): SegmentRank => {
      if (part === '*') return WILDCARD;
      if (part.startsWith(':')) return PARAM;
      return LITERAL;
    });
}

// 逐段比较，特异性更高的排前面（返回负数）。
// 不使用各段分数之和：求和会让不同位置的字面量/参数互相抵消，
// 产生依赖创建顺序的错误优先级。
function compareSpecificity(left: SegmentRank[], right: SegmentRank[]): number {
  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftRank = left[index] ?? MISSING;
    const rightRank = right[index] ?? MISSING;
    if (leftRank !== rightRank) return rightRank - leftRank;
  }
  return 0;
}
