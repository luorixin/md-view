# React Hooks 源码深入分析

本文基于当前 `react-main` 源码，分析 Hooks 的核心实现，重点覆盖 `useState`、`useReducer`、`useEffect`、`useMemo`、`useCallback`。

Hooks 的源码主线可以用一句话概括：

```text
FunctionComponent Fiber.memoizedState 上挂着一条 Hook 链表；
每个 Hook 节点保存自己的状态、队列或 effect；
renderWithHooks 按调用顺序逐个读取/创建 Hook；
commit 阶段再消费 effect 链表。
```

## 一、源码位置

核心文件：

```text
packages/react-reconciler/src/ReactFiberHooks.js
```

相关文件：

| 文件 | 作用 |
| --- | --- |
| `ReactFiberHooks.js` | Hooks 数据结构、dispatcher、mount/update/rerender 逻辑、Hook updateQueue、effect 链表 |
| `ReactFiberBeginWork.js` | FunctionComponent beginWork 中调用 `renderWithHooks` |
| `ReactFiberWorkLoop.js` | 更新调度、commit 阶段调度 passive effects |
| `ReactFiberCommitWork.js` | commit 阶段遍历 Fiber，触发 layout/passive hook effects |
| `ReactFiberCommitEffects.js` | 执行 Hook effect list 的 mount/unmount |
| `ReactHookEffectTags.js` | 定义 `HookHasEffect`、`HookLayout`、`HookPassive` 等 Hook effect tag |
| `ReactFiberConcurrentUpdates.js` | Hook update 入队后参与 concurrent update 合并 |
| `ReactFiberLane.js` | lane 优先级模型 |

## 二、Hooks 数据存在哪里？

Hooks 数据主要存在两个地方：

| 位置 | 保存什么 |
| --- | --- |
| `FunctionComponent Fiber.memoizedState` | 当前函数组件的 Hook 链表头节点 |
| `FunctionComponent Fiber.updateQueue` | 函数组件级别的 updateQueue，主要保存 effect 环形链表 `lastEffect` |

源码中的 Hook 类型：

```js
export type Hook = {
  memoizedState: any,
  baseState: any,
  baseQueue: Update<any, any> | null,
  queue: any,
  next: Hook | null,
};
```

每个字段的含义：

| 字段 | 作用 |
| --- | --- |
| `memoizedState` | 当前 Hook 的“记忆值”。对 `useState` 是当前 state；对 `useMemo` 是 `[value, deps]`；对 `useEffect` 是 effect 对象 |
| `baseState` | 跳过低优先级更新后，用于后续 rebase 的基础状态 |
| `baseQueue` | 被跳过或需要保留的 update 环形队列 |
| `queue` | Hook 自己的更新队列，`useState/useReducer` 使用它保存 pending updates 和 dispatch |
| `next` | 指向下一个 Hook 节点，形成单链表 |

源码中的注释直接说明了存储位置：

```js
// Hooks are stored as a linked list on the fiber's memoizedState field.
// The current hook list is the list that belongs to the current fiber.
// The work-in-progress hook list is a new list that will be added to the
// work-in-progress fiber.
let currentHook: Hook | null = null;
let workInProgressHook: Hook | null = null;
```

## 三、function component 的 Fiber 如何保存 hooks 链表？

函数组件渲染时，React 会进入：

```text
renderWithHooks(current, workInProgress, Component, props, secondArg, lanes)
```

`renderWithHooks` 做几件关键事：

```js
renderLanes = nextRenderLanes;
currentlyRenderingFiber = workInProgress;

workInProgress.memoizedState = null;
workInProgress.updateQueue = null;
workInProgress.lanes = NoLanes;

ReactSharedInternals.H =
  current === null || current.memoizedState === null
    ? HooksDispatcherOnMount
    : HooksDispatcherOnUpdate;

children = Component(props, secondArg);

finishRenderingHooks(current, workInProgress, Component);
```

重点：

| 步骤 | 说明 |
| --- | --- |
| 设置 `currentlyRenderingFiber` | 让每个 Hook 知道自己属于哪个 Fiber |
| 清空 `workInProgress.memoizedState` | 准备重建本次 render 的 Hook 链表 |
| 选择 dispatcher | mount 用 `HooksDispatcherOnMount`，update 用 `HooksDispatcherOnUpdate` |
| 调用组件函数 | 用户代码中的 `useState/useEffect` 会通过 dispatcher 进入对应实现 |
| finish | 清理全局指针，并校验 Hook 数量是否一致 |

Hook 链表由 `mountWorkInProgressHook` 和 `updateWorkInProgressHook` 管理。

mount 时创建新 Hook：

```js
function mountWorkInProgressHook(): Hook {
  const hook = {
    memoizedState: null,
    baseState: null,
    baseQueue: null,
    queue: null,
    next: null,
  };

  if (workInProgressHook === null) {
    currentlyRenderingFiber.memoizedState = workInProgressHook = hook;
  } else {
    workInProgressHook = workInProgressHook.next = hook;
  }

  return workInProgressHook;
}
```

update 时从 current Hook 克隆：

```js
function updateWorkInProgressHook(): Hook {
  const current = currentlyRenderingFiber.alternate;
  const nextCurrentHook =
    currentHook === null ? current.memoizedState : currentHook.next;

  const newHook = {
    memoizedState: nextCurrentHook.memoizedState,
    baseState: nextCurrentHook.baseState,
    baseQueue: nextCurrentHook.baseQueue,
    queue: nextCurrentHook.queue,
    next: null,
  };

  if (workInProgressHook === null) {
    currentlyRenderingFiber.memoizedState = workInProgressHook = newHook;
  } else {
    workInProgressHook = workInProgressHook.next = newHook;
  }

  currentHook = nextCurrentHook;
  return workInProgressHook;
}
```

## 四、Hooks 链表图

以这个组件为例：

```jsx
function App() {
  const [count, setCount] = useState(0);
  const doubled = useMemo(() => count * 2, [count]);
  useEffect(() => {
    document.title = String(count);
  }, [count]);
  const onClick = useCallback(() => setCount(c => c + 1), []);

  return <button onClick={onClick}>{doubled}</button>;
}
```

对应的 Fiber 结构：

```text
FunctionComponent Fiber(App)
  memoizedState
    |
    v
  Hook(useState)
    memoizedState = 0
    queue = { pending, dispatch, lastRenderedReducer, lastRenderedState }
    next
    |
    v
  Hook(useMemo)
    memoizedState = [0, [0]]
    next
    |
    v
  Hook(useEffect)
    memoizedState = Effect
    next
    |
    v
  Hook(useCallback)
    memoizedState = [callback, []]
    next = null

FunctionComponent Fiber(App)
  updateQueue
    |
    v
  FunctionComponentUpdateQueue
    lastEffect -> Effect(useEffect) --next--> itself
```

注意：

```text
Hook 链表保存每个 Hook 的顺序和自身状态；
Effect 环形链表保存需要在 commit 阶段执行的 effect。
```

`useEffect` 比较特殊：它既占用一个 Hook 节点，又会把 effect 对象放进 `fiber.updateQueue.lastEffect` 指向的环形链表。

## 五、Dispatcher：同一个 useState 为什么会走不同函数？

用户代码调用的是：

```js
React.useState(0);
```

真正执行哪个函数，取决于当前 dispatcher：

```js
const HooksDispatcherOnMount = {
  useCallback: mountCallback,
  useEffect: mountEffect,
  useLayoutEffect: mountLayoutEffect,
  useMemo: mountMemo,
  useReducer: mountReducer,
  useState: mountState,
};

const HooksDispatcherOnUpdate = {
  useCallback: updateCallback,
  useEffect: updateEffect,
  useLayoutEffect: updateLayoutEffect,
  useMemo: updateMemo,
  useReducer: updateReducer,
  useState: updateState,
};
```

所以同一行代码：

```js
const [count, setCount] = useState(0);
```

在首次渲染时走：

```text
useState -> mountState
```

在更新渲染时走：

```text
useState -> updateState
```

## 六、useState 源码流程

### 1. mountState 做什么？

入口：

```text
useState(initialState)
  -> mountState(initialState)
  -> mountStateImpl(initialState)
```

核心流程：

```js
function mountStateImpl(initialState) {
  const hook = mountWorkInProgressHook();

  if (typeof initialState === 'function') {
    initialState = initialState();
  }

  hook.memoizedState = hook.baseState = initialState;

  const queue = {
    pending: null,
    lanes: NoLanes,
    dispatch: null,
    lastRenderedReducer: basicStateReducer,
    lastRenderedState: initialState,
  };

  hook.queue = queue;
  return hook;
}
```

`mountState` 再创建 dispatch：

```js
function mountState(initialState) {
  const hook = mountStateImpl(initialState);
  const queue = hook.queue;

  const dispatch = (queue.dispatch = dispatchSetState.bind(
    null,
    currentlyRenderingFiber,
    queue,
  ));

  return [hook.memoizedState, dispatch];
}
```

首次渲染示例：

```jsx
function Counter() {
  const [count, setCount] = useState(() => 0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

mount 后 Hook 节点大概是：

```js
hook = {
  memoizedState: 0,
  baseState: 0,
  baseQueue: null,
  queue: {
    pending: null,
    lanes: NoLanes,
    dispatch: dispatchSetState.bind(null, fiber, queue),
    lastRenderedReducer: basicStateReducer,
    lastRenderedState: 0,
  },
  next: null,
};
```

### 2. updateState 做什么？

`updateState` 非常短：

```js
function updateState(initialState) {
  return updateReducer(basicStateReducer, initialState);
}
```

也就是说：

```text
useState 是 useReducer 的特例。
```

`basicStateReducer` 的逻辑：

```js
function basicStateReducer(state, action) {
  return typeof action === 'function' ? action(state) : action;
}
```

所以这两种写法最终都能处理：

```js
setCount(1);
setCount(c => c + 1);
```

它们对应：

```text
action = 1
action = c => c + 1
```

## 七、mountState 和 updateState 的区别

| 对比项 | `mountState` | `updateState` |
| --- | --- | --- |
| 执行时机 | 首次 render | 后续 render |
| Hook 节点 | 新建 Hook | 从 current Hook 克隆到 workInProgress |
| 初始值 | 会使用 `initialState`，函数初始值会被调用 | 参数基本不再用于计算状态 |
| queue | 创建新的 Hook updateQueue | 复用已有 queue |
| state 来源 | `initialState` | 消费 `queue.pending` / `baseQueue` 后计算 |
| dispatch | 创建并绑定 fiber + queue | 复用 queue.dispatch |

示例：

```jsx
function Counter() {
  const [count, setCount] = useState(() => {
    console.log('init');
    return 0;
  });
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

第一次 render：

```text
调用初始化函数
创建 Hook
创建 queue
返回 [0, dispatch]
```

点击后 update render：

```text
不会再调用初始化函数
克隆 current Hook
处理 queue.pending
返回 [1, 同一个 dispatch]
```

## 八、useReducer 源码流程

`useReducer` 和 `useState` 共享大部分队列处理逻辑。

mount：

```js
function mountReducer(reducer, initialArg, init) {
  const hook = mountWorkInProgressHook();

  const initialState =
    init !== undefined ? init(initialArg) : initialArg;

  hook.memoizedState = hook.baseState = initialState;

  const queue = {
    pending: null,
    lanes: NoLanes,
    dispatch: null,
    lastRenderedReducer: reducer,
    lastRenderedState: initialState,
  };

  hook.queue = queue;

  const dispatch = (queue.dispatch = dispatchReducerAction.bind(
    null,
    currentlyRenderingFiber,
    queue,
  ));

  return [hook.memoizedState, dispatch];
}
```

update：

```js
function updateReducer(reducer, initialArg, init) {
  const hook = updateWorkInProgressHook();
  return updateReducerImpl(hook, currentHook, reducer);
}
```

`updateReducerImpl` 的核心工作：

| 步骤 | 说明 |
| --- | --- |
| 获取 Hook queue | 如果没有 queue，说明 Hooks 调用顺序可能错了 |
| 合并 pendingQueue 和 baseQueue | 新更新与之前跳过的更新合并 |
| 按 lane 判断是否跳过 | 优先级不够的 update 留到以后 |
| 执行 reducer | 对本次可处理的 update 计算新 state |
| 更新 Hook | 写回 `memoizedState`、`baseState`、`baseQueue` |
| 更新 queue | 写回 `lastRenderedState` |

示例：

```jsx
function reducer(state, action) {
  switch (action.type) {
    case 'inc':
      return state + 1;
    default:
      return state;
  }
}

function Counter() {
  const [count, dispatch] = useReducer(reducer, 0);
  return <button onClick={() => dispatch({type: 'inc'})}>{count}</button>;
}
```

点击后：

```text
dispatch({type: 'inc'})
  -> dispatchReducerAction(fiber, queue, action)
  -> requestUpdateLane(fiber)
  -> 创建 update
  -> enqueueConcurrentHookUpdate(fiber, queue, update, lane)
  -> scheduleUpdateOnFiber(root, fiber, lane)
  -> render 阶段 updateReducerImpl 消费 update
```

## 九、Hooks updateQueue 是如何工作的？

Hook update 类型：

```js
export type Update<S, A> = {
  lane: Lane,
  revertLane: Lane,
  action: A,
  hasEagerState: boolean,
  eagerState: S | null,
  next: Update<S, A>,
  gesture: null | ScheduledGesture,
};
```

Hook updateQueue 类型：

```js
export type UpdateQueue<S, A> = {
  pending: Update<S, A> | null,
  lanes: Lanes,
  dispatch: (A => mixed) | null,
  lastRenderedReducer: ((S, A) => S) | null,
  lastRenderedState: S | null,
};
```

队列形态：

```text
queue.pending 指向环形链表最后一个 update

pending
  |
  v
update3 -> update1 -> update2 -> update3
```

为什么用环形链表？

| 好处 | 说明 |
| --- | --- |
| O(1) 插入 | 新 update 插到 `pending` 后面即可 |
| 保留顺序 | `pending.next` 是第一个 update |
| 方便合并 | pendingQueue 和 baseQueue 都是环形链表，合并只需交换 next |

pendingQueue 合并到 baseQueue 的简化逻辑：

```js
const pendingQueue = queue.pending;
if (pendingQueue !== null) {
  if (baseQueue !== null) {
    const baseFirst = baseQueue.next;
    const pendingFirst = pendingQueue.next;
    baseQueue.next = pendingFirst;
    pendingQueue.next = baseFirst;
  }

  current.baseQueue = baseQueue = pendingQueue;
  queue.pending = null;
}
```

处理 update 时，React 会检查 lane：

```js
const shouldSkipUpdate = !isSubsetOfLanes(renderLanes, updateLane);

if (shouldSkipUpdate) {
  // 优先级不够，跳过并保留到 baseQueue
} else {
  // 优先级足够，执行 reducer
  newState = reducer(newState, action);
}
```

这就是 Hooks 与并发优先级模型的连接点。

## 十、dispatchSetState / dispatchReducerAction 如何触发更新？

### useState 的 dispatchSetState

`useState` 返回的 `setState` 绑定了两个东西：

```text
fiber
queue
```

所以调用：

```js
setCount(c => c + 1);
```

本质是：

```text
dispatchSetState(fiber, queue, action)
```

核心流程：

```js
function dispatchSetState(fiber, queue, action) {
  const lane = requestUpdateLane(fiber);

  const didScheduleUpdate = dispatchSetStateInternal(
    fiber,
    queue,
    action,
    lane,
  );

  if (didScheduleUpdate) {
    startUpdateTimerByLane(lane, 'setState()', fiber);
  }
}
```

内部会创建 update：

```js
const update = {
  lane,
  revertLane: NoLane,
  gesture: null,
  action,
  hasEagerState: false,
  eagerState: null,
  next: null,
};
```

然后分两种情况：

| 情况 | 处理 |
| --- | --- |
| render phase update | `enqueueRenderPhaseUpdate(queue, update)`，当前组件 render 后重新 render |
| 普通事件/异步回调更新 | `enqueueConcurrentHookUpdate` 入队，并 `scheduleUpdateOnFiber` |

普通更新的链路：

```text
dispatchSetState
  -> requestUpdateLane(fiber)
  -> dispatchSetStateInternal
  -> enqueueConcurrentHookUpdate(fiber, queue, update, lane)
  -> scheduleUpdateOnFiber(root, fiber, lane)
  -> entangleTransitionUpdate(root, queue, lane)
```

`dispatchSetStateInternal` 还有一个 eager bailout 优化：

```js
const currentState = queue.lastRenderedState;
const eagerState = lastRenderedReducer(currentState, action);

update.hasEagerState = true;
update.eagerState = eagerState;

if (is(eagerState, currentState)) {
  enqueueConcurrentHookUpdateAndEagerlyBailout(fiber, queue, update);
  return false;
}
```

示例：

```jsx
function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(0)}>
      {count}
    </button>
  );
}
```

如果当前 `count` 已经是 `0`，React 可以在某些条件下提前算出状态没变，从而避免调度一次无意义的 re-render。

### useReducer 的 dispatchReducerAction

`useReducer` 的 dispatch 进入：

```text
dispatchReducerAction(fiber, queue, action)
```

流程比 `useState` 更直接：

```js
function dispatchReducerAction(fiber, queue, action) {
  const lane = requestUpdateLane(fiber);

  const update = {
    lane,
    revertLane: NoLane,
    gesture: null,
    action,
    hasEagerState: false,
    eagerState: null,
    next: null,
  };

  if (isRenderPhaseUpdate(fiber)) {
    enqueueRenderPhaseUpdate(queue, update);
  } else {
    const root = enqueueConcurrentHookUpdate(fiber, queue, update, lane);
    if (root !== null) {
      scheduleUpdateOnFiber(root, fiber, lane);
      entangleTransitionUpdate(root, queue, lane);
    }
  }
}
```

## 十一、useEffect 源码流程

`useEffect` 分为 render 阶段登记 effect，commit 阶段执行 effect。

### 1. mountEffect

调用链：

```text
useEffect(create, deps)
  -> mountEffect(create, deps)
  -> mountEffectImpl(PassiveEffect | PassiveStaticEffect, HookPassive, create, deps)
  -> pushSimpleEffect(HookHasEffect | HookPassive, inst, create, deps)
```

核心源码：

```js
function mountEffectImpl(fiberFlags, hookFlags, create, deps) {
  const hook = mountWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;

  currentlyRenderingFiber.flags |= fiberFlags;

  hook.memoizedState = pushSimpleEffect(
    HookHasEffect | hookFlags,
    createEffectInstance(),
    create,
    nextDeps,
  );
}
```

首次渲染时，effect 一定带 `HookHasEffect`，表示 commit 阶段需要执行。

### 2. updateEffect

调用链：

```text
useEffect(create, deps)
  -> updateEffect(create, deps)
  -> updateEffectImpl(PassiveEffect, HookPassive, create, deps)
```

核心源码：

```js
function updateEffectImpl(fiberFlags, hookFlags, create, deps) {
  const hook = updateWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  const effect = hook.memoizedState;
  const inst = effect.inst;

  if (currentHook !== null) {
    if (nextDeps !== null) {
      const prevEffect = currentHook.memoizedState;
      const prevDeps = prevEffect.deps;

      if (areHookInputsEqual(nextDeps, prevDeps)) {
        hook.memoizedState = pushSimpleEffect(
          hookFlags,
          inst,
          create,
          nextDeps,
        );
        return;
      }
    }
  }

  currentlyRenderingFiber.flags |= fiberFlags;

  hook.memoizedState = pushSimpleEffect(
    HookHasEffect | hookFlags,
    inst,
    create,
    nextDeps,
  );
}
```

关键点：

| 情况 | effect tag |
| --- | --- |
| deps 相同 | 只有 `HookPassive`，没有 `HookHasEffect`，commit 阶段不会执行 create |
| deps 不同 | `HookHasEffect | HookPassive`，commit 阶段会执行 cleanup + create |
| 没传 deps | `nextDeps = null`，每次 update 都会执行 |

### 3. effect 对象结构

源码类型：

```js
export type Effect = {
  tag: HookFlags,
  inst: EffectInstance,
  create: () => (() => void) | void,
  deps: Array<mixed> | void | null,
  next: Effect,
};
```

`EffectInstance` 保存 cleanup：

```js
type EffectInstance = {
  destroy: void | (() => void),
};
```

Effect 环形链表通过 `pushEffectImpl` 挂到 `fiber.updateQueue.lastEffect`：

```js
function pushEffectImpl(effect) {
  let componentUpdateQueue = currentlyRenderingFiber.updateQueue;

  if (componentUpdateQueue === null) {
    componentUpdateQueue = createFunctionComponentUpdateQueue();
    currentlyRenderingFiber.updateQueue = componentUpdateQueue;
  }

  const lastEffect = componentUpdateQueue.lastEffect;
  if (lastEffect === null) {
    componentUpdateQueue.lastEffect = effect.next = effect;
  } else {
    const firstEffect = lastEffect.next;
    lastEffect.next = effect;
    effect.next = firstEffect;
    componentUpdateQueue.lastEffect = effect;
  }

  return effect;
}
```

Effect 链表图：

```text
fiber.updateQueue.lastEffect
  |
  v
effect3 --next--> effect1 --next--> effect2 --next--> effect3
```

## 十二、useEffect 的依赖数组如何比较？

依赖数组比较函数：

```text
areHookInputsEqual(nextDeps, prevDeps)
```

源码逻辑：

```js
function areHookInputsEqual(nextDeps, prevDeps) {
  if (prevDeps === null) {
    return false;
  }

  if (__DEV__) {
    if (nextDeps.length !== prevDeps.length) {
      console.error('...');
    }
  }

  for (let i = 0; i < prevDeps.length && i < nextDeps.length; i++) {
    if (is(nextDeps[i], prevDeps[i])) {
      continue;
    }
    return false;
  }

  return true;
}
```

这里的 `is` 可以理解为 `Object.is`。

示例：

```jsx
useEffect(() => {
  console.log('run');
}, [count, user.id]);
```

比较过程：

```text
Object.is(nextCount, prevCount)
Object.is(nextUserId, prevUserId)

全部相同:
  不加 HookHasEffect，本次不执行 effect

任意不同:
  加 HookHasEffect，本次 commit 后执行 effect
```

常见情况：

```jsx
useEffect(() => {}, []);
```

```text
mount: 执行一次
update: deps 长度为 0，比较结果相同，不再执行
```

```jsx
useEffect(() => {});
```

```text
deps 是 undefined，会被转成 null
每次 update 都执行
```

```jsx
useEffect(() => {}, [{id}]);
```

```text
每次 render 都创建新对象
Object.is(newObject, oldObject) 为 false
effect 每次执行
```

## 十三、useEffect 和 useLayoutEffect 的执行时机有什么不同？

二者 render 阶段都通过 `mountEffectImpl/updateEffectImpl` 登记 effect，区别在于 flags 不同：

| Hook | fiber flags | hook flags | commit 时机 |
| --- | --- | --- | --- |
| `useEffect` | `PassiveEffect` / `PassiveStaticEffect` | `HookPassive` | passive 阶段异步执行 |
| `useLayoutEffect` | `UpdateEffect` / `LayoutStaticEffect` | `HookLayout` | layout 阶段同步执行 |

`useLayoutEffect`：

```js
function mountLayoutEffect(create, deps) {
  let fiberFlags = UpdateEffect | LayoutStaticEffect;
  return mountEffectImpl(fiberFlags, HookLayout, create, deps);
}

function updateLayoutEffect(create, deps) {
  return updateEffectImpl(UpdateEffect, HookLayout, create, deps);
}
```

执行链路：

```text
commitRoot
  -> flushMutationEffects
  -> root.current = finishedWork
  -> flushLayoutEffects
  -> commitLayoutEffects
  -> commitHookLayoutEffects
  -> commitHookEffectListMount(HookLayout | HookHasEffect)
```

`useEffect`：

```text
commitRoot
  -> 如果存在 PassiveMask，scheduleCallback(flushPassiveEffects)
  -> flushPassiveEffects
  -> commitPassiveUnmountEffects
  -> commitPassiveMountEffects
  -> commitHookPassiveMountEffects
  -> commitHookEffectListMount(HookPassive | HookHasEffect)
```

示例：

```jsx
function Demo() {
  const ref = useRef(null);

  useLayoutEffect(() => {
    console.log('layout', ref.current.getBoundingClientRect());
  }, []);

  useEffect(() => {
    console.log('passive');
  }, []);

  return <div ref={ref}>Demo</div>;
}
```

执行顺序：

```text
render 阶段:
  登记 layout effect
  登记 passive effect

commit mutation:
  DOM 插入

commit layout:
  执行 useLayoutEffect

passive flush:
  执行 useEffect
```

所以：

| 场景 | 应该用 |
| --- | --- |
| 读取布局、同步测量、避免闪烁 | `useLayoutEffect` |
| 订阅、日志、网络请求、非布局副作用 | `useEffect` |

## 十四、useMemo 源码流程

mount：

```js
function mountMemo(nextCreate, deps) {
  const hook = mountWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  const nextValue = nextCreate();
  hook.memoizedState = [nextValue, nextDeps];
  return nextValue;
}
```

update：

```js
function updateMemo(nextCreate, deps) {
  const hook = updateWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  const prevState = hook.memoizedState;

  if (nextDeps !== null) {
    const prevDeps = prevState[1];
    if (areHookInputsEqual(nextDeps, prevDeps)) {
      return prevState[0];
    }
  }

  const nextValue = nextCreate();
  hook.memoizedState = [nextValue, nextDeps];
  return nextValue;
}
```

示例：

```jsx
function List({items, query}) {
  const filtered = useMemo(() => {
    return items.filter(item => item.includes(query));
  }, [items, query]);

  return filtered.map(item => <div key={item}>{item}</div>);
}
```

Hook 节点：

```js
hook.memoizedState = [filtered, [items, query]];
```

更新时：

```text
deps 相同:
  返回上一次 filtered

deps 不同:
  重新执行 nextCreate
  写入新的 [value, deps]
```

## 十五、useCallback 源码流程

`useCallback(fn, deps)` 可以理解为：

```js
useMemo(() => fn, deps)
```

但源码是独立实现的。

mount：

```js
function mountCallback(callback, deps) {
  const hook = mountWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  hook.memoizedState = [callback, nextDeps];
  return callback;
}
```

update：

```js
function updateCallback(callback, deps) {
  const hook = updateWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  const prevState = hook.memoizedState;

  if (nextDeps !== null) {
    const prevDeps = prevState[1];
    if (areHookInputsEqual(nextDeps, prevDeps)) {
      return prevState[0];
    }
  }

  hook.memoizedState = [callback, nextDeps];
  return callback;
}
```

示例：

```jsx
function Parent({id}) {
  const onSelect = useCallback(() => {
    console.log(id);
  }, [id]);

  return <Child onSelect={onSelect} />;
}
```

Hook 节点：

```js
hook.memoizedState = [onSelect, [id]];
```

更新时：

```text
id 不变:
  返回上一次 callback 引用

id 变化:
  保存并返回新的 callback
```

## 十六、为什么 Hooks 不能写在条件语句里？

React 不是通过 Hook 名字、变量名或调用栈来识别 Hook。

React 识别 Hook 的方式是：

```text
同一个 FunctionComponent 中，按调用顺序依次匹配 Hook 链表节点。
```

正确写法：

```jsx
function Demo({enabled}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    subscribe();
  }, [enabled]);

  return count;
}
```

Hook 顺序始终是：

```text
1. useState
2. useEffect
```

错误写法：

```jsx
function Demo({enabled}) {
  const [count, setCount] = useState(0);

  if (enabled) {
    useEffect(() => {
      subscribe();
    }, []);
  }

  return count;
}
```

第一次 render，`enabled = true`：

```text
Hook 1: useState
Hook 2: useEffect
```

第二次 render，`enabled = false`：

```text
Hook 1: useState
Hook 2: 不存在
```

这会破坏链表位置匹配。React 在 `finishRenderingHooks` 里会检查是否“少渲染了 Hook”：

```js
const didRenderTooFewHooks =
  currentHook !== null && currentHook.next !== null;
```

如果 update 时调用了更多 Hook，`updateWorkInProgressHook` 中会报错：

```js
throw new Error('Rendered more hooks than during the previous render.');
```

如果 Hook 类型或顺序在 DEV 下发生变化，React 还会通过 `_debugHookTypes` 做额外校验。

## 十七、React 如何保证多次 render 时 hooks 顺序一致？

核心机制是两个指针：

```js
let currentHook = null;
let workInProgressHook = null;
```

update 时，每调用一个 Hook：

```text
currentHook 移到 current 链表的下一个节点
workInProgressHook 在新链表中追加一个克隆节点
```

示意图：

```text
current Fiber.memoizedState
  HookA -> HookB -> HookC

update render 调用顺序:
  useState  -> 读取 HookA
  useMemo   -> 读取 HookB
  useEffect -> 读取 HookC

workInProgress Fiber.memoizedState
  HookA' -> HookB' -> HookC'
```

只要调用顺序稳定，React 就能把本次第 N 个 Hook 与上次第 N 个 Hook 对齐。

如果调用顺序变成：

```text
useState -> useEffect
```

React 会把 `useEffect` 错误地对齐到上次的 `HookB(useMemo)`，于是状态结构就乱了。因此规则要求：

```text
Hooks 必须在函数组件顶层调用；
不能放在 if、for、while、嵌套函数、try/catch 等可能改变调用顺序的位置。
```

## 十八、Hooks 和 Fiber 是如何关联的？

关联点有三个：

| 关联点 | 说明 |
| --- | --- |
| `currentlyRenderingFiber` | renderWithHooks 开始时指向当前正在渲染的 FunctionComponent Fiber |
| `fiber.memoizedState` | 保存 Hook 链表头 |
| `fiber.updateQueue` | 保存 function component effect 环形链表 |

render 期间：

```text
renderWithHooks 设置 currentlyRenderingFiber
  -> useState 创建/读取 Hook
  -> useEffect 创建/读取 Hook，并 push effect 到 fiber.updateQueue
  -> finishRenderingHooks 清空 currentlyRenderingFiber/currentHook/workInProgressHook
```

dispatch 期间：

```text
setState 调用 dispatchSetState(fiber, queue, action)
  -> fiber 用来找到 root 并调度更新
  -> queue 用来保存 update
```

commit 期间：

```text
commit 阶段拿到 finishedWork Fiber
  -> 从 fiber.updateQueue.lastEffect 找 effect 链表
  -> 按 HookLayout / HookPassive 执行对应 effect
```

所以 Hooks 不是孤立系统，它依附在 Fiber 上：

```text
Fiber 负责组件实例身份和调度；
Hook 负责函数组件内部状态槽位；
Hook queue 负责状态更新；
Fiber updateQueue 负责 commit 阶段 effect 执行。
```

## 十九、完整调用链汇总

### useState mount

```text
beginWork
  -> updateFunctionComponent
  -> renderWithHooks
  -> HooksDispatcherOnMount.useState
  -> mountState
  -> mountStateImpl
  -> mountWorkInProgressHook
  -> 创建 Hook + queue + dispatch
```

### useState update

```text
setState(action)
  -> dispatchSetState(fiber, queue, action)
  -> requestUpdateLane(fiber)
  -> dispatchSetStateInternal
  -> enqueueConcurrentHookUpdate
  -> scheduleUpdateOnFiber
  -> renderWithHooks
  -> HooksDispatcherOnUpdate.useState
  -> updateState
  -> updateReducer
  -> updateReducerImpl
  -> 消费 queue.pending/baseQueue
  -> 得到新 state
```

### useReducer

```text
dispatch(action)
  -> dispatchReducerAction(fiber, queue, action)
  -> requestUpdateLane(fiber)
  -> enqueueConcurrentHookUpdate
  -> scheduleUpdateOnFiber
  -> updateReducerImpl
  -> reducer(newState, action)
```

### useEffect

```text
renderWithHooks
  -> mountEffect / updateEffect
  -> mountEffectImpl / updateEffectImpl
  -> pushSimpleEffect
  -> pushEffectImpl
  -> fiber.updateQueue.lastEffect

commitRoot
  -> scheduleCallback(flushPassiveEffects)
  -> flushPassiveEffects
  -> commitPassiveUnmountEffects
  -> commitPassiveMountEffects
  -> commitHookPassiveMountEffects
  -> commitHookEffectListMount
  -> effect.create()
```

### useLayoutEffect

```text
renderWithHooks
  -> mountLayoutEffect / updateLayoutEffect
  -> mountEffectImpl / updateEffectImpl
  -> pushSimpleEffect

commitRoot
  -> flushMutationEffects
  -> root.current = finishedWork
  -> flushLayoutEffects
  -> commitLayoutEffects
  -> commitHookLayoutEffects
  -> commitHookEffectListMount
  -> effect.create()
```

### useMemo / useCallback

```text
renderWithHooks
  -> mountMemo / updateMemo
  -> mountWorkInProgressHook / updateWorkInProgressHook
  -> areHookInputsEqual
  -> 复用旧值或保存新值

renderWithHooks
  -> mountCallback / updateCallback
  -> mountWorkInProgressHook / updateWorkInProgressHook
  -> areHookInputsEqual
  -> 复用旧 callback 或保存新 callback
```

## 二十、每一步示例代码

### 示例 1：useState 的 Hook 节点

```jsx
function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

mount 后：

```text
Counter Fiber.memoizedState
  -> Hook
       memoizedState = 0
       baseState = 0
       queue.pending = null
       queue.dispatch = dispatchSetState(fiber, queue)
```

点击后：

```text
dispatchSetState
  -> update(action = c => c + 1)
  -> queue.pending = update
  -> scheduleUpdateOnFiber
```

update render 后：

```text
updateReducerImpl
  -> reducer(0, c => c + 1)
  -> newState = 1
  -> hook.memoizedState = 1
```

### 示例 2：useReducer 的队列

```jsx
function Counter() {
  const [state, dispatch] = useReducer((state, action) => {
    if (action.type === 'inc') {
      return state + 1;
    }
    return state;
  }, 0);

  return <button onClick={() => dispatch({type: 'inc'})}>{state}</button>;
}
```

队列：

```text
Hook.queue
  pending -> Update({type: 'inc'})
  lastRenderedReducer -> reducer
  lastRenderedState -> 0
```

render 消费后：

```text
newState = reducer(0, {type: 'inc'})
hook.memoizedState = 1
queue.lastRenderedState = 1
```

### 示例 3：useEffect 依赖变化

```jsx
function Profile({id}) {
  useEffect(() => {
    const sub = subscribe(id);
    return () => sub.unsubscribe();
  }, [id]);

  return <div>{id}</div>;
}
```

首次 mount：

```text
Hook.memoizedState = Effect(
  tag = HookHasEffect | HookPassive,
  deps = [id],
)

commit passive:
  create()
```

id 不变：

```text
areHookInputsEqual([id], prevDeps) = true
Effect tag = HookPassive
commit passive 不执行 create
```

id 变化：

```text
areHookInputsEqual([nextId], [prevId]) = false
Effect tag = HookHasEffect | HookPassive
commit passive:
  cleanup(prev)
  create(next)
```

### 示例 4：useMemo 和 useCallback

```jsx
function Search({items, query}) {
  const result = useMemo(() => {
    return items.filter(item => item.includes(query));
  }, [items, query]);

  const onSelect = useCallback(item => {
    console.log(item);
  }, []);

  return <List items={result} onSelect={onSelect} />;
}
```

Hook 链表：

```text
Hook(useMemo)
  memoizedState = [result, [items, query]]

Hook(useCallback)
  memoizedState = [onSelect, []]
```

更新时：

```text
items/query 不变:
  useMemo 返回旧 result

[] 始终相同:
  useCallback 返回旧 onSelect
```

## 二十一、常见面试问题总结

| 问题 | 核心答案 |
| --- | --- |
| Hooks 数据存在哪里？ | 存在 FunctionComponent Fiber 上，Hook 链表头在 `fiber.memoizedState`，effect 链表在 `fiber.updateQueue.lastEffect` |
| Hook 节点长什么样？ | `{memoizedState, baseState, baseQueue, queue, next}` |
| `useState` 和 `useReducer` 什么关系？ | `useState` 是 `useReducer` 的特例，update 时走 `updateReducer(basicStateReducer)` |
| `mountState` 和 `updateState` 区别？ | mount 创建 Hook/queue/dispatch 并使用初始值；update 克隆 Hook 并消费 updateQueue |
| setState 如何触发更新？ | `dispatchSetState` 请求 lane，创建 update，入 Hook queue，然后 `scheduleUpdateOnFiber` |
| Hook updateQueue 为什么是环形链表？ | 插入快、合并 pending/base queue 方便、能保持更新顺序 |
| deps 怎么比较？ | `areHookInputsEqual` 逐项用 `Object.is` 比较 |
| 没传 deps 和传 `[]` 有什么不同？ | 没传 deps 每次执行；`[]` mount 后通常不再执行 |
| `useEffect` 和 `useLayoutEffect` 区别？ | `useLayoutEffect` 在 layout 阶段同步执行；`useEffect` 在 passive 阶段异步执行 |
| 为什么 Hooks 不能写条件里？ | React 按调用顺序匹配 Hook 链表节点，条件调用会破坏顺序 |
| React 如何发现 Hook 数量不一致？ | update 时找不到对应 currentHook 会报 “Rendered more hooks”；finish 时发现 currentHook 还有 next 会认为 Hook 变少 |
| `useMemo` 保存什么？ | `hook.memoizedState = [value, deps]` |
| `useCallback` 保存什么？ | `hook.memoizedState = [callback, deps]` |
| effect cleanup 存在哪里？ | 存在 `effect.inst.destroy` |
| Hook 和 Fiber 如何关联？ | render 时通过 `currentlyRenderingFiber` 绑定，状态挂在该 Fiber 的 Hook 链表上 |

## 二十二、学习重点

读 Hooks 源码时建议抓住四条线：

| 主线 | 重点 |
| --- | --- |
| Hook 链表 | `fiber.memoizedState`、`currentHook`、`workInProgressHook` |
| Dispatcher | mount/update/rerender 三套 dispatcher 决定调用哪个实现 |
| State queue | `queue.pending`、`baseQueue`、lane、`updateReducerImpl` |
| Effect queue | `pushSimpleEffect`、`fiber.updateQueue.lastEffect`、commit 阶段执行 |

推荐阅读顺序：

| 顺序 | 源码位置 | 目标 |
| --- | --- | --- |
| 1 | `renderWithHooks` | 理解 Hook 渲染入口和 dispatcher 切换 |
| 2 | `mountWorkInProgressHook` / `updateWorkInProgressHook` | 理解 Hook 链表创建和复用 |
| 3 | `mountState` / `updateState` | 理解最基础的 state Hook |
| 4 | `mountReducer` / `updateReducerImpl` | 理解 Hook updateQueue 和 lane 跳过 |
| 5 | `dispatchSetState` / `dispatchReducerAction` | 理解 Hook 更新如何进入调度 |
| 6 | `mountEffectImpl` / `updateEffectImpl` | 理解 effect 如何登记 |
| 7 | `pushEffectImpl` | 理解 effect 环形链表 |
| 8 | `commitHookEffectListMount/Unmount` | 理解 effect 如何在 commit 阶段执行 |
| 9 | `mountMemo/updateMemo` | 理解 memo 值缓存 |
| 10 | `mountCallback/updateCallback` | 理解 callback 引用缓存 |

## 二十三、总结

Hooks 的实现并不依赖函数闭包保存状态。闭包只保存用户事件里的引用，例如 `dispatch`。真正的状态由 React 保存在 Fiber 上：

```text
FunctionComponent Fiber
  memoizedState -> Hook 链表
  updateQueue   -> Effect 环形链表
```

每次函数组件 render，React 都按固定顺序重新调用 Hooks：

```text
第 1 个 useState 对应第 1 个 Hook 节点
第 2 个 useMemo 对应第 2 个 Hook 节点
第 3 个 useEffect 对应第 3 个 Hook 节点
```

这就是 Hooks 规则的源码根基：

```text
Hook 没有名字，只有顺序。
```

理解了这点，再看 `useState`、`useReducer`、`useEffect`、`useMemo`、`useCallback` 就会发现它们都是同一套机制的不同使用方式：

| Hook | Hook.memoizedState 保存 |
| --- | --- |
| `useState` | 当前 state |
| `useReducer` | 当前 reducer state |
| `useEffect` | effect 对象 |
| `useLayoutEffect` | layout effect 对象 |
| `useMemo` | `[value, deps]` |
| `useCallback` | `[callback, deps]` |

最终闭环：

```text
renderWithHooks 构建 Hook 链表
dispatch 把 update 放进 Hook queue
scheduleUpdateOnFiber 触发重新渲染
updateReducerImpl 消费 update 得到新 state
pushEffectImpl 登记 effect
commit 阶段执行 layout/passive effects
```

