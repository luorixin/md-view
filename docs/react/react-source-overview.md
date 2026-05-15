# React 源码仓库全局导览

本文档基于当前本地仓库 `react-main` 的只读扫描整理，面向第一次阅读 React 源码的人，帮助建立整体地图和优先阅读路径。

## 项目整体说明

`react-main` 是 React 官方源码的 monorepo。根目录的 `package.json` 通过 `workspaces: ["packages/*"]` 管理多个包，核心源码主要集中在 `packages` 目录下。

从学习角度看，可以把仓库分成四层：

1. 公共 API 层：`react`
2. 宿主渲染器层：`react-dom`
3. 核心协调与调度层：`react-reconciler`、`scheduler`
4. 内部公共工具层：`shared`

除此之外，仓库还包含构建测试脚本、示例 fixtures、DevTools、React Server Components、React Compiler 等相关项目。

## 核心目录结构

| 目录 | 作用 |
| --- | --- |
| `packages/` | React 源码主体，包含 `react`、`react-dom`、`react-reconciler`、`scheduler`、DevTools、Server Components、测试 renderer 等包 |
| `scripts/` | 构建、测试、发布、Rollup、Jest、Flow、错误码生成、lint 等工程脚本 |
| `fixtures/` | DOM、Fizz、Flight、Scheduler、DevTools 等功能验证和示例项目 |
| `compiler/` | React Compiler 子项目，用于优化组件和 Hooks 的重渲染，并验证 React 规则 |
| `flow-typed/` | Flow 类型声明和类型环境 |
| `.github/` | GitHub Actions、issue 模板等协作配置 |

## 根目录重要文件

| 文件 | 作用 |
| --- | --- |
| `package.json` | monorepo 配置、开发依赖、`build`、`test`、`lint`、`flow` 等脚本入口 |
| `ReactVersions.js` | npm 发布版本的单一来源，定义 stable 和 experimental 包清单 |
| `babel.config.js` | Babel 转换配置，包括 JSX、Flow strip、ES 语法转换 |
| `babel.config-ts.js` | TypeScript 相关 Babel 配置 |
| `babel.config-react-compiler.js` | React Compiler 相关 Babel 配置 |
| `.eslintrc.js` | 全仓 ESLint 根配置，包含 React 内部 lint 规则 |
| `.prettierrc.js` | 代码格式化配置 |
| `scripts/rollup/bundles.js` | 定义 React、ReactDOM、scheduler 等包的打包入口、bundle 类型和外部依赖 |
| `scripts/jest/jest-cli.js` | React 自己封装的 Jest 测试入口 |
| `CHANGELOG.md` | 发布变更记录 |
| `README.md` | React 项目介绍 |
| `CONTRIBUTING.md` | 贡献指南入口 |

## 核心包职责表

| 包 | 解决的问题 | 建议关注点 |
| --- | --- | --- |
| `react` | 提供用户直接使用的 API，例如 `createElement`、JSX runtime、`Component`、`useState`、`useEffect`、Context、`memo`、`lazy` 等。它负责描述 UI，不负责真实 DOM 操作。 | ReactElement 结构、Hooks dispatcher、Context、组件基础类 |
| `react-dom` | DOM renderer 的公共入口，负责把 React 接到浏览器 DOM，提供 `createRoot`、`hydrateRoot`、`createPortal`、`flushSync`、server/static 等入口。 | `createRoot`、`root.render`、hydration、portal、与 reconciler 的连接 |
| `react-reconciler` | React 的 Fiber 协调核心，负责创建 root、调度更新、执行 render phase、commit phase、Hooks 真正实现、lane 优先级、自定义 renderer 支撑。 | Fiber 数据结构、更新队列、lane、begin/complete/commit、Hooks 实现 |
| `scheduler` | 协作式调度器，负责任务队列、任务优先级、时间切片、让出主线程和恢复任务。 | priority、min heap、`shouldYield`、host callback |
| `shared` | 内部公共工具层，保存全仓共享的 symbols、types、feature flags、版本号、错误处理、stack 工具和通用 helper。 | `ReactSymbols`、`ReactTypes`、`ReactFeatureFlags`、`ReactSharedInternals` |

补充：`react-dom-bindings` 虽然不在最核心的五个包里，但它是理解 `react-dom` 的关键私有包。它保存 DOM host config、事件系统、DOM 属性 diff、hydration、DOM 节点与 Fiber 的映射等实现细节。

## 每个核心包解决什么问题

### react

`react` 解决的是“如何描述 UI”。用户写的 JSX、函数组件、类组件、Hooks、Context 最终都先经过这个包。

典型关注文件：

- `packages/react/index.js`
- `packages/react/src/ReactClient.js`
- `packages/react/src/jsx/ReactJSXElement.js`
- `packages/react/src/ReactHooks.js`
- `packages/react/src/ReactBaseClasses.js`
- `packages/react/src/ReactContext.js`

### react-dom

`react-dom` 解决的是“如何把 React 描述的 UI 渲染到 DOM”。它是浏览器场景中最常接触的 renderer。

典型关注文件：

- `packages/react-dom/client.js`
- `packages/react-dom/index.js`
- `packages/react-dom/src/client/ReactDOMClient.js`
- `packages/react-dom/src/client/ReactDOMRoot.js`
- `packages/react-dom/src/shared/ReactDOM.js`

### react-reconciler

`react-reconciler` 解决的是“React 如何比较、调度和提交 UI 更新”。这是 React 源码最核心也最复杂的部分。

它并不直接绑定 DOM，而是通过 HostConfig 适配不同宿主环境。DOM 场景下，HostConfig 主要来自 `react-dom-bindings`。

典型关注文件：

- `packages/react-reconciler/src/ReactFiberReconciler.js`
- `packages/react-reconciler/src/ReactFiberWorkLoop.js`
- `packages/react-reconciler/src/ReactFiberBeginWork.js`
- `packages/react-reconciler/src/ReactFiberCompleteWork.js`
- `packages/react-reconciler/src/ReactFiberCommitWork.js`
- `packages/react-reconciler/src/ReactFiberHooks.js`
- `packages/react-reconciler/src/ReactFiberLane.js`

### scheduler

`scheduler` 解决的是“什么时候执行任务，以及执行多久要让出控制权”。React 的并发能力需要它提供底层任务调度能力。

典型关注文件：

- `packages/scheduler/src/SchedulerPriorities.js`
- `packages/scheduler/src/SchedulerMinHeap.js`
- `packages/scheduler/src/forks/Scheduler.js`

### shared

`shared` 解决的是“多个包之间共享哪些内部概念和工具”。它不是用户 API，而是 React 内部公共基础层。

典型关注文件：

- `packages/shared/ReactSymbols.js`
- `packages/shared/ReactTypes.js`
- `packages/shared/ReactFeatureFlags.js`
- `packages/shared/ReactSharedInternals.js`
- `packages/shared/ReactVersion.js`
- `packages/shared/getComponentNameFromType.js`

## 不同包之间的依赖关系

可以先记住这张简化图：

```text
react
  -> shared

react-dom
  -> react
  -> react-reconciler
  -> react-dom-bindings
  -> scheduler
  -> shared

react-reconciler
  -> scheduler
  -> shared
  -> HostConfig

scheduler
  -> 独立调度能力

shared
  -> 被大多数核心包复用
```

一次典型的客户端渲染主线：

```text
createRoot(container)
  -> react-dom/src/client/ReactDOMRoot.js
  -> createContainer(...)
  -> react-reconciler/src/ReactFiberReconciler.js
  -> root.render(element)
  -> updateContainer(...)
  -> requestUpdateLane(...)
  -> scheduleUpdateOnFiber(...)
  -> ReactFiberWorkLoop
  -> beginWork / completeWork
  -> commit 阶段
  -> react-dom-bindings 执行真实 DOM 操作
```

Hooks 的调用主线：

```text
useState(...)
  -> react/src/ReactHooks.js
  -> ReactSharedInternals.H 当前 dispatcher
  -> react-reconciler/src/ReactFiberHooks.js
  -> mountState / updateState
  -> dispatchSetState
  -> scheduleUpdateOnFiber
```

## 推荐阅读顺序

第一次读 React 源码，不建议从 `ReactFiberWorkLoop` 直接硬啃。更顺的顺序是：

1. 先读 `react`
   - 目标：理解 ReactElement、JSX、Hooks 表层 API、Context、组件类。
   - 先知道“用户代码被 React 表示成什么”。

2. 再读 `react-dom`
   - 目标：理解 `createRoot`、`root.render` 如何进入 renderer。
   - 先抓住浏览器渲染入口，不急着深入所有 SSR 和 hydration 细节。

3. 然后读 `react-reconciler`
   - 目标：理解 Fiber root、更新队列、lane、render phase、commit phase。
   - 这是 React 的主战场，需要分阶段读。

4. 穿插读 `ReactFiberHooks` 和 `ReactFiberLane`
   - 目标：理解 Hooks 状态链表和 React 更新优先级模型。
   - `useState` 是最适合入门追踪的一条线。

5. 再读 `scheduler`
   - 目标：理解任务如何排队、如何按优先级执行、什么时候让出主线程。

6. 最后补读 `shared` 和 `react-dom-bindings`
   - 目标：补齐 symbols、feature flags、内部类型、DOM host config、事件系统和真实 DOM 操作。

## 第一阶段应该重点看的源码文件

第一阶段建议围绕“首次渲染 + 一次 `useState` 更新”阅读，不要一开始就陷入 Server Components、Fizz、Flight、DevTools、React Compiler。

| 顺序 | 文件 | 重点 |
| --- | --- | --- |
| 1 | `packages/react/src/ReactClient.js` | React 公共 API 如何汇总导出 |
| 2 | `packages/react/src/jsx/ReactJSXElement.js` | JSX 最终生成的 ReactElement 长什么样 |
| 3 | `packages/react/src/ReactHooks.js` | Hooks 表层 API 如何通过 dispatcher 转发 |
| 4 | `packages/react/src/ReactBaseClasses.js` | 类组件、`setState`、`forceUpdate` 的入口 |
| 5 | `packages/react-dom/src/client/ReactDOMRoot.js` | `createRoot`、`root.render`、`root.unmount` 如何进入 reconciler |
| 6 | `packages/react-reconciler/src/ReactFiberReconciler.js` | `createContainer`、`updateContainer` 如何创建和入队更新 |
| 7 | `packages/react-reconciler/src/ReactFiberWorkLoop.js` | lane 选择、调度更新、工作循环 |
| 8 | `packages/react-reconciler/src/ReactFiberBeginWork.js` | render phase 的 begin 阶段 |
| 9 | `packages/react-reconciler/src/ReactFiberCompleteWork.js` | render phase 的 complete 阶段 |
| 10 | `packages/react-reconciler/src/ReactFiberCommitWork.js` | commit 阶段如何提交副作用 |
| 11 | `packages/react-reconciler/src/ReactFiberHooks.js` | `useState`、`useEffect` 等 Hooks 的真正实现 |
| 12 | `packages/react-reconciler/src/ReactFiberLane.js` | React 更新优先级模型 |
| 13 | `packages/react-reconciler/src/Scheduler.js` | reconciler 对 scheduler 的包装 |
| 14 | `packages/scheduler/src/forks/Scheduler.js` | scheduler 的任务队列和让出机制 |
| 15 | `packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js` | DOM renderer 的 HostConfig，真实 DOM 操作从这里落地 |

## 建议的第一条源码追踪路线

可以用下面这个最小例子作为脑内路线：

```jsx
import {createRoot} from 'react-dom/client';
import {useState} from 'react';

function App() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}

createRoot(document.getElementById('root')).render(<App />);
```

追踪顺序：

```text
<App />
  -> ReactJSXElement 创建 ReactElement
  -> createRoot 创建 FiberRoot
  -> root.render 调用 updateContainer
  -> requestUpdateLane 选择优先级
  -> scheduleUpdateOnFiber 调度更新
  -> beginWork 处理函数组件
  -> ReactFiberHooks 处理 useState
  -> completeWork 生成/准备 host 节点
  -> commit 阶段提交 DOM 变化
  -> 点击按钮触发 setCount
  -> dispatchSetState 再次进入调度流程
```

## 学习建议

第一遍阅读不要追所有分支。React 源码里同时存在开发环境警告、实验 feature flag、服务端渲染、hydration、DevTools、React Native、内部 Facebook 构建等大量路径。初学时先固定在浏览器客户端渲染主线：

```text
react -> react-dom -> react-reconciler -> scheduler -> react-dom-bindings
```

等这条线跑通之后，再分专题阅读：

- Hooks
- Concurrent rendering
- Suspense
- Hydration
- DOM event system
- Server Components
- Fizz server rendering
- React Compiler
