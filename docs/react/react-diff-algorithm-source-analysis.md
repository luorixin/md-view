# React diff 算法源码深入分析

本文基于当前 `react-main` 源码，分析 React child diff 的入口、`reconcileChildFibers` / `mountChildFibers` 的区别、单节点 diff、多节点数组 diff、`key`、`lastPlacedIndex`、`Placement` / `ChildDeletion` flags 标记，以及 React diff 与 Vue diff 的核心差异。

React diff 的核心源码位于：

```text
packages/react-reconciler/src/ReactChildFiber.js
```

一句话概括：

```text
React diff 的目标不是直接操作 DOM，
而是在 render 阶段为新 children 构建新的 Fiber 子链表，
并通过 flags 标记插入、移动、删除等副作用，
最后交给 commit 阶段真正修改 DOM。
```

## 一、React diff 的入口在哪里？

React diff 发生在 render 阶段的 `beginWork` 中。

当某个 Fiber 需要计算子节点时，会调用：

```text
reconcileChildren(current, workInProgress, nextChildren, renderLanes)
```

源码位置：

```text
packages/react-reconciler/src/ReactFiberBeginWork.js
```

简化源码：

```js
export function reconcileChildren(
  current,
  workInProgress,
  nextChildren,
  renderLanes,
) {
  if (current === null) {
    workInProgress.child = mountChildFibers(
      workInProgress,
      null,
      nextChildren,
      renderLanes,
    );
  } else {
    workInProgress.child = reconcileChildFibers(
      workInProgress,
      current.child,
      nextChildren,
      renderLanes,
    );
  }
}
```

入口调用链：

```text
performUnitOfWork
  -> beginWork(current, workInProgress, renderLanes)
  -> updateFunctionComponent / updateHostComponent / updateHostRoot / ...
  -> reconcileChildren(current, workInProgress, nextChildren, renderLanes)
  -> mountChildFibers 或 reconcileChildFibers
  -> reconcileChildFibersImpl
  -> reconcileSingleElement / reconcileChildrenArray / reconcileSingleTextNode / ...
```

常见组件示例：

```jsx
function App({items}) {
  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>{item.text}</li>
      ))}
    </ul>
  );
}
```

当 `App` 重新 render 时：

```text
App Fiber beginWork
  -> renderWithHooks 得到 nextChildren
  -> reconcileChildren
  -> 对 ul / li children 进行 diff
```

## 二、核心源码文件

| 文件 | 作用 |
| --- | --- |
| `ReactFiberBeginWork.js` | `reconcileChildren` 的入口，根据 mount/update 选择不同 child reconciler |
| `ReactChildFiber.js` | child diff 核心实现，包含单节点、数组、iterator、文本节点处理 |
| `ReactFiber.js` | `createWorkInProgress`、`createFiberFromElement` 等 Fiber 创建/复用能力 |
| `ReactFiberFlags.js` | 定义 `Placement`、`ChildDeletion` 等 commit 阶段消费的 flags |
| `ReactFiberCommitWork.js` | commit 阶段消费 `Placement` / `ChildDeletion` 等 flags |
| `ReactFiberCommitHostEffects.js` | 真正执行 DOM 插入、删除等 host effect |

## 三、reconcileChildFibers 和 mountChildFibers 有什么区别？

二者都来自同一个工厂函数：

```js
function createChildReconciler(
  shouldTrackSideEffects: boolean,
): ChildReconciler {
  // ...
}

export const reconcileChildFibers = createChildReconciler(true);
export const mountChildFibers = createChildReconciler(false);
```

区别在于：

| 函数 | `shouldTrackSideEffects` | 使用场景 | 是否标记删除/移动等副作用 |
| --- | --- | --- | --- |
| `mountChildFibers` | `false` | 父 Fiber 首次挂载，`current === null` | 不跟踪旧节点删除，因为没有旧子树 |
| `reconcileChildFibers` | `true` | 父 Fiber 更新，`current !== null` | 跟踪 `Placement`、`ChildDeletion` 等副作用 |

源码里的删除逻辑能直接看出差异：

```js
function deleteChild(returnFiber, childToDelete) {
  if (!shouldTrackSideEffects) {
    return;
  }

  const deletions = returnFiber.deletions;
  if (deletions === null) {
    returnFiber.deletions = [childToDelete];
    returnFiber.flags |= ChildDeletion;
  } else {
    deletions.push(childToDelete);
  }
}
```

mount 阶段：

```text
没有旧 child Fiber
只需要创建新 child Fiber 链表
不需要记录删除
```

update 阶段：

```text
存在 current child Fiber 链表
需要判断复用、插入、移动、删除
需要标记 flags，交给 commit 阶段处理
```

## 四、diff 调用链

完整调用链可以分成三层。

第一层：beginWork 入口。

```text
beginWork
  -> reconcileChildren
```

第二层：选择 mount/update reconciler。

```text
reconcileChildren
  -> current === null
       mountChildFibers(returnFiber, null, nextChildren, lanes)
  -> current !== null
       reconcileChildFibers(returnFiber, current.child, nextChildren, lanes)
```

第三层：按 newChild 类型分发。

```text
reconcileChildFibers
  -> reconcileChildFibersImpl
       -> ReactElement:
            reconcileSingleElement
            placeSingleChild
       -> ReactPortal:
            reconcileSinglePortal
            placeSingleChild
       -> Array:
            reconcileChildrenArray
       -> Iterator:
            reconcileChildrenIteratable
       -> Text:
            reconcileSingleTextNode
            placeSingleChild
       -> Empty:
            deleteRemainingChildren
```

源码分支：

```js
function reconcileChildFibersImpl(
  returnFiber,
  currentFirstChild,
  newChild,
  lanes,
) {
  if (typeof newChild === 'object' && newChild !== null) {
    switch (newChild.$$typeof) {
      case REACT_ELEMENT_TYPE:
        return placeSingleChild(
          reconcileSingleElement(returnFiber, currentFirstChild, newChild, lanes),
        );
      case REACT_PORTAL_TYPE:
        return placeSingleChild(
          reconcileSinglePortal(returnFiber, currentFirstChild, newChild, lanes),
        );
      case REACT_LAZY_TYPE:
        return reconcileChildFibersImpl(
          returnFiber,
          currentFirstChild,
          resolveLazy(newChild),
          lanes,
        );
    }

    if (isArray(newChild)) {
      return reconcileChildrenArray(
        returnFiber,
        currentFirstChild,
        newChild,
        lanes,
      );
    }
  }

  if (typeof newChild === 'string' || typeof newChild === 'number') {
    return placeSingleChild(
      reconcileSingleTextNode(returnFiber, currentFirstChild, '' + newChild, lanes),
    );
  }

  return deleteRemainingChildren(returnFiber, currentFirstChild);
}
```

## 五、单节点 diff 流程

单节点 diff 入口：

```text
reconcileSingleElement(returnFiber, currentFirstChild, element, lanes)
```

它处理的是这种情况：

```jsx
return <div key="a" className="box" />;
```

或者：

```jsx
return <Counter key="counter" />;
```

### 1. 单节点复用条件

React 复用旧 Fiber 的条件可以概括为：

```text
key 相同
并且 type 相同或兼容
```

源码逻辑：

```js
function reconcileSingleElement(
  returnFiber,
  currentFirstChild,
  element,
  lanes,
) {
  const key = element.key;
  let child = currentFirstChild;

  while (child !== null) {
    if (child.key === key) {
      const elementType = element.type;

      if (elementType === REACT_FRAGMENT_TYPE) {
        if (child.tag === Fragment) {
          deleteRemainingChildren(returnFiber, child.sibling);
          const existing = useFiber(child, element.props.children);
          existing.return = returnFiber;
          return existing;
        }
      } else {
        if (child.elementType === elementType) {
          deleteRemainingChildren(returnFiber, child.sibling);
          const existing = useFiber(child, element.props);
          coerceRef(existing, element);
          existing.return = returnFiber;
          return existing;
        }
      }

      deleteRemainingChildren(returnFiber, child);
      break;
    } else {
      deleteChild(returnFiber, child);
    }

    child = child.sibling;
  }

  const created = createFiberFromElement(element, returnFiber.mode, lanes);
  created.return = returnFiber;
  return created;
}
```

源码中还包含 hot reload 和 lazy 类型兼容判断，这里为了理解主线省略。

### 2. 单节点 diff 流程图

```text
newChild 是 ReactElement
  -> 取 element.key
  -> 遍历旧 child 链表
       -> key 不同:
            deleteChild(oldChild)
            继续找
       -> key 相同:
            type 相同:
              useFiber(oldChild, newProps)
              deleteRemainingChildren(oldChild.sibling)
              返回复用 Fiber
            type 不同:
              deleteRemainingChildren(oldChild)
              创建新 Fiber
  -> 没找到可复用节点:
       createFiberFromElement
```

### 3. 单节点示例：key 和 type 都相同

更新前：

```jsx
<div>
  <Counter key="a" count={1} />
</div>
```

更新后：

```jsx
<div>
  <Counter key="a" count={2} />
</div>
```

判断：

```text
oldFiber.key === "a"
newElement.key === "a"
oldFiber.elementType === Counter
newElement.type === Counter
```

结果：

```text
复用旧 Fiber
通过 createWorkInProgress 克隆为 workInProgress Fiber
pendingProps 更新为 {count: 2}
组件 state 保留
```

### 4. 单节点示例：key 相同但 type 不同

更新前：

```jsx
<div>
  <Counter key="a" />
</div>
```

更新后：

```jsx
<div>
  <Profile key="a" />
</div>
```

判断：

```text
key 相同
type 不同
```

结果：

```text
旧 Counter Fiber 删除
新建 Profile Fiber
Counter 的 state 不保留
Profile 重新 mount
```

### 5. 单节点示例：key 不同

更新前：

```jsx
<Counter key="a" />
```

更新后：

```jsx
<Counter key="b" />
```

判断：

```text
key 不同
```

结果：

```text
旧 Fiber 删除
新 Fiber 创建
即使 type 同为 Counter，也不会复用
```

## 六、多节点数组 diff 流程

多节点数组 diff 入口：

```text
reconcileChildrenArray(returnFiber, currentFirstChild, newChildren, lanes)
```

处理的是：

```jsx
return items.map(item => <li key={item.id}>{item.text}</li>);
```

源码注释里有一个非常重要的信息：

```text
This algorithm can't optimize by searching from both ends since we
don't have backpointers on fibers.
```

也就是说，React 当前数组 diff 是前向扫描，不像 Vue 3 keyed diff 那样做典型的双端同步和最长递增子序列优化。

### 1. 数组 diff 总流程

React 数组 diff 可以分成四段：

```text
1. 第一轮顺序扫描:
   oldFiber 和 newChildren[newIdx] 一一对比
   key/type 能匹配就复用
   一旦不匹配就退出快路径

2. 新数组已经结束:
   删除剩余旧 Fiber

3. 旧数组已经结束:
   创建剩余新 Fiber，并标记插入

4. 两边都有剩余:
   把剩余旧 Fiber 放进 Map
   后续新节点按 key 或 index 从 Map 中查找复用
   Map 中最后没被消费的旧 Fiber 全部删除
```

源码结构：

```js
function reconcileChildrenArray(
  returnFiber,
  currentFirstChild,
  newChildren,
  lanes,
) {
  let resultingFirstChild = null;
  let previousNewFiber = null;

  let oldFiber = currentFirstChild;
  let lastPlacedIndex = 0;
  let newIdx = 0;

  // 1. 顺序扫描
  for (; oldFiber !== null && newIdx < newChildren.length; newIdx++) {
    const newFiber = updateSlot(
      returnFiber,
      oldFiber,
      newChildren[newIdx],
      lanes,
    );

    if (newFiber === null) {
      break;
    }

    if (oldFiber && newFiber.alternate === null) {
      deleteChild(returnFiber, oldFiber);
    }

    lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
    previousNewFiber = link(previousNewFiber, newFiber);
    oldFiber = nextOldFiber;
  }

  // 2. 新 children 已结束，删除剩余 old
  if (newIdx === newChildren.length) {
    deleteRemainingChildren(returnFiber, oldFiber);
    return resultingFirstChild;
  }

  // 3. old 已结束，剩余 new 都是插入
  if (oldFiber === null) {
    for (; newIdx < newChildren.length; newIdx++) {
      const newFiber = createChild(returnFiber, newChildren[newIdx], lanes);
      lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
      previousNewFiber = link(previousNewFiber, newFiber);
    }
    return resultingFirstChild;
  }

  // 4. 慢路径：旧 Fiber 放进 Map
  const existingChildren = mapRemainingChildren(oldFiber);

  for (; newIdx < newChildren.length; newIdx++) {
    const newFiber = updateFromMap(
      existingChildren,
      returnFiber,
      newIdx,
      newChildren[newIdx],
      lanes,
    );

    if (newFiber !== null) {
      if (newFiber.alternate !== null) {
        existingChildren.delete(
          newFiber.key === null ? newIdx : newFiber.key,
        );
      }

      lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx);
      previousNewFiber = link(previousNewFiber, newFiber);
    }
  }

  existingChildren.forEach(child => deleteChild(returnFiber, child));

  return resultingFirstChild;
}
```

### 2. 第一轮顺序扫描：updateSlot

第一轮使用：

```text
updateSlot(returnFiber, oldFiber, newChild, lanes)
```

核心规则：

```text
同一位置上 key 匹配，才继续尝试复用；
key 不匹配，返回 null，退出快路径。
```

源码：

```js
function updateSlot(returnFiber, oldFiber, newChild, lanes) {
  const key = oldFiber !== null ? oldFiber.key : null;

  if (typeof newChild === 'string' || typeof newChild === 'number') {
    if (key !== null) {
      return null;
    }
    return updateTextNode(returnFiber, oldFiber, '' + newChild, lanes);
  }

  if (typeof newChild === 'object' && newChild !== null) {
    switch (newChild.$$typeof) {
      case REACT_ELEMENT_TYPE:
        if (newChild.key === key) {
          return updateElement(returnFiber, oldFiber, newChild, lanes);
        }
        return null;
    }
  }

  return null;
}
```

### 3. 慢路径：mapRemainingChildren + updateFromMap

一旦第一轮遇到不匹配，React 会把剩余旧 Fiber 放进 Map：

```js
function mapRemainingChildren(currentFirstChild) {
  const existingChildren = new Map();

  let existingChild = currentFirstChild;
  while (existingChild !== null) {
    if (existingChild.key === null) {
      existingChildren.set(existingChild.index, existingChild);
    } else {
      existingChildren.set(existingChild.key, existingChild);
    }
    existingChild = existingChild.sibling;
  }

  return existingChildren;
}
```

然后新节点从 Map 中查找旧 Fiber：

```js
function updateFromMap(existingChildren, returnFiber, newIdx, newChild, lanes) {
  if (newChild.$$typeof === REACT_ELEMENT_TYPE) {
    const matchedFiber =
      existingChildren.get(newChild.key === null ? newIdx : newChild.key) ||
      null;

    return updateElement(returnFiber, matchedFiber, newChild, lanes);
  }
}
```

这说明：

```text
有 key:
  用 key 找旧 Fiber

没有 key:
  用 index 找旧 Fiber
```

这也是 index key 问题的源码根源之一。

## 七、key 在 diff 中起什么作用？

`key` 的作用是帮助 React 在同一层兄弟节点中识别“同一个逻辑节点”。

React 判断复用的核心条件是：

```text
key 相同
type 相同或兼容
```

源码层面：

| 场景 | key 如何使用 |
| --- | --- |
| 单节点 diff | `reconcileSingleElement` 遍历旧 child，先比较 `child.key === element.key` |
| 数组快路径 | `updateSlot` 比较当前位置 `oldFiber.key` 与 `newChild.key` |
| 数组慢路径 | `mapRemainingChildren` 以 `oldFiber.key` 建 Map；`updateFromMap` 用 `newChild.key` 查找 |
| 无 key | fallback 到 index |

### key 示例：稳定 key 可以保留状态

```jsx
function Row({item}) {
  const [text, setText] = useState(item.text);
  return <input value={text} onChange={e => setText(e.target.value)} />;
}

function List({items}) {
  return items.map(item => <Row key={item.id} item={item} />);
}
```

更新前：

```text
[A(id=1), B(id=2), C(id=3)]
```

更新后：

```text
[C(id=3), A(id=1), B(id=2)]
```

因为 key 稳定：

```text
id=3 的 Row Fiber 可以找到旧 C
id=1 的 Row Fiber 可以找到旧 A
id=2 的 Row Fiber 可以找到旧 B
```

结果：

```text
组件状态跟着 item 走
```

### key 不稳定示例：状态错位

```jsx
function List({items}) {
  return items.map((item, index) => (
    <Row key={index} item={item} />
  ));
}
```

更新前：

```text
index 0 -> A
index 1 -> B
index 2 -> C
```

更新后在头部插入 X：

```text
index 0 -> X
index 1 -> A
index 2 -> B
index 3 -> C
```

React 看到的是：

```text
key 0 还在
key 1 还在
key 2 还在
```

于是它可能复用：

```text
旧 A Fiber -> 新 X
旧 B Fiber -> 新 A
旧 C Fiber -> 新 B
```

结果：

```text
输入框状态、组件内部 state、DOM 复用关系可能错位
```

## 八、为什么不推荐使用 index 作为 key？

不是说 index key 永远错误，而是它只适合非常有限的场景：

```text
列表不排序
列表不插入
列表不删除
列表项没有本地状态
列表项不依赖 DOM 保留
```

不推荐 index key 的原因：

| 问题 | 原因 |
| --- | --- |
| 插入导致状态错位 | index 改变后，React 仍按旧位置复用 Fiber |
| 删除导致状态错位 | 后面的元素 index 前移，复用到错误的旧 Fiber |
| 排序导致状态错位 | 逻辑 item 换位置，但 key 仍按位置生成 |
| diff 语义不稳定 | key 表示位置，而不是业务实体 |
| 表单问题明显 | input、checkbox、受控/非受控状态容易看出错位 |

示例：

```jsx
function TodoList({todos}) {
  return todos.map((todo, index) => (
    <TodoItem key={index} todo={todo} />
  ));
}
```

当在头部插入一条新 todo：

```text
旧:
  key=0 -> Todo A
  key=1 -> Todo B

新:
  key=0 -> Todo X
  key=1 -> Todo A
  key=2 -> Todo B
```

React 会倾向于：

```text
复用 key=0 的旧 Fiber 给 Todo X
复用 key=1 的旧 Fiber 给 Todo A
新建 key=2 的 Fiber 给 Todo B
```

这不是我们希望的“Todo A 保留 Todo A 的状态”。

更好的写法：

```jsx
function TodoList({todos}) {
  return todos.map(todo => (
    <TodoItem key={todo.id} todo={todo} />
  ));
}
```

## 九、React 如何判断节点复用、插入、移动、删除？

React 的判断可以归纳为四类。

| 操作 | 判断条件 | 源码位置 |
| --- | --- | --- |
| 复用 | key 相同，type 相同或兼容 | `updateElement` -> `useFiber` |
| 插入 | 新 Fiber 没有 alternate | `placeChild` / `placeSingleChild` 标记 `Placement` |
| 移动 | 新 Fiber 有 alternate，但旧 index 小于 `lastPlacedIndex` | `placeChild` 标记 `Placement` |
| 删除 | 旧 Fiber 没被新 children 消费 | `deleteChild` / `deleteRemainingChildren` 标记 `ChildDeletion` |

### 1. 复用：useFiber

```js
function useFiber(fiber, pendingProps) {
  const clone = createWorkInProgress(fiber, pendingProps);
  clone.index = 0;
  clone.sibling = null;
  return clone;
}
```

复用不是直接修改旧 Fiber，而是基于旧 Fiber 创建 workInProgress Fiber：

```text
current Fiber
  <-> alternate
workInProgress Fiber
```

### 2. 插入 / 移动：placeChild

```js
function placeChild(newFiber, lastPlacedIndex, newIndex) {
  newFiber.index = newIndex;

  if (!shouldTrackSideEffects) {
    return lastPlacedIndex;
  }

  const current = newFiber.alternate;
  if (current !== null) {
    const oldIndex = current.index;
    if (oldIndex < lastPlacedIndex) {
      newFiber.flags |= Placement | PlacementDEV;
      return lastPlacedIndex;
    } else {
      return oldIndex;
    }
  } else {
    newFiber.flags |= Placement | PlacementDEV;
    return lastPlacedIndex;
  }
}
```

含义：

```text
没有 alternate:
  新节点，标记 Placement

有 alternate:
  旧 index < lastPlacedIndex:
    说明它相对前面已经确认位置的节点发生了左移/乱序
    标记 Placement，commit 阶段会移动

  旧 index >= lastPlacedIndex:
    可以留在原地
    更新 lastPlacedIndex
```

### 3. 删除：deleteChild

```js
function deleteChild(returnFiber, childToDelete) {
  if (!shouldTrackSideEffects) {
    return;
  }

  const deletions = returnFiber.deletions;
  if (deletions === null) {
    returnFiber.deletions = [childToDelete];
    returnFiber.flags |= ChildDeletion;
  } else {
    deletions.push(childToDelete);
  }
}
```

删除不是直接移除 DOM，而是：

```text
returnFiber.deletions.push(oldFiber)
returnFiber.flags |= ChildDeletion
```

commit mutation 阶段再执行 DOM 删除和卸载副作用。

## 十、lastPlacedIndex 是什么？

`lastPlacedIndex` 是数组 diff 中用来判断“是否需要移动”的基准。

它表示：

```text
到目前为止，已经确认可以留在原地的旧 Fiber 的最大 oldIndex。
```

在新数组从左到右扫描时，如果某个可复用节点的旧位置 `oldIndex` 小于 `lastPlacedIndex`，说明它应该被移动。

### 示例 1：尾部追加，不移动

旧：

```text
[A, B]
oldIndex:
 A=0, B=1
```

新：

```text
[A, B, C]
newIndex:
 A=0, B=1, C=2
```

过程：

| new 节点 | oldIndex | lastPlacedIndex 之前 | 判断 | lastPlacedIndex 之后 |
| --- | --- | --- | --- | --- |
| A | 0 | 0 | 0 >= 0，不移动 | 0 |
| B | 1 | 0 | 1 >= 0，不移动 | 1 |
| C | 无 | 1 | 新节点，标记 Placement | 1 |

结果：

```text
C 插入
A/B 不移动
```

### 示例 2：把 C 移到最前

旧：

```text
[A, B, C]
oldIndex:
 A=0, B=1, C=2
```

新：

```text
[C, A, B]
newIndex:
 C=0, A=1, B=2
```

过程：

| new 节点 | oldIndex | lastPlacedIndex 之前 | 判断 | flag |
| --- | --- | --- | --- | --- |
| C | 2 | 0 | 2 >= 0，不标记移动，lastPlacedIndex = 2 | 无 |
| A | 0 | 2 | 0 < 2，需要移动 | `Placement` |
| B | 1 | 2 | 1 < 2，需要移动 | `Placement` |

这看起来像是移动 A/B，而不是移动 C。

为什么？

```text
React 的策略是从左到右构造新链表，
只要一个节点的旧位置没有倒退，就认为它可以作为“稳定锚点”。
后面旧位置倒退的节点标记 Placement，
commit 阶段通过插入操作得到最终 DOM 顺序。
```

### 示例 3：交换 B 和 C

旧：

```text
[A, B, C, D]
oldIndex:
 A=0, B=1, C=2, D=3
```

新：

```text
[A, C, B, D]
```

过程：

| new 节点 | oldIndex | lastPlacedIndex 之前 | 判断 | lastPlacedIndex 之后 |
| --- | --- | --- | --- | --- |
| A | 0 | 0 | 不移动 | 0 |
| C | 2 | 0 | 不移动 | 2 |
| B | 1 | 2 | 移动，标记 `Placement` | 2 |
| D | 3 | 2 | 不移动 | 3 |

结果：

```text
B 标记 Placement
commit 阶段把 B 插入到 D 前面
最终顺序变为 A C B D
```

## 十一、Placement / ChildDeletion 是在哪里标记的？

### Placement 标记位置

`Placement` 在两个函数中标记：

```text
placeSingleChild
placeChild
```

单节点：

```js
function placeSingleChild(newFiber) {
  if (shouldTrackSideEffects && newFiber.alternate === null) {
    newFiber.flags |= Placement | PlacementDEV;
  }
  return newFiber;
}
```

数组节点：

```js
function placeChild(newFiber, lastPlacedIndex, newIndex) {
  newFiber.index = newIndex;

  const current = newFiber.alternate;
  if (current !== null) {
    const oldIndex = current.index;
    if (oldIndex < lastPlacedIndex) {
      newFiber.flags |= Placement | PlacementDEV;
      return lastPlacedIndex;
    }
    return oldIndex;
  }

  newFiber.flags |= Placement | PlacementDEV;
  return lastPlacedIndex;
}
```

含义：

| 场景 | 是否标记 Placement |
| --- | --- |
| mount 阶段 child reconciler | 通常不跟踪 Placement |
| update 阶段新增单节点 | 是 |
| update 阶段数组新增节点 | 是 |
| update 阶段数组移动节点 | 是 |
| update 阶段可留在原地的复用节点 | 否 |

### ChildDeletion 标记位置

`ChildDeletion` 在 `deleteChild` 中标记在父 Fiber 上：

```js
function deleteChild(returnFiber, childToDelete) {
  const deletions = returnFiber.deletions;
  if (deletions === null) {
    returnFiber.deletions = [childToDelete];
    returnFiber.flags |= ChildDeletion;
  } else {
    deletions.push(childToDelete);
  }
}
```

注意：

```text
Placement 标在要插入/移动的新 Fiber 上；
ChildDeletion 标在父 Fiber 上，被删除的旧 Fiber 放在父 Fiber.deletions 数组里。
```

这样 commit 阶段可以从父 Fiber 找到需要删除的旧子树。

## 十二、单节点 diff 流程总结

```text
reconcileSingleElement
  -> 读取 new element.key
  -> 遍历 old child 链表
       -> key 不同:
            deleteChild(oldChild)
            继续
       -> key 相同:
            -> type 相同:
                 deleteRemainingChildren(sibling)
                 useFiber 复用
                 返回
            -> type 不同:
                 deleteRemainingChildren(child)
                 break
  -> createFiberFromElement
  -> placeSingleChild
       -> 如果是 update 且新 Fiber 没有 alternate
          标记 Placement
```

示例代码：

```jsx
function App({type}) {
  return type === 'a'
    ? <Panel key="same" title="A" />
    : <Panel key="same" title="B" />;
}
```

结果：

```text
key 相同
type 都是 Panel
复用 Fiber
Panel state 保留
props 更新
```

另一个示例：

```jsx
function App({type}) {
  return type === 'a'
    ? <Panel key="same" />
    : <Card key="same" />;
}
```

结果：

```text
key 相同
type 从 Panel 变成 Card
删除旧 Panel Fiber
新建 Card Fiber
state 不保留
```

## 十三、多节点 diff 流程总结

```text
reconcileChildrenArray
  -> 初始化:
       oldFiber = currentFirstChild
       newIdx = 0
       lastPlacedIndex = 0

  -> 快路径顺序扫描:
       updateSlot(oldFiber, newChildren[newIdx])
       key/type 匹配则复用
       placeChild 判断是否移动
       链接到新 sibling 链
       遇到 null 退出

  -> 如果 newChildren 已耗尽:
       deleteRemainingChildren(oldFiber)
       返回

  -> 如果 oldFiber 已耗尽:
       createChild 创建剩余新 Fiber
       placeChild 标记插入
       返回

  -> 慢路径:
       mapRemainingChildren(oldFiber)
       对剩余 newChildren:
         updateFromMap
         命中则复用并从 Map 删除
         placeChild 判断移动/插入
       Map 中剩余旧 Fiber 标记删除
```

示例：头部插入。

旧：

```jsx
[
  <li key="A">A</li>,
  <li key="B">B</li>,
]
```

新：

```jsx
[
  <li key="X">X</li>,
  <li key="A">A</li>,
  <li key="B">B</li>,
]
```

过程：

```text
第一轮:
  old A vs new X
  key 不同，updateSlot 返回 null
  退出快路径

慢路径:
  existingChildren = { A -> oldA, B -> oldB }

new X:
  Map 找不到
  createFiber
  Placement

new A:
  Map 找到 oldA
  useFiber 复用
  从 Map 删除 A

new B:
  Map 找到 oldB
  useFiber 复用
  从 Map 删除 B

Map 剩余:
  空
```

结果：

```text
X 插入
A/B 复用
没有删除
```

## 十四、React 与 Vue diff 对比表

这里的 Vue 指 Vue 3 常见 keyed children diff 思路，用于对比理解。React 结论基于当前 `react-main` 源码；Vue 部分是框架算法层面的概括。

| 对比项 | React child diff | Vue 3 keyed diff |
| --- | --- | --- |
| 核心数据结构 | Fiber 单向 child/sibling 链表 | VNode 数组 |
| diff 方向 | 主要前向扫描 | 头尾同步 + 中间乱序处理 |
| 是否双端比较 | 当前源码注释说明无法很好做双端，因为 Fiber 没有 backpointers | 会从头、尾分别同步相同节点 |
| 乱序处理 | 剩余旧 Fiber 建 Map，新节点按 key/index 查找 | 建 key:index map，并计算新旧索引映射 |
| 移动判断 | `lastPlacedIndex`，旧 index 小于它则标记 `Placement` | 通常结合最长递增子序列减少移动 |
| 移动优化 | 不计算 LIS，可能标记较多移动 | 使用 LIS 找出可保持不动的最长子序列 |
| 编译期优化 | React 主要依赖运行时 Fiber diff 和调度模型 | Vue 编译器可生成 patch flags、block tree，减少动态节点比较 |
| 更新粒度 | 组件 render 后对返回 children 做 Fiber diff | 编译器帮助定位动态部分，runtime patch VNode |
| 副作用表达 | `flags` / `subtreeFlags`，commit 阶段消费 | patch 过程中直接执行 DOM 操作或调度 |
| 并发关系 | diff 发生在 render 阶段，可被 Fiber 调度体系中断/恢复 | Vue 更新通常是 scheduler 批处理后的同步 patch |

### 核心差异一句话

```text
React diff 更服务于 Fiber 架构：
  生成 workInProgress Fiber 树 + flags，commit 阶段统一提交。

Vue diff 更服务于 VNode patch：
  借助编译器信息和双端/LIS 策略，尽量减少 DOM 移动。
```

### React 为什么不用 Vue 那种双端 + LIS？

从当前 React 源码注释看，一个关键原因是 Fiber children 是单向链表：

```text
This algorithm can't optimize by searching from both ends since we
don't have backpointers on fibers.
```

React 可以在慢路径用 Map 快速查找旧 Fiber，但它没有在数组 diff 中计算 LIS。它用 `lastPlacedIndex` 做一种简单有效的移动判断。

这和 React 的整体架构目标一致：

```text
React:
  更关注 Fiber 可中断 render、优先级调度、commit flags。

Vue:
  更依赖模板编译信息和 VNode patch 优化，尽量减少运行时比较和 DOM 移动。
```

## 十五、每一步示例代码

### 示例 1：复用节点

```jsx
function App({name}) {
  return <User key="user" name={name} />;
}
```

更新：

```text
<User key="user" name="A" />
-> <User key="user" name="B" />
```

diff：

```text
key 相同
type 相同
useFiber 复用旧 Fiber
pendingProps 更新为 {name: "B"}
```

结果：

```text
User 组件 state 保留
```

### 示例 2：替换节点

```jsx
function App({mode}) {
  return mode === 'user'
    ? <User key="panel" />
    : <Admin key="panel" />;
}
```

diff：

```text
key 相同
type 不同
删除旧 User Fiber
创建新 Admin Fiber
```

结果：

```text
User state 丢失
Admin mount
```

### 示例 3：删除节点

```jsx
function App({show}) {
  return (
    <div>
      {show ? <span key="tip">Tip</span> : null}
    </div>
  );
}
```

更新：

```text
show: true -> false
```

diff：

```text
newChild 是 null
deleteRemainingChildren(returnFiber, currentFirstChild)
returnFiber.deletions = [spanFiber]
returnFiber.flags |= ChildDeletion
```

commit：

```text
mutation 阶段删除 span DOM
执行相关 ref cleanup / effect cleanup
```

### 示例 4：插入节点

```jsx
function App({show}) {
  return (
    <div>
      {show ? <span key="tip">Tip</span> : null}
    </div>
  );
}
```

更新：

```text
show: false -> true
```

diff：

```text
旧 child 为空
createFiberFromElement(span)
placeSingleChild
newFiber.alternate === null
newFiber.flags |= Placement
```

commit：

```text
mutation 阶段插入 span DOM
```

### 示例 5：数组移动

```jsx
const oldItems = ['A', 'B', 'C', 'D'];
const newItems = ['A', 'C', 'B', 'D'];

function List({items}) {
  return items.map(id => <div key={id}>{id}</div>);
}
```

diff：

```text
A:
  oldIndex 0 >= lastPlacedIndex 0
  不移动
  lastPlacedIndex = 0

C:
  oldIndex 2 >= lastPlacedIndex 0
  不移动
  lastPlacedIndex = 2

B:
  oldIndex 1 < lastPlacedIndex 2
  标记 Placement

D:
  oldIndex 3 >= lastPlacedIndex 2
  不移动
  lastPlacedIndex = 3
```

结果：

```text
B 在 commit 阶段被移动
```

### 示例 6：index key 导致状态错位

```jsx
function Row({item}) {
  const [value, setValue] = useState(item.name);
  return <input value={value} onChange={e => setValue(e.target.value)} />;
}

function List({items}) {
  return items.map((item, index) => (
    <Row key={index} item={item} />
  ));
}
```

旧：

```text
key=0 -> A
key=1 -> B
```

新：

```text
key=0 -> X
key=1 -> A
key=2 -> B
```

React 复用：

```text
旧 key=0 的 Row(A) -> 新 Row(X)
旧 key=1 的 Row(B) -> 新 Row(A)
新建 key=2 的 Row(B)
```

问题：

```text
Row 的 useState 状态跟着位置走了，
没有跟着业务 item 走。
```

改成稳定 key：

```jsx
function List({items}) {
  return items.map(item => (
    <Row key={item.id} item={item} />
  ));
}
```

## 十六、学习重点

读 React diff 源码时，优先抓住这些点：

| 重点 | 说明 |
| --- | --- |
| diff 入口 | `ReactFiberBeginWork.js` 的 `reconcileChildren` |
| child reconciler | `ReactChildFiber.js` 的 `createChildReconciler` |
| mount/update 区别 | 是否 `shouldTrackSideEffects` |
| 单节点复用 | key 相同 + type 相同 |
| 数组快路径 | 同位置 `updateSlot` 顺序比较 |
| 数组慢路径 | `mapRemainingChildren` + `updateFromMap` |
| key | 在同层兄弟节点中建立稳定身份 |
| index key | 无 key 时 React fallback 到 index，会导致插入/排序时状态错位 |
| lastPlacedIndex | 判断移动的旧 index 基准 |
| Placement | 标记新 Fiber 需要插入或移动 |
| ChildDeletion | 标记父 Fiber 有子节点删除，删除列表放在 `returnFiber.deletions` |

## 十七、建议阅读顺序

| 顺序 | 文件/函数 | 目标 |
| --- | --- | --- |
| 1 | `ReactFiberBeginWork.js` -> `reconcileChildren` | 找到 diff 入口 |
| 2 | `ReactChildFiber.js` -> `createChildReconciler` | 理解 mount/update reconciler 的生成 |
| 3 | `deleteChild` / `deleteRemainingChildren` | 理解删除如何标记 |
| 4 | `placeSingleChild` / `placeChild` | 理解插入和移动如何标记 |
| 5 | `reconcileSingleElement` | 理解单节点 key/type 复用 |
| 6 | `reconcileChildrenArray` | 理解数组 diff 主流程 |
| 7 | `updateSlot` | 理解顺序扫描快路径 |
| 8 | `mapRemainingChildren` / `updateFromMap` | 理解慢路径 Map 查找 |
| 9 | `ReactFiberCommitWork.js` | 看 commit 阶段如何消费 `ChildDeletion` |
| 10 | `ReactFiberCommitHostEffects.js` | 看 commit 阶段如何执行 Placement DOM 插入/移动 |

## 十八、总结

React diff 的核心不是“直接比较 DOM”，而是：

```text
比较 new ReactElement children 与 old Fiber children，
构建新的 workInProgress child Fiber 链表，
复用能复用的 Fiber，
为插入、移动、删除打 flags，
让 commit 阶段一次性提交。
```

最核心的源码闭环：

```text
reconcileChildren
  -> reconcileChildFibers
  -> reconcileChildFibersImpl
  -> reconcileSingleElement / reconcileChildrenArray
  -> useFiber / createFiberFromElement / createChild
  -> placeChild / deleteChild
  -> flags: Placement / ChildDeletion
  -> commit 阶段修改 DOM
```

理解 React diff，最重要的是理解这三句话：

```text
1. key 决定同层节点身份。
2. type 决定能不能复用组件状态。
3. lastPlacedIndex 决定复用节点是否需要移动。
```

