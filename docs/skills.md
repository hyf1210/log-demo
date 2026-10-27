# AI 协作 Skills

本项目开发过程中应用的 Claude Code 能力 / 工作模式，沉淀为可复用的「技能」。

## 1. 任务拆解与进度跟踪（TaskList）

把大项目拆成 6 个可跟踪阶段：

1. 脚手架 + 依赖安装
2. 主进程核心（索引/读取/搜索/统计）
3. IPC + preload 类型化 API
4. 渲染层 UI
5. 样例日志生成 + 截图采集
6. 文档 + 仓库

每个阶段独立可验证，避免「一把梭」导致的定位困难。

## 2. 环境探测先行

开发前一次性探测工具链版本，直接决定技术选型：

```bash
node -v; npm -v; pnpm -v; git --version; rustc --version; cargo --version
```

结论驱动：无 Rust → Electron；有 Node 24 → 直接可用。

## 3. 最小复现脚本（快速定位正则/换算 bug）

UI 表现异常时，用 Node 单行脚本直接验证核心逻辑，几秒定位：

```bash
node -e "console.log('[2024-01-15] INFO x'.slice(0,120).match(LEVEL_RE))"
```

比「改代码 → 重启应用 → 看界面」快一个数量级。

## 4. 自动化截图 + 文本证据采集

编写 `capture` 驱动，让应用跑一段确定性流程，每个阶段：
- 截屏（`webContents.capturePage`）
- dump 渲染文本（`document.body.innerText`）作文字证据
- 记录内存（`app.getAppMetrics` + `performance.memory`）

产出可提交、可复现的截图与内存数据，替代手动截图。

## 5. 分层内存归因

排查「内存高」时分三层归因，避免误判：

1. **主进程 RSS**（`process.memoryUsage().rss`）—— 文件处理是否越界
2. **渲染进程 JS 堆**（`performance.memory.usedJSHeapSize`）—— 是否有 JS 泄漏
3. **各进程 workingSet**（`app.getAppMetrics`）—— Chromium 原生/布局开销

本次据此定位到「超大滚动布局」导致的原生内存膨胀，而非代码泄漏。

## 6. 确定性的样例数据生成

用**带种子 PRNG**（mulberry32）生成日志，保证：
- 每次生成结果可复现，便于对比
- 级别/时间戳/错误模板可控，能稳定触发统计与聚类路径

## 7. 类型安全的 IPC 契约

共享类型 + `contextBridge` 暴露类型化 API，让 main/preload/renderer 三端编译期即可发现接口漂移。
