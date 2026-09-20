import {
  COND_OPS,
  CondOp,
  MAX_ARC_WEIGHT,
  MAX_CAPACITY,
  MAX_PLACES,
  MAX_TRANSITIONS,
  MIN_PLACES,
  MIN_TRANSITIONS,
  Model,
} from './types';

export type Validation = { ok: true; model: Model } | { ok: false; errors: string[] };

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * 校验并规范化模型。所有约束失败时返回中文错误列表；
 * 成功时补全缺省名称并返回规范模型。
 */
export function validateModel(raw: unknown): Validation {
  const errors: string[] = [];
  const root = asRecord(raw);
  if (!root) return { ok: false, errors: ['模型必须是 JSON 对象'] };

  const name = typeof root.name === 'string' && root.name.trim() ? root.name.trim() : '未命名模型';

  // ---- 库所 ----
  if (!Array.isArray(root.places)) return { ok: false, errors: ['缺少 places 数组'] };
  const rawPlaces = root.places as unknown[];
  if (rawPlaces.length < MIN_PLACES || rawPlaces.length > MAX_PLACES) {
    errors.push(`库所数量须为 ${MIN_PLACES}..${MAX_PLACES}，当前为 ${rawPlaces.length}`);
  }
  const places: Model['places'] = [];
  rawPlaces.forEach((rp, i) => {
    const rec = asRecord(rp);
    if (!rec) {
      errors.push(`库所 #${i} 必须是对象`);
      return;
    }
    const pname =
      typeof rec.name === 'string' && rec.name.trim() ? rec.name.trim() : `P${i}`;
    const capacity = rec.capacity;
    if (!isInt(capacity) || capacity < 0 || capacity > MAX_CAPACITY) {
      errors.push(`库所 ${pname} 的容量须为 0..${MAX_CAPACITY} 的整数`);
      return;
    }
    const initial = rec.initial;
    if (!isInt(initial) || initial < 0 || initial > capacity) {
      errors.push(`库所 ${pname} 的初始令牌须为 0..${capacity} 的整数`);
      return;
    }
    const accept = rec.accept === null || rec.accept === undefined ? null : rec.accept;
    if (accept !== null && (!isInt(accept) || accept < 0 || accept > capacity)) {
      errors.push(`库所 ${pname} 的验收值须为 null（任意）或 0..${capacity} 的整数`);
      return;
    }
    places.push({ name: pname, capacity, initial, accept });
  });
  const placeCount = rawPlaces.length;

  // ---- 变迁 ----
  if (!Array.isArray(root.transitions)) return { ok: false, errors: ['缺少 transitions 数组'] };
  const rawTransitions = root.transitions as unknown[];
  if (rawTransitions.length < MIN_TRANSITIONS || rawTransitions.length > MAX_TRANSITIONS) {
    errors.push(`变迁数量须为 ${MIN_TRANSITIONS}..${MAX_TRANSITIONS}，当前为 ${rawTransitions.length}`);
  }
  const transitions: Model['transitions'] = [];
  rawTransitions.forEach((rt, i) => {
    const rec = asRecord(rt);
    if (!rec) {
      errors.push(`变迁 #${i} 必须是对象`);
      return;
    }
    const tname =
      typeof rec.name === 'string' && rec.name.trim() ? rec.name.trim() : `T${i}`;
    const arcs = (key: 'pre' | 'post'): number[] | null => {
      const arr = rec[key];
      if (!Array.isArray(arr) || arr.length !== placeCount) {
        errors.push(`变迁 ${tname} 的 ${key} 弧数组长度须等于库所数 ${placeCount}`);
        return null;
      }
      for (const w of arr) {
        if (!isInt(w) || w < 0 || w > MAX_ARC_WEIGHT) {
          errors.push(`变迁 ${tname} 的 ${key} 弧权值须为 0..${MAX_ARC_WEIGHT} 的整数`);
          return null;
        }
      }
      return arr as number[];
    };
    const pre = arcs('pre');
    const post = arcs('post');
    if (pre && post) transitions.push({ name: tname, pre, post });
  });

  // ---- 禁态 ----
  const forbidden: Model['forbidden'] = [];
  if (root.forbidden !== undefined) {
    if (!Array.isArray(root.forbidden)) {
      errors.push('forbidden 必须是规则数组（任一规则命中即禁态）');
    } else {
      (root.forbidden as unknown[]).forEach((rr, ri) => {
        if (!Array.isArray(rr) || rr.length === 0) {
          errors.push(`禁态规则 #${ri} 必须是非空条件数组`);
          return;
        }
        const rule: { place: number; op: CondOp; value: number }[] = [];
        let valid = true;
        (rr as unknown[]).forEach((rc, ci) => {
          const rec = asRecord(rc);
          if (!rec) {
            errors.push(`禁态规则 #${ri} 条件 #${ci} 必须是对象`);
            valid = false;
            return;
          }
          const place = rec.place;
          const op = rec.op;
          const value = rec.value;
          if (!isInt(place) || place < 0 || place >= placeCount) {
            errors.push(`禁态规则 #${ri} 条件 #${ci} 的库所下标越界`);
            valid = false;
            return;
          }
          if (typeof op !== 'string' || !COND_OPS.includes(op as CondOp)) {
            errors.push(`禁态规则 #${ri} 条件 #${ci} 的比较符须为 ${COND_OPS.join('/')}`);
            valid = false;
            return;
          }
          if (!isInt(value) || value < 0 || value > MAX_ARC_WEIGHT) {
            errors.push(`禁态规则 #${ri} 条件 #${ci} 的比较值须为 0..${MAX_ARC_WEIGHT} 的整数`);
            valid = false;
            return;
          }
          rule.push({ place, op: op as CondOp, value });
        });
        if (valid) forbidden.push(rule);
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, model: { name, places, transitions, forbidden } };
}

/** 解析 JSON 文本并校验 */
export function parseModel(text: string): Validation {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`JSON 解析失败：${(e as Error).message}`] };
  }
  return validateModel(raw);
}
