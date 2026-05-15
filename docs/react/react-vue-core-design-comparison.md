# React 与 Vue 核心实现差异源码设计对比

本文从源码设计角度对比 React 和 Vue 的核心实现。React 侧基于当前本地 `react-main` 源码；Vue 侧参考官方源码仓库：

- Vue 3: <https://github.com/vuejs/core>
- Vue 2: <https://github.com/vuejs/vue>

为了避免把两个框架讲成“谁更好”，本文只关注设计取舍：它们分别把复杂度放在哪里、更新从哪里开始、如何调度、如何 diff，以及哪些思想值得学习。

## 一、总览对比表

| 维度 | React | Vue 2 | Vue 3 |
| --- | --- | --- | --- |
| 响应式模型 | 不做运行时透明依赖收集，状态更新由 `setState` / Hook dispatch 显式触发 | `Object.defineProperty` 劫持 data 属性 getter/setter | `Proxy` 劫持对象访问，`track` / `trigger` 管理依赖 |
| 更新入口 | `setState`、`dispatchSetState`、`updateContainer` | setter 中 `dep.notify()` | Proxy `set` 中 `trigger(...)` |
| 依赖关系 | update 挂到 Fiber 的 updateQueue 或 Hook queue，root 记录 lanes | `Dep.target` 指向当前 Watcher，getter 中收集依赖 | `targetMap -> depsMap -> Dep -> ReactiveEffect` |
| 组件更新粒度 | 状态所在 Fiber 发起更新，render 阶段重新执行相关 Fiber 子树 | data key 触发订阅它的 Watcher，组件 render watcher 重新渲染 | reactive key 触发订阅它的 component effect，组件 effect 重新执行 |
| render 模型 | function component 重新执行，生成 React Element，再 reconcile Fiber | render watcher 执行 render 函数生成 VNode，再 patch | component render effect 执行 render，生成 VNode，再 patch |
| diff 核心 | Fiber child reconciliation，单向扫描 + key map + `lastPlacedIndex` 判断移动 | 双端 diff，四指针比较头头、尾尾、头尾、尾头 | 快速 diff，头尾预处理 + key map + `newIndexToOldIndexMap` + LIS |
| 调度模型 | Fiber + scheduler + lane，可中断 render，不可中断 commit | watcher queue + `nextTick` 异步批处理 | job queue + microtask flush，pre/post flush callbacks |
| 优先级 | lane 位图表示更新优先级和批次，映射 Scheduler priority | 基本按 watcher id 排序和去重，没有 lane 模型 | job id 排序、去重、pre/post 队列，没有 React 式 lane 时间切片 |
| 编译时能力 | JSX 是 JS 语法扩展，主要生成 `jsx(...)` / `createElement(...)` 调用 | template 编译成 render 函数，运行时 patch VNode | template compiler 输出 patch flags、block tree、hoist 静态节点 |
| 核心哲学 | runtime-first，显式状态更新，统一 Fiber 工作循环和优先级调度 | runtime reactivity，模板编译辅助但运行时依赖收集是主线 | compiler + runtime 协作，用编译信息降低运行时 diff 成本 |

一句话概括：

```text
React 把更新建模为“显式投递 update 到 Fiber，再由调度系统选择 lanes 执行 render/commit”。
Vue 把更新建模为“读取时自动收集依赖，写入时触发对应 effect/job，再 patch VNode”。
```

## 二、核心源码位置对照

### React

| 模块 | 关键文件 | 重点函数 |
| --- | --- | --- |
| Hooks update | `packages/react-reconciler/src/ReactFiberHooks.js` | `dispatchSetState`、`dispatchSetStateInternal`、`mountState`、`updateState`、`renderWithHooks` |
| Hook 并发更新 | `packages/react-reconciler/src/ReactFiberConcurrentUpdates.js` | `enqueueConcurrentHookUpdate`、`finishQueueingConcurrentUpdates`、`getRootForUpdatedFiber` |
| class/root update | `packages/react-reconciler/src/ReactFiberClassUpdateQueue.js` | `createUpdate`、`enqueueUpdate`、`processUpdateQueue` |
| lane | `packages/react-reconciler/src/ReactFiberLane.js` | `markRootUpdated`、`getNextLanes` |
| work loop | `packages/react-reconciler/src/ReactFiberWorkLoop.js` | `requestUpdateLane`、`scheduleUpdateOnFiber`、`performWorkOnRoot`、`renderRootConcurrent`、`workLoopConcurrent`、`commitRoot` |
| root scheduler | `packages/react-reconciler/src/ReactFiberRootScheduler.js` | `ensureRootIsScheduled`、`performWorkOnRootViaSchedulerTask`、`performSyncWorkOnRoot` |
| diff | `packages/react-reconciler/src/ReactChildFiber.js` | `reconcileChildFibers`、`reconcileChildrenArray`、`placeChild` |
| begin/complete | `packages/react-reconciler/src/ReactFiberBeginWork.js`、`ReactFiberCompleteWork.js` | `beginWork`、`updateFunctionComponent`、`completeWork` |
| commit DOM | `packages/react-reconciler/src/ReactFiberCommitWork.js`、`ReactFiberCommitHostEffects.js` | `commitMutationEffects`、`commitHostUpdate`、`commitHostPlacement` |
| DOM host config | `packages/react-dom-bindings/src/client/ReactFiberConfigDOM.js` | `commitUpdate`、`commitTextUpdate`、`appendChildToContainer` |

### Vue 2

| 模块 | 官方源码文件 | 重点函数/类 |
| --- | --- | --- |
| 响应式 | `src/core/observer/index.ts` | `Observer`、`defineReactive`、`observe`、`set` |
| 依赖容器 | `src/core/observer/dep.ts` | `Dep`、`depend`、`notify`、`Dep.target` |
| Watcher | `src/core/observer/watcher.ts` | `Watcher`、`get`、`update`、`run` |
| 调度 | `src/core/observer/scheduler.ts` | `queueWatcher`、`flushSchedulerQueue` |
| patch/diff | `src/core/vdom/patch.ts` | `patchVnode`、`updateChildren`、`sameVnode` |
| template 编译 | `src/compiler/*` | `parse`、`optimize`、`generate` |

### Vue 3

| 模块 | 官方源码文件 | 重点函数/类 |
| --- | --- | --- |
| Proxy handlers | `packages/reactivity/src/baseHandlers.ts` | `BaseReactiveHandler.get`、`MutableReactiveHandler.set` |
| 依赖追踪 | `packages/reactivity/src/dep.ts` | `targetMap`、`track`、`trigger`、`Dep` |
| effect | `packages/reactivity/src/effect.ts` | `ReactiveEffect`、`effect` |
| renderer | `packages/runtime-core/src/renderer.ts` | `baseCreateRenderer`、`patch`、`setupRenderEffect`、`patchKeyedChildren` |
| scheduler | `packages/runtime-core/src/scheduler.ts` | `queueJob`、`queueFlush`、`flushJobs`、`queuePostFlushCb` |
| compiler | `packages/compiler-core/src/*` | `baseParse`、`transform`、`generate`、patch flags |

## 三、响应式机制对比

### React: 显式 update queue

React 不会在读取 `state` 时自动建立“这个组件依赖了某个字段”的关系。React 的响应式入口是显式的：

```jsx
const [count, setCount] = useState(0);
setCount(count + 1);
```

Hook 更新链路：

```text
setCount(action)
  -> dispatchSetState(fiber, queue, action)
  -> requestUpdateLane(fiber)
  -> dispatchSetStateInternal(...)
  -> 创建 Hook update
  -> enqueueConcurrentHookUpdate(fiber, queue, update, lane)
  -> scheduleUpdateOnFiber(root, fiber, lane)
```

Hook update 数据结构：

```js
{
  lane,
  revertLane: NoLane,
  gesture: null,
  action,
  hasEagerState: false,
  eagerState: null,
  next: null
}
```

Hook queue 挂在 Hook 节点上，Hook 链表挂在 FunctionComponent Fiber 上：

```text
FunctionComponent Fiber.memoizedState
  -> Hook(useState)
      memoizedState
      baseState
      baseQueue
      queue
        pending
        lanes
        dispatch
        lastRenderedReducer
        lastRenderedState
```

设计含义：

| 特点 | 说明 |
| --- | --- |
| 显式触发 | 只有调用 `setState` / dispatch 才进入 React 更新流程 |
| 不做属性级依赖追踪 | React 不知道组件读取了对象里的哪个字段 |
| 重新执行组件函数 | function component 更新时重新调用组件函数 |
| 调度能力强 | update 被 lane 化后可以合并、跳过、恢复、按优先级执行 |

### Vue 2: `defineProperty` + Dep + Watcher

Vue 2 会在初始化 data 时递归转换属性：

```text
observe(data)
  -> new Observer(value)
  -> walk(obj)
  -> defineReactive(obj, key, value)
```

`defineReactive` 给每个 key 创建 `Dep`，并通过 getter/setter 劫持读取和写入：

```text
getter:
  if Dep.target exists:
    dep.depend()

setter:
  if value changed:
    dep.notify()
```

组件渲染时会创建 render watcher：

```text
new Watcher(vm, updateComponent, noop, watcherOptions, true)
```

当 render 函数读取 data：

```js
this.count
```

getter 会把当前 `Dep.target` 指向的 Watcher 收集到该属性的 Dep 中。

写入时：

```js
this.count++;
```

setter 触发：

```text
dep.notify()
  -> watcher.update()
  -> queueWatcher(watcher)
  -> nextTick(flushSchedulerQueue)
```

设计含义：

| 特点 | 说明 |
| --- | --- |
| 读取即收集依赖 | render 读了哪个 key，就订阅哪个 key |
| 写入自动触发 | 用户改 data，不需要显式 dispatch |
| 粒度较细 | 属性级 Dep 可以知道哪些 watcher 依赖该 key |
| 有历史限制 | `defineProperty` 对新增属性、数组索引/length 等场景需要额外处理 |

### Vue 3: `Proxy` + `track` / `trigger`

Vue 3 用 `Proxy` 替代 Vue 2 的 `defineProperty`。

读取：

```text
reactiveObj.count
  -> BaseReactiveHandler.get
  -> track(target, TrackOpTypes.GET, key)
```

写入：

```text
reactiveObj.count = 1
  -> MutableReactiveHandler.set
  -> trigger(target, TriggerOpTypes.SET, key, value, oldValue)
```

依赖容器形态：

```text
targetMap: WeakMap<object, Map<key, Dep>>

target
  -> depsMap
      key: "count"
        -> Dep
            -> ReactiveEffect(component render effect)
```

组件更新时，组件 render 被包进 `ReactiveEffect`：

```text
componentUpdateFn
  -> renderComponentRoot(instance)
  -> patch(prevTree, nextTree, ...)

ReactiveEffect(componentUpdateFn)
  scheduler -> queueJob(job)
```

设计含义：

| 特点 | 说明 |
| --- | --- |
| Proxy 覆盖能力更强 | 新增属性、删除属性、数组、Map/Set 等更自然 |
| effect 是核心抽象 | 组件更新、computed、watch 都建立在 effect/dep 模型上 |
| 响应式独立包 | `@vue/reactivity` 可以脱离 renderer 使用 |
| 编译器可增强运行时 | template compiler 产生 patch flags，减少运行时 diff 范围 |

## 四、更新触发方式对比

### React 调用链

以 Hook 为例：

```text
dispatchSetState
  -> requestUpdateLane
  -> dispatchSetStateInternal
  -> enqueueConcurrentHookUpdate
  -> getRootForUpdatedFiber
  -> scheduleUpdateOnFiber
  -> markRootUpdated
  -> ensureRootIsScheduled
  -> performWorkOnRootViaSchedulerTask / performSyncWorkOnRoot
  -> performWorkOnRoot
  -> renderRootConcurrent / renderRootSync
  -> workLoopConcurrent / workLoopSync
  -> beginWork
  -> updateFunctionComponent
  -> renderWithHooks
  -> updateState
  -> reconcileChildren
  -> completeWork
  -> commitRoot
```

React 的更新触发是“命令式投递 update”：

```text
用户调用 setCount
  -> React 创建 update
  -> update 进入 queue
  -> root 被标记 pending lanes
  -> scheduler 选择执行时机
```

### Vue 2 调用链

```text
data.count = 1
  -> setter
  -> dep.notify()
  -> watcher.update()
  -> queueWatcher(watcher)
  -> nextTick(flushSchedulerQueue)
  -> watcher.run()
  -> watcher.get()
  -> updateComponent()
  -> vm._render()
  -> vm._update(vnode)
  -> patch(oldVnode, vnode)
```

Vue 2 的更新触发是“依赖自动触发 Watcher”：

```text
render 期间读取 count
  -> getter 收集 render watcher

写入 count
  -> setter 触发 dep.notify
  -> 对应 watcher 入队更新
```

### Vue 3 调用链

```text
state.count = 1
  -> Proxy set
  -> trigger(target, SET, "count")
  -> 找到 count 对应 Dep
  -> 触发订阅的 ReactiveEffect
  -> scheduler: queueJob(componentUpdateJob)
  -> queueFlush()
  -> Promise.then(flushJobs)
  -> component update job
  -> renderComponentRoot(instance)
  -> patch(prevTree, nextTree, ...)
```

Vue 3 的更新触发是“Proxy trigger effect”：

```text
render effect 执行时读取 count
  -> track 收集 effect

写入 count
  -> trigger 找到 effect
  -> scheduler 把 component job 入队
```

## 五、diff 算法对比

### React Fiber child reconciliation

源码位置：

```text
packages/react-reconciler/src/ReactChildFiber.js
```

React 数组 diff 的核心思路：

```text
reconcileChildFibers
  -> reconcileChildFibersImpl
  -> reconcileChildrenArray
    -> 第一轮从左到右尝试按位置复用
    -> 遇到不匹配后，把剩余旧 Fiber 建成 map
    -> 遍历剩余新 children，用 key 或 index 找可复用旧 Fiber
    -> placeChild 根据 oldIndex 和 lastPlacedIndex 判断是否移动
    -> 标记 Placement / ChildDeletion
```

React 判断移动的核心变量：

```text
lastPlacedIndex
```

含义：

```text
如果旧 Fiber 的 oldIndex < lastPlacedIndex:
  说明它在新序列中相对顺序倒退，需要移动，标记 Placement

否则:
  可以留在原位置，更新 lastPlacedIndex
```

React 的特点：

| 特点 | 说明 |
| --- | --- |
| 单向扫描 | 不使用 Vue 2 那种双端四指针 |
| Fiber 可中断 | diff 是 render 阶段的一部分，可以按 Fiber unit 分片 |
| flags 延迟提交 | render 阶段只标记 Placement/ChildDeletion/Update，commit 阶段执行 DOM |
| 不用 LIS | React 用 `lastPlacedIndex` 判断移动，不追求最少移动次数 |

### Vue 2 双端 diff

源码位置：

```text
vue/src/core/vdom/patch.ts
```

核心函数：

```text
updateChildren(parentElm, oldCh, newCh, insertedVnodeQueue, removeOnly)
```

Vue 2 使用四个指针：

```text
oldStartIdx / oldEndIdx
newStartIdx / newEndIdx
```

每轮比较：

```text
oldStart vs newStart
oldEnd vs newEnd
oldStart vs newEnd
oldEnd vs newStart
```

命中后 patch 并移动指针；必要时通过 key map 找旧节点，执行创建、移动或删除。

特点：

| 特点 | 说明 |
| --- | --- |
| 对头尾移动友好 | 适合处理首尾增删和简单反转/移动 |
| DOM 移动即时发生 | patch 过程中直接 `insertBefore` |
| 没有 Fiber flags 分离 | diff 和 DOM 操作耦合更紧 |
| 算法直观 | 四指针逻辑比 Fiber reconciliation 更容易手推 |

### Vue 3 LIS 快速 diff

源码位置：

```text
vuejs/core/packages/runtime-core/src/renderer.ts
```

核心函数：

```text
patchKeyedChildren
```

Vue 3 keyed children diff 分成五段：

```text
1. sync from start
2. sync from end
3. common sequence + mount
4. common sequence + unmount
5. unknown sequence
```

unknown sequence 的关键结构：

```text
keyToNewIndexMap
newIndexToOldIndexMap
moved
maxNewIndexSoFar
increasingNewIndexSequence = getSequence(newIndexToOldIndexMap)
```

LIS 的作用：

```text
在需要移动的节点中，找出最长稳定子序列。
稳定子序列中的节点不用移动，其他节点移动或新增。
```

特点：

| 特点 | 说明 |
| --- | --- |
| 移动次数更少 | LIS 用于减少 DOM move |
| 编译器辅助 | patch flags 和 block tree 可跳过大量静态节点 |
| 运行时 patch 更聚焦 | template 编译信息告诉 runtime 哪些部分动态 |
| 不做 React 式时间切片 | diff 通常作为一个组件 job 内的同步过程执行 |

### diff 设计差异表

| 对比项 | React | Vue 2 | Vue 3 |
| --- | --- | --- | --- |
| 核心结构 | Fiber 链表树 | VNode 树 | VNode + block tree |
| 子节点 diff | 单向扫描 + map + `lastPlacedIndex` | 双端四指针 | 头尾预处理 + key map + LIS |
| 移动优化 | 判断是否需要移动，不保证最少移动 | 首尾移动优化 | LIS 尽量减少移动 |
| DOM 操作时机 | commit 阶段统一执行 | patch 过程中执行 | patch 过程中执行 |
| 可中断性 | render 阶段可中断 | 不可中断 | 不可中断为主 |
| 编译器参与 | JSX 不提供 patch flags | template 编译 render 函数 | template 编译 patch flags/block tree |

## 六、调度机制对比

### React: Fiber + Scheduler + Lane

React 调度链路：

```text
requestUpdateLane
  -> update.lane
  -> markRootUpdated(root, lane)
  -> root.pendingLanes |= lane
  -> ensureRootIsScheduled(root)
  -> getNextLanes(root, ...)
  -> lanesToEventPriority(nextLanes)
  -> Scheduler.scheduleCallback(priority, performWorkOnRootViaSchedulerTask)
  -> renderRootConcurrent
  -> workLoopConcurrent / shouldYield
```

React 的核心能力：

| 能力 | 来源 |
| --- | --- |
| 多优先级 | lane 位图 |
| 批量更新 | 多个 updates 合并到 lanes |
| 中断恢复 | Fiber workInProgress + alternate |
| 时间切片 | Scheduler + `shouldYield` |
| 提交一致性 | commit 阶段不可中断 |

React 把调度作为框架核心能力：同一个 root 上的任务不只是排队，还要按 lane 选择“下一批最应该处理的工作”。

### Vue 2: watcher queue

Vue 2 调度链路：

```text
dep.notify()
  -> watcher.update()
  -> queueWatcher(watcher)
  -> nextTick(flushSchedulerQueue)
  -> watcher.run()
```

主要能力：

| 能力 | 说明 |
| --- | --- |
| 去重 | 同一个 watcher id 只入队一次 |
| 异步批处理 | `nextTick` 中统一 flush |
| 顺序控制 | flush 前按 watcher id 排序，通常保证父组件先于子组件 |
| 简单稳定 | 没有复杂优先级模型 |

### Vue 3: job queue

Vue 3 调度链路：

```text
trigger(...)
  -> effect.scheduler()
  -> queueJob(job)
  -> queueFlush()
  -> Promise.resolve().then(flushJobs)
  -> job()
```

Vue 3 scheduler 维护：

```text
queue
pendingPostFlushCbs
activePostFlushCbs
flushIndex
currentFlushPromise
```

主要能力：

| 能力 | 说明 |
| --- | --- |
| job 去重 | `SchedulerJobFlags.QUEUED` |
| 父子顺序 | 按 job id 插入，父组件 uid 通常更小 |
| pre/post 队列 | 支持 watcher flush timing、生命周期后置回调 |
| microtask flush | Promise microtask 中批量执行 |

Vue scheduler 更像“稳定、高效的异步队列”；React scheduler 更像“带优先级和可中断工作循环的任务系统”。

## 七、组件更新粒度对比

### React 粒度

React 组件更新从 update 所在 Fiber 开始，但渲染模型是重新执行组件函数：

```text
setState / dispatch
  -> 标记 fiber.lanes 和父路径 childLanes
  -> root pendingLanes
  -> beginWork 找到有工作的 Fiber
  -> updateFunctionComponent
  -> renderWithHooks
  -> 重新执行组件函数
  -> reconcileChildren
```

React 不知道：

```text
组件具体读取了 state 对象的哪个字段
```

所以 React 的优化通常依赖：

| 方式 | 说明 |
| --- | --- |
| 组件边界 | Fiber 子树 bailout |
| 引用稳定性 | `memo`、`useMemo`、`useCallback`、React Compiler |
| lane | 跳过不属于当前 renderLanes 的 update |
| key | 控制 child Fiber 复用 |

### Vue 粒度

Vue 组件更新基于依赖追踪：

```text
render effect 执行
  -> 读取 state.count
  -> track count -> component effect

state.count = 1
  -> trigger count
  -> 只调度依赖 count 的 effect
```

粒度差异：

| 对比项 | React | Vue |
| --- | --- | --- |
| 依赖知道到哪一层 | Fiber/update queue | reactive target/key |
| 触发入口 | 显式 dispatch | 数据写入自动 trigger |
| 组件函数执行 | setState 后重新执行相关组件 | effect 被 trigger 后重新执行 render |
| 子树跳过 | bailout/memo/lane | 依赖没有触发则 effect 不入队，编译器还能跳静态节点 |

重要边界：Vue 的组件 render effect 仍然以组件为更新单位，不是每个 DOM 文本都单独一个 effect。更细的 key 依赖决定“哪些组件 effect 会被调度”，组件内部 patch 仍然要比较 VNode，只是 Vue 3 compiler 可以大幅缩小比较范围。

## 八、编译时能力对比

### React JSX

React JSX 主要是 JavaScript 语法扩展：

```jsx
<div className="box">{count}</div>
```

大致编译为：

```js
jsx("div", {
  className: "box",
  children: count,
});
```

设计特点：

| 特点 | 说明 |
| --- | --- |
| 接近 JS | 条件、循环、函数组合都直接用 JS |
| 编译信息少 | JSX 通常不会告诉 runtime 哪些 props 是动态的 |
| runtime 统一处理 | React Element -> Fiber -> diff |
| 未来优化方向 | React Compiler 通过静态分析减少手写 memo 成本 |

### Vue template compiler

Vue template：

```vue
<template>
  <div class="box">{{ count }}</div>
</template>
```

会被编译成 render 函数，并带上运行时优化信息：

```text
template
  -> AST
  -> transform
  -> codegen render function
  -> patch flags / block tree / hoisted static nodes
```

Vue 3 编译器能告诉 runtime：

| 编译信息 | 作用 |
| --- | --- |
| patch flags | 哪些 props/text/class/style 是动态的 |
| block tree | 收集动态节点，跳过大量静态节点 |
| hoist static | 静态 VNode 或静态 props 提升，避免重复创建 |
| cache handlers | 缓存事件处理器，降低不必要更新 |

### 编译模型差异

| 对比项 | React JSX | Vue template |
| --- | --- | --- |
| 表达力来源 | JavaScript 本身 | 模板 DSL + 指令 |
| 编译器掌握结构 | 较少，JS 太灵活 | 较多，模板结构可分析 |
| runtime diff 依赖 | 更多依赖运行时通用 diff | 编译器给 runtime 精准提示 |
| 学习重点 | Element/Fiber/update/scheduler | compiler flags/reactivity/renderer |

## 九、源码设计思想差异

### React 的设计思想

React 的主线是：

```text
UI = f(state)
```

但源码实现上，它更强调：

```text
把 UI 更新拆成可调度的工作单元
```

核心设计：

| 设计 | 目的 |
| --- | --- |
| Fiber | 把递归渲染拆成可中断、可恢复的链表工作单元 |
| alternate 双缓存 | current 树和 workInProgress 树切换，保证一致提交 |
| lane | 表达优先级、批次、跳过、合并、重试 |
| scheduler | 时间切片，让长任务能让出主线程 |
| render/commit 分离 | render 可中断，commit 原子提交 |
| flags | render 阶段记录副作用，commit 阶段消费 |

React 的复杂度主要花在“调度和一致性”上。

### Vue 的设计思想

Vue 的主线是：

```text
自动追踪数据依赖，数据变了就更新依赖它的组件
```

Vue 3 更进一步：

```text
用 compiler 提供静态信息，帮助 runtime 少做工作
```

核心设计：

| 设计 | 目的 |
| --- | --- |
| reactive / ref | 建立响应式数据源 |
| track / trigger | 自动收集和触发依赖 |
| ReactiveEffect | 把组件渲染、computed、watch 统一成 effect |
| job queue | 异步批量更新，去重和排序 |
| template compiler | 产出 patch flags/block tree，降低 runtime diff 成本 |
| LIS diff | keyed children 中减少 DOM 移动 |

Vue 的复杂度主要花在“依赖追踪和编译优化”上。

### 两种思想的根本区别

| 问题 | React 的答案 | Vue 的答案 |
| --- | --- | --- |
| 怎么知道要更新？ | 用户显式 dispatch update | 数据读取时 track，写入时 trigger |
| 怎么决定先更新谁？ | root lanes + Scheduler priority | job queue 排序和 microtask flush |
| 怎么保证大更新不卡？ | Fiber 时间切片，可中断 render | 更细依赖 + 编译器减少要做的 work |
| 怎么减少 diff 成本？ | Fiber bailout、memo、key、未来 compiler | patch flags、block tree、hoist、LIS |
| DOM 什么时候改？ | commit 阶段统一改 | patch 过程中改 |

## 十、调用链差异汇总

### React useState 更新

```text
setCount
  -> dispatchSetState
  -> requestUpdateLane
  -> enqueueConcurrentHookUpdate
  -> scheduleUpdateOnFiber
  -> markRootUpdated
  -> ensureRootIsScheduled
  -> performWorkOnRootViaSchedulerTask
  -> renderRootConcurrent
  -> workLoopConcurrent
  -> beginWork
  -> updateFunctionComponent
  -> renderWithHooks
  -> updateState
  -> reconcileChildren
  -> completeWork
  -> commitRoot
  -> commitMutationEffects
  -> commitHostUpdate / commitHostTextUpdate
```

### Vue 2 data 更新

```text
vm.count = 1
  -> defineReactive setter
  -> dep.notify
  -> watcher.update
  -> queueWatcher
  -> nextTick(flushSchedulerQueue)
  -> watcher.run
  -> updateComponent
  -> vm._render
  -> vm._update
  -> patch
  -> patchVnode / updateChildren
  -> nodeOps 更新 DOM
```

### Vue 3 reactive 更新

```text
state.count = 1
  -> Proxy set
  -> trigger(target, SET, "count")
  -> Dep 触发 ReactiveEffect
  -> scheduler queueJob(componentJob)
  -> queueFlush
  -> Promise.then(flushJobs)
  -> componentJob
  -> renderComponentRoot
  -> patch(prevTree, nextTree)
  -> patchElement / patchChildren / patchKeyedChildren
  -> hostPatchProp / hostSetText / hostInsert
```

## 十一、哪些设计值得学习

### 值得从 React 学的

| 设计 | 值得学习的点 |
| --- | --- |
| Fiber | 把递归任务拆成显式工作单元，复杂系统可以中断、恢复、重试 |
| lane | 用位图表达优先级和批次，适合高并发 UI 更新 |
| render/commit 分离 | 先计算完整结果，再原子提交，避免半成品 UI |
| double buffering | current/workInProgress 双树切换，保证一致性 |
| flags 模型 | render 阶段只记录副作用，commit 阶段统一消费 |
| 显式 update queue | 更新来源、顺序、优先级都可建模和调试 |

### 值得从 Vue 学的

| 设计 | 值得学习的点 |
| --- | --- |
| track/trigger | 依赖自动追踪让用户代码更直接，减少手动优化负担 |
| 响应式独立包 | reactivity 和 renderer 解耦，抽象边界清晰 |
| compiler + runtime | 能在编译期确定的信息，不留给运行时猜 |
| patch flags | 用静态标记减少 diff 范围，提升更新效率 |
| job queue | 简洁稳定的异步批处理、去重、父子顺序控制 |
| LIS diff | 在 keyed children 移动场景中减少 DOM move |

### 工程实践启发

| 场景 | 可以借鉴 |
| --- | --- |
| 构建大型交互系统 | React 的任务建模、优先级、原子提交 |
| 构建数据驱动表单/后台 | Vue 的依赖追踪和组件级 effect |
| 写渲染器/编辑器 | React 的 render/commit 分层 + Vue 的编译期标记都值得学 |
| 优化列表 diff | React 的 `lastPlacedIndex` 简洁，Vue 3 的 LIS 更追求最少移动 |
| 设计状态系统 | React 偏显式队列，Vue 偏自动依赖图，取决于是否需要透明追踪 |

## 十二、学习建议

如果你已经在读 React 源码，建议这样对照 Vue：

| 阶段 | React 重点 | Vue 对照 |
| --- | --- | --- |
| 1 | `dispatchSetState`、Hook queue | Vue 3 `track` / `trigger`，Vue 2 `Dep` / `Watcher` |
| 2 | `scheduleUpdateOnFiber`、lane | Vue `queueJob` / `queueWatcher` |
| 3 | `beginWork`、`renderWithHooks` | Vue `ReactiveEffect` + `renderComponentRoot` |
| 4 | `reconcileChildFibers` | Vue 2 `updateChildren`，Vue 3 `patchKeyedChildren` |
| 5 | `completeWork`、`commitRoot` | Vue `patchElement` / host operations |
| 6 | React Compiler / JSX | Vue template compiler / patch flags |

推荐心智模型：

```text
React:
  显式 update -> lane 调度 -> Fiber render -> commit DOM

Vue:
  reactive read track -> write trigger -> job queue -> render effect -> patch DOM
```

## 十三、结论

React 和 Vue 的最大差异不是“是否虚拟 DOM”，而是“更新如何被发现和组织”。

React 选择显式更新与强调度能力。它不追踪属性级依赖，而是把 update、lane、Fiber、Scheduler 串成一条可中断、可恢复、可合并的工作链路。这让 React 在并发渲染、优先级控制、Suspense 等复杂场景中有很强的表达力。

Vue 选择自动依赖追踪与编译器协作。Vue 通过 getter/Proxy 收集依赖，用 trigger 精准唤醒 effect，再通过 template compiler 给 runtime 提供 patch flags 和 block tree，减少不必要 diff。这让 Vue 在普通业务组件中有更直接的数据驱动体验和较低的手动优化成本。

最终可以这样记：

```text
React 更像一个“可调度 UI 运行时”。
Vue 更像一个“响应式系统 + 编译优化渲染器”。
```

两者都值得学：React 适合理解任务调度、并发、渲染一致性；Vue 适合理解响应式依赖图、编译期优化和更细粒度的更新触发。
