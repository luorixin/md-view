# React lane 优先级模型源码深入分析

本文基于当前 `react-main` 源码，分析 React lane 优先级模型，包括 lane 数据结构、位运算、`requestUpdateLane`、`markRootUpdated`、`getNextLanes`、entangled lanes、lane 对 `renderRootConcurrent` 的影响，以及 lane 与 Scheduler priority 的关系。

一句话概括：

```text
lane 是 React 用 bitmask 表示“更新优先级 + 更新批次”的模型。
一个 update 属于一个 Lane；
一个 root 上可以同时挂着多个 Lanes；
React 用位运算快速合并、筛选、比较、挂起和恢复这些任务。
```

## 一、源码位置

核心文件：

```text
packages/react-reconciler/src/ReactFiberLane.js
packages/react-reconciler/src/ReactFiberWorkLoop.js
packages/react-reconciler/src/ReactFiberRootScheduler.js
packages/react-reconciler/src/ReactEventPriorities.js
packages/react-reconciler/src/ReactFiberRoot.js
```

相关文件：

| 文件 | 作用 |
| --- | --- |
| `ReactFiberLane.js` | lane 常量、位运算工具、`getNextLanes`、root lane 状态标记 |
| `ReactFiberWorkLoop.js` | `requestUpdateLane`、`scheduleUpdateOnFiber`、`performWorkOnRoot`、`renderRootConcurrent` |
| `ReactFiberRootScheduler.js` | root 调度入口，把 lane 映射成 Scheduler priority |
| `ReactEventPriorities.js` | event priority 与 lane 的对应关系 |
| `ReactFiberRoot.js` | FiberRoot 上保存 `pendingLanes`、`suspendedLanes`、`entangledLanes` 等状态 |
| `ReactFiberClassUpdateQueue.js` | class update queue 中的 transition entanglement |
| `ReactFiberHooks.js` | Hook update 创建 lane，并通过 dispatch 进入调度 |
| `ReactFiberConcurrentUpdates.js` | concurrent update 入队，同时把 lane 标到 Fiber 上 |

## 二、lane 是什么？

源码中 lane 的类型非常朴素：

```js
export type Lanes = number;
export type Lane = number;
export type LaneMap<T> = Array<T>;
```

区别：

| 类型 | 含义 |
| --- | --- |
| `Lane` | 单个优先级/批次，通常只有一个 bit 为 1 |
| `Lanes` | 多个 lane 的集合，是 bitmask |
| `LaneMap<T>` | 以 lane index 为下标的数组，例如 `expirationTimes`、`entanglements` |

当前源码定义了 31 个 lane：

```js
export const TotalLanes = 31;
```

常见 lane：

```js
export const NoLanes = 0b0000000000000000000000000000000;
export const SyncLane = 0b0000000000000000000000000000010;
export const InputContinuousLane = 0b0000000000000000000000000001000;
export const DefaultLane = 0b0000000000000000000000000100000;
const TransitionLanes = 0b0000000001111111111111100000000;
const RetryLanes = 0b0000011110000000000000000000000;
export const IdleLane = 0b0010000000000000000000000000000;
export const OffscreenLane = 0b0100000000000000000000000000000;
export const DeferredLane = 0b1000000000000000000000000000000;
```

可以把 lane 想成一条条车道：

```text
SyncLane:
  紧急车道

InputContinuousLane:
  连续输入车道，比如 mousemove、scroll 相关更新

DefaultLane:
  普通更新车道

TransitionLanes:
  transition 更新车道，一组 lane，用来区分多个 transition 批次

RetryLanes:
  Suspense retry 相关车道

IdleLane:
  空闲任务车道
```

## 三、为什么 React 从 expirationTime 演进到 lane？

早期 React 用 `expirationTime` 表示更新优先级，本质是一个“截止时间”：

```text
越快过期，优先级越高。
```

这种模型的问题是，一个更新更像单个时间点，很难自然表达这些需求：

| 需求 | expirationTime 不擅长的地方 |
| --- | --- |
| 同时存在多类任务 | 单个时间值不容易表达多个独立批次 |
| transition 分组 | 多个 transition 需要保持独立，又能合并 |
| Suspense 挂起/重试 | 某些任务挂起后，需要跳过、ping 后恢复 |
| 批量更新 | 多个 update 需要按集合一起处理 |
| entanglement | 某些 lane 必须一起 render |
| 并发中断和恢复 | 需要判断当前 wip lanes 是否应该被更高优先级打断 |

lane 模型把“优先级”和“批次”都编码到 bitmask 中：

```text
一个 bit 表示一个 lane；
多个 bit 表示一批 lanes；
root 上维护多个 lanes 集合；
React 用集合运算选择下一批任务。
```

当前源码仍然保留了 `expirationTimes`，但它不是旧的 update 主模型，而是每个 lane 的防饥饿辅助表：

```js
this.expirationTimes = createLaneMap(NoTimestamp);
```

`markStarvedLanesAsExpired` 会遍历 pending lanes：

```js
const expirationTime = expirationTimes[index];
if (expirationTime === NoTimestamp) {
  expirationTimes[index] = computeExpirationTime(lane, currentTime);
} else if (expirationTime <= currentTime) {
  root.expiredLanes |= lane;
}
```

所以当前模型可以理解为：

```text
lane:
  主调度模型，表示优先级和批次集合

expirationTimes:
  lane 级别的 starvation 防护
```

## 四、lane 数据结构说明

### 1. FiberRoot 上的 lane 状态

`FiberRoot` 初始化时会创建这些字段：

```js
this.callbackPriority = NoLane;
this.expirationTimes = createLaneMap(NoTimestamp);

this.pendingLanes = NoLanes;
this.suspendedLanes = NoLanes;
this.pingedLanes = NoLanes;
this.warmLanes = NoLanes;
this.expiredLanes = NoLanes;

this.entangledLanes = NoLanes;
this.entanglements = createLaneMap(NoLanes);

this.hiddenUpdates = createLaneMap(null);
```

字段说明：

| 字段 | 含义 |
| --- | --- |
| `pendingLanes` | root 上还没完成的所有任务 |
| `suspendedLanes` | 当前因为 Suspense 等原因挂起的 lanes |
| `pingedLanes` | 挂起后数据已准备好，可以重试的 lanes |
| `warmLanes` | 预热/预渲染相关 lanes |
| `expiredLanes` | 已经过期，需要尽快同步完成的 lanes |
| `entangledLanes` | 存在绑定关系的 lanes |
| `entanglements` | 每个 lane 绑定了哪些其他 lanes |
| `expirationTimes` | 每个 lane 的过期时间 |
| `callbackPriority` | 当前 root 已调度 callback 的最高优先级 lane |

### 2. Fiber 上的 lanes

update 入队时也会立刻标记 Fiber：

```js
fiber.lanes = mergeLanes(fiber.lanes, lane);
const alternate = fiber.alternate;
if (alternate !== null) {
  alternate.lanes = mergeLanes(alternate.lanes, lane);
}
```

含义：

```text
Fiber.lanes:
  当前 Fiber 自己有更新

Fiber.childLanes:
  子树中有更新
```

这让 beginWork 能快速判断子树是否有当前 render lanes 相关的工作。

## 五、lane 如何用位运算表示多个优先级？

lane 是 bitmask，所以核心操作都是位运算。

源码中的工具函数：

```js
export function mergeLanes(a, b) {
  return a | b;
}

export function removeLanes(set, subset) {
  return set & ~subset;
}

export function intersectLanes(a, b) {
  return a & b;
}

export function includesSomeLane(a, b) {
  return (a & b) !== NoLanes;
}

export function isSubsetOfLanes(set, subset) {
  return (set & subset) === subset;
}

export function getHighestPriorityLane(lanes) {
  return lanes & -lanes;
}
```

### 位运算示例

假设：

```js
const SyncLane = 0b0010;
const DefaultLane = 0b100000;
```

合并任务：

```js
const pending = SyncLane | DefaultLane;
// 0b0010 | 0b100000 = 0b100010
```

判断是否包含 Sync：

```js
(pending & SyncLane) !== 0;
// 0b100010 & 0b0010 = 0b0010
// true
```

移除 Sync：

```js
const remaining = pending & ~SyncLane;
// 0b100010 & ~0b0010 = 0b100000
```

取最高优先级 lane：

```js
const highest = pending & -pending;
// 得到最右侧的 1
// 在 React lane 中，越靠右通常优先级越高
```

为什么 `lanes & -lanes` 能取最低位的 1？

```text
lanes     = 0b1011000
-lanes    = 0b0101000  // 二进制补码效果
&         = 0b0001000
```

这能快速得到最高优先级的单个 lane。

## 六、核心函数调用链

以 `setState` / Hook dispatch 为例：

```text
setState / dispatch
  -> requestUpdateLane(fiber)
  -> 创建 update，update.lane = lane
  -> enqueueConcurrentHookUpdate / enqueueConcurrentClassUpdate
  -> scheduleUpdateOnFiber(root, fiber, lane)
  -> markRootUpdated(root, lane)
  -> ensureRootIsScheduled(root)
  -> scheduleTaskForRootDuringMicrotask(root, now)
  -> getNextLanes(root, wipLanes, rootHasPendingCommit)
  -> lanesToEventPriority(nextLanes)
  -> Scheduler.scheduleCallback(...)
  -> performWorkOnRootViaSchedulerTask
  -> getNextLanes(...)
  -> performWorkOnRoot(root, lanes, forceSync)
  -> renderRootConcurrent 或 renderRootSync
```

对于 transition：

```text
startTransition
  -> requestUpdateLane
  -> requestCurrentTransition() !== null
  -> requestTransitionLane(transition)
  -> claimNextTransitionUpdateLane()
  -> update.lane = TransitionLaneX
  -> scheduleUpdateOnFiber
```

对于 commit 完成：

```text
commitRoot
  -> markRootFinished(root, finishedLanes, remainingLanes, ...)
  -> root.pendingLanes = remainingLanes
  -> 清理已经完成 lane 的 entanglements / expirationTimes / hiddenUpdates
  -> ensureRootIsScheduled(root)
```

## 七、requestUpdateLane 做了什么？

入口：

```text
packages/react-reconciler/src/ReactFiberWorkLoop.js
requestUpdateLane(fiber)
```

源码主线：

```js
export function requestUpdateLane(fiber) {
  const mode = fiber.mode;

  if (!disableLegacyMode && (mode & ConcurrentMode) === NoMode) {
    return SyncLane;
  } else if (
    (executionContext & RenderContext) !== NoContext &&
    workInProgressRootRenderLanes !== NoLanes
  ) {
    return pickArbitraryLane(workInProgressRootRenderLanes);
  }

  const transition = requestCurrentTransition();
  if (transition !== null) {
    return requestTransitionLane(transition);
  }

  return eventPriorityToLane(resolveUpdatePriority());
}
```

它按优先级处理四种情况：

| 情况 | 返回 lane |
| --- | --- |
| legacy 非 concurrent root | `SyncLane` |
| render phase update | 当前正在 render 的 `workInProgressRootRenderLanes` 中任选一个 |
| transition 内更新 | `requestTransitionLane(transition)` |
| 普通事件更新 | `eventPriorityToLane(resolveUpdatePriority())` |

### 示例 1：普通点击更新

```jsx
function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

点击时：

```text
dispatchSetState
  -> requestUpdateLane(fiber)
  -> resolveUpdatePriority()
  -> eventPriorityToLane(...)
  -> 通常得到 SyncLane / DiscreteEventPriority 对应 lane
```

### 示例 2：transition 更新

```jsx
startTransition(() => {
  setList(filterItems(input));
});
```

流程：

```text
requestCurrentTransition() !== null
  -> requestTransitionLane(transition)
  -> 当前事件内所有 transition update 复用同一个 TransitionLane
```

`requestTransitionLane` 中有一条关键注释：

```text
All transitions within the same event are assigned the same lane.
```

这让同一个事件里的 transition 更新天然批到同一条 lane 中。

## 八、markRootUpdated 做了什么？

入口：

```text
packages/react-reconciler/src/ReactFiberLane.js
markRootUpdated(root, updateLane)
```

源码：

```js
export function markRootUpdated(root, updateLane) {
  root.pendingLanes |= updateLane;

  if (updateLane !== IdleLane) {
    root.suspendedLanes = NoLanes;
    root.pingedLanes = NoLanes;
    root.warmLanes = NoLanes;
  }
}
```

职责：

| 步骤 | 说明 |
| --- | --- |
| `root.pendingLanes |= updateLane` | 把新 lane 加入 root 待处理集合 |
| 清空 suspended/pinged/warm | 非 idle 更新可能解开之前的挂起状态，所以让相关 lanes 有机会重新尝试 |

示例：

```js
root.pendingLanes = DefaultLane;
updateLane = SyncLane;

markRootUpdated(root, SyncLane);

root.pendingLanes = DefaultLane | SyncLane;
root.suspendedLanes = NoLanes;
root.pingedLanes = NoLanes;
root.warmLanes = NoLanes;
```

它不负责真正调度任务。真正调度由 `scheduleUpdateOnFiber` 后续调用：

```text
scheduleUpdateOnFiber
  -> markRootUpdated
  -> ensureRootIsScheduled
```

## 九、getNextLanes 如何选择下一批要处理的任务？

入口：

```text
packages/react-reconciler/src/ReactFiberLane.js
getNextLanes(root, wipLanes, rootHasPendingCommit)
```

它的目标是：

```text
从 root.pendingLanes 中选择下一批应该 render 的 lanes。
```

源码主线：

```js
export function getNextLanes(root, wipLanes, rootHasPendingCommit) {
  const pendingLanes = root.pendingLanes;
  if (pendingLanes === NoLanes) {
    return NoLanes;
  }

  let nextLanes = NoLanes;

  const suspendedLanes = root.suspendedLanes;
  const pingedLanes = root.pingedLanes;
  const warmLanes = root.warmLanes;

  const nonIdlePendingLanes = pendingLanes & NonIdleLanes;
  if (nonIdlePendingLanes !== NoLanes) {
    const nonIdleUnblockedLanes = nonIdlePendingLanes & ~suspendedLanes;
    if (nonIdleUnblockedLanes !== NoLanes) {
      nextLanes = getHighestPriorityLanes(nonIdleUnblockedLanes);
    } else {
      const nonIdlePingedLanes = nonIdlePendingLanes & pingedLanes;
      if (nonIdlePingedLanes !== NoLanes) {
        nextLanes = getHighestPriorityLanes(nonIdlePingedLanes);
      } else if (!rootHasPendingCommit) {
        const lanesToPrewarm = nonIdlePendingLanes & ~warmLanes;
        if (lanesToPrewarm !== NoLanes) {
          nextLanes = getHighestPriorityLanes(lanesToPrewarm);
        }
      }
    }
  } else {
    // 只剩 idle work 时再处理 idle
  }

  if (nextLanes === NoLanes) {
    return NoLanes;
  }

  if (wipLanes !== NoLanes && wipLanes !== nextLanes) {
    const nextLane = getHighestPriorityLane(nextLanes);
    const wipLane = getHighestPriorityLane(wipLanes);
    if (nextLane >= wipLane) {
      return wipLanes;
    }
  }

  return nextLanes;
}
```

选择策略：

| 顺序 | 规则 |
| --- | --- |
| 1 | 没有 pending lanes，返回 `NoLanes` |
| 2 | 优先处理非 idle lanes |
| 3 | 在非 idle 中优先选未 suspended 的 lanes |
| 4 | 如果都 suspended，选已经 pinged 的 lanes |
| 5 | 如果没有 pinged，可能选择需要 prewarm 的 lanes |
| 6 | 只有 idle work 时才处理 idle |
| 7 | 如果已有 wip render，只有更高优先级 next lanes 才打断当前 render |

### getHighestPriorityLanes

`getNextLanes` 不是只返回一个 bit。它会调用：

```text
getHighestPriorityLanes(lanes)
```

某些优先级会成组返回：

```js
const pendingSyncLanes = lanes & SyncUpdateLanes;
if (pendingSyncLanes !== 0) {
  return pendingSyncLanes;
}
```

`SyncUpdateLanes` 包含：

```js
export const SyncUpdateLanes =
  SyncLane | InputContinuousLane | DefaultLane;
```

这意味着某些同步/默认更新可能被一起处理。

### getNextLanes 示例

假设 root：

```js
root.pendingLanes = DefaultLane | TransitionLane1;
root.suspendedLanes = TransitionLane1;
root.pingedLanes = NoLanes;
```

选择：

```text
nonIdlePendingLanes = DefaultLane | TransitionLane1
nonIdleUnblockedLanes = DefaultLane
nextLanes = getHighestPriorityLanes(DefaultLane)
```

结果：

```text
先处理 DefaultLane
跳过 suspended 的 TransitionLane1
```

如果之后数据 resolved：

```js
root.pingedLanes = TransitionLane1;
```

下一次：

```text
TransitionLane1 可以被选中重试
```

## 十、entangled lanes 是什么？

entangled lanes 指“必须一起 render 的 lanes”。

源码注释说得很直接：

```text
A lane is said to be entangled with another when it's not allowed to render
in a batch that does not also include the other lane.
```

典型原因：

```text
多个 update 来自同一个源；
React 希望只响应该源的最新事件；
或者 transition / deferred / hidden updates 之间存在语义依赖。
```

### getEntangledLanes

入口：

```text
getEntangledLanes(root, renderLanes)
```

流程：

```js
export function getEntangledLanes(root, renderLanes) {
  let entangledLanes = renderLanes;

  const allEntangledLanes = root.entangledLanes;
  if (allEntangledLanes !== NoLanes) {
    const entanglements = root.entanglements;
    let lanes = entangledLanes & allEntangledLanes;
    while (lanes > 0) {
      const index = pickArbitraryLaneIndex(lanes);
      const lane = 1 << index;
      entangledLanes |= entanglements[index];
      lanes &= ~lane;
    }
  }

  return entangledLanes;
}
```

### markRootEntangled

入口：

```text
markRootEntangled(root, entangledLanes)
```

它不仅绑定传入的 lanes，还会处理传递性：

```text
如果 C 已经和 A entangled，
现在 A 和 B entangled，
那么 C 也应该和 B entangled。
```

源码：

```js
export function markRootEntangled(root, entangledLanes) {
  const rootEntangledLanes = (root.entangledLanes |= entangledLanes);
  const entanglements = root.entanglements;

  let lanes = rootEntangledLanes;
  while (lanes) {
    const index = pickArbitraryLaneIndex(lanes);
    const lane = 1 << index;
    if (
      (lane & entangledLanes) |
      (entanglements[index] & entangledLanes)
    ) {
      entanglements[index] |= entangledLanes;
    }
    lanes &= ~lane;
  }
}
```

### class queue 中的 transition entanglement

`ReactFiberClassUpdateQueue.js` 中：

```js
if (isTransitionLane(lane)) {
  let queueLanes = sharedQueue.lanes;
  queueLanes = intersectLanes(queueLanes, root.pendingLanes);

  const newQueueLanes = mergeLanes(queueLanes, lane);
  sharedQueue.lanes = newQueueLanes;

  markRootEntangled(root, newQueueLanes);
}
```

含义：

```text
同一个 queue 上的 transition lanes 会被 entangle，
避免相关更新被拆开提交，导致中间状态暴露给用户。
```

## 十一、lane 如何影响 renderRootConcurrent？

`performWorkOnRoot` 会根据 lanes 决定同步还是并发 render：

```js
const shouldTimeSlice =
  (!forceSync &&
    !includesBlockingLane(lanes) &&
    !includesExpiredLane(root, lanes)) ||
  checkIfRootIsPrerendering(root, lanes);

let exitStatus = shouldTimeSlice
  ? renderRootConcurrent(root, lanes)
  : renderRootSync(root, lanes, true);
```

影响点：

| lane 状态 | 影响 |
| --- | --- |
| blocking lane | 倾向同步 render |
| expired lane | 为防止饥饿，倾向同步完成 |
| transition/retry/idle 等非阻塞 lane | 更可能进入 concurrent render |
| prerendering | 即使是 sync lanes，也可能走 concurrent work loop 避免阻塞主线程 |

`renderRootConcurrent` 接收 lanes：

```js
function renderRootConcurrent(root, lanes) {
  if (workInProgressRoot !== root || workInProgressRootRenderLanes !== lanes) {
    workInProgressTransitions = getTransitionsForLanes(root, lanes);
    resetRenderTimer();
    prepareFreshStack(root, lanes);
  }

  workLoopConcurrent(includesNonIdleWork(lanes));
}
```

关键点：

```text
root 或 lanes 改变:
  丢弃旧 workInProgress stack，prepareFreshStack(root, lanes)

root 和 lanes 未变:
  继续之前中断的 workInProgress
```

这就是 lane 支持“可中断、可恢复”的重要基础：

```text
同一批 lanes:
  可以继续已有 workInProgress

更高优先级 lanes:
  可以中断当前 render，重新开始

低/同优先级 lanes:
  getNextLanes 可能选择继续当前 wipLanes
```

`prepareFreshStack` 中还会计算 entangled render lanes：

```js
entangledRenderLanes = getEntangledLanes(root, lanes);
```

这会影响 beginWork/render 阶段判断哪些 update 能被本次 render 消费。

## 十二、lane 和 scheduler priority 是什么关系？

lane 是 React 内部的更新优先级与批次模型。

Scheduler priority 是宿主任务调度优先级，用来决定 callback 在浏览器任务队列中的执行顺序。

关系：

```text
lane/Lanes
  -> lanesToEventPriority
  -> Scheduler priority
  -> Scheduler.scheduleCallback
```

`ReactEventPriorities.js`：

```js
export const DiscreteEventPriority = SyncLane;
export const ContinuousEventPriority = InputContinuousLane;
export const DefaultEventPriority = DefaultLane;
export const IdleEventPriority = IdleLane;

export function eventPriorityToLane(updatePriority) {
  return updatePriority;
}

export function lanesToEventPriority(lanes) {
  const lane = getHighestPriorityLane(lanes);
  if (!isHigherEventPriority(DiscreteEventPriority, lane)) {
    return DiscreteEventPriority;
  }
  if (!isHigherEventPriority(ContinuousEventPriority, lane)) {
    return ContinuousEventPriority;
  }
  if (includesNonIdleWork(lane)) {
    return DefaultEventPriority;
  }
  return IdleEventPriority;
}
```

`ReactFiberRootScheduler.js` 中把 event priority 转成 Scheduler priority：

```js
switch (lanesToEventPriority(nextLanes)) {
  case DiscreteEventPriority:
  case ContinuousEventPriority:
    schedulerPriorityLevel = UserBlockingSchedulerPriority;
    break;
  case DefaultEventPriority:
    schedulerPriorityLevel = NormalSchedulerPriority;
    break;
  case IdleEventPriority:
    schedulerPriorityLevel = IdleSchedulerPriority;
    break;
  default:
    schedulerPriorityLevel = NormalSchedulerPriority;
    break;
}

scheduleCallback(
  schedulerPriorityLevel,
  performWorkOnRootViaSchedulerTask.bind(null, root),
);
```

### lane 与 scheduler priority 对照

| React lane / EventPriority | Scheduler priority | 说明 |
| --- | --- | --- |
| `SyncLane` / `DiscreteEventPriority` | 通常同步 microtask 刷新；若进入 Scheduler path，则映射到 `UserBlockingSchedulerPriority` | 点击、键盘等离散输入 |
| `InputContinuousLane` / `ContinuousEventPriority` | `UserBlockingSchedulerPriority` | scroll、mousemove 等连续输入 |
| `DefaultLane` / `DefaultEventPriority` | `NormalSchedulerPriority` | 普通 setState、网络回包后的更新等 |
| `TransitionLanes` | 通常通过 `lanesToEventPriority` 归到 default event priority | transition 更新，可中断、可延后 |
| `RetryLanes` | 通常归到 default 或更低语义，取决于最高 lane 和是否 non-idle | Suspense retry |
| `IdleLane` / `IdleEventPriority` | `IdleSchedulerPriority` | 空闲任务 |

注意：

```text
lane 决定 React 内部该处理哪些 update；
Scheduler priority 决定外部 callback 以什么优先级被调度。
```

二者不是同一个系统，但在 root scheduler 中发生映射。

## 十三、lane 如何支持并发渲染和批量更新？

### 1. 支持批量更新

多个 update 可以合并到同一个 lanes 集合：

```js
root.pendingLanes |= updateLane;
```

同一事件中的 transition 更新会复用同一个 transition lane：

```js
if (currentEventTransitionLane === NoLane) {
  currentEventTransitionLane = claimNextTransitionUpdateLane();
}
return currentEventTransitionLane;
```

这样同一事件里的多个更新自然会被一起处理。

示例：

```jsx
function App() {
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);

  function onClick() {
    setA(1);
    setB(2);
  }

  return null;
}
```

同一事件中：

```text
setA -> requestUpdateLane -> SyncLane
setB -> requestUpdateLane -> SyncLane

root.pendingLanes |= SyncLane
两次 update 属于同一批 SyncLane render
```

### 2. 支持并发中断

假设正在 render transition：

```text
wipLanes = TransitionLane1
```

此时用户点击按钮：

```text
nextLanes = SyncLane
```

`getNextLanes` 比较：

```text
SyncLane 优先级高于 TransitionLane1
允许中断当前 render
```

结果：

```text
React 可以丢弃/暂停当前 transition workInProgress
优先处理用户输入
之后再恢复 transition
```

### 3. 支持恢复

`renderRootConcurrent` 中：

```js
if (workInProgressRoot !== root || workInProgressRootRenderLanes !== lanes) {
  prepareFreshStack(root, lanes);
} else {
  // continuation of existing work-in-progress
}
```

含义：

```text
如果 root 和 lanes 没变:
  说明是同一批任务的 continuation
  可以继续之前中断的位置

如果 lanes 改变:
  新任务优先级/批次不同
  重新准备 stack
```

### 4. 支持跳过低优先级 update

Hook update queue 中会按 lane 判断是否处理 update：

```js
const shouldSkipUpdate = !isSubsetOfLanes(renderLanes, updateLane);

if (shouldSkipUpdate) {
  // 优先级不够，留到 baseQueue
} else {
  // 本次 render 消费 update
}
```

这让同一个组件队列里可以同时有高低优先级更新：

```text
本次 renderLanes = SyncLane
  只处理 SyncLane update
  跳过 TransitionLane update

后续 renderLanes = TransitionLane
  再处理被跳过的 transition update
```

## 十四、每一步示例代码

### 示例 1：普通 setState

```jsx
function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(c => c + 1)}>
      {count}
    </button>
  );
}
```

流程：

```text
click event
  -> setCount
  -> dispatchSetState
  -> requestUpdateLane
  -> eventPriorityToLane(resolveUpdatePriority())
  -> update.lane = SyncLane
  -> enqueueConcurrentHookUpdate
  -> scheduleUpdateOnFiber
  -> markRootUpdated(root, SyncLane)
  -> ensureRootIsScheduled(root)
```

### 示例 2：transition

```jsx
function Search() {
  const [text, setText] = useState('');
  const [list, setList] = useState([]);

  function onChange(e) {
    const nextText = e.target.value;
    setText(nextText);

    startTransition(() => {
      setList(expensiveFilter(nextText));
    });
  }

  return null;
}
```

lane 关系：

```text
setText:
  来自输入事件
  InputContinuousLane 或 SyncLane

setList:
  在 startTransition 中
  TransitionLaneX
```

效果：

```text
输入框更新优先
列表过滤更新可中断、可延后
```

### 示例 3：多个 transition update 批到同一 lane

```jsx
startTransition(() => {
  setA(1);
  setB(2);
});
```

流程：

```text
第一次 requestTransitionLane:
  currentEventTransitionLane === NoLane
  claimNextTransitionUpdateLane() -> TransitionLane1

第二次 requestTransitionLane:
  currentEventTransitionLane !== NoLane
  复用 TransitionLane1
```

结果：

```text
setA 和 setB 同批 render
```

### 示例 4：Suspense ping

```jsx
function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Content />
    </Suspense>
  );
}
```

当 `Content` suspend：

```text
当前 lanes 被标记到 suspendedLanes
如果 promise resolved
  -> markRootPinged(root, lanes)
  -> root.pingedLanes |= root.suspendedLanes & lanes
  -> ensureRootIsScheduled
  -> getNextLanes 重新选择 pinged lanes
```

结果：

```text
数据准备好后，React 可以重试之前挂起的 lane
```

### 示例 5：过期 lane 防止饥饿

```text
某个 lane 长时间 pending
  -> markStarvedLanesAsExpired(root, currentTime)
  -> computeExpirationTime(lane, currentTime)
  -> 到期后 root.expiredLanes |= lane
  -> performWorkOnRoot 判断 includesExpiredLane
  -> 不再 time slice，尽快完成
```

这解决了低优先级任务一直被高优先级任务插队的问题。

## 十五、源码阅读重点

推荐阅读顺序：

| 顺序 | 文件/函数 | 目标 |
| --- | --- | --- |
| 1 | `ReactFiberLane.js` 顶部 lane 常量 | 建立 bitmask 直觉 |
| 2 | `mergeLanes` / `removeLanes` / `getHighestPriorityLane` | 理解位运算 |
| 3 | `ReactFiberRoot.js` root lane 字段 | 理解 lanes 存在哪里 |
| 4 | `requestUpdateLane` | 理解 update 如何获得 lane |
| 5 | `scheduleUpdateOnFiber` | 理解 lane 如何标记到 root 并触发调度 |
| 6 | `markRootUpdated` | 理解 root.pendingLanes 如何更新 |
| 7 | `getNextLanes` | 理解下一批任务如何选择 |
| 8 | `ReactEventPriorities.js` | 理解 event priority 与 lane 的关系 |
| 9 | `ReactFiberRootScheduler.js` | 理解 lane 如何映射到 Scheduler priority |
| 10 | `performWorkOnRoot` | 理解 lane 如何决定 sync/concurrent render |
| 11 | `renderRootConcurrent` | 理解 lanes 如何影响 workInProgress 复用/重建 |
| 12 | `markRootEntangled` / `getEntangledLanes` | 理解 entangled lanes |

## 十六、核心问题速记

| 问题 | 答案 |
| --- | --- |
| lane 是什么？ | 一个 bit，表示某个更新优先级/批次 |
| lanes 是什么？ | 多个 lane 的 bitmask 集合 |
| 为什么用 lane？ | 能同时表达多个优先级、批次、挂起、恢复、entangle 和并发中断 |
| requestUpdateLane 做什么？ | 根据 root 模式、render phase、transition、事件优先级为 update 分配 lane |
| markRootUpdated 做什么？ | 把 updateLane 合入 root.pendingLanes，并清理 suspended/pinged/warm 状态 |
| getNextLanes 做什么？ | 从 root.pendingLanes 中选出下一批要 render 的 lanes |
| entangled lanes 是什么？ | 必须一起 render 的 lanes |
| lane 如何影响 concurrent render？ | 决定是否 time slice、是否中断当前 wip、是否复用已有 stack |
| lane 与 Scheduler priority 关系？ | lane 是 React 内部模型，Scheduler priority 是外部任务优先级，root scheduler 会把 lanes 映射过去 |
| lane 如何支持批量更新？ | 多个 update 可以共享同一 lane 或合并为 lanes 集合一起 render |

## 十七、总结

lane 模型是 React 并发架构的调度语言。

它把更新分成不同车道：

```text
SyncLane:
  紧急输入，优先完成

DefaultLane:
  普通更新

TransitionLanes:
  可中断、可延后、可恢复的过渡更新

RetryLanes:
  Suspense retry

IdleLane:
  空闲任务
```

然后通过 root 上的多个 lane 集合管理状态：

```text
pendingLanes:
  还有哪些任务

suspendedLanes:
  哪些任务挂起了

pingedLanes:
  哪些挂起任务可以重试

expiredLanes:
  哪些任务饥饿太久需要强制完成

entangledLanes:
  哪些任务必须一起完成
```

完整闭环：

```text
update 产生
  -> requestUpdateLane
  -> update.lane
  -> markRootUpdated
  -> getNextLanes
  -> lanesToEventPriority
  -> Scheduler callback
  -> performWorkOnRoot
  -> renderRootConcurrent / renderRootSync
  -> commitRoot
  -> markRootFinished
```

理解 lane 后，再看 Scheduler、Reconciler、Hooks updateQueue、Suspense 和 transition，就会看到它们都在围绕同一套 bitmask 优先级语言协作。

