import { describe, expect, it } from 'vitest';
import { audit } from './audit';
import { enabledTransitions, fire, isAccepting, isEnabled, isForbidden } from './engine';
import { EXAMPLES } from './examples';
import { Model } from './types';

const BIG = 1_000_000;

function example(id: string): Model {
  return EXAMPLES.find((e) => e.id === id)!.model;
}

describe('触发语义', () => {
  const m: Model = {
    name: 't',
    places: [
      { name: 'a', capacity: 2, initial: 1, accept: null },
      { name: 'b', capacity: 1, initial: 0, accept: null },
    ],
    transitions: [
      { name: 'move', pre: [1, 0], post: [0, 1] },
      { name: 'fill', pre: [0, 0], post: [1, 0] },
    ],
    forbidden: [],
  };

  it('令牌充足且不超容量时可用', () => {
    expect(isEnabled(m, [1, 0], 0)).toBe(true);
    expect(isEnabled(m, [0, 0], 0)).toBe(false);
  });

  it('结果超容量时不可用', () => {
    // fill 使 a +1；a 容量 2，故 a=2 时不可用
    expect(isEnabled(m, [1, 0], 1)).toBe(true);
    expect(isEnabled(m, [2, 0], 1)).toBe(false);
  });

  it('原子触发同时扣前置、加后置', () => {
    expect(fire(m, [1, 0], 0)).toEqual([0, 1]);
    expect(enabledTransitions(m, [1, 0])).toEqual([0, 1]);
  });

  it('自环变迁要求令牌充足且净结果不超容量', () => {
    const loop: Model = {
      name: 'l',
      places: [{ name: 'p', capacity: 3, initial: 2, accept: null }],
      transitions: [{ name: 'spin', pre: [2], post: [2] }],
      forbidden: [],
    };
    expect(isEnabled(loop, [2], 0)).toBe(true);
    expect(isEnabled(loop, [1], 0)).toBe(false);
    expect(fire(loop, [2], 0)).toEqual([2]);
  });
});

describe('验收与禁态判定', () => {
  it('验收值 null 的库所不参与判定', () => {
    const m: Model = {
      name: 'a',
      places: [
        { name: 'p0', capacity: 1, initial: 0, accept: null },
        { name: 'p1', capacity: 1, initial: 1, accept: 1 },
      ],
      transitions: [{ name: 't', pre: [0, 0], post: [1, 0] }],
      forbidden: [],
    };
    expect(isAccepting(m, [0, 1])).toBe(true);
    expect(isAccepting(m, [1, 1])).toBe(true);
    expect(isAccepting(m, [0, 0])).toBe(false);
  });

  it('全部验收值为 null 时视为永不验收', () => {
    const m: Model = {
      name: 'a',
      places: [
        { name: 'p0', capacity: 1, initial: 0, accept: null },
        { name: 'p1', capacity: 1, initial: 0, accept: null },
      ],
      transitions: [{ name: 't', pre: [0, 0], post: [1, 0] }],
      forbidden: [],
    };
    expect(isAccepting(m, [0, 0])).toBe(false);
  });

  it('禁态规则间取析取、规则内取合取', () => {
    const m: Model = {
      name: 'f',
      places: [
        { name: 'p0', capacity: 3, initial: 0, accept: null },
        { name: 'p1', capacity: 3, initial: 0, accept: null },
      ],
      transitions: [{ name: 't', pre: [0, 0], post: [1, 0] }],
      forbidden: [
        [
          { place: 0, op: '>=', value: 2 },
          { place: 1, op: '=', value: 0 },
        ],
        [{ place: 1, op: '=', value: 3 }],
      ],
    };
    expect(isForbidden(m, [2, 0])).toBe(true);
    expect(isForbidden(m, [2, 1])).toBe(false);
    expect(isForbidden(m, [0, 3])).toBe(true);
    expect(isForbidden(m, [1, 1])).toBe(false);
  });
});

describe('审计：内置样例', () => {
  it('双原料顺序配液 → 通过', () => {
    const r = audit(example('pass'), BIG);
    expect(r).toEqual({ kind: 'pass', states: 5, edges: 5, depth: 3 });
  });

  it('双阀并发溢流 → 最短且字典序最小禁态轨迹 [0,1]', () => {
    const r = audit(example('forbidden'), BIG);
    expect(r.kind).toBe('counterexample');
    if (r.kind !== 'counterexample') return;
    expect(r.reason).toBe('forbidden');
    expect(r.steps.map((s) => s.transition)).toEqual([0, 1]);
    expect(r.steps[1].after).toEqual([0, 0, 2]);
  });

  it('缺料死锁 → 非验收死锁，轨迹 [0]', () => {
    const r = audit(example('deadlock'), BIG);
    expect(r.kind).toBe('counterexample');
    if (r.kind !== 'counterexample') return;
    expect(r.reason).toBe('deadlock');
    expect(r.steps.map((s) => s.transition)).toEqual([0]);
  });

  it('冲洗循环 → 套索：空前缀 + 循环 [0,1]', () => {
    const r = audit(example('lasso'), BIG);
    expect(r.kind).toBe('lasso');
    if (r.kind !== 'lasso') return;
    expect(r.prefix).toEqual([]);
    expect(r.cycle.map((s) => s.transition)).toEqual([0, 1]);
    // 循环闭合：末态等于循环起点
    expect(r.cycle[r.cycle.length - 1].after).toEqual(r.cycle[0].before);
  });
});

describe('审计：反例最优性', () => {
  it('等长反例取字典序最小序列', () => {
    // 禁态需 p2>=1 且 p3>=1；[0,1] 与 [1,0] 均可达，应取 [0,1]
    const m: Model = {
      name: 'lex',
      places: [
        { name: 'p0', capacity: 1, initial: 1, accept: null },
        { name: 'p1', capacity: 1, initial: 1, accept: null },
        { name: 'p2', capacity: 1, initial: 0, accept: null },
        { name: 'p3', capacity: 1, initial: 0, accept: null },
      ],
      transitions: [
        { name: 't0', pre: [1, 0, 0, 0], post: [0, 0, 1, 0] },
        { name: 't1', pre: [0, 1, 0, 0], post: [0, 0, 0, 1] },
      ],
      forbidden: [
        [
          { place: 2, op: '>=', value: 1 },
          { place: 3, op: '>=', value: 1 },
        ],
      ],
    };
    const r = audit(m, BIG);
    expect(r.kind).toBe('counterexample');
    if (r.kind !== 'counterexample') return;
    expect(r.steps.map((s) => s.transition)).toEqual([0, 1]);
  });

  it('初始状态即禁态时轨迹为空', () => {
    const m: Model = {
      name: 'init-bad',
      places: [
        { name: 'p0', capacity: 1, initial: 1, accept: null },
        { name: 'p1', capacity: 1, initial: 0, accept: null },
      ],
      transitions: [{ name: 't', pre: [1, 0], post: [0, 1] }],
      forbidden: [[{ place: 0, op: '=', value: 1 }]],
    };
    const r = audit(m, BIG);
    expect(r).toMatchObject({ kind: 'counterexample', reason: 'forbidden', steps: [] });
  });

  it('初始状态即验收时直接通过', () => {
    const m: Model = {
      name: 'init-ok',
      places: [
        { name: 'p0', capacity: 1, initial: 1, accept: 1 },
        { name: 'p1', capacity: 1, initial: 0, accept: 0 },
      ],
      transitions: [{ name: 't', pre: [1, 0], post: [0, 1] }],
      forbidden: [],
    };
    expect(audit(m, BIG)).toEqual({ kind: 'pass', states: 1, edges: 0, depth: 0 });
  });

  it('初始状态即非验收死锁时轨迹为空', () => {
    const m: Model = {
      name: 'init-dead',
      places: [
        { name: 'p0', capacity: 1, initial: 0, accept: 1 },
        { name: 'p1', capacity: 1, initial: 0, accept: null },
      ],
      transitions: [{ name: 't', pre: [1, 0], post: [0, 1] }],
      forbidden: [],
    };
    const r = audit(m, BIG);
    expect(r).toMatchObject({ kind: 'counterexample', reason: 'deadlock', steps: [] });
  });

  it('到达验收即截断：验收态之后的禁态不计', () => {
    const m: Model = {
      name: 'cut',
      places: [
        { name: 'p0', capacity: 1, initial: 1, accept: 0 },
        { name: 'p1', capacity: 1, initial: 0, accept: 1 },
        { name: 'p2', capacity: 1, initial: 0, accept: 0 },
      ],
      transitions: [
        { name: 't0', pre: [1, 0, 0], post: [0, 1, 0] },
        { name: 't1', pre: [0, 1, 0], post: [0, 0, 1] },
      ],
      forbidden: [[{ place: 2, op: '=', value: 1 }]],
    };
    expect(audit(m, BIG).kind).toBe('pass');
  });
});

describe('审计：套索最优性', () => {
  it('链入环：前缀 [0]，循环 [1,2]', () => {
    const m: Model = {
      name: 'chain-loop',
      places: [
        { name: 'p0', capacity: 1, initial: 1, accept: null },
        { name: 'p1', capacity: 1, initial: 0, accept: null },
        { name: 'p2', capacity: 1, initial: 0, accept: null },
      ],
      transitions: [
        { name: 't0', pre: [1, 0, 0], post: [0, 1, 0] },
        { name: 't1', pre: [0, 1, 0], post: [0, 0, 1] },
        { name: 't2', pre: [0, 0, 1], post: [0, 1, 0] },
      ],
      forbidden: [],
    };
    const r = audit(m, BIG);
    expect(r.kind).toBe('lasso');
    if (r.kind !== 'lasso') return;
    expect(r.prefix.map((s) => s.transition)).toEqual([0]);
    expect(r.cycle.map((s) => s.transition)).toEqual([1, 2]);
  });

  it('自环是最短循环', () => {
    const m: Model = {
      name: 'self-loop',
      places: [
        { name: 'p0', capacity: 1, initial: 1, accept: null },
        { name: 'p1', capacity: 3, initial: 0, accept: null },
      ],
      transitions: [{ name: 'spin', pre: [1, 0], post: [1, 0] }],
      forbidden: [],
    };
    const r = audit(m, BIG);
    expect(r.kind).toBe('lasso');
    if (r.kind !== 'lasso') return;
    expect(r.prefix).toEqual([]);
    expect(r.cycle.map((s) => s.transition)).toEqual([0]);
  });

  it('状态数超限返回 inconclusive', () => {
    // 无容量约束语义下状态爆炸；这里用小上限触发截断
    const r = audit(example('pass'), 3);
    expect(r.kind).toBe('inconclusive');
  });
});
