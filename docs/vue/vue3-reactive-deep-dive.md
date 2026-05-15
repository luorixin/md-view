# Vue3 reactive 响应式源码深入分析

> 分析对象：当前本地 `vue3` 源码  
> 核心问题：`reactive` 如何把普通对象变成响应式对象  
> 重点源码目录：`vue3/packages/reactivity/src`

## 结论先行

`reactive(obj)` 并不会立刻递归遍历 `obj` 的所有属性，也不会把每个属性都改造成 getter/setter。它做的核心事情是：

1. 判断目标值是不是可代理对象。
2. 根据目标类型选择普通对象 handler 或集合类型 handler。
3. 用 `new Proxy(target, handlers)` 创建代理对象。
4. 把 `target -> proxy` 缓存在 `reactiveMap` 中。
5. 等真正读取属性时，在 `get` 拦截器中收集依赖，并对嵌套对象做懒代理。
6. 等真正写入属性时，在 `set` 拦截器中判断是新增还是修改，再调用 `trigger` 触发依赖更新。

最核心链路：

```text
reactive(target)
  -> createReactiveObject(target, false, mutableHandlers, mutableCollectionHandlers, reactiveMap)
    -> new Proxy(target, handlers)
      -> get: track(target, GET, key)
      -> set: trigger(target, ADD/SET, key)
```

## 源码位置

| 主题 | 文件 | 关键位置 |
| --- | --- | --- |
| `reactive` 入口 | `vue3/packages/reactivity/src/reactive.ts` | `reactive()`：91-105；`createReactiveObject()`：268-309 |
| Proxy handler | `vue3/packages/reactivity/src/baseHandlers.ts` | `BaseReactiveHandler.get()`：55-134；`MutableReactiveHandler.set()`：142-192；`mutableHandlers`：251-252 |
| 数组方法特殊处理 | `vue3/packages/reactivity/src/arrayInstrumentations.ts` | `arrayInstrumentations`：42-230；`noTracking()`：361-372 |
| Map/Set handler | `vue3/packages/reactivity/src/collectionHandlers.ts` | `createInstrumentations()`：96-268；`mutableCollectionHandlers`：296-298 |
| 依赖图 | `vue3/packages/reactivity/src/dep.ts` | `Dep`：67-205；`targetMap`：238-240；`track()`：262-284；`trigger()`：294-389 |
| effect 执行单元 | `vue3/packages/reactivity/src/effect.ts` | `ReactiveEffect`：87-228；`effect()`：484-505；`batch()`：251-260 |
| 操作类型常量 | `vue3/packages/reactivity/src/constants.ts` | `TrackOpTypes`：4-8；`TriggerOpTypes`：10-15；`ReactiveFlags`：17-24 |

## reactive 的入口函数在哪里？

入口在：

```text
vue3/packages/reactivity/src/reactive.ts
```

关键代码位置：

```ts
export function reactive<T extends object>(target: T): Reactive<T>
export function reactive(target: object) {
  if (isReadonly(target)) {
    return target
  }
  return createReactiveObject(
    target,
    false,
    mutableHandlers,
    mutableCollectionHandlers,
    reactiveMap,
  )
}
```

这个入口传给 `createReactiveObject` 五个参数：

| 参数 | 含义 |
| --- | --- |
| `target` | 原始对象 |
| `false` | 不是 readonly |
| `mutableHandlers` | 普通对象/数组使用的 Proxy handlers |
| `mutableCollectionHandlers` | Map/Set/WeakMap/WeakSet 使用的 Proxy handlers |
| `reactiveMap` | 缓存原始对象到 reactive proxy 的 WeakMap |

注意：如果传入的是 readonly proxy，`reactive` 会直接返回它，不会把 readonly 重新变成 mutable。

## reactive 调用链

```text
用户调用
  reactive({ count: 0 })

入口
  reactive(target)

创建代理
  createReactiveObject(
    target,
    isReadonly = false,
    baseHandlers = mutableHandlers,
    collectionHandlers = mutableCollectionHandlers,
    proxyMap = reactiveMap
  )

校验
  1. 非对象：直接返回原值
  2. 已经是 Proxy：直接返回
  3. 不可代理类型：直接返回
  4. 已经有缓存 Proxy：返回缓存

创建
  new Proxy(
    target,
    targetType === COLLECTION
      ? mutableCollectionHandlers
      : mutableHandlers
  )

缓存
  reactiveMap.set(target, proxy)

返回
  proxy
```

源码中的 `TargetType` 分三类：

```text
INVALID     不可代理类型
COMMON      Object / Array
COLLECTION  Map / Set / WeakMap / WeakSet
```

判断逻辑在 `targetTypeMap()` 和 `getTargetType()` 中：

- `Object`、`Array` 走 `mutableHandlers`。
- `Map`、`Set`、`WeakMap`、`WeakSet` 走 `mutableCollectionHandlers`。
- 被 `markRaw` 标记、不可扩展对象、其他类型走 `INVALID`。

## reactive 内部如何创建 Proxy？

核心创建代码在 `createReactiveObject()`：

```ts
const proxy = new Proxy(
  target,
  targetType === TargetType.COLLECTION ? collectionHandlers : baseHandlers,
)
proxyMap.set(target, proxy)
return proxy
```

创建前会做几层保护：

1. **非对象不代理**
   - `reactive(1)`、`reactive(null)` 这类值不能变成 Proxy。

2. **已经是 Proxy 时避免重复代理**
   - 通过 `ReactiveFlags.RAW` 判断。

3. **只代理特定类型**
   - 普通对象、数组、Map、Set、WeakMap、WeakSet。

4. **同一个 target 只创建一个 proxy**
   - 通过 `reactiveMap` 缓存。

缓存结构：

```text
reactiveMap: WeakMap<Target, Proxy>

原始对象 rawObj ──> reactiveProxy
```

这保证：

```ts
const raw = {}
reactive(raw) === reactive(raw) // true
```

## mutableHandlers 的作用是什么？

`mutableHandlers` 定义在：

```text
vue3/packages/reactivity/src/baseHandlers.ts
```

它是普通对象和数组的 Proxy handler：

```ts
export const mutableHandlers: ProxyHandler<object> =
  new MutableReactiveHandler()
```

`MutableReactiveHandler` 继承 `BaseReactiveHandler`：

```text
BaseReactiveHandler
  -> get()

MutableReactiveHandler
  -> set()
  -> deleteProperty()
  -> has()
  -> ownKeys()
```

它的职责是把 JavaScript 对象操作转换成响应式系统能理解的操作：

| JS 操作 | Proxy trap | 响应式行为 |
| --- | --- | --- |
| `obj.foo` | `get` | 读取属性，调用 `track(target, GET, key)` |
| `obj.foo = 1` | `set` | 写入属性，必要时调用 `trigger(target, SET/ADD, key)` |
| `delete obj.foo` | `deleteProperty` | 删除属性，调用 `trigger(target, DELETE, key)` |
| `'foo' in obj` | `has` | 判断 key 是否存在，调用 `track(target, HAS, key)` |
| `Object.keys(obj)` / `for...in` | `ownKeys` | 枚举 key，调用 `track(target, ITERATE, ITERATE_KEY)` |

所以 `mutableHandlers` 是普通对象响应式能力的核心入口。

## get 拦截器做了什么？

`get` 在 `BaseReactiveHandler.get()` 中，主要分七步。

### 1. 处理内部响应式标志

当读取这些 key 时，不走普通依赖收集，而是返回代理元信息：

```text
ReactiveFlags.SKIP
ReactiveFlags.IS_REACTIVE
ReactiveFlags.IS_READONLY
ReactiveFlags.IS_SHALLOW
ReactiveFlags.RAW
```

例如：

```ts
isReactive(proxy)
```

底层就是读取 `proxy[ReactiveFlags.IS_REACTIVE]`。

### 2. 数组特殊方法拦截

非 readonly 且 target 是数组时，部分数组方法会从 `arrayInstrumentations` 返回：

```text
includes / indexOf / lastIndexOf
push / pop / shift / unshift / splice
forEach / map / filter / find ...
```

原因：

- `includes/indexOf` 要同时兼容 raw 值和 proxy 值。
- `push/splice` 等会改变 length 的方法要暂停 tracking，避免某些 length 依赖导致循环触发。

### 3. hasOwnProperty 特殊处理

`obj.hasOwnProperty(key)` 会被替换为自定义函数，内部对 `HAS` 类型做依赖收集：

```text
track(rawObj, TrackOpTypes.HAS, key)
```

### 4. 使用 Reflect.get 读取真实值

```ts
const res = Reflect.get(target, key, receiver)
```

`Reflect.get` 比 `target[key]` 更适合 Proxy trap，因为它能正确传递 `receiver`，支持 getter 中的 `this` 指向代理对象。

### 5. 跳过不需要追踪的 key

内置 Symbol、`__proto__`、`__v_isRef`、`__isVue` 不收集依赖。

### 6. 非 readonly 时收集 GET 依赖

```ts
track(target, TrackOpTypes.GET, key)
```

这是读取属性和 effect 建立关系的关键。

### 7. 懒递归代理与 ref 解包

如果是 shallow，直接返回读取值。

如果读取到的是 ref：

- 普通对象属性：返回 `ref.value`。
- 数组整数索引：返回 ref 本身，避免数组元素 ref 被自动解包。

如果读取到的是对象：

- readonly 模式返回 `readonly(res)`。
- reactive 模式返回 `reactive(res)`。

这就是 Vue3 的“懒代理”：嵌套对象不会在 `reactive()` 调用时立刻全部代理，而是在读取到嵌套对象时才代理。

示意：

```ts
const state = reactive({ nested: { count: 0 } })

// reactive(state) 时 nested 还没有必要立即变 Proxy
state.nested
// get 拦截器发现 nested 是对象，返回 reactive(nested)
```

## set 拦截器做了什么？

`set` 在 `MutableReactiveHandler.set()` 中，主要分六步。

### 1. 读取旧值

```ts
let oldValue = target[key]
```

后面要用旧值判断是否真的发生变化。

### 2. 非 shallow 模式下转 raw

如果不是 shallow，并且新旧值不是 shallow/readonly，会先转成 raw：

```text
oldValue = toRaw(oldValue)
value = toRaw(value)
```

这样可以避免 proxy 与 raw 混用时比较异常。

### 3. 特殊处理旧值是 ref 的情况

如果旧值是 ref，新值不是 ref，并且不是数组整数索引：

```ts
oldValue.value = value
return true
```

也就是说：

```ts
const state = reactive({ count: ref(0) })
state.count = 1
```

本质上会更新旧 ref 的 `.value`，而不是替换整个 ref。

### 4. 判断是新增还是修改

```text
hadKey = key 是否已经存在
```

数组整数索引用 `Number(key) < target.length` 判断，普通对象用 `hasOwn(target, key)`。

### 5. 使用 Reflect.set 写入

```ts
const result = Reflect.set(target, key, value, receiver)
```

### 6. 触发 ADD 或 SET

只有当 `target === toRaw(receiver)` 时才触发，避免原型链上的 set 导致重复触发。

```text
如果原来没有 key：
  trigger(target, TriggerOpTypes.ADD, key, value)

如果原来有 key 且值发生变化：
  trigger(target, TriggerOpTypes.SET, key, value, oldValue)
```

所以：

```ts
state.foo = 1
```

可能是两种操作：

```text
新增属性：ADD
修改属性：SET
```

这对触发范围很重要，因为新增属性还会影响 `for...in`、`Object.keys` 这类迭代依赖。

## targetMap 的数据结构是什么？

`targetMap` 定义在 `dep.ts`：

```ts
type KeyToDepMap = Map<any, Dep>
export const targetMap: WeakMap<object, KeyToDepMap> = new WeakMap()
```

它保存的是：

```text
原始对象 target
  -> key
    -> Dep
      -> effect / computed subscribers
```

数据结构图：

```text
targetMap: WeakMap<object, Map<any, Dep>>

WeakMap
┌─────────────────────────────┐
│ rawTarget1                  │
│   └─ depsMap: Map           │
│       ├─ "count" ── Dep     │
│       │              ├─ Link ── ReactiveEffect A
│       │              └─ Link ── ReactiveEffect B
│       │
│       ├─ "name"  ── Dep     │
│       │              └─ Link ── ReactiveEffect C
│       │
│       └─ ITERATE_KEY ─ Dep  │
│                      └─ Link ── ReactiveEffect D
│
│ rawTarget2                  │
│   └─ depsMap: Map           │
│       └─ "foo" ─── Dep      │
└─────────────────────────────┘
```

更具体地说：

```text
targetMap
  WeakMap<rawTarget, depsMap>

depsMap
  Map<key, dep>

dep
  Dep 实例，代表 target 上某个 key 的依赖集合

link
  Link 实例，连接一个 Dep 和一个 Subscriber

subscriber
  ReactiveEffect 或 ComputedRefImpl
```

为什么不是简单的 `Set<effect>`？

当前 Vue3 源码中，`Dep` 和 `Subscriber` 之间是多对多关系：

- 一个属性 key 可以被多个 effect 读取。
- 一个 effect 执行时也可能读取多个属性 key。

源码用 `Link` 表示每一条连接，并让它同时处于两条双向链表中：

```text
Dep.subs 链表：这个属性被哪些 effect 订阅
Effect.deps 链表：这个 effect 依赖了哪些属性
```

这样便于：

- effect 重新执行前标记旧依赖。
- effect 重新执行后清理已经不再使用的依赖。
- computed 做版本检查和缓存优化。
- 在无订阅者时清理 dep，减少内存占用。

## effect 和依赖之间是什么关系？

`effect(fn)` 做的事：

```text
effect(fn)
  -> new ReactiveEffect(fn)
  -> e.run()
    -> activeSub = e
    -> 执行 fn()
      -> 读取 reactive 属性
        -> get trap
          -> track(target, GET, key)
            -> targetMap 找到 Dep
            -> Dep.track()
              -> 创建 Link(activeSub, dep)
              -> Link 加到 effect.deps 链表
              -> Link 加到 dep.subs 链表
  -> 返回 runner
```

关系图：

```text
ReactiveEffect A
  deps ── Link ── Dep(rawState, "count")
       └ Link ── Dep(rawState, "name")

Dep(rawState, "count")
  subs ── Link ── ReactiveEffect A
       └ Link ── ReactiveEffect B
```

也就是说：

- `effect` 是订阅者。
- `Dep` 是某个响应式属性的依赖桶。
- `Link` 是 effect 与 dep 的连接边。
- `track` 建立连接。
- `trigger` 沿连接找到 effect 并通知它。

## track 是如何收集依赖的？

`track` 入口在 `dep.ts`。

触发前提：

```text
shouldTrack === true
activeSub 存在
```

也就是说，只有当前正在执行某个 effect/computed 时，读取 reactive 属性才会收集依赖。

流程图：

```text
effect.run()
  |
  | 设置 activeSub = 当前 ReactiveEffect
  v
执行用户函数 fn()
  |
  | 读取 state.count
  v
Proxy get
  |
  | track(target, GET, "count")
  v
targetMap.get(target)
  |
  | 不存在则创建 depsMap = new Map()
  v
depsMap.get("count")
  |
  | 不存在则创建 dep = new Dep()
  v
dep.track()
  |
  | 创建/复用 Link(activeSub, dep)
  v
建立双向关系：
  activeSub.deps -> Link -> dep
  dep.subs      -> Link -> activeSub
```

伪代码：

```ts
function track(target, type, key) {
  if (shouldTrack && activeSub) {
    let depsMap = targetMap.get(target)
    if (!depsMap) {
      targetMap.set(target, (depsMap = new Map()))
    }

    let dep = depsMap.get(key)
    if (!dep) {
      depsMap.set(key, (dep = new Dep()))
      dep.map = depsMap
      dep.key = key
    }

    dep.track({ target, type, key })
  }
}
```

关键点：

- `target` 是原始对象，不是 proxy。
- `key` 是被读取的属性。
- `type` 用于调试和区分读取类型，例如 `GET`、`HAS`、`ITERATE`。
- 真正把 effect 放进依赖桶的是 `dep.track()`。

## trigger 是如何触发更新的？

`trigger` 入口也在 `dep.ts`。

当 `set/delete/clear` 等写操作发生时，handler 会调用：

```text
trigger(target, type, key, newValue, oldValue)
```

流程图：

```text
state.count = 1
  |
  v
Proxy set
  |
  | 判断 ADD 还是 SET
  v
trigger(target, SET, "count", newValue, oldValue)
  |
  v
targetMap.get(target)
  |
  | 找到 depsMap
  v
depsMap.get("count")
  |
  | 找到 dep
  v
dep.trigger()
  |
  | dep.version++ / globalVersion++
  v
dep.notify()
  |
  | 遍历 dep.subs 链表
  v
subscriber.notify()
  |
  | batch(subscriber)
  v
endBatch()
  |
  | ReactiveEffect.trigger()
  v
有 scheduler：scheduler()
无 scheduler：runIfDirty()
```

普通对象触发规则：

| 操作 | 触发内容 |
| --- | --- |
| 修改已有 key：`SET` | 触发该 key 对应的 Dep |
| 新增 key：`ADD` | 触发该 key 的 Dep，同时触发迭代依赖 `ITERATE_KEY` |
| 删除 key：`DELETE` | 触发该 key 的 Dep，同时触发迭代依赖 `ITERATE_KEY` |
| 清空集合：`CLEAR` | 触发该 target 上所有 Dep |

数组有额外规则：

- 修改 `length` 会触发：
  - `length` 依赖
  - `ARRAY_ITERATE_KEY` 依赖
  - 大于等于新 length 的索引依赖
- 新增数组索引会触发 `length` 依赖。

Map 有额外规则：

- `ADD` / `DELETE` 会触发 `ITERATE_KEY` 和 `MAP_KEY_ITERATE_KEY`。
- `SET` 会触发 `ITERATE_KEY`，因为 Map value 变化会影响迭代结果。

## Proxy handlers 分析

### 普通对象 handlers

普通对象和数组使用：

```text
mutableHandlers
```

来自：

```ts
new MutableReactiveHandler()
```

包含：

```text
get
set
deleteProperty
has
ownKeys
```

### 集合类型 handlers

Map/Set/WeakMap/WeakSet 使用：

```text
mutableCollectionHandlers
```

它只有一个 `get` trap：

```ts
export const mutableCollectionHandlers = {
  get: createInstrumentationGetter(false, false),
}
```

为什么集合类型不直接用普通 `set/deleteProperty`？

因为 Map/Set 的关键操作不是属性赋值，而是方法调用：

```ts
map.get(key)
map.set(key, value)
map.delete(key)
map.clear()
set.add(value)
```

所以 Vue3 会在 `get` trap 里返回被包装过的 `get/set/delete/clear/forEach/keys/values/entries` 方法，这些方法内部再调用 `track` 或 `trigger`。

### 数组方法 handlers

数组本身仍走 `mutableHandlers`，但 `get` 中会对一些数组方法返回 `arrayInstrumentations` 的版本。

典型目的：

- 读全量数组时追踪 `ARRAY_ITERATE_KEY`。
- `includes/indexOf/lastIndexOf` 兼容 raw/proxy 身份差异。
- `push/pop/shift/unshift/splice` 暂停 tracking，避免 length 相关循环。

## track / trigger 流程图

### 读取收集依赖

```text
┌─────────────────────────────┐
│ effect(() => state.count)   │
└──────────────┬──────────────┘
               │
               v
┌─────────────────────────────┐
│ ReactiveEffect.run()        │
│ activeSub = currentEffect   │
└──────────────┬──────────────┘
               │
               v
┌─────────────────────────────┐
│ 读取 state.count             │
└──────────────┬──────────────┘
               │
               v
┌─────────────────────────────┐
│ Proxy get trap              │
└──────────────┬──────────────┘
               │
               v
┌─────────────────────────────┐
│ track(rawTarget, GET, key)  │
└──────────────┬──────────────┘
               │
               v
┌─────────────────────────────┐
│ targetMap / depsMap / Dep   │
└──────────────┬──────────────┘
               │
               v
┌─────────────────────────────┐
│ Link connects Dep + Effect  │
└─────────────────────────────┘
```

### 写入触发更新

```text
┌─────────────────────────────┐
│ state.count++               │
└──────────────┬──────────────┘
               │
               v
┌─────────────────────────────┐
│ Proxy set trap              │
└──────────────┬──────────────┘
               │
               v
┌─────────────────────────────┐
│ 判断 ADD / SET              │
└──────────────┬──────────────┘
               │
               v
┌─────────────────────────────┐
│ trigger(rawTarget, type,key)│
└──────────────┬──────────────┘
               │
               v
┌─────────────────────────────┐
│ targetMap 找到 Dep          │
└──────────────┬──────────────┘
               │
               v
┌─────────────────────────────┐
│ Dep.notify()                │
└──────────────┬──────────────┘
               │
               v
┌─────────────────────────────┐
│ Subscriber.notify()         │
└──────────────┬──────────────┘
               │
               v
┌─────────────────────────────┐
│ batch / scheduler / run     │
└─────────────────────────────┘
```

## 用一个例子串起来

```ts
const state = reactive({ count: 0 })

effect(() => {
  console.log(state.count)
})

state.count++
```

### 第一步：创建 reactive proxy

```text
reactive({ count: 0 })
  -> createReactiveObject
  -> targetType = COMMON
  -> new Proxy(target, mutableHandlers)
  -> reactiveMap.set(target, proxy)
```

此时还没有任何依赖，因为还没有读取属性。

### 第二步：effect 首次执行

```text
effect(fn)
  -> new ReactiveEffect(fn)
  -> e.run()
  -> activeSub = e
  -> fn()
```

执行 `fn()` 时读取 `state.count`。

### 第三步：get 收集依赖

```text
state.count
  -> mutableHandlers.get
  -> Reflect.get(target, "count", receiver)
  -> track(target, GET, "count")
  -> targetMap[target]["count"] = Dep
  -> Dep 和 ReactiveEffect 通过 Link 连接
```

### 第四步：set 触发更新

```text
state.count++
  -> 先 get，拿到旧值
  -> set 新值
  -> hadKey = true
  -> hasChanged(newValue, oldValue) = true
  -> trigger(target, SET, "count", newValue, oldValue)
  -> 找到 count 的 Dep
  -> 通知订阅它的 ReactiveEffect
  -> effect 重新执行
```

## Vue2 与 Vue3 响应式对比

| 对比项 | Vue2：`Object.defineProperty` | Vue3：`Proxy` |
| --- | --- | --- |
| 代理方式 | 对每个属性定义 getter/setter | 对整个对象创建代理 |
| 初始化成本 | 需要递归遍历对象属性 | 不需要立即深度遍历，嵌套对象读取时懒代理 |
| 新增属性 | 无法天然拦截，需要 `Vue.set` | 可以通过 `set` trap 拦截新增 key |
| 删除属性 | 无法天然拦截，需要 `Vue.delete` | 可以通过 `deleteProperty` trap 拦截 |
| 数组索引 | 直接设置索引难以拦截 | 可以拦截索引读写 |
| 数组 length | 处理受限，需要改写数组方法 | 可结合 Proxy trap 和数组方法 instrumentations 处理 |
| Map/Set | 不适合完整支持 | 可以通过 collection handlers 支持 |
| 属性枚举 | 需要额外处理，能力有限 | 可通过 `ownKeys`、`has` 追踪 |
| 对象身份 | 原对象被转换属性，响应式能力贴在属性上 | 原对象保持不变，响应式对象是 proxy |
| 浏览器兼容 | 可支持 IE | Proxy 不支持 IE11 |

### Vue3 为什么用 Proxy 替代 Object.defineProperty？

核心原因是 Proxy 能拦截“对象层面”的操作，而 `Object.defineProperty` 只能拦截“已存在属性”的 get/set。

Vue3 因此获得了这些能力：

1. **天然监听新增属性**
   - `state.newKey = 1` 可以触发 `ADD`。

2. **天然监听删除属性**
   - `delete state.foo` 可以触发 `DELETE`。

3. **更好支持数组**
   - 数组索引、length、迭代、身份敏感方法都能统一纳入响应式系统。

4. **支持 Map/Set**
   - Vue3 可以对 `map.get`、`map.set`、`set.add`、迭代等建立依赖。

5. **懒代理，减少初始化成本**
   - 深层对象只有被读取时才继续 `reactive(res)`。

6. **语义更完整**
   - `in`、`Object.keys`、`for...in`、`hasOwnProperty` 都可以通过 `has/ownKeys` 等 trap 接入。

代价也很明确：

- 不支持 IE11。
- Proxy 与原始对象不是同一个引用。
- raw/proxy 混用时需要 `toRaw`、`markRaw` 等逃生机制。

## 最小源码阅读顺序

如果只想理解 `reactive`，按这个顺序读就够：

1. `vue3/packages/reactivity/src/reactive.ts`
   - `reactive`
   - `createReactiveObject`
   - `reactiveMap`
   - `ReactiveFlags`

2. `vue3/packages/reactivity/src/baseHandlers.ts`
   - `mutableHandlers`
   - `BaseReactiveHandler.get`
   - `MutableReactiveHandler.set`
   - `deleteProperty`
   - `has`
   - `ownKeys`

3. `vue3/packages/reactivity/src/dep.ts`
   - `targetMap`
   - `Dep`
   - `Link`
   - `track`
   - `trigger`

4. `vue3/packages/reactivity/src/effect.ts`
   - `ReactiveEffect`
   - `effect`
   - `activeSub`
   - `batch`
   - `startBatch`
   - `endBatch`

5. 扩展阅读：
   - `arrayInstrumentations.ts`
   - `collectionHandlers.ts`
   - `computed.ts`
   - `watch.ts`

## 自测问题

学完这条链路后，应该能回答：

1. `reactive()` 为什么返回的是 Proxy，而不是修改原对象？
2. 同一个原始对象多次 `reactive()` 为什么返回同一个代理？
3. `get` 中为什么要用 `Reflect.get`？
4. 为什么 nested object 是读取时才变成 reactive？
5. `state.foo = 1` 如何判断是新增属性还是修改属性？
6. `track` 为什么必须依赖 `activeSub`？
7. `targetMap` 为什么第一层是 WeakMap？
8. `Dep` 和 `ReactiveEffect` 为什么需要 `Link` 连接？
9. 新增属性为什么要触发迭代依赖？
10. Vue3 的 Proxy 响应式相比 Vue2 解决了哪些根本限制？
