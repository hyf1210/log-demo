# CLAUDE.md — LogLens 项目说明

本地日志探查桌面工具（Electron + React 18 + TypeScript）。

## 常用命令

```bash
npm install            # 安装依赖
npm run dev            # 开发模式（electron-vite dev，HMR）
npm run build          # 生产构建（输出到 out/）
npm run typecheck      # tsc --noEmit 类型检查
npm run gen:logs       # 生成样例日志（默认 2GB，LOG_MAIN_MB=64 可调小）
npm run capture        # 构建 + 运行截图/内存采集（需先 gen:logs）
```

## 架构要点

- 重型 I/O 全在 **main 进程**（`src/main/`）：流式行偏移索引、按需取行、搜索、统计
- **renderer**（`src/renderer/`）纯 UI，通过 `window.loglens`（preload 暴露）调用主进程
- 共享类型与 IPC 通道集中在 `src/shared/types.ts`

## 关键设计决策

- 2GB 文件不整体载入内存，只存 `Uint32Array` 行偏移索引（约文件体积 4.6%）
- 虚拟滚动用「3000 万 px 虚拟滚动条 + sticky 视窗」规避 Chromium ~33.5M px scrollTop 上限
- 搜索/统计/索引共用 `forEachLine` 流式迭代 + 分块让出事件循环 + 取消信号

## 文档

设计、PRD、问题记录见 `docs/`，协作规则见 `docs/rules.md`，Skills 见 `docs/skills.md`。
