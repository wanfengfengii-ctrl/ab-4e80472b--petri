import { CondOp, Model } from './types';

/** 判断变迁 t 在标识 m 下是否可用：令牌充足且触发后不超容量 */
export function isEnabled(model: Model, marking: number[], t: number): boolean {
  const tr = model.transitions[t];
  for (let p = 0; p < model.places.length; p++) {
    const pre = tr.pre[p] ?? 0;
    const post = tr.post[p] ?? 0;
    if (marking[p] < pre) return false;
    if (marking[p] - pre + post > model.places[p].capacity) return false;
  }
  return true;
}

/** 原子触发变迁，返回新标识（调用前须保证可用） */
export function fire(model: Model, marking: number[], t: number): number[] {
  const tr = model.transitions[t];
  const next = new Array<number>(model.places.length);
  for (let p = 0; p < model.places.length; p++) {
    next[p] = marking[p] - (tr.pre[p] ?? 0) + (tr.post[p] ?? 0);
  }
  return next;
}

/** 按变迁编号升序返回全部可用变迁 */
export function enabledTransitions(model: Model, marking: number[]): number[] {
  const out: number[] = [];
  for (let t = 0; t < model.transitions.length; t++) {
    if (isEnabled(model, marking, t)) out.push(t);
  }
  return out;
}

/**
 * 是否到达验收标记：所有指定了验收值的库所均精确匹配。
 * 约定：若全部库所验收值均为 null（未定义验收标记），则视为永不验收，
 * 否则"终止于验收"将退化为恒真，死锁与无限执行无从谈起。
 */
export function isAccepting(model: Model, marking: number[]): boolean {
  if (model.places.every((pl) => pl.accept === null)) return false;
  return model.places.every((pl, i) => pl.accept === null || pl.accept === marking[i]);
}

function cmp(a: number, op: CondOp, b: number): boolean {
  switch (op) {
    case '=':
      return a === b;
    case '!=':
      return a !== b;
    case '<=':
      return a <= b;
    case '>=':
      return a >= b;
    case '<':
      return a < b;
    case '>':
      return a > b;
  }
}

/** 是否进入禁态：任一规则的全部条件同时成立 */
export function isForbidden(model: Model, marking: number[]): boolean {
  return model.forbidden.some(
    (rule) => rule.length > 0 && rule.every((c) => cmp(marking[c.place], c.op, c.value)),
  );
}

/** 标识序列化键 */
export function markingKey(marking: number[]): string {
  return marking.join(',');
}
