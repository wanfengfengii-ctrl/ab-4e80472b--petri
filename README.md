# 配液产线 Petri 网审计台

面向自动配液产线的**纯前端**有界 Petri 网审计台：阀门、泵与批次令牌被编译为 Petri 网后，
即使局部试跑成功，仍可能隐藏禁态、非验收死锁或可永久循环的操作分支。本工具在浏览器中
完整探索可达状态空间，对每条执行给出形式化结论，并在发现违规时生成可逐步回放的最优见证。
**全程不调用任何业务后端**，审计计算在 Web Worker 中本地完成。

## 功能

- **模型编辑**：浏览器内结构化编辑或 JSON 编辑，支持文件导入/导出；
  库所 2–18 个、变迁 1–40 个；库所容量 0–3、初始令牌、验收标记（可按库所设为"任意"）、
  禁态条件（规则间析取、规则内合取）。
- **触发语义**：变迁按前置/后置整数弧**原子触发**，仅当令牌充足（`m ≥ pre`）
  且结果不超容量（`m − pre + post ≤ capacity`）时可用；到达验收标记即结束。
- **完整审计**：广度优先完整探索可达状态（在验收标记处截断），证明
  "每条执行都终止于验收且从未进入禁态"，否则给出见证：
  - **禁态 / 非验收死锁** → 步数最短、变迁编号序列字典序最小的反例轨迹；
  - **无限执行** → 前缀最短、循环最短并按同一规则决胜的套索（lasso）见证；
    套索优先级低于反例。
- **逐步回放**：回放反例/套索，逐格标出每步令牌增减，套索可循环播放。
- **工程化**：Dockerfile、Docker Compose、Web 健康检查（`/healthz`）、
  可配置宿主机端口（`WEB_PORT`）；Compose 中一次性 `verify` 服务在真实 Chromium
  中执行验收场景，完成后自行退出并以退出码报告结果。

## 快速开始

### 本地开发

```bash
npm install
npm run dev        # 开发服务器
npm test           # 单元 + 集成测试（vitest）
npm run build      # 类型检查并产出 dist/
npm run preview    # 预览构建产物
```

### Docker

```bash
docker build -t petri-audit-web .
docker run --rm -p 8080:80 petri-audit-web
# 打开 http://localhost:8080 ，健康检查：curl http://localhost:8080/healthz
```

### Docker Compose（推荐）

```bash
cp .env.example .env        # 可修改 WEB_PORT（默认 8080）
docker compose up web       # 启动审计台
```

运行一次性验收（真实浏览器场景，退出码即结果）：

```bash
docker compose up --exit-code-from verify --abort-on-container-exit verify
echo $?                    # 0 = 全部场景通过
```

`verify` 服务依赖 `web` 健康检查通过后启动，在 Chromium 中依次执行：
健康检查、页面加载、通过样例、禁态反例（含回放令牌变化断言）、非验收死锁、
套索见证、JSON 编辑再审计、结构化编辑再审计，随后自行退出。

## 模型 JSON 格式

```jsonc
{
  "name": "双原料顺序配液",
  "places": [
    { "name": "原料A暂存", "capacity": 1, "initial": 1, "accept": 0 },
    { "name": "成品批次", "capacity": 1, "initial": 0, "accept": 1 }
    // capacity: 0..3；initial: 0..capacity；accept: 0..capacity 或 null（任意）
  ],
  "transitions": [
    { "name": "投料A", "pre": [1, 0], "post": [0, 1] }
    // pre/post 长度 = 库所数，权值为 0..9 的整数（0 表示无弧）
  ],
  "forbidden": [
    [
      { "place": 0, "op": ">=", "value": 2 },
      { "place": 1, "op": "=", "value": 0 }
    ]
    // 外层数组：任一规则命中即禁态（析取）；内层数组：全部条件成立（合取）
    // op ∈ =, !=, <=, >=, <, >
  ]
}
```

## 语义约定

- **验收判定**：所有指定了验收值的库所精确匹配即到达验收；到达验收标记的执行立即结束
  （其后续变迁不再展开）。若全部库所验收值均为 `null`，视为未定义验收标记（永不验收）。
- **判定优先级**：禁态 > 验收 > 非验收死锁；三者均不命中且图中无环 → 审计通过。
- **反例最优性**：BFS 按变迁编号升序探索，首个发现的禁态/死锁轨迹即
  "步数最短、字典序最小"的轨迹。
- **套索最优性**：在截断后的可达图上，取环上深度最小的状态（前缀最短），
  其上最短回环（循环最短），并以"前缀+循环"变迁编号序列字典序决胜。
- **状态上限**：为防止浏览器卡死，默认探索上限 100,000 状态（界面可调）；
  超限返回"无法定论"而非错误结论。

## 目录结构

```
src/petri/        类型、触发语义、模型校验、审计算法、内置样例（含 vitest 单测）
src/workers/      审计 Web Worker（后台计算，不阻塞界面）
src/components/   结构化编辑器、JSON 编辑器、审计面板、回放器、标识视图
verify/           一次性验收服务（Playwright + Chromium）
Dockerfile        多阶段构建：vite build → nginx 静态托管（含 HEALTHCHECK）
docker-compose.yml  web（健康检查、WEB_PORT 可配）+ verify（一次性，退出码报告）
```
