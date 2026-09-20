/**
 * 随机化一致性测试：用独立实现交叉验证 audit 的结论。
 * - 反例：轨迹合法、终态类型吻合、长度等于独立 BFS 最短距离、序列等于字典序最小者；
 * - 套索：前缀+循环合法闭合、前缀长度等于环上状态最小深度、循环长度等于该深度最短回环；
 * - 通过：独立探索确认无禁态、无非验收死锁、无环。
 */
import { describe, expect, it } from 'vitest';
import { audit } from './audit';
import { enabledTransitions, fire, isAccepting, isForbidden } from './engine';
import { CondOp, Model } from './types';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OPS: CondOp[] = ['=', '!=', '<=', '>=', '<', '>'];

function randomModel(rng: () => number): Model {
  const P = 2 + Math.floor(rng() * 4); // 2..5
  const T = 1 + Math.floor(rng() * 5); // 1..5
  const places = Array.from({ length: P }, (_, i) => {
    const capacity = Math.floor(rng() * 4); // 0..3
    const initial = Math.floor(rng() * (capacity + 1));
    const accept = rng() < 0.5 ? null : Math.floor(rng() * (capacity + 1));
    return { name: `P${i}`, capacity, initial, accept };
  });
  const arc = () => (rng() < 0.55 ? 0 : 1 + Math.floor(rng() * 2)); // 0..2，偏稀疏
  const transitions = Array.from({ length: T }, (_, i) => ({
    name: `T${i}`,
    pre: Array.from({ length: P }, arc),
    post: Array.from({ length: P }, arc),
  }));
  const rules = rng() < 0.5 ? 0 : 1 + Math.floor(rng() * 2);
  const forbidden = Array.from({ length: rules }, () =>
    Array.from({ length: 1 + Math.floor(rng() * 2) }, () => ({
      place: Math.floor(rng() * P),
      op: OPS[Math.floor(rng() * OPS.length)],
      value: Math.floor(rng() * 4),
    })),
  );
  return { name: 'fuzz', places, transitions, forbidden };
}

/** 独立探索：与 audit.ts 不同的实现，返回截断图与状态分类 */
function explore(model: Model) {
  const key = (m: number[]) => m.join(',');
  const start = model.places.map((p) => p.initial);
  const markings: number[][] = [start];
  const ids = new Map([[key(start), 0]]);
  const adj: number[][] = [[]];
  const kindOf = (m: number[]): 'forbidden' | 'accepting' | 'normal' =>
    isForbidden(model, m) ? 'forbidden' : isAccepting(model, m) ? 'accepting' : 'normal';
  const kinds = [kindOf(start)];
  const queue = kinds[0] === 'normal' ? [0] : [];
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    for (const t of enabledTransitions(model, markings[id])) {
      const next = fire(model, markings[id], t);
      let to = ids.get(key(next));
      if (to === undefined) {
        to = markings.length;
        ids.set(key(next), to);
        markings.push(next);
        adj.push([]);
        kinds.push(kindOf(next));
        if (kinds[to] === 'normal') queue.push(to);
      }
      adj[id].push(to);
    }
  }
  const isBad = kinds.map((k, i) => k === 'forbidden' || (k === 'normal' && adj[i].length === 0));
  return { markings, adj, kinds, isBad };
}

/** 独立计算：到最近坏状态的字典序最小最短变迁序列（反向距离 + 贪心） */
function independentBadTrace(model: Model): number[] | null {
  const { markings, adj, isBad } = explore(model);
  const n = markings.length;
  const rd = new Array<number>(n).fill(Infinity);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (isBad[i]) {
      rd[i] = 0;
      queue.push(i);
    }
  }
  if (queue.length === 0) return null;
  // 反向 BFS
  const rev: number[][] = Array.from({ length: n }, () => []);
  adj.forEach((outs, v) => outs.forEach((w) => rev[w].push(v)));
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head];
    for (const u of rev[v]) {
      if (rd[u] === Infinity) {
        rd[u] = rd[v] + 1;
        queue.push(u);
      }
    }
  }
  if (rd[0] === Infinity) return null;
  // 贪心字典序最小
  const seq: number[] = [];
  let cur = 0;
  while (rd[cur] > 0) {
    const m = markings[cur];
    for (const t of enabledTransitions(model, m)) {
      const next = fire(model, m, t);
      const key = next.join(',');
      const to = markings.findIndex((x) => x.join(',') === key);
      if (rd[to] === rd[cur] - 1) {
        seq.push(t);
        cur = to;
        break;
      }
    }
  }
  return seq;
}

/** 独立计算：环上状态集合（小图直接逐点自可达判定） */
function cyclicStates(model: Model): { depths: number[]; onCycle: boolean[]; adj: number[][] } {
  const { adj } = explore(model);
  const n = adj.length;
  // 深度（BFS）
  const depths = new Array<number>(n).fill(Infinity);
  depths[0] = 0;
  const q = [0];
  for (let h = 0; h < q.length; h++) {
    for (const w of adj[q[h]]) {
      if (depths[w] === Infinity) {
        depths[w] = depths[q[h]] + 1;
        q.push(w);
      }
    }
  }
  const onCycle = new Array<boolean>(n).fill(false);
  for (let s = 0; s < n; s++) {
    // s 是否能回到 s（长度 >= 1）
    const seen = new Set<number>();
    const stack = [...adj[s]];
    while (stack.length) {
      const v = stack.pop()!;
      if (v === s) {
        onCycle[s] = true;
        break;
      }
      if (!seen.has(v)) {
        seen.add(v);
        stack.push(...adj[v]);
      }
    }
  }
  return { depths, onCycle, adj };
}

describe('随机模型一致性', () => {
  const SEEDS = 300;
  for (let seed = 1; seed <= SEEDS; seed++) {
    it(`种子 ${seed}`, () => {
      const model = randomModel(mulberry32(seed));
      const r = audit(model, 1_000_000);
      expect(r.kind).not.toBe('inconclusive');

      const badTrace = independentBadTrace(model);

      if (r.kind === 'counterexample') {
        // 独立实现确认存在坏状态，且轨迹长度、序列一致
        expect(badTrace).not.toBeNull();
        const seq = r.steps.map((s) => s.transition);
        expect(seq).toEqual(badTrace);
        // 轨迹逐步合法，且终态类型吻合
        let cur = model.places.map((p) => p.initial);
        for (const step of r.steps) {
          expect(step.before).toEqual(cur);
          expect(enabledTransitions(model, cur)).toContain(step.transition);
          cur = fire(model, cur, step.transition);
          expect(step.after).toEqual(cur);
        }
        if (r.reason === 'forbidden') expect(isForbidden(model, cur)).toBe(true);
        else {
          expect(isForbidden(model, cur)).toBe(false);
          expect(isAccepting(model, cur)).toBe(false);
          expect(enabledTransitions(model, cur)).toEqual([]);
        }
      } else if (r.kind === 'lasso') {
        // 不存在反例
        expect(badTrace).toBeNull();
        // 前缀 + 循环逐步合法，且循环闭合到循环起点
        let cur = model.places.map((p) => p.initial);
        for (const step of [...r.prefix, ...r.cycle]) {
          expect(step.before).toEqual(cur);
          expect(enabledTransitions(model, cur)).toContain(step.transition);
          cur = fire(model, cur, step.transition);
          expect(step.after).toEqual(cur);
        }
        const cycleStart =
          r.prefix.length === 0
            ? model.places.map((p) => p.initial)
            : r.prefix[r.prefix.length - 1].after;
        expect(cur).toEqual(cycleStart);
        // 前缀长度 = 环上状态最小深度；循环长度 = 该深度最短回环
        const { depths, onCycle, adj } = cyclicStates(model);
        const minDepth = Math.min(...depths.filter((_, i) => onCycle[i]));
        expect(r.prefix.length).toBe(minDepth);
        let minCycle = Infinity;
        for (let s = 0; s < adj.length; s++) {
          if (!onCycle[s] || depths[s] !== minDepth) continue;
          // s 到自身的最短回环：BFS
          const dist = new Map<number, number>();
          const qq: number[] = [];
          adj[s].forEach((w) => {
            if (w === s) minCycle = Math.min(minCycle, 1);
            else if (!dist.has(w)) {
              dist.set(w, 1);
              qq.push(w);
            }
          });
          for (let h = 0; h < qq.length; h++) {
            const v = qq[h];
            if (v === s) continue;
            for (const w of adj[v]) {
              if (w === s) minCycle = Math.min(minCycle, dist.get(v)! + 1);
              else if (!dist.has(w)) {
                dist.set(w, dist.get(v)! + 1);
                qq.push(w);
              }
            }
          }
        }
        expect(r.cycle.length).toBe(minCycle);
      } else if (r.kind === 'pass') {
        expect(badTrace).toBeNull();
        const { onCycle } = cyclicStates(model);
        expect(onCycle.some(Boolean)).toBe(false);
      }
    });
  }
});
