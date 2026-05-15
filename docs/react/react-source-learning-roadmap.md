# React 源码系统学习路线

本文档基于当前本地 `react-main` 源码整理，按照从公共 API 到 Fiber 内核、再到并发机制的顺序组织。建议配合 `docs/react-source-overview.md` 一起阅读：先看总览，再按本文逐阶段深入。

建议贯穿全文使用这个最小例子作为源码追踪主线：

```jsx
import {createRoot} from 'react-dom/client';
import {useState} from 'react';

function App() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}

createRoot(document.getElementById('root')).render(<App />);
```

## 阶段路线总表

| 阶段 | 学习目标 | 需要阅读的源码文件 | 核心函数 | 需要理解的数据结构 | 推荐阅读顺序 | 学完后应该能回答的问题 |
| --- | --- | --- | --- | --- | --- | --- |
| 第一阶段：React Element 与 JSX | 理解 JSX 如何变成 ReactElement，React 如何描述 UI | `packages/react/src/jsx/ReactJSXElement.js`<br>`packages/react/src/ReactClient.js`<br>`packages/shared/ReactSymbols.js` | `createElement`<br>`jsxDEVImpl`<br>`ReactElement`<br>`isValidElement` | `ReactElement`<br>`type`<br>`key`<br>`ref`<br>`props`<br>`$$typeof` | 先看 `ReactClient.js` 的导出，再看 `ReactJSXElement.js` 创建元素，最后看 `ReactSymbols.js` | JSX 和 `createElement` 是什么关系？ReactElement 是真实 DOM 吗？`key`、`ref` 为什么特殊？ |
| 第二阶段：createRoot 和首次渲染入口 | 理解 React 应用如何从 DOM 容器进入 Fiber 系统 | `packages/react-dom/client.js`<br>`packages/react-dom/src/client/ReactDOMClient.js`<br>`packages/react-dom/src/client/ReactDOMRoot.js`<br>`packages/react-reconciler/src/ReactFiberReconciler.js` | `createRoot`<br>`ReactDOMRoot.prototype.render`<br>`createContainer`<br>`updateContainer` | `ReactDOMRoot`<br>`FiberRoot`<br>`HostRoot Fiber`<br>`RootType` | `client.js` -> `ReactDOMClient.js` -> `ReactDOMRoot.js` -> `ReactFiberReconciler.js` | `createRoot(container)` 创建了什么？`root.render(<App />)` 如何进入 reconciler？ |
| 第三阶段：Fiber 数据结构 | 理解 Fiber 节点如何表示组件树和工作单元 | `packages/react-reconciler/src/ReactFiber.js`<br>`packages/react-reconciler/src/ReactInternalTypes.js`<br>`packages/react-reconciler/src/ReactFiberRoot.js`<br>`packages/react-reconciler/src/ReactWorkTags.js`<br>`packages/react-reconciler/src/ReactFiberFlags.js` | `FiberNode`<br>`createFiberRoot`<br>`createWorkInProgress`<br>`createFiberFromElement` | `Fiber`<br>`FiberRoot`<br>`alternate`<br>`child/sibling/return`<br>`flags`<br>`lanes`<br>`memoizedProps`<br>`memoizedState` | 先看类型定义，再看 Fiber 构造，再看 WorkTag 和 Flags | Fiber 为什么既是节点又是工作单元？`current` 和 `workInProgress` 是什么关系？ |
| 第四阶段：更新触发流程 | 理解 `setState`、`root.render` 如何创建更新并调度 | `packages/react-reconciler/src/ReactFiberReconciler.js`<br>`packages/react-reconciler/src/ReactFiberHooks.js`<br>`packages/react-reconciler/src/ReactFiberClassUpdateQueue.js`<br>`packages/react-reconciler/src/ReactFiberConcurrentUpdates.js`<br>`packages/react-reconciler/src/ReactFiberWorkLoop.js` | `updateContainer`<br>`createUpdate`<br>`enqueueUpdate`<br>`dispatchSetState`<br>`scheduleUpdateOnFiber` | `Update`<br>`UpdateQueue`<br>`Hook UpdateQueue`<br>`Lane`<br>`FiberRoot.pendingLanes` | 先追 `root.render` 更新，再追 `useState` 更新，最后看统一调度入口 | 一次更新对象里存了什么？`setState` 为什么不会立刻改 UI？更新如何找到 root？ |
| 第五阶段：Scheduler 调度机制 | 理解 React 底层如何安排任务、让出主线程、恢复执行 | `packages/react-reconciler/src/Scheduler.js`<br>`packages/scheduler/src/forks/Scheduler.js`<br>`packages/scheduler/src/SchedulerPriorities.js`<br>`packages/scheduler/src/SchedulerMinHeap.js`<br>`packages/react-reconciler/src/ReactFiberRootScheduler.js` | `unstable_scheduleCallback`<br>`workLoop`<br>`shouldYieldToHost`<br>`ensureRootIsScheduled`<br>`performSyncWorkOnRoot` | `Task`<br>`taskQueue`<br>`timerQueue`<br>`PriorityLevel`<br>`callbackNode` | 先看 reconciler 对 scheduler 的包装，再看 scheduler 实现，最后回到 root scheduler | React 如何判断该不该让出主线程？任务优先级和 lane 是一回事吗？ |
| 第六阶段：Reconciler 协调流程 | 理解 render 阶段如何从 root 开始构建 work-in-progress 树 | `packages/react-reconciler/src/ReactFiberWorkLoop.js`<br>`packages/react-reconciler/src/ReactFiberBeginWork.js`<br>`packages/react-reconciler/src/ReactFiberCompleteWork.js`<br>`packages/react-reconciler/src/ReactChildFiber.js` | `performConcurrentWorkOnRoot`<br>`workLoopSync`<br>`workLoopConcurrent`<br>`performUnitOfWork`<br>`beginWork`<br>`completeWork` | `workInProgress`<br>`renderLanes`<br>`subtreeFlags`<br>`deletions` | 先读 WorkLoop 主流程，再进入 begin/complete，最后看 child reconciliation | render 阶段做了什么？为什么 render 阶段可以被中断？ |
| 第七阶段：beginWork 与 completeWork | 理解 Fiber 的“向下处理”和“向上归并” | `packages/react-reconciler/src/ReactFiberBeginWork.js`<br>`packages/react-reconciler/src/ReactFiberCompleteWork.js`<br>`packages/react-reconciler/src/ReactFiber.js`<br>`packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js` | `beginWork`<br>`updateFunctionComponent`<br>`updateHostComponent`<br>`reconcileChildren`<br>`completeWork`<br>`appendAllChildren` | `WorkTag`<br>`pendingProps`<br>`memoizedProps`<br>`stateNode`<br>`flags` | 先看 `beginWork` 分发，再看函数组件和 HostComponent，最后看 `completeWork` 创建 DOM | 函数组件在哪里被调用？DOM 节点在哪里创建？flags 是什么时候标记的？ |
| 第八阶段：commit 阶段 | 理解 React 如何把 render 结果真正提交到宿主环境 | `packages/react-reconciler/src/ReactFiberWorkLoop.js`<br>`packages/react-reconciler/src/ReactFiberCommitWork.js`<br>`packages/react-reconciler/src/ReactFiberCommitEffects.js`<br>`packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js` | `commitRoot`<br>`commitMutationEffects`<br>`commitLayoutEffects`<br>`commitPassiveMountEffects`<br>`commitPassiveUnmountEffects` | `finishedWork`<br>`Effect flags`<br>`MutationMask`<br>`LayoutMask`<br>`PassiveMask` | 先看 `commitRoot`，再分 mutation、layout、passive 三段读 | commit 阶段为什么不可中断？`useEffect` 和 `useLayoutEffect` 的提交时机有什么区别？ |
| 第九阶段：Hooks 实现原理 | 理解 Hooks dispatcher、Hook 链表、更新队列和 effect | `packages/react/src/ReactHooks.js`<br>`packages/react-reconciler/src/ReactFiberHooks.js`<br>`packages/react-reconciler/src/ReactHookEffectTags.js`<br>`packages/shared/ReactSharedInternals.js` | `resolveDispatcher`<br>`renderWithHooks`<br>`mountState`<br>`updateState`<br>`dispatchSetState`<br>`mountEffect`<br>`updateEffect` | `Hook`<br>`UpdateQueue`<br>`Effect`<br>`Dispatcher`<br>`memoizedState` | 先看 `ReactHooks.js` 转发，再看 dispatcher 切换，再读 `useState`，最后读 effect | Hooks 为什么必须按顺序调用？`useState` 的状态存在哪里？effect 是什么时候执行的？ |
| 第十阶段：diff 算法 | 理解 children reconciliation 如何复用、插入、移动、删除 Fiber | `packages/react-reconciler/src/ReactChildFiber.js`<br>`packages/react-reconciler/src/ReactFiberBeginWork.js`<br>`packages/react-reconciler/src/ReactFiber.js` | `reconcileChildFibers`<br>`reconcileChildFibersImpl`<br>`reconcileChildrenArray`<br>`updateSlot`<br>`placeChild`<br>`deleteChild` | `key`<br>`elementType`<br>`existingChildren`<br>`lastPlacedIndex`<br>`Placement`<br>`ChildDeletion` | 先看单节点 diff，再看数组 diff，再看 placement/deletion flags | React diff 为什么需要 `key`？列表移动如何被识别？什么情况下复用 Fiber？ |
| 第十一阶段：lane 优先级模型 | 理解 React 如何用 bitmask 表示更新优先级和批处理 | `packages/react-reconciler/src/ReactFiberLane.js`<br>`packages/react-reconciler/src/ReactEventPriorities.js`<br>`packages/react-reconciler/src/ReactFiberWorkLoop.js`<br>`packages/react-reconciler/src/ReactFiberRootScheduler.js` | `requestUpdateLane`<br>`eventPriorityToLane`<br>`getNextLanes`<br>`markRootUpdated`<br>`markRootFinished`<br>`requestTransitionLane` | `Lane`<br>`Lanes`<br>`pendingLanes`<br>`suspendedLanes`<br>`pingedLanes`<br>`entangledLanes` | 先看 lane 常量，再看 update 如何选 lane，再看 root 如何选下次执行的 lanes | lane 为什么用二进制位？同步更新、默认更新、transition 更新有什么区别？ |
| 第十二阶段：并发渲染相关机制 | 理解可中断渲染、transition、Suspense、deferred work 的协作方式 | `packages/react-reconciler/src/ReactFiberWorkLoop.js`<br>`packages/react-reconciler/src/ReactFiberRootScheduler.js`<br>`packages/react-reconciler/src/ReactFiberThenable.js`<br>`packages/react-reconciler/src/ReactFiberThrow.js`<br>`packages/react-reconciler/src/ReactFiberSuspenseComponent.js`<br>`packages/react/src/ReactStartTransition.js` | `workLoopConcurrent`<br>`shouldYield`<br>`startTransition`<br>`requestTransitionLane`<br>`throwException`<br>`trackUsedThenable` | `Transition`<br>`ThenableState`<br>`SuspenseState`<br>`OffscreenLane`<br>`DeferredLane`<br>`RetryLane` | 先理解并发 work loop，再读 transition lane，最后读 Suspense、thenable、retry | 并发渲染“并发”在哪里？渲染中断后如何恢复？Suspense 如何触发重试？ |

## 第一轮阅读建议

第一轮不要追所有 feature flag 和平台分支。建议把注意力固定在浏览器客户端渲染主线：

```text
JSX
  -> ReactElement
  -> createRoot
  -> updateContainer
  -> scheduleUpdateOnFiber
  -> workLoop
  -> beginWork
  -> completeWork
  -> commitRoot
  -> DOM mutation
```

## 第二轮专题阅读建议

当第一轮主线跑通后，再按专题补强：

| 专题 | 建议入口 |
| --- | --- |
| Hooks | `packages/react-reconciler/src/ReactFiberHooks.js` |
| Diff | `packages/react-reconciler/src/ReactChildFiber.js` |
| Lane | `packages/react-reconciler/src/ReactFiberLane.js` |
| Scheduler | `packages/scheduler/src/forks/Scheduler.js` |
| Commit | `packages/react-reconciler/src/ReactFiberCommitWork.js` |
| Suspense | `packages/react-reconciler/src/ReactFiberSuspenseComponent.js` |
| 并发渲染 | `packages/react-reconciler/src/ReactFiberWorkLoop.js` |
| DOM HostConfig | `packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js` |

## 每阶段输出建议

学习每一阶段时，建议自己记录四类笔记：

| 笔记类型 | 记录内容 |
| --- | --- |
| 入口 | 这个阶段从哪个公开 API 或内部函数进入 |
| 数据结构 | 当前阶段最重要的数据结构字段 |
| 主流程 | 正常路径下函数调用顺序 |
| 分支 | 暂时跳过的复杂分支，例如 DEV、hydration、Suspense、feature flag |

这样读到后面时，可以把每一阶段拼成一张完整的源码地图。
