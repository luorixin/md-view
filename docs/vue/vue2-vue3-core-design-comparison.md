# Vue2 与 Vue3 核心实现差异源码设计对比

本文从源码设计角度对比 Vue2 与 Vue3 的核心实现差异，重点覆盖响应式系统、依赖收集、组件更新、diff 算法、编译优化、API 设计、TypeScript 支持与架构拆分。

> 说明：当前仓库只包含 Vue3 源码，因此 Vue3 部分以当前 `vue3/packages/*` 为准；Vue2 部分按 Vue2.x 经典源码结构对照，例如 `src/core/observer/*`、`src/core/vdom/patch.js`、`src/compiler/*`。

## 一、总览对比表

| 维度 | Vue2 | Vue3 |
| --- | --- | --- |
| 响应式实现 | `Object.defineProperty` 劫持对象已有属性。 | `Proxy` 代理整个对象，配合 `Reflect` 完成 get / set / has / delete / ownKeys 等拦截。 |
| 依赖收集 | `Dep` + `Watcher`。每个响应式属性一个 `Dep`，全局 `Dep.target` 指向当前 watcher。 | `ReactiveEffect` + `Dep` + `targetMap`。`targetMap: WeakMap<object, Map<key, Dep>>` 描述 target / key / effect 关系。 |
| 组件更新 | 每个组件一个 render watcher，数据变化后 watcher 入队，执行 `vm._update(vm._render())`。 | 每个组件一个 component render effect，数据变化后 `effect.scheduler -> queueJob(instance.job)`。 |
| diff 算法 | 双端 diff，使用 oldStart / oldEnd / newStart / newEnd 四指针。 | `patchKeyedChildren` 五段式处理，中间乱序区使用最长递增子序列减少移动。 |
| 编译优化 | 标记静态节点和静态根，生成 `staticRenderFns`，运行时跳过部分静态树。 | `patchFlag`、`block tree`、`dynamicChildren`，让运行时只关注动态节点。 |
| API 风格 | 以 Options API 为中心，逻辑按 `data`、`methods`、`computed`、`watch` 等选项分散。 | Options API 继续支持，同时新增 Composition API，用函数组织逻辑。 |
| TypeScript | 源码主要不是 TypeScript，类型依赖外部声明和复杂推导，Options API 对 `this` 推导天然受限。 | 源码使用 TypeScript，`defineComponent`、`setup`、`defineProps`、`defineEmits` 等围绕类型推导设计。 |
| 架构组织 | 相对集中，核心逻辑主要在 `src/core`、`src/compiler`、`src/platforms`。 | monorepo 多包拆分：`reactivity`、`runtime-core`、`runtime-dom`、`compiler-core`、`compiler-dom`、`compiler-sfc`、`shared` 等。 |
| 平台抽象 | web 平台和 core 有分层，但整体耦合更集中。 | `runtime-core` 完全不直接依赖 DOM，通过 renderer options 注入平台操作。 |
| 可独立复用性 | 响应式能力主要服务 Vue 实例。 | `@vue/reactivity` 可独立使用，runtime / compiler 也更模块化。 |

## 二、源码位置对照

| 主题 | Vue2 典型源码位置 | Vue3 当前仓库源码位置 |
| --- | --- | --- |
| 响应式入口 | `src/core/observer/index.js` | `packages/reactivity/src/reactive.ts` |
| getter / setter | `defineReactive` | `packages/reactivity/src/baseHandlers.ts` |
| 依赖容器 | `src/core/observer/dep.js` | `packages/reactivity/src/dep.ts` |
| 副作用 / watcher | `src/core/observer/watcher.js` | `packages/reactivity/src/effect.ts` |
| 组件更新调度 | `src/core/observer/scheduler.js` | `packages/runtime-core/src/scheduler.ts` |
| 组件 render 更新 | `src/core/instance/lifecycle.js` | `packages/runtime-core/src/renderer.ts` |
| vnode / patch | `src/core/vdom/*` | `packages/runtime-core/src/vnode.ts`、`packages/runtime-core/src/renderer.ts` |
| diff | `src/core/vdom/patch.js` | `packages/runtime-core/src/renderer.ts` 的 `patchKeyedChildren` |
| 编译优化 | `src/compiler/optimizer.js`、`src/compiler/codegen/*` | `packages/compiler-core/src/transforms/transformElement.ts`、`packages/runtime-core/src/vnode.ts` |
| SFC 编译 | `vue-template-compiler` | `packages/compiler-sfc/src/*` |

## 三、响应式系统：Object.defineProperty vs Proxy

### Vue2：Object.defineProperty

Vue2 的响应式核心是把对象属性转换成 getter / setter。典型简化代码如下：

```js
function defineReactive(obj, key, val) {
  const dep = new Dep()

  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get() {
      if (Dep.target) {
        dep.depend()
      }
      return val
    },
    set(newVal) {
      if (newVal === val) return
      val = newVal
      dep.notify()
    }
  })
}
```

这个设计的特点：

| 点 | 说明 |
| --- | --- |
| 劫持粒度 | 属性级别。每个 key 都要被 `defineReactive` 处理。 |
| 初始化成本 | 初始化时需要递归遍历对象已有属性。 |
| 新增属性 | 无法自动感知，需要 `Vue.set(obj, key, value)`。 |
| 删除属性 | 无法自动感知，需要 `Vue.delete(obj, key)`。 |
| 数组处理 | 不能直接拦截索引和 length，因此通过重写数组变更方法处理。 |
| 深层对象 | 需要递归 observe。 |

### Vue3：Proxy

Vue3 的响应式入口在 `packages/reactivity/src/reactive.ts`，核心函数是 `createReactiveObject`：

```ts
const proxy = new Proxy(
  target,
  targetType === TargetType.COLLECTION ? collectionHandlers : baseHandlers,
)
proxyMap.set(target, proxy)
return proxy
```

简化理解：

```ts
function reactive(target) {
  return new Proxy(target, {
    get(target, key, receiver) {
      track(target, TrackOpTypes.GET, key)
      return Reflect.get(target, key, receiver)
    },
    set(target, key, value, receiver) {
      const oldValue = target[key]
      const result = Reflect.set(target, key, value, receiver)
      if (oldValue !== value) {
        trigger(target, TriggerOpTypes.SET, key, value, oldValue)
      }
      return result
    }
  })
}
```

Vue3 这个设计的特点：

| 点 | 说明 |
| --- | --- |
| 劫持粒度 | 对象级代理，但依赖仍按 target + key 收集。 |
| 初始化成本 | 不需要一开始递归转换所有属性，访问深层对象时再懒代理。 |
| 新增属性 | `set` trap 可以识别 `ADD`。 |
| 删除属性 | `deleteProperty` trap 可以识别 `DELETE`。 |
| 数组处理 | 可以拦截索引、length、迭代等行为，仍有专门 array instrumentation 优化边界场景。 |
| 集合类型 | `Map`、`Set`、`WeakMap`、`WeakSet` 有专门 `collectionHandlers`。 |

### 设计差异小结

Vue2 是“把对象属性改造成响应式属性”，Vue3 是“用代理对象统一拦截对象操作”。

```text
Vue2:
  observe(obj)
    -> 遍历 key
    -> defineReactive(obj, key)
    -> get / set 收集和触发

Vue3:
  reactive(obj)
    -> new Proxy(obj, handlers)
    -> get / set / has / delete / ownKeys 统一拦截
    -> track / trigger
```

Vue3 的改进点：

1. 能天然处理新增属性和删除属性。
2. 对数组和集合类型支持更完整。
3. 响应式模块可以独立于组件系统使用。
4. `readonly`、`shallowReactive`、`shallowReadonly` 等能力能通过不同 handlers 组合出来。

## 四、依赖收集：Dep / Watcher vs ReactiveEffect / targetMap

### Vue2：Dep / Watcher

Vue2 中：

- `Dep` 表示一个响应式属性的依赖容器。
- `Watcher` 表示一个订阅者。
- `Dep.target` 是当前正在收集依赖的 watcher。

典型流程：

```text
组件 render
  -> pushTarget(renderWatcher)
  -> 执行 render
     -> 读取 this.count
        -> getter
        -> dep.depend()
        -> renderWatcher.addDep(dep)
  -> popTarget()

this.count = 1
  -> setter
  -> dep.notify()
  -> watcher.update()
```

可以理解为：

```text
property dep
  -> render watcher
  -> user watcher
  -> computed watcher
```

### Vue3：ReactiveEffect / targetMap

Vue3 当前源码中，依赖关系核心在 `packages/reactivity/src/dep.ts`：

```ts
export const targetMap: WeakMap<object, KeyToDepMap> = new WeakMap()
type KeyToDepMap = Map<any, Dep>
```

数据结构：

```text
targetMap: WeakMap
  target object
    -> depsMap: Map
       key
         -> dep
            -> subscribers: ReactiveEffect / Computed
```

Vue3 的 `track`：

```ts
export function track(target: object, type: TrackOpTypes, key: unknown): void {
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
    dep.track(...)
  }
}
```

Vue3 的 `trigger`：

```ts
export function trigger(target, type, key, newValue, oldValue) {
  const depsMap = targetMap.get(target)
  if (!depsMap) {
    globalVersion++
    return
  }

  const run = (dep) => {
    if (dep) dep.trigger(...)
  }

  startBatch()
  run(depsMap.get(key))
  endBatch()
}
```

### 设计差异小结

| 维度 | Vue2 | Vue3 |
| --- | --- | --- |
| 当前订阅者 | `Dep.target` | `activeSub` / `ReactiveEffect` |
| 依赖容器 | 每个属性闭包里一个 `Dep` | `targetMap -> depsMap -> Dep` |
| 订阅者类型 | `Watcher` | `ReactiveEffect`、computed subscriber |
| 依赖关系表达 | `Dep` 与 `Watcher` 互相记录 | `Dep` 与 subscriber 通过 `Link` 维护双向链表 |
| 批处理 | watcher queue | reactivity batch + runtime scheduler |

Vue2 的依赖模型更贴近“组件 watcher 驱动更新”。Vue3 的模型更通用，“effect” 不必知道组件，可以服务 render、computed、watch、独立响应式副作用。

## 五、组件更新：watcher 更新 vs component render effect 更新

### Vue2：render watcher

Vue2 每个组件通常有一个 render watcher。简化流程：

```js
const updateComponent = () => {
  vm._update(vm._render(), hydrating)
}

new Watcher(vm, updateComponent, noop, {
  before() {
    if (vm._isMounted) {
      callHook(vm, 'beforeUpdate')
    }
  }
}, true)
```

数据变化后：

```text
setter
  -> dep.notify()
  -> watcher.update()
  -> queueWatcher(watcher)
  -> flushSchedulerQueue()
  -> watcher.run()
  -> updateComponent()
  -> vm._render()
  -> vm._update(vnode)
```

### Vue3：component render effect

Vue3 在 `packages/runtime-core/src/renderer.ts` 的 `setupRenderEffect` 中创建组件渲染 effect：

```ts
const effect = (instance.effect = new ReactiveEffect(componentUpdateFn))
const update = (instance.update = effect.run.bind(effect))
const job: SchedulerJob = (instance.job = effect.runIfDirty.bind(effect))
job.i = instance
job.id = instance.uid
effect.scheduler = () => queueJob(job)

update()
```

组件更新时进入 `componentUpdateFn` 的更新分支：

```text
componentUpdateFn
  -> renderComponentRoot(instance)
  -> prevTree = instance.subTree
  -> instance.subTree = nextTree
  -> patch(prevTree, nextTree, ...)
```

### 设计差异小结

| 维度 | Vue2 | Vue3 |
| --- | --- | --- |
| 组件更新载体 | render watcher | component render effect |
| 更新函数 | `updateComponent` | `componentUpdateFn` |
| 调度对象 | watcher | scheduler job，即 `instance.job` |
| 依赖收集时机 | render watcher 执行 render 时 | render effect 执行 `componentUpdateFn` 时 |
| 更新入口 | `watcher.run()` | `effect.runIfDirty()` |
| 运行时状态 | `vm` 实例为中心 | `ComponentInternalInstance` 为中心 |

Vue3 把“副作用”和“组件”解耦得更彻底。组件渲染只是 `ReactiveEffect` 的一个使用场景。

## 六、diff 算法：双端 diff vs patchKeyedChildren + LIS

### Vue2：双端 diff

Vue2 的 children diff 核心是双端比较：

```text
oldStartIdx / oldEndIdx
newStartIdx / newEndIdx

1. oldStart vs newStart
2. oldEnd   vs newEnd
3. oldStart vs newEnd
4. oldEnd   vs newStart
5. 否则根据 key map 查找
```

简化伪代码：

```js
while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
  if (sameVnode(oldStartVnode, newStartVnode)) {
    patchVnode(oldStartVnode, newStartVnode)
    oldStartIdx++
    newStartIdx++
  } else if (sameVnode(oldEndVnode, newEndVnode)) {
    patchVnode(oldEndVnode, newEndVnode)
    oldEndIdx--
    newEndIdx--
  } else if (sameVnode(oldStartVnode, newEndVnode)) {
    patchVnode(oldStartVnode, newEndVnode)
    move oldStart to after oldEnd
    oldStartIdx++
    newEndIdx--
  } else if (sameVnode(oldEndVnode, newStartVnode)) {
    patchVnode(oldEndVnode, newStartVnode)
    move oldEnd to before oldStart
    oldEndIdx--
    newStartIdx++
  } else {
    find by key
  }
}
```

这个算法对头尾移动很友好，但在更一般的乱序场景中，移动次数不一定最少。

### Vue3：patchKeyedChildren 五段式

Vue3 的 `patchKeyedChildren` 位于 `packages/runtime-core/src/renderer.ts`，核心分为五个阶段：

| 阶段 | 作用 |
| --- | --- |
| 1. sync from start | 从左到右同步比较相同前缀。 |
| 2. sync from end | 从右到左同步比较相同后缀。 |
| 3. common sequence + mount | 旧节点先耗尽，新节点剩余部分直接挂载。 |
| 4. common sequence + unmount | 新节点先耗尽，旧节点剩余部分直接卸载。 |
| 5. unknown sequence | 处理中间乱序区，建立 key map，patch 可复用节点，卸载旧节点，最后移动或挂载。 |

中间乱序区关键数据结构：

```text
keyToNewIndexMap:
  new child key -> new index

newIndexToOldIndexMap:
  new index relative position -> old index + 1
  0 表示新节点没有对应旧节点，需要 mount
```

Vue3 会在需要移动时计算最长递增子序列：

```ts
const increasingNewIndexSequence = moved
  ? getSequence(newIndexToOldIndexMap)
  : EMPTY_ARR
```

含义：最长递增子序列对应“可以保持原地不动的一组节点”。不在 LIS 中的旧节点才需要移动。

### 示例：为什么 LIS 能减少移动

旧节点：

```text
[a, b, c, d, e]
```

新节点：

```text
[a, c, b, d, e]
```

去掉相同前后缀后，中间大致是：

```text
旧: [b, c]
新: [c, b]
```

Vue3 会建立新位置到旧位置的映射：

```text
newIndexToOldIndexMap = [3, 2]
```

它不是递增序列，说明发生移动。最长递增子序列只保留能稳定不动的部分，其他节点移动。对更大的乱序列表，LIS 能显著减少 DOM move 次数。

### 设计差异小结

| 维度 | Vue2 双端 diff | Vue3 patchKeyedChildren |
| --- | --- | --- |
| 主要策略 | 四指针头尾比较 + key 查找 | 前缀同步 + 后缀同步 + 挂载/卸载快路径 + 中间乱序区 |
| 移动优化 | 对头尾移动场景友好 | 用 LIS 尽量减少移动 |
| 编译器协作 | 较弱 | 与 `patchFlag`、fragment flag、block tree 强协作 |
| 运行时信息 | 主要靠 vnode key / sameVnode | vnode key、patchFlag、dynamicChildren、shapeFlag |

## 七、编译优化：静态节点标记 vs patchFlag / block tree

### Vue2：静态节点标记

Vue2 编译器会做静态分析：

```text
template
  -> AST
  -> optimize
     -> markStatic
     -> markStaticRoots
  -> codegen
     -> render
     -> staticRenderFns
```

Vue2 的核心思路是：

- 静态节点不依赖响应式数据。
- 静态根可以被缓存。
- 更新时跳过静态子树。

简化示例：

```vue
<template>
  <div>
    <p>static</p>
    <span>{{ count }}</span>
  </div>
</template>
```

Vue2 会识别 `<p>static</p>` 是静态节点，并尽量避免重复创建和 patch。

### Vue3：patchFlag

Vue3 编译器在 `packages/compiler-core/src/transforms/transformElement.ts` 中分析动态点：

```ts
if (hasDynamicKeys) {
  patchFlag |= PatchFlags.FULL_PROPS
} else {
  if (hasClassBinding && !isComponent) {
    patchFlag |= PatchFlags.CLASS
  }
  if (hasStyleBinding && !isComponent) {
    patchFlag |= PatchFlags.STYLE
  }
  if (dynamicPropNames.length) {
    patchFlag |= PatchFlags.PROPS
  }
}
```

动态文本也会被标记：

```ts
if (hasDynamicTextChild) {
  patchFlag |= PatchFlags.TEXT
}
```

运行时 `patchElement` 根据 `patchFlag` 走快路径：

```ts
if (patchFlag & PatchFlags.CLASS) {
  hostPatchProp(el, 'class', null, newProps.class, namespace)
}

if (patchFlag & PatchFlags.TEXT) {
  if (n1.children !== n2.children) {
    hostSetElementText(el, n2.children as string)
  }
}
```

这意味着 Vue3 不只是知道“哪里是静态的”，更知道“哪里是动态的、动态类型是什么”。

### Vue3：block tree / dynamicChildren

Vue3 的 block tree 设计位于 `packages/runtime-core/src/vnode.ts`。源码注释给出核心目标：

```text
在一个稳定结构的 block 内，跳过大部分 children diff，只关心动态节点。
```

`openBlock` / `createBlock` 的简化模型：

```ts
openBlock()
createBlock('div', null, children)
```

运行时会把当前 block 里的动态节点收集到：

```ts
vnode.dynamicChildren
```

更新时 `patchElement` 看到 `dynamicChildren` 可以走：

```text
patchBlockChildren(oldDynamicChildren, newDynamicChildren)
```

而不是对整个 children 做完整 diff。

### 编译优化差异小结

| 维度 | Vue2 | Vue3 |
| --- | --- | --- |
| 主要优化信息 | 静态节点、静态根 | 动态类型、动态 props、动态 children |
| 生成物 | `staticRenderFns` | `patchFlag`、`dynamicProps`、block vnode |
| 运行时收益 | 跳过静态树 | 精确更新动态点，减少无效 diff |
| 编译器与 runtime 协作 | 有，但粒度较粗 | 非常紧密，运行时大量依赖编译提示 |

## 八、API 设计：Options API vs Composition API

### Vue2：Options API

Vue2 的典型组件：

```js
export default {
  data() {
    return {
      count: 0
    }
  },
  computed: {
    double() {
      return this.count * 2
    }
  },
  methods: {
    increment() {
      this.count++
    }
  },
  mounted() {
    console.log(this.count)
  }
}
```

Options API 的优点是上手简单，配置项语义清晰。但在大型组件中，同一功能逻辑会散落在多个选项里：

```text
一个计数逻辑可能分散在:
  data
  computed
  watch
  methods
  lifecycle hooks
```

### Vue3：Composition API

Vue3 支持：

```ts
import { computed, onMounted, ref } from 'vue'

export default {
  setup() {
    const count = ref(0)
    const double = computed(() => count.value * 2)

    function increment() {
      count.value++
    }

    onMounted(() => {
      console.log(count.value)
    })

    return {
      count,
      double,
      increment
    }
  }
}
```

`<script setup>` 进一步把组合式 API 编译成更简洁的组件声明：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'

const count = ref(0)
const double = computed(() => count.value * 2)

function increment() {
  count.value++
}
</script>
```

### API 设计差异小结

| 维度 | Options API | Composition API |
| --- | --- | --- |
| 组织单位 | 选项类型 | 逻辑功能 |
| 复用方式 | mixin、extends、scoped slot、renderless component | composable 函数 |
| 类型推导 | 依赖 `this`，复杂场景困难 | 基于普通变量和函数，更接近 TypeScript 自然模型 |
| 逻辑拆分 | 容易按选项分散 | 容易按业务逻辑聚合 |
| 学习成本 | 低 | 初期更高，但大型逻辑更清晰 |

Vue3 没有废弃 Options API，而是让两种风格共存。Options API 适合简单组件和传统写法，Composition API 适合复杂逻辑复用、TypeScript 和大型项目。

## 九、TypeScript 支持差异

### Vue2 的限制

Vue2 的类型困难主要来自三点：

1. 源码本身不是以 TypeScript 为核心设计。
2. Options API 依赖 `this`，而 `this` 的类型来自多个选项合并。
3. mixin、extends、插件注入会让类型来源变得更隐式。

例如：

```js
export default {
  data() {
    return { count: 0 }
  },
  methods: {
    increment() {
      this.count++
    }
  }
}
```

这里的 `this.count` 需要类型系统理解 `data` 返回值与 `methods` 中 `this` 的关系，这对复杂组件并不自然。

### Vue3 的 TypeScript 友好设计

Vue3 源码本身使用 TypeScript，并提供大量类型辅助：

| 能力 | Vue3 源码位置 |
| --- | --- |
| `defineComponent` 类型推导 | `packages/runtime-core/src/apiDefineComponent.ts` |
| `defineProps` / `defineEmits` | `packages/runtime-core/src/apiSetupHelpers.ts` |
| `<script setup>` 编译 | `packages/compiler-sfc/src/compileScript.ts` |
| props 类型解析 | `packages/compiler-sfc/src/script/defineProps.ts`、`resolveType.ts` |

TypeScript 友好写法：

```vue
<script setup lang="ts">
const props = defineProps<{
  title: string
  count?: number
}>()

const emit = defineEmits<{
  change: [value: number]
}>()

emit('change', 1)
</script>
```

这种写法的优势：

- props 类型直接来自泛型。
- emit 事件名和参数可推导。
- 模板可获得更好的类型提示。
- composable 函数就是普通 TypeScript 函数。

## 十、架构拆分：集中式 core vs monorepo 多包

### Vue2：相对集中

Vue2 的源码结构大致是：

```text
src/
  core/
    observer/
    instance/
    vdom/
    components/
  compiler/
  platforms/
    web/
    weex/
  shared/
```

它已经有 core / compiler / platform 的分层，但整体仍更偏“框架核心集中式组织”。

### Vue3：多包拆分

当前仓库 `packages` 下核心包：

```text
packages/
  reactivity/
  runtime-core/
  runtime-dom/
  compiler-core/
  compiler-dom/
  compiler-sfc/
  compiler-ssr/
  server-renderer/
  shared/
  vue/
  vue-compat/
```

核心职责：

| 包 | 职责 |
| --- | --- |
| `reactivity` | 响应式系统，独立于组件运行时。 |
| `runtime-core` | 平台无关运行时，组件、vnode、renderer、scheduler、生命周期。 |
| `runtime-dom` | 浏览器 DOM 平台适配，提供 DOM nodeOps / patchProp。 |
| `compiler-core` | 平台无关编译核心，parse / transform / codegen。 |
| `compiler-dom` | DOM 模板编译扩展，例如 v-model、v-on、HTML 解析选项。 |
| `compiler-sfc` | `.vue` 单文件组件解析与编译。 |
| `shared` | 跨包共享工具、常量和类型。 |
| `vue` | 面向用户的完整入口，组合 runtime-dom 和 compiler。 |
| `vue-compat` | Vue2 兼容构建。 |

### 分层带来的设计收益

1. `reactivity` 可以独立使用。
2. `runtime-core` 不依赖 DOM，可以支持自定义 renderer。
3. `runtime-dom` 只负责浏览器平台差异。
4. `compiler-core` 与 `compiler-dom` 分离，便于支持不同平台编译。
5. `compiler-sfc` 单独处理 `.vue` 文件，使 SFC 编译链路更清晰。
6. monorepo 让内部包之间边界更明确，也更利于测试和发布。

## 十一、关键源码设计差异总结

### 1. 响应式抽象升级

Vue2：

```text
Observer / defineReactive / Dep / Watcher
```

Vue3：

```text
Proxy handlers / track / trigger / Dep / ReactiveEffect
```

本质变化：从“对象属性响应式化”升级为“通用 effect 系统”。

### 2. 组件更新模型升级

Vue2：

```text
组件 render watcher
  -> watcher.update
  -> queueWatcher
  -> watcher.run
```

Vue3：

```text
组件 render effect
  -> ReactiveEffect.trigger
  -> effect.scheduler
  -> queueJob(instance.job)
  -> effect.runIfDirty
```

本质变化：组件更新成为响应式 effect 的一个调度场景。

### 3. 编译器与运行时协作更深

Vue2：

```text
静态节点标记，让运行时跳过静态树。
```

Vue3：

```text
patchFlag 告诉运行时哪里动态。
block tree 告诉运行时一个稳定结构中哪些 children 动态。
dynamicChildren 让运行时跳过大量无关节点。
```

本质变化：从“静态优化”升级为“动态点精确定位”。

### 4. 平台抽象更彻底

Vue3 的 `runtime-core` 不直接创建 DOM，而是通过 renderer options：

```text
hostCreateElement
hostInsert
hostPatchProp
hostSetElementText
```

浏览器端由 `runtime-dom` 注入这些方法。这让自定义 renderer 更自然。

## 十二、Vue3 相比 Vue2 的主要改进点

| 改进点 | 说明 |
| --- | --- |
| 响应式能力更完整 | Proxy 支持新增、删除、数组索引、集合类型等更多操作。 |
| 依赖系统更通用 | `ReactiveEffect` 不绑定组件，可服务 computed、watch、render、自定义 effect。 |
| 更新调度更清晰 | reactivity batch 与 runtime scheduler 分层，组件 job 去重和排序明确。 |
| diff 移动更少 | `patchKeyedChildren` 在乱序区用 LIS 减少 DOM 移动。 |
| 编译优化更精准 | `patchFlag` 与 `dynamicChildren` 让运行时跳过无关节点。 |
| TypeScript 更友好 | 源码、API、SFC 宏都围绕 TS 推导设计。 |
| 逻辑复用更自然 | Composition API 以函数为复用单位，避免 mixin 命名冲突和来源不明。 |
| 包边界更清楚 | monorepo 多包拆分，让 reactivity / runtime / compiler 各自独立演进。 |
| 自定义渲染器更容易 | `runtime-core` 与平台操作解耦。 |

## 十三、哪些设计值得学习

### 1. 用数据结构表达问题

Vue3 的依赖关系不是散落在对象闭包里，而是明确表达为：

```text
WeakMap<object, Map<key, Dep>>
```

这类设计值得学习：先把关系建模清楚，再写流程。

### 2. 把副作用抽象成通用 primitive

`ReactiveEffect` 是 Vue3 响应式系统的关键抽象。组件 render、computed、watch 都可以建立在 effect 之上。

值得学习的是：不要让底层能力过早绑定到上层业务概念。

### 3. 编译时信息反哺运行时

Vue3 不是让运行时盲目 diff，而是在编译阶段标记动态信息：

```text
TEXT / CLASS / STYLE / PROPS / FULL_PROPS
```

这是一种非常重要的性能设计思路：编译期能确定的信息，不要留给运行时反复猜。

### 4. 运行时保留通用性，平台能力外部注入

`runtime-core` 通过 `hostInsert`、`hostCreateElement` 这种接口操作平台，使 DOM、测试 renderer、自定义 renderer 都能复用核心流程。

### 5. API 设计服务类型系统

`setup`、`defineProps`、`defineEmits`、composable 函数让用户代码更接近普通 TypeScript，而不是把类型都藏在 `this` 和选项合并里。

## 十四、示例代码对比

### 1. 新增属性

Vue2：

```js
export default {
  data() {
    return {
      user: {
        name: 'Ada'
      }
    }
  },
  mounted() {
    // 直接新增 age 在 Vue2 中不是响应式
    this.user.age = 18

    // 需要使用 Vue.set
    this.$set(this.user, 'age', 18)
  }
}
```

Vue3：

```ts
import { reactive } from 'vue'

const user = reactive({
  name: 'Ada'
})

// Proxy set trap 可以捕获新增属性
user.age = 18
```

### 2. 逻辑复用

Vue2 mixin：

```js
export const counterMixin = {
  data() {
    return {
      count: 0
    }
  },
  methods: {
    increment() {
      this.count++
    }
  }
}
```

问题是多个 mixin 可能有命名冲突，状态来源也不直观。

Vue3 composable：

```ts
import { computed, ref } from 'vue'

export function useCounter() {
  const count = ref(0)
  const double = computed(() => count.value * 2)

  function increment() {
    count.value++
  }

  return {
    count,
    double,
    increment
  }
}
```

使用方：

```vue
<script setup lang="ts">
import { useCounter } from './useCounter'

const { count, double, increment } = useCounter()
</script>
```

### 3. 组件更新模型

Vue2 简化模型：

```js
const updateComponent = () => {
  vm._update(vm._render())
}

new Watcher(vm, updateComponent, noop, {}, true)
```

Vue3 简化模型：

```ts
const componentUpdateFn = () => {
  const nextTree = renderComponentRoot(instance)
  const prevTree = instance.subTree
  instance.subTree = nextTree
  patch(prevTree, nextTree, container)
}

const effect = new ReactiveEffect(componentUpdateFn)
effect.scheduler = () => queueJob(instance.job)
```

### 4. 编译优化结果

模板：

```vue
<template>
  <div>
    <p>static</p>
    <span :class="cls">{{ count }}</span>
  </div>
</template>
```

Vue2 重点：

```text
标记 <p>static</p> 为静态节点或静态根。
更新时尽量跳过静态节点。
```

Vue3 重点：

```text
span 的 class 动态 -> PatchFlags.CLASS
span 的文本动态 -> PatchFlags.TEXT
block 收集动态节点 -> dynamicChildren
更新时直接 patch 动态 span，而不是完整遍历整棵树。
```

## 十五、学习建议

如果你已经在读当前 Vue3 源码，可以按下面顺序对比 Vue2：

1. 先读 Vue3 `packages/reactivity/src/reactive.ts`、`baseHandlers.ts`、`dep.ts`、`effect.ts`，再对照 Vue2 `observer/index.js`、`dep.js`、`watcher.js`。
2. 再读 Vue3 `runtime-core/src/renderer.ts` 的 `setupRenderEffect`，对照 Vue2 `mountComponent` 和 render watcher。
3. 接着读 Vue3 `patchKeyedChildren`，再对照 Vue2 `updateChildren` 双端 diff。
4. 然后读 Vue3 `compiler-core/src/transforms/transformElement.ts` 和 `runtime-core/src/vnode.ts` 的 block tree，对照 Vue2 `optimizer.js`。
5. 最后看 `compiler-sfc` 与 `<script setup>`，理解 Vue3 为什么能给 TypeScript 更好的开发体验。

## 十六、一句话总结

Vue2 的核心设计是：

```text
Object.defineProperty 响应式 + Dep/Watcher + render watcher + 双端 diff + 静态节点优化 + Options API
```

Vue3 的核心设计是：

```text
Proxy 响应式 + ReactiveEffect/targetMap + component render effect + patchKeyedChildren/LIS + patchFlag/block tree + Composition API + TypeScript-first monorepo
```

Vue3 不是简单重写 Vue2，而是把 Vue2 中“可用但耦合较强”的设计拆成了更通用、更可组合、更适合编译优化和 TypeScript 的基础模块。
