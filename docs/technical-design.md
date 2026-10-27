# 技术设计文档 — LogLens

## 1. 技术选型

| 决策点 | 选择 | 理由 |
| --- | --- | --- |
| 桌面壳 | Electron 33 | 主进程即 Node.js，可用流式 I/O 处理大文件；生态成熟；无需 Rust 工具链 |
| 前端 | React 18 + TypeScript | 生态成熟，配合 Ant Design 快速构建桌面 UI |
| 图表 | Apache ECharts 5 | 大数据量时序/柱状图性能好，主题可定制 |
| 构建 | electron-vite（Vite 5） | 统一 main/preload/renderer 三端构建，HMR 开发体验好 |

## 2. 进程模型

Electron 三进程分工，**重型 I/O 全部下沉到主进程**，渲染进程零文件访问：

- **Main（Node.js）**：文件流式读取、行偏移索引构建、搜索、统计、IPC
- **Renderer（React）**：纯 UI，通过 `window.loglens`（contextBridge）调用主进程
- **Preload**：`contextBridge.exposeInMainWorld` 暴露类型化 API，`contextIsolation` 隔离

## 3. 大文件方案：流式读取 + 行偏移索引

### 3.1 核心思想

文件内容**永不整体载入内存**。索引阶段只扫描换行符，记录每行起始字节偏移到一个**类型化数组**：

```
offsets: Uint32Array   // offsets[i] = 第 i 行在文件中的起始字节位置
```

- 2GB 文件、2390 万行 → `2390万 × 4 字节 ≈ 95MB`（约占文件体积 4.6%）
- 对比「读入整个文件」需 2GB 内存，压缩了 20 倍以上
- 文件 < 4GB 用 `Uint32Array`，否则回退 `Float64Array`

### 3.2 索引构建（`src/main/indexer.ts`）

- `fs.open` + `fs.read` 分块（8MB）顺序读取
- 每块扫描 `0x0A` 换行符，追加行起始偏移
- **每块之间 `setImmediate` 让出事件循环**，保证 IPC / 窗口持续响应
- 类型化数组按需倍增扩容，避免 JS 数组的对象开销
- 末尾若以换行结尾则丢弃伪空行

### 3.3 按需取行（`src/main/reader.ts`）

虚拟滚动只渲染可见行，每次取一「批」（1000 行）：

1. 由行号区间 `[from, to)` 从索引算出字节区间 `[offsets[from], offsets[to])`
2. **一次 `fs.read` 读该字节段**（而非读全文件）
3. 依据偏移切片 + `Buffer.toString('utf8')` 解码每行
4. 单行超过 1MB 截断，防御畸形超长行

### 3.4 搜索（`src/main/searcher.ts`）

- 复用 `forEachLine` 流式逐行迭代（8MB 块 + 跨块续行 + 超长行截断）
- 每行解析级别/时间戳（启发式正则，只看前 200 字节）
- 依次应用 关键字（`includes` 或 `RegExp`）→ 级别 → 时间范围 过滤
- 命中结果**上限 100,000 条**，防止海量匹配撑爆内存，`truncated` 标记

### 3.5 统计（`src/main/stats.ts`）

单遍流式扫描同时产出三份结果：

1. **时间序列直方图**：`Map<时间桶, Map<级别, 计数>>`，桶超阈值自动降采样合并
2. **级别总量**：累加计数
3. **错误聚类**：对 ERROR/FATAL 行剥离时间戳/级别/日志器前缀后做**签名归一化**
   - 归一化规则：小写化、UUID→`<uuid>`、IP→`<ip>`、路径→`<path>`、十六进制→`<hex>`、数字→`<n>`、引号串→`<str>`
   - 去重上限 5000 条，最终取 Top N（默认 20）

## 4. 进度反馈与取消

统一的任务取消机制：

- 每个长任务（索引/搜索/统计）注册一个 `TaskSignal { aborted }`
- 流式循环在**每个块边界**检查 `signal.aborted`，命中则抛 `CancelledError`
- 主进程通过 `webContents.send` 推送进度事件（`bytesScanned/totalBytes`）
- 渲染层 `取消` 按钮触发 `cancel*` IPC，置 `aborted = true`

## 5. 虚拟滚动的浏览器限制与解法

Chromium 的 `scrollTop` 上限约 **3350 万 px**。2390 万行 × 20px = 4.78 亿 px 远超上限，直接布局会导致：

1. 无法滚动到 167 万行之后的行（**功能缺陷**）
2. 巨量布局占用 ~600MB 渲染进程原生内存

**解法：虚拟滚动条 + 粘性视窗**（`src/renderer/src/components/LogViewer.tsx`）：

- 滚动范围上限固定为 3000 万 px（小于浏览器上限）
- `startLine = floor(scrollTop / scrollH * totalLines)` 由滚动位置映射行号
- 仅渲染可见行数（`viewportHeight/20 + overscan`）到一个 `position: sticky` 容器
- 小文件（总高度 < 上限）则退回精确逐行滚动

这样任意一行都可访问，同时渲染进程内存从 ~600MB 降到 ~350MB。

## 6. IPC 接口设计

| 通道 | 方向 | 说明 |
| --- | --- | --- |
| `openDirectory` / `listDirectory` | invoke | 选择/列目录 |
| `indexFile` + `ev:indexProgress` + `cancelIndex` | invoke/event/send | 索引 + 进度 + 取消 |
| `readLines` | invoke | 按行号区间取行 |
| `search` + `ev:searchProgress` + `cancelSearch` | invoke/event/send | 搜索 |
| `stats` + `ev:statsProgress` + `cancelStats` | invoke/event/send | 统计 |
| `getMemory` | invoke | 读取内存占用 |

类型统一在 `src/shared/types.ts`，preload 与 renderer 共享，保证端到端类型安全。

## 7. 日志解析启发式

- **级别**：正则匹配行首 200 字节内的级别词，边界符限定（`[...]`、空格、冒号等），并做别名归一化（`WARNING→WARN`、`SEVERE→FATAL` 等）
- **时间戳**：匹配 ISO 格式与 Unix 毫秒/秒时间戳，`Date.parse` 解析；解析失败则视为无时间戳（跳过时间过滤 / 不入时间序列）
