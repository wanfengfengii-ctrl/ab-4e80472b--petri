/**
 * 一次性验收脚本：在真实 Chromium 中执行审计台场景。
 * 全部通过退出码 0，任一失败退出码 1。
 */
import { chromium } from 'playwright';

const BASE_URL = (process.env.BASE_URL || 'http://web:80').replace(/\/$/, '');

const results = [];
function check(name, cond, extra = '') {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond || !extra ? '' : `  （实际：${extra}）`}`);
}

/** 选择示例并发起审计，等待判定完成 */
async function runExample(page, id) {
  await page.selectOption('[data-testid="example-select"]', id);
  await page.waitForSelector('[data-testid="audit-status"][data-kind="idle"]');
  await page.click('[data-testid="run-audit"]');
  await page.waitForSelector('[data-testid="audit-status"][data-done="true"]', { timeout: 30000 });
}

const status = (page) => page.locator('[data-testid="audit-status"]');
const attr = (page, name) => status(page).getAttribute(name);

let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();

  // 1. Web 健康检查
  const health = await page.request.get(`${BASE_URL}/healthz`);
  check('健康检查 GET /healthz 返回 200', health.status() === 200, `HTTP ${health.status()}`);
  check('健康检查响应体为 ok', (await health.text()).trim() === 'ok');

  // 2. 页面加载
  await page.goto(`${BASE_URL}/`);
  await page.waitForSelector('[data-testid="run-audit"]');
  check('页面加载并显示“发起审计”按钮', true);
  check('页面标题正确', (await page.title()).includes('Petri'), await page.title());

  // 3. 通过样例：全部执行终止于验收
  await runExample(page, 'pass');
  check('通过样例判定为“审计通过”', (await attr(page, 'data-kind')) === 'pass', await attr(page, 'data-kind'));
  check('通过样例探索 5 个状态', (await attr(page, 'data-states')) === '5', await attr(page, 'data-states'));

  // 4. 禁态样例：最短且字典序最小反例 [T0, T1]
  await runExample(page, 'forbidden');
  check('禁态样例判定为禁态反例', (await attr(page, 'data-kind')) === 'forbidden', await attr(page, 'data-kind'));
  check('禁态轨迹为 [0,1]（最短且字典序最小）', (await attr(page, 'data-seq')) === '0,1', await attr(page, 'data-seq'));

  // 5. 逐步回放并检查每步令牌变化
  await page.click('[data-testid="replay-next"]');
  let tokens = await page.locator('[data-testid="place-2"]').getAttribute('data-tokens');
  check('回放第 1 步后混合池令牌=1', tokens === '1', tokens);
  await page.click('[data-testid="replay-next"]');
  tokens = await page.locator('[data-testid="place-2"]').getAttribute('data-tokens');
  check('回放第 2 步后混合池令牌=2（禁态）', tokens === '2', tokens);
  const posText = await page.locator('[data-testid="replay-pos"]').innerText();
  check('回放进度显示 2/2 步', posText.includes('2/2'), posText);
  const badge = await page.locator('.marking-badge').innerText();
  check('终态徽标标注“禁态”', badge.includes('禁态'), badge);

  // 6. 死锁样例
  await runExample(page, 'deadlock');
  check('死锁样例判定为非验收死锁', (await attr(page, 'data-kind')) === 'deadlock', await attr(page, 'data-kind'));
  check('死锁轨迹为 [0]', (await attr(page, 'data-seq')) === '0', await attr(page, 'data-seq'));

  // 7. 套索样例：空前缀 + 循环 [T0, T1]
  await runExample(page, 'lasso');
  check('循环样例判定为套索（无限执行）', (await attr(page, 'data-kind')) === 'lasso', await attr(page, 'data-kind'));
  check('套索前缀长度 0', (await attr(page, 'data-prefix')) === '0', await attr(page, 'data-prefix'));
  check('套索循环长度 2', (await attr(page, 'data-cycle')) === '2', await attr(page, 'data-cycle'));
  check('套索循环序列为 [0,1]', (await attr(page, 'data-cycle-seq')) === '0,1', await attr(page, 'data-cycle-seq'));

  // 8. JSON 编辑：为冲洗循环追加禁态后重新审计
  const edited = {
    name: '冲洗循环-禁态改造',
    places: [
      { name: '待机', capacity: 1, initial: 1, accept: 0 },
      { name: '冲洗中', capacity: 1, initial: 0, accept: 0 },
    ],
    transitions: [
      { name: '开始冲洗', pre: [1, 0], post: [0, 1] },
      { name: '结束冲洗', pre: [0, 1], post: [1, 0] },
    ],
    forbidden: [[{ place: 1, op: '>=', value: 1 }]],
  };
  await page.selectOption('[data-testid="example-select"]', 'lasso');
  await page.click('[data-testid="tab-json"]');
  await page.fill('[data-testid="json-input"]', JSON.stringify(edited, null, 2));
  await page.click('[data-testid="json-apply"]');
  await page.click('[data-testid="run-audit"]');
  await page.waitForSelector('[data-testid="audit-status"][data-done="true"]', { timeout: 30000 });
  check('JSON 编辑后判定为禁态反例', (await attr(page, 'data-kind')) === 'forbidden', await attr(page, 'data-kind'));
  check('JSON 编辑后轨迹为 [0]', (await attr(page, 'data-seq')) === '0', await attr(page, 'data-seq'));

  // 9. 结构化编辑：将通过样例的“成品批次”验收值改为 0，应检出非验收死锁
  await page.click('[data-testid="tab-structured"]');
  await page.selectOption('[data-testid="example-select"]', 'pass');
  await page
    .locator('[data-testid="places-table"] tbody tr')
    .nth(3)
    .locator('select')
    .nth(1)
    .selectOption('0');
  await page.click('[data-testid="run-audit"]');
  await page.waitForSelector('[data-testid="audit-status"][data-done="true"]', { timeout: 30000 });
  check('结构化编辑后判定为非验收死锁', (await attr(page, 'data-kind')) === 'deadlock', await attr(page, 'data-kind'));
  check('结构化编辑后轨迹为 [0,1,2]', (await attr(page, 'data-seq')) === '0,1,2', await attr(page, 'data-seq'));
} catch (err) {
  console.error('验收执行异常：', err);
  results.push({ name: '执行异常', ok: false });
} finally {
  await browser?.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n验收结果：${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length === 0 ? 0 : 1);
