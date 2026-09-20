/**
 * 有界 Petri 网模型类型定义。
 *
 * 语义约定：
 * - 库所容量 0..3，初始令牌 0..容量。
 * - 变迁按前置/后置整数弧原子触发：仅当所有库所令牌充足（m >= pre）
 *   且触发后不超容量（m - pre + post <= capacity）时可用。
 * - 验收标记按库所给出精确值或 null（任意）；全部非 null 项匹配即到达验收，
 *   到达验收标记的执行立即结束（不再扩展后继）。
 * - 禁态条件为规则的析取（任一规则命中即禁态），规则内部为条件的合取。
 */

export interface PlaceSpec {
  name: string;
  /** 容量，0..3 */
  capacity: number;
  /** 初始令牌数，0..capacity */
  initial: number;
  /** 验收标记中该库所应有的令牌数；null 表示该库所不参与验收判定 */
  accept: number | null;
}

export interface TransitionSpec {
  name: string;
  /** 前置弧权值，长度 = 库所数 */
  pre: number[];
  /** 后置弧权值，长度 = 库所数 */
  post: number[];
}

export type CondOp = '=' | '!=' | '<=' | '>=' | '<' | '>';

export const COND_OPS: CondOp[] = ['=', '!=', '<=', '>=', '<', '>'];

export interface ForbiddenCond {
  /** 库所下标 */
  place: number;
  op: CondOp;
  value: number;
}

/** 一条禁态规则：内部条件取合取 */
export type ForbiddenRule = ForbiddenCond[];

export interface Model {
  name: string;
  places: PlaceSpec[];
  transitions: TransitionSpec[];
  /** 禁态规则集合：任一规则命中即视为禁态（规则间取析取） */
  forbidden: ForbiddenRule[];
}

export const MIN_PLACES = 2;
export const MAX_PLACES = 18;
export const MIN_TRANSITIONS = 1;
export const MAX_TRANSITIONS = 40;
export const MIN_CAPACITY = 0;
export const MAX_CAPACITY = 3;
export const MAX_ARC_WEIGHT = 9;

/** 审计结果 */
export interface Step {
  /** 变迁下标 */
  transition: number;
  /** 触发前标识 */
  before: number[];
  /** 触发后标识 */
  after: number[];
}

export type AuditResult =
  | {
      kind: 'pass';
      /** 已探索状态数 */
      states: number;
      /** 已探索边数 */
      edges: number;
      /** 最长执行长度 */
      depth: number;
    }
  | {
      kind: 'counterexample';
      reason: 'forbidden' | 'deadlock';
      /** 步数最短、变迁编号序列字典序最小的反例轨迹 */
      steps: Step[];
      states: number;
    }
  | {
      kind: 'lasso';
      /** 前缀最短 */
      prefix: Step[];
      /** 循环最短；前缀与循环均按变迁编号序列字典序决胜 */
      cycle: Step[];
      states: number;
      edges: number;
    }
  | {
      kind: 'inconclusive';
      reason: string;
      states: number;
    };
