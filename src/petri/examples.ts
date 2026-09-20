import { Model } from './types';

export interface Example {
  id: string;
  title: string;
  description: string;
  model: Model;
}

/** 双原料顺序配液：全部执行均终止于验收 */
const passModel: Model = {
  name: '双原料顺序配液',
  places: [
    { name: '原料A暂存', capacity: 1, initial: 1, accept: 0 },
    { name: '原料B暂存', capacity: 1, initial: 1, accept: 0 },
    { name: '混合罐', capacity: 2, initial: 0, accept: 0 },
    { name: '成品批次', capacity: 1, initial: 0, accept: 1 },
  ],
  transitions: [
    { name: '投料A', pre: [1, 0, 0, 0], post: [0, 0, 1, 0] },
    { name: '投料B', pre: [0, 1, 0, 0], post: [0, 0, 1, 0] },
    { name: '出料验收', pre: [0, 0, 2, 0], post: [0, 0, 0, 1] },
  ],
  forbidden: [[{ place: 3, op: '>=', value: 2 }]],
};

/** 双阀并发溢流：最短反例 [T0, T1] */
const forbiddenModel: Model = {
  name: '双阀并发溢流',
  places: [
    { name: '阀A就绪', capacity: 1, initial: 1, accept: 0 },
    { name: '阀B就绪', capacity: 1, initial: 1, accept: 0 },
    { name: '混合池', capacity: 2, initial: 0, accept: 0 },
  ],
  transitions: [
    { name: '开阀A', pre: [1, 0, 0], post: [0, 0, 1] },
    { name: '开阀B', pre: [0, 1, 0], post: [0, 0, 1] },
  ],
  forbidden: [[{ place: 2, op: '>=', value: 2 }]],
};

/** 缺料死锁：投料后因催化剂永远缺席而卡死在非验收状态 */
const deadlockModel: Model = {
  name: '缺料死锁',
  places: [
    { name: '原料就绪', capacity: 1, initial: 1, accept: 0 },
    { name: '等待催化剂', capacity: 1, initial: 0, accept: 0 },
    { name: '催化剂', capacity: 1, initial: 0, accept: 0 },
    { name: '完成', capacity: 1, initial: 0, accept: 1 },
  ],
  transitions: [
    { name: '投料', pre: [1, 0, 0, 0], post: [0, 1, 0, 0] },
    { name: '催化反应', pre: [0, 1, 1, 0], post: [0, 0, 0, 1] },
  ],
  forbidden: [],
};

/** 冲洗循环：存在可永久循环的操作分支，套索前缀为空、循环为 [T0, T1] */
const lassoModel: Model = {
  name: '冲洗循环',
  places: [
    { name: '待机', capacity: 1, initial: 1, accept: 0 },
    { name: '冲洗中', capacity: 1, initial: 0, accept: 0 },
  ],
  transitions: [
    { name: '开始冲洗', pre: [1, 0], post: [0, 1] },
    { name: '结束冲洗', pre: [0, 1], post: [1, 0] },
  ],
  forbidden: [],
};

export const EXAMPLES: Example[] = [
  {
    id: 'pass',
    title: '双原料顺序配液（审计通过）',
    description: '两种原料任意顺序投料后出料验收，全部执行均终止于验收标记。',
    model: passModel,
  },
  {
    id: 'forbidden',
    title: '双阀并发溢流（禁态反例）',
    description: '两阀可先后开启使混合池达到容量上限，触发"混合池≥2"禁态。',
    model: forbiddenModel,
  },
  {
    id: 'deadlock',
    title: '缺料死锁（非验收死锁）',
    description: '催化剂库所永远为空，投料后流程卡死在非验收状态。',
    model: deadlockModel,
  },
  {
    id: 'lasso',
    title: '冲洗循环（无限执行套索）',
    description: '待机与冲洗之间可无限往返，永远到不了验收标记。',
    model: lassoModel,
  },
];
