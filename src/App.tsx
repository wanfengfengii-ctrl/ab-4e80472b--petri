import { useCallback, useEffect, useRef, useState } from 'react';
import { AuditPanel, AuditStatus } from './components/AuditPanel';
import { JsonEditor } from './components/JsonEditor';
import { StructuredEditor } from './components/StructuredEditor';
import { EXAMPLES } from './petri/examples';
import { parseModel } from './petri/model';
import { Model } from './petri/types';
import type { AuditRequest, AuditResponse } from './workers/audit.worker';

const DEFAULT_MAX_STATES = 100_000;

export default function App() {
  const [model, setModel] = useState<Model>(EXAMPLES[0].model);
  const [jsonText, setJsonText] = useState(() => JSON.stringify(EXAMPLES[0].model, null, 2));
  const [jsonErrors, setJsonErrors] = useState<string[]>([]);
  const [tab, setTab] = useState<'structured' | 'json'>('structured');
  const [exampleId, setExampleId] = useState(EXAMPLES[0].id);
  const [audit, setAudit] = useState<AuditStatus>({ status: 'idle' });
  const [maxStates, setMaxStates] = useState(DEFAULT_MAX_STATES);
  const workerRef = useRef<Worker | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const stopWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  useEffect(() => stopWorker, [stopWorker]);

  const resetAudit = useCallback(() => {
    stopWorker();
    setAudit({ status: 'idle' });
  }, [stopWorker]);

  /** 应用新模型：同步 JSON 视图并使旧审计结果失效 */
  const applyModel = useCallback(
    (m: Model) => {
      setModel(m);
      setJsonText(JSON.stringify(m, null, 2));
      setJsonErrors([]);
      resetAudit();
    },
    [resetAudit],
  );

  const onStructuredChange = useCallback(
    (m: Model) => {
      setExampleId('');
      applyModel(m);
    },
    [applyModel],
  );

  const onSelectExample = (id: string) => {
    const ex = EXAMPLES.find((e) => e.id === id);
    if (!ex) return;
    setExampleId(id);
    applyModel(ex.model);
  };

  const applyJson = useCallback(() => {
    const v = parseModel(jsonText);
    if (v.ok) {
      setExampleId('');
      applyModel(v.model);
    } else {
      setJsonErrors(v.errors);
    }
  }, [jsonText, applyModel]);

  const formatJson = useCallback(() => {
    try {
      setJsonText(JSON.stringify(JSON.parse(jsonText), null, 2));
    } catch {
      /* 保留原文，错误在应用时提示 */
    }
  }, [jsonText]);

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void file.text().then((text) => {
      const v = parseModel(text);
      if (v.ok) {
        setExampleId('');
        applyModel(v.model);
      } else {
        setJsonText(text);
        setJsonErrors(v.errors);
        setTab('json');
      }
    });
  };

  const onExport = () => {
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${model.name || 'petri-model'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runAudit = useCallback(() => {
    stopWorker();
    setAudit({ status: 'running' });
    const w = new Worker(new URL('./workers/audit.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = w;
    w.onmessage = (e: MessageEvent<AuditResponse>) => {
      setAudit(
        e.data.ok
          ? { status: 'done', result: e.data.result }
          : { status: 'error', message: e.data.error },
      );
      stopWorker();
    };
    w.onerror = () => {
      setAudit({ status: 'error', message: '审计 Worker 执行失败' });
      stopWorker();
    };
    w.postMessage({ model, maxStates } satisfies AuditRequest);
  }, [model, maxStates, stopWorker]);

  return (
    <div className="app">
      <header>
        <h1>配液产线 Petri 网审计台</h1>
        <span className="tagline">纯前端 · 完整状态空间探索 · 不调用任何业务后端</span>
      </header>
      <main>
        <section className="editor-panel">
          <div className="toolbar">
            <select
              value={exampleId}
              onChange={(e) => onSelectExample(e.target.value)}
              data-testid="example-select"
              title="载入示例模型"
            >
              <option value="" disabled>
                载入示例模型…
              </option>
              {EXAMPLES.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
            <button onClick={() => fileRef.current?.click()} data-testid="import-button">
              导入 JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={onImportFile}
              data-testid="import-input"
            />
            <button onClick={onExport} data-testid="export-button">
              导出 JSON
            </button>
            <span className="spacer" />
            <div className="tabs">
              <button
                className={tab === 'structured' ? 'active' : ''}
                onClick={() => setTab('structured')}
                data-testid="tab-structured"
              >
                结构化编辑
              </button>
              <button
                className={tab === 'json' ? 'active' : ''}
                onClick={() => setTab('json')}
                data-testid="tab-json"
              >
                JSON 编辑
              </button>
            </div>
          </div>
          {exampleId && (
            <p className="example-desc">{EXAMPLES.find((e) => e.id === exampleId)?.description}</p>
          )}
          {tab === 'structured' ? (
            <StructuredEditor model={model} onChange={onStructuredChange} />
          ) : (
            <JsonEditor
              text={jsonText}
              errors={jsonErrors}
              onTextChange={setJsonText}
              onApply={applyJson}
              onFormat={formatJson}
            />
          )}
        </section>
        <AuditPanel
          model={model}
          audit={audit}
          maxStates={maxStates}
          onMaxStatesChange={setMaxStates}
          onRun={runAudit}
          onCancel={resetAudit}
        />
      </main>
      <footer>
        语义：变迁原子触发（令牌充足且不超容量）· 到达验收标记即结束 · 禁态 &gt; 验收 &gt; 死锁 ·
        反例取步数最短、字典序最小；套索取前缀最短、循环最短并按字典序决胜
      </footer>
    </div>
  );
}
