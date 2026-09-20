// @vitest-environment jsdom
/**
 * 应用级集成测试：在 jsdom 中渲染 App，用同步 FakeWorker 替代 Web Worker，
 * 覆盖“载入示例 → 发起审计 → 判定展示 → 逐步回放”完整链路。
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import App from './App';
import { audit } from './petri/audit';
import type { AuditRequest } from './workers/audit.worker';

class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;

  postMessage(data: AuditRequest) {
    const result = audit(data.model, data.maxStates);
    queueMicrotask(() => {
      if (!this.terminated) this.onmessage?.({ data: { ok: true, result } } as MessageEvent);
    });
  }

  terminate() {
    this.terminated = true;
  }
}

beforeAll(() => {
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(cleanup);

async function runAuditForExample(exampleId: string) {
  fireEvent.change(screen.getByTestId('example-select'), { target: { value: exampleId } });
  fireEvent.click(screen.getByTestId('run-audit'));
  await waitFor(() =>
    expect(screen.getByTestId('audit-status').getAttribute('data-done')).toBe('true'),
  );
  return screen.getByTestId('audit-status');
}

describe('App 集成', () => {
  it('渲染标题、工具栏与结构化编辑器', () => {
    render(<App />);
    expect(screen.getByText('配液产线 Petri 网审计台')).toBeTruthy();
    expect(screen.getByTestId('run-audit')).toBeTruthy();
    expect(screen.getByTestId('places-table').querySelectorAll('tbody tr').length).toBe(4);
  });

  it('通过样例：判定为审计通过并展示统计', async () => {
    render(<App />);
    const status = await runAuditForExample('pass');
    expect(status.getAttribute('data-kind')).toBe('pass');
    expect(status.getAttribute('data-states')).toBe('5');
    expect(status.textContent).toContain('审计通过');
  });

  it('禁态样例：展示最短反例轨迹并可逐步回放令牌变化', async () => {
    render(<App />);
    const status = await runAuditForExample('forbidden');
    expect(status.getAttribute('data-kind')).toBe('forbidden');
    expect(status.getAttribute('data-seq')).toBe('0,1');

    const place2 = screen.getByTestId('place-2');
    expect(place2.getAttribute('data-tokens')).toBe('0');

    fireEvent.click(screen.getByTestId('replay-next'));
    expect(place2.getAttribute('data-tokens')).toBe('1');
    expect(screen.getByTestId('replay-pos').textContent).toContain('1/2');

    fireEvent.click(screen.getByTestId('replay-next'));
    expect(place2.getAttribute('data-tokens')).toBe('2');
    expect(document.querySelector('.marking-badge')?.textContent).toContain('禁态');
  });

  it('死锁样例：判定为非验收死锁', async () => {
    render(<App />);
    const status = await runAuditForExample('deadlock');
    expect(status.getAttribute('data-kind')).toBe('deadlock');
    expect(status.getAttribute('data-seq')).toBe('0');
  });

  it('套索样例：判定为无限执行并给出前缀与循环', async () => {
    render(<App />);
    const status = await runAuditForExample('lasso');
    expect(status.getAttribute('data-kind')).toBe('lasso');
    expect(status.getAttribute('data-prefix')).toBe('0');
    expect(status.getAttribute('data-cycle')).toBe('2');
    expect(status.getAttribute('data-cycle-seq')).toBe('0,1');
  });

  it('JSON 编辑：应用修改后的模型并重新审计', async () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('tab-json'));
    const edited = {
      name: '改造模型',
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
    fireEvent.change(screen.getByTestId('json-input'), {
      target: { value: JSON.stringify(edited) },
    });
    fireEvent.click(screen.getByTestId('json-apply'));
    fireEvent.click(screen.getByTestId('run-audit'));
    await waitFor(() =>
      expect(screen.getByTestId('audit-status').getAttribute('data-done')).toBe('true'),
    );
    const status = screen.getByTestId('audit-status');
    expect(status.getAttribute('data-kind')).toBe('forbidden');
    expect(status.getAttribute('data-seq')).toBe('0');
  });

  it('非法 JSON 展示校验错误且不崩溃', async () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('tab-json'));
    fireEvent.change(screen.getByTestId('json-input'), {
      target: { value: '{"places": [], "transitions": []}' },
    });
    fireEvent.click(screen.getByTestId('json-apply'));
    expect(screen.getByTestId('json-errors').textContent).toContain('库所数量');
    expect(screen.getByTestId('json-errors').textContent).toContain('变迁数量');
  });
});
