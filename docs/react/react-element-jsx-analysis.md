# React Element 与 JSX 源码分析

本文档基于当前本地 `react-main` 源码整理，目标是回答两个核心问题：

1. JSX 最终会变成什么。
2. `React.createElement` 做了什么，以及 React Element 如何进入后续渲染流程。

## 源码位置

| 主题 | 源码文件 | 说明 |
| --- | --- | --- |
| React 公共入口 | `packages/react/index.js` | 对外导出 `createElement`、`cloneElement`、`isValidElement` 等 API |
| React Client 聚合导出 | `packages/react/src/ReactClient.js` | 从 `jsx/ReactJSXElement.js` 引入并导出 `createElement` |
| JSX runtime 与 Element 创建 | `packages/react/src/jsx/ReactJSXElement.js` | `ReactElement`、`jsxProd`、`jsxDEV`、`createElement` 的核心实现 |
| 自动 JSX runtime 出口 | `packages/react/src/jsx/ReactJSX.js` | 导出 `jsx`、`jsxs`、`jsxDEV` |
| React 内部标识 | `packages/shared/ReactSymbols.js` | 定义 `REACT_ELEMENT_TYPE`、`REACT_FRAGMENT_TYPE` 等 symbol |
| Element 转 Fiber | `packages/react-reconciler/src/ReactFiber.js` | `createFiberFromElement`、`createFiberFromTypeAndProps` |
| 子节点协调 | `packages/react-reconciler/src/ReactChildFiber.js` | 根据 React Element 创建或复用 Fiber |
| beginWork 子节点入口 | `packages/react-reconciler/src/ReactFiberBeginWork.js` | `reconcileChildren` 进入 child reconciliation |

## JSX 编译后大概会变成什么代码

JSX 本身不是运行时数据结构，它会先被编译器转换成普通 JavaScript 调用。

### 现代 JSX transform

现在更常见的是自动 runtime。示例：

```jsx
const element = <div className="box">hello</div>;
```

大致会编译成：

```js
import {jsx as _jsx} from 'react/jsx-runtime';

const element = _jsx('div', {
  className: 'box',
  children: 'hello',
});
```

多个静态 children 时，通常会使用 `jsxs`：

```jsx
const element = (
  <ul>
    <li>A</li>
    <li>B</li>
  </ul>
);
```

大致会编译成：

```js
import {jsxs as _jsxs, jsx as _jsx} from 'react/jsx-runtime';

const element = _jsxs('ul', {
  children: [_jsx('li', {children: 'A'}), _jsx('li', {children: 'B'})],
});
```

开发环境会使用 `jsxDEV`，额外携带调试信息。

源码上，`packages/react/src/jsx/ReactJSX.js` 把 `jsx`、`jsxs`、`jsxDEV` 导出；生产环境的 `jsx/jsxs` 最终走 `ReactJSXElement.js` 里的 `jsxProd`，开发环境走带校验和调试栈的路径。

### 经典 JSX transform

旧的 JSX transform 会编译成 `React.createElement`：

```jsx
const element = <div className="box">hello</div>;
```

大致会变成：

```js
const element = React.createElement(
  'div',
  {className: 'box'},
  'hello',
);
```

React 仍然保留 `createElement`，既用于手写调用，也用于某些编译场景。

## React.createElement 的入口在哪里

入口链路：

```text
react/index.js
  -> packages/react/src/ReactClient.js
  -> packages/react/src/jsx/ReactJSXElement.js
  -> createElement(...)
  -> ReactElement(...)
```

`ReactClient.js` 从 `./jsx/ReactJSXElement` 中引入 `createElement`、`cloneElement`、`isValidElement`，然后再统一导出。

## React.createElement 做了什么

`createElement(type, config, children)` 的核心步骤：

| 步骤 | 行为 |
| --- | --- |
| 1 | 开发环境下校验 children 的 key |
| 2 | 创建新的 `props` 对象 |
| 3 | 从 `config` 中提取特殊字段 `key` |
| 4 | 把普通字段复制到 `props`，跳过 `key`、`__self`、`__source` |
| 5 | 把第三个及之后的参数整理成 `props.children` |
| 6 | 合并 `type.defaultProps` |
| 7 | 开发环境下为 `props.key` 加访问警告 |
| 8 | 调用 `ReactElement(type, key, props, owner, debugStack, debugTask)` |

简化版伪代码：

```js
function createElement(type, config, ...children) {
  const props = {};
  let key = null;

  if (config != null) {
    if (config.key !== undefined) {
      key = '' + config.key;
    }

    for (const propName in config) {
      if (
        propName !== 'key' &&
        propName !== '__self' &&
        propName !== '__source'
      ) {
        props[propName] = config[propName];
      }
    }
  }

  if (children.length === 1) {
    props.children = children[0];
  } else if (children.length > 1) {
    props.children = children;
  }

  if (type && type.defaultProps) {
    for (const propName in type.defaultProps) {
      if (props[propName] === undefined) {
        props[propName] = type.defaultProps[propName];
      }
    }
  }

  return ReactElement(type, key, props, owner, debugStack, debugTask);
}
```

注意：当前源码中 `ref` 被视为普通 prop 存在于 `props.ref` 中，`ReactElement` 会从 `props.ref` 读取 ref 值。开发环境访问 `element.ref` 会触发兼容性警告，因为 React 19 中 ref 正在向普通 prop 语义迁移。

## 核心数据结构

React Element 是一个普通 JavaScript 对象。生产环境下大致结构如下：

```js
{
  $$typeof: Symbol.for('react.transitional.element'),
  type,
  key,
  ref,
  props,
}
```

开发环境下结构略有不同：

```js
{
  $$typeof: Symbol.for('react.transitional.element'),
  type,
  key,
  props,
  _owner,
  ref: nonEnumerableGetterOrValue,
  _store,
  _debugInfo,
  _debugStack,
  _debugTask,
}
```

字段说明：

| 字段 | 作用 |
| --- | --- |
| `$$typeof` | React Element 的身份标识，用于判断一个对象是否是 React Element |
| `type` | 描述节点类型。字符串表示宿主节点，例如 `'div'`；函数表示函数组件；class 表示类组件；特殊 symbol 表示 Fragment、Suspense 等 |
| `key` | child reconciliation 使用的稳定身份标识，主要用于数组或列表 diff |
| `ref` | 指向宿主实例或组件实例的引用信息。当前源码中来自 `props.ref` |
| `props` | 组件或宿主节点收到的属性集合，`children` 也在这里 |
| `_owner` | 开发环境调试用，记录创建该 Element 的 owner |
| `_debugStack`、`_debugTask`、`_debugInfo` | 开发环境调试信息 |

## key、ref、props、type 分别有什么作用

| 字段 | 作用 | 后续在哪里被使用 |
| --- | --- | --- |
| `type` | 决定这个 Element 表示什么：DOM 标签、函数组件、类组件或 React 内置类型 | `createFiberFromTypeAndProps` 根据 `type` 选择 Fiber 的 `tag`，例如 `HostComponent`、`FunctionComponent`、`ClassComponent` |
| `key` | 标识同一层 children 中的稳定身份，帮助 diff 判断复用、移动、插入、删除 | `ReactChildFiber` 的 `reconcileSingleElement`、`reconcileChildrenArray` 使用 key 匹配旧 Fiber |
| `ref` | 表示渲染完成后要关联的引用 | `ReactChildFiber` 中 `coerceRef` 会把 element 的 ref 信息转到 Fiber 上，commit 阶段再处理 |
| `props` | 保存传给组件或宿主节点的数据，包括 `children` | `createFiberFromElement` 把 `element.props` 作为 `pendingProps` 放进 Fiber |

## React Element 和 Fiber 节点有什么区别

| 对比项 | React Element | Fiber |
| --- | --- | --- |
| 本质 | 描述 UI 的普通对象 | React 内部的工作单元和树节点 |
| 是否可变 | 基本作为不可变描述使用 | 会在渲染过程中被更新、复用、打 flags |
| 创建时机 | JSX 或 `createElement` 调用时创建 | reconciler 处理 Element 时创建或复用 |
| 主要字段 | `$$typeof`、`type`、`key`、`ref`、`props` | `tag`、`key`、`type`、`stateNode`、`child`、`sibling`、`return`、`pendingProps`、`memoizedProps`、`flags`、`lanes`、`alternate` |
| 表达内容 | “我想要的 UI 是什么” | “React 当前如何完成这次渲染工作” |
| 是否包含调度信息 | 不包含 | 包含 `lanes`、`childLanes`、`flags` 等调度和副作用信息 |
| 是否直接对应真实 DOM | 不直接对应 | HostComponent Fiber 的 `stateNode` 会指向真实 DOM 节点 |

一句话：React Element 是 UI 描述，Fiber 是执行计划和运行时状态。

## 为什么 React 不直接操作 JSX

原因可以分成几层：

1. JSX 不是运行时对象。它只是语法糖，必须先被 Babel、TypeScript 或其他编译器转换成 JavaScript。
2. React 需要统一输入格式。无论 JSX、`React.createElement`、`jsx/jsxs` runtime，最后都可以落到 React Element 这种统一描述对象。
3. React Element 很轻量。它只描述 `type`、`key`、`props` 等信息，不包含调度、DOM、状态队列等运行时复杂信息。
4. Fiber 可以独立承担运行时工作。调度、中断、复用、diff、commit 等复杂逻辑都放到 Fiber 层，而不是污染 Element。
5. 这种分层让 React 可以支持多个 renderer。相同的 Element 描述可以进入 DOM、Native、自定义 renderer 等不同宿主环境。

## 调用链

### 现代 JSX runtime 调用链

```text
JSX
  -> 编译为 jsx/jsxs/jsxDEV 调用
  -> react/src/jsx/ReactJSX.js
  -> ReactJSXElement.js: jsxProd 或 jsxDEVImpl
  -> ReactElement(...)
  -> 返回 React Element 对象
```

### React.createElement 调用链

```text
React.createElement(type, config, children)
  -> react/index.js 导出 createElement
  -> ReactClient.js 导出 createElement
  -> ReactJSXElement.js: createElement
  -> 提取 key
  -> 组装 props
  -> 处理 children
  -> 合并 defaultProps
  -> ReactElement(...)
  -> 返回 React Element 对象
```

### React Element 进入渲染流程

```text
root.render(<App />)
  -> updateContainer(element, root, ...)
  -> 创建 update，payload.element = element
  -> scheduleUpdateOnFiber
  -> render 阶段 beginWork
  -> reconcileChildren
  -> ReactChildFiber.reconcileChildFibers
  -> 遇到 REACT_ELEMENT_TYPE
  -> reconcileSingleElement 或 createChild
  -> createFiberFromElement
  -> createFiberFromTypeAndProps
  -> 得到 Fiber 节点
```

## 示例代码

### JSX 示例

```jsx
function App() {
  return <div className="box">hello</div>;
}
```

现代 transform 大致结果：

```js
import {jsx as _jsx} from 'react/jsx-runtime';

function App() {
  return _jsx('div', {
    className: 'box',
    children: 'hello',
  });
}
```

运行后得到的 React Element 可以理解为：

```js
{
  $$typeof: Symbol.for('react.transitional.element'),
  type: 'div',
  key: null,
  ref: null,
  props: {
    className: 'box',
    children: 'hello',
  },
}
```

### key 示例

```jsx
const list = items.map(item => <li key={item.id}>{item.name}</li>);
```

每个 `<li>` 的 Element 中会有自己的 `key`：

```js
{
  type: 'li',
  key: 'item-id',
  props: {
    children: item.name,
  },
}
```

后续 diff 时，React 会用 key 在同一层级的旧 Fiber 中寻找可复用节点。

### ref 示例

```jsx
const inputRef = useRef(null);
const element = <input ref={inputRef} />;
```

当前源码语义下，`ref` 会保留在 `props.ref` 中，`ReactElement` 从 `props.ref` 派生 `element.ref`，后续 child reconciliation 会把它转到 Fiber 的 `ref` 字段。

## React Element 到 Fiber 的转换关系

核心转换发生在 `packages/react-reconciler/src/ReactFiber.js`：

```text
React Element
  type        -> Fiber.elementType / Fiber.type / Fiber.tag
  key         -> Fiber.key
  props       -> Fiber.pendingProps
  ref         -> Fiber.ref
  _owner      -> Fiber._debugOwner
  _debugStack -> Fiber._debugStack
```

关键函数：

```text
createFiberFromElement(element, mode, lanes)
  -> const type = element.type
  -> const key = element.key
  -> const pendingProps = element.props
  -> createFiberFromTypeAndProps(type, key, pendingProps, owner, mode, lanes)
```

`createFiberFromTypeAndProps` 会根据 `type` 决定 Fiber 类型：

| Element type | Fiber tag |
| --- | --- |
| `'div'`、`'span'` 等字符串 | `HostComponent` |
| 函数组件 | `FunctionComponent` |
| 类组件 | `ClassComponent` |
| `React.Fragment` | `Fragment` |
| `React.Suspense` | `SuspenseComponent` |
| `React.memo(...)` | `MemoComponent` |
| `React.forwardRef(...)` | `ForwardRef` |
| `React.lazy(...)` | `LazyComponent` |

## 后续渲染流程中如何使用 React Element

React Element 通常不会长期作为运行时状态存在。它更多是一次 render 产生的输入描述。

1. 组件 render 或 JSX 表达式产生 React Element。
2. `root.render(element)` 或父组件 render 返回 children。
3. reconciler 在 `reconcileChildren` 中读取这些 Element。
4. React 根据 `type` 和 `key` 判断能否复用旧 Fiber。
5. 如果能复用，调用 `useFiber` 克隆旧 Fiber，更新 `pendingProps`。
6. 如果不能复用，调用 `createFiberFromElement` 创建新 Fiber。
7. Fiber 在后续 `beginWork`、`completeWork`、`commit` 阶段承载真正工作。

所以，React Element 的生命周期很短：它负责描述下一棵 UI 树；Fiber 负责把这份描述变成可调度、可提交的工作。

## 总结

React Element 是 React 源码中非常关键的第一层抽象。它把 JSX 从语法层转换成统一的数据描述：

```text
JSX
  -> jsx/jsxs 或 React.createElement
  -> React Element
  -> Fiber
  -> DOM 或其他宿主环境
```

理解 React Element 后，再去读 Fiber、diff、commit 会顺很多，因为后续很多逻辑本质上都是围绕 `type`、`key`、`props` 这几个字段做判断和转换。
