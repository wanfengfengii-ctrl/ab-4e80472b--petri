import { enabledTransitions, fire, isAccepting, isForbidden, markingKey } from './engine';
import { AuditResult, Model, Step } from './types';

/**
 * 完整探索可达状态空间（在验收标记处截断，因为到达验收即结束）：
 *
 * 1. 按变迁编号升序做广度优先探索。首个被发现的禁态或非验收死锁，
 *    其轨迹即为"步数最短、变迁编号序列字典序最小"的反例
 *    （BFS 按层推进且同层按字典序发现，首次发现路径即字典序最小最短路）。
 * 2. 若不存在反例，则在截断后的可达图上检测环路；存在环路即存在无限执行。
 *    套索见证取：前缀最短（环上状态的最小深度）、循环最短（过该状态的最短回环）、
 *    并以"前缀+循环"的变迁编号序列字典序决胜。
 * 3. 探索状态数超过 maxStates 时返回 inconclusive，避免浏览器卡死。
 */
export function audit(model: Model, maxStates: number): AuditResult {
  const markings: number[][] = [];
  const parents: ({ prev: number; t: number } | null)[] = [];
  const depths: number[] = [];
  /** 截断图的邻接表（仅非验收、非禁态状态有出边），按变迁编号升序 */
  const adj: { t: number; to: number }[][] = [];
  const ids = new Map<string, number>();
  let edges = 0;

  const addState = (m: number[], parent: { prev: number; t: number } | null): number => {
    const id = markings.length;
    ids.set(markingKey(m), id);
    markings.push(m);
    parents.push(parent);
    depths.push(parent === null ? 0 : depths[parent.prev] + 1);
    adj.push([]);
    return id;
  };

  const traceTo = (id: number): Step[] => {
    const steps: Step[] = [];
    let cur = id;
    for (;;) {
      const p = parents[cur];
      if (!p) break;
      steps.push({ transition: p.t, before: markings[p.prev], after: markings[cur] });
      cur = p.prev;
    }
    return steps.reverse();
  };

  // ---- 初始标识 ----
  const start = model.places.map((p) => p.initial);
  if (isForbidden(model, start)) {
    return { kind: 'counterexample', reason: 'forbidden', steps: [], states: 1 };
  }
  addState(start, null);
  if (isAccepting(model, start)) {
    return { kind: 'pass', states: 1, edges: 0, depth: 0 };
  }
  // 初始状态自身即可能是非验收死锁（BFS 循环只检查新发现的状态）
  if (enabledTransitions(model, start).length === 0) {
    return { kind: 'counterexample', reason: 'deadlock', steps: [], states: 1 };
  }

  // ---- BFS（head 指针代替 shift，避免 O(n^2)）----
  const queue: number[] = [0];
  let head = 0;
  let maxDepth = 0;
  let truncated = false;

  while (head < queue.length) {
    const id = queue[head++];
    const m = markings[id];
    const enabled = enabledTransitions(model, m);
    for (const t of enabled) {
      const next = fire(model, m, t);
      const key = markingKey(next);
      let to = ids.get(key);
      if (to === undefined) {
        if (markings.length >= maxStates) {
          truncated = true;
          break;
        }
        to = addState(next, { prev: id, t });
        maxDepth = Math.max(maxDepth, depths[to]);
        // 新状态分类：禁态 > 验收（终止）> 死锁 > 继续扩展
        if (isForbidden(model, next)) {
          return { kind: 'counterexample', reason: 'forbidden', steps: traceTo(to), states: markings.length };
        }
        if (isAccepting(model, next)) {
          // 到达验收即结束：不扩展后继
        } else if (enabledTransitions(model, next).length === 0) {
          return { kind: 'counterexample', reason: 'deadlock', steps: traceTo(to), states: markings.length };
        } else {
          queue.push(to);
        }
      }
      adj[id].push({ t, to });
      edges++;
    }
    if (truncated) break;
  }

  if (truncated) {
    return {
      kind: 'inconclusive',
      reason: `可达状态数超过上限 ${maxStates}，无法完成完整探索（可在审计面板调高上限）`,
      states: markings.length,
    };
  }

  // ---- 环路检测（迭代式 Tarjan SCC）----
  const onCycle = statesOnCycles(adj);
  let prefixDepth = Infinity;
  for (let i = 0; i < onCycle.length; i++) {
    if (onCycle[i] && depths[i] < prefixDepth) prefixDepth = depths[i];
  }
  if (prefixDepth === Infinity) {
    return { kind: 'pass', states: markings.length, edges, depth: maxDepth };
  }

  // ---- 构造最优套索：前缀最短 → 循环最短 → 序列字典序最小 ----
  let best: { q: number; cycleSeq: number[]; fullSeq: number[] } | null = null;
  for (let q = 0; q < markings.length; q++) {
    if (!onCycle[q] || depths[q] !== prefixDepth) continue;
    const cycleSeq = shortestCycle(adj, q);
    if (!cycleSeq) continue;
    if (best && cycleSeq.length > best.cycleSeq.length) continue;
    const prefixSeq = seqTo(parents, q);
    const fullSeq = [...prefixSeq, ...cycleSeq];
    if (
      !best ||
      cycleSeq.length < best.cycleSeq.length ||
      lexCompare(fullSeq, best.fullSeq) < 0
    ) {
      best = { q, cycleSeq, fullSeq };
    }
  }

  // onCycle 非空时必然存在 best
  const { q, cycleSeq } = best!;
  return {
    kind: 'lasso',
    prefix: traceTo(q),
    cycle: simulate(model, markings[q], cycleSeq),
    states: markings.length,
    edges,
  };
}

/** 沿父指针收集从初始状态到 id 的变迁编号序列 */
function seqTo(parents: ({ prev: number; t: number } | null)[], id: number): number[] {
  const seq: number[] = [];
  let cur = id;
  for (;;) {
    const p = parents[cur];
    if (!p) break;
    seq.push(p.t);
    cur = p.prev;
  }
  return seq.reverse();
}

/** 从标识 m 出发依次触发 seq，生成带令牌变化的步序列 */
function simulate(model: Model, start: number[], seq: number[]): Step[] {
  const steps: Step[] = [];
  let cur = start;
  for (const t of seq) {
    const next = fire(model, cur, t);
    steps.push({ transition: t, before: cur, after: next });
    cur = next;
  }
  return steps;
}

/** 字典序比较：负数表示 a 更小 */
function lexCompare(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

/** 迭代式 Tarjan：标记所有位于环上的状态（非平凡 SCC 或带自环） */
function statesOnCycles(adj: { t: number; to: number }[][]): boolean[] {
  const n = adj.length;
  const index = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const onStack = new Array<boolean>(n).fill(false);
  const onCycle = new Array<boolean>(n).fill(false);
  const stack: number[] = [];
  let counter = 0;

  for (let s = 0; s < n; s++) {
    if (index[s] !== -1) continue;
    index[s] = low[s] = counter++;
    stack.push(s);
    onStack[s] = true;
    const call: { v: number; child: number }[] = [{ v: s, child: 0 }];
    while (call.length > 0) {
      const top = call[call.length - 1];
      const v = top.v;
      if (top.child < adj[v].length) {
        const w = adj[v][top.child++].to;
        if (index[w] === -1) {
          index[w] = low[w] = counter++;
          stack.push(w);
          onStack[w] = true;
          call.push({ v: w, child: 0 });
        } else if (onStack[w]) {
          low[v] = Math.min(low[v], index[w]);
        }
      } else {
        call.pop();
        if (call.length > 0) {
          const p = call[call.length - 1].v;
          low[p] = Math.min(low[p], low[v]);
        }
        if (low[v] === index[v]) {
          const scc: number[] = [];
          let w: number;
          do {
            w = stack.pop()!;
            onStack[w] = false;
            scc.push(w);
          } while (w !== v);
          if (scc.length > 1) {
            for (const x of scc) onCycle[x] = true;
          } else if (adj[scc[0]].some((e) => e.to === scc[0])) {
            onCycle[scc[0]] = true;
          }
        }
      }
    }
  }
  return onCycle;
}

/**
 * 状态 q 到自身的最短回环（长度 >= 1），返回变迁编号序列。
 * 对每个出边 (q --t--> q') 求 q' 到 q 的最短路；等长时按序列字典序取最小。
 */
function shortestCycle(adj: { t: number; to: number }[][], q: number): number[] | null {
  let best: number[] | null = null;
  for (const { t, to } of adj[q]) {
    let cand: number[] | null;
    if (to === q) {
      cand = [t];
    } else {
      const path = bfsPath(adj, to, q);
      cand = path ? [t, ...path] : null;
    }
    // adj[q] 按变迁编号升序，bfsPath 返回字典序最小最短路，
    // 因此等长时先发现者即字典序最小者，严格更短才替换。
    if (cand && (!best || cand.length < best.length)) best = cand;
  }
  return best;
}

/** 截断图上 from 到 to 的字典序最小最短变迁序列；不可达返回 null */
function bfsPath(adj: { t: number; to: number }[][], from: number, to: number): number[] | null {
  if (from === to) return [];
  const prev = new Map<number, { prev: number; t: number }>();
  const visited = new Set<number>([from]);
  const queue = [from];
  let head = 0;
  while (head < queue.length) {
    const v = queue[head++];
    for (const { t, to: w } of adj[v]) {
      if (visited.has(w)) continue;
      visited.add(w);
      prev.set(w, { prev: v, t });
      if (w === to) {
        const seq: number[] = [];
        let cur = to;
        while (cur !== from) {
          const p = prev.get(cur)!;
          seq.push(p.t);
          cur = p.prev;
        }
        return seq.reverse();
      }
      queue.push(w);
    }
  }
  return null;
}
