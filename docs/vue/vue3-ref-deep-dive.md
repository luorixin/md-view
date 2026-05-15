# Vue3 ref 源码实现深度分析

本文基于当前仓库 `vue3` 源码整理，重点分析 `ref` 如何把一个普通值包装成响应式引用，以及它和 `reactive`、模板自动解包之间的关系。

## 一、ref 源码位置

| 能力 | 源码位置 | 作用 |
| --- | --- | --- |
| `ref` / `shallowRef` 入口 | `vue3/packages/reactivity/src/ref.ts:59`、`vue3/packages/reactivity/src/ref.ts:91` | 创建普通 ref 或浅层 ref |
| `createRef` | `vue3/packages/reactivity/src/ref.ts:104` | 统一创建逻辑；如果传入值已经是 ref，直接返回 |
| `RefImpl` | `vue3/packages/reactivity/src/ref.ts:114` | 普通 ref 的核心实现 |
| `triggerRef` | `vue3/packages/reactivity/src/ref.ts:192` | 手动触发 ref 依赖，主要用于 `shallowRef` 深层修改后 |
| `unref` / `proxyRefs` | `vue3/packages/reactivity/src/ref.ts:232`、`vue3/packages/reactivity/src/ref.ts:280` | ref 解包工具，以及 setup 返回值的浅层自动解包 |
| `toRef` / `toRefs` | `vue3/packages/reactivity/src/ref.ts:363`、`vue3/packages/reactivity/src/ref.ts:486` | 把对象属性或普通值规范化成 ref |
| `Dep` 依赖容器 | `vue3/packages/reactivity/src/dep.ts:67` | ref 自己持有的依赖集合 |
| reactive 对象内 ref 解包 | `vue3/packages/reactivity/src/baseHandlers.ts:120` | 读取 reactive 对象属性时自动解包 ref |
| setup 返回值自动解包 | `vue3/packages/runtime-core/src/component.ts:929` | `setup()` 返回对象后通过 `proxyRefs` 包装 |
| 模板表达式编译期解包 | `vue3/packages/compiler-core/src/transforms/transformExpression.ts:127` | `<script setup>` 内联渲染时把 ref 标识符重写成 `.value` 或 `unref()` |

## 二、ref 的入口函数在哪里？

`ref` 的入口在 `packages/reactivity/src/ref.ts`：

```ts
export function ref(value?: unknown) {
  return createRef(value, false)
}

export function shallowRef(value?: unknown) {
  return createRef(value, true)
}

function createRef(rawValue: unknown, shallow: boolean) {
  if (isRef(rawValue)) {
    return rawValue
  }
  return new RefImpl(rawValue, shallow)
}
```

调用链很短：

```text
ref(value)
  -> createRef(value, false)
    -> isRef(value) ? value : new RefImpl(value, false)

shallowRef(value)
  -> createRef(value, true)
    -> isRef(value) ? value : new RefImpl(value, true)
```

这里有一个重要细节：如果传入的值本身已经是 ref，`createRef` 不会重复包装，而是直接返回原 ref。这保证了 `ref(ref(1))` 不会产生多层 `.value.value`。

## 三、RefImpl 是什么？

`RefImpl` 是普通 `ref` 和 `shallowRef` 的运行时实现。它不是 Proxy，而是一个带有 `value` getter/setter 的对象。

核心结构可以简化成：

```ts
class RefImpl<T = any> {
  _value: T
  private _rawValue: T

  dep: Dep = new Dep()

  public readonly [ReactiveFlags.IS_REF] = true
  public readonly [ReactiveFlags.IS_SHALLOW]: boolean = false

  constructor(value: T, isShallow: boolean) {
    this._rawValue = isShallow ? value : toRaw(value)
    this._value = isShallow ? value : toReactive(value)
    this[ReactiveFlags.IS_SHALLOW] = isShallow
  }

  get value() {
    this.dep.track()
    return this._value
  }

  set value(newValue) {
    const oldValue = this._rawValue
    const useDirectValue =
      this[ReactiveFlags.IS_SHALLOW] ||
      isShallow(newValue) ||
      isReadonly(newValue)

    newValue = useDirectValue ? newValue : toRaw(newValue)

    if (hasChanged(newValue, oldValue)) {
      this._rawValue = newValue
      this._value = useDirectValue ? newValue : toReactive(newValue)
      this.dep.trigger()
    }
  }
}
```

关键字段：

| 字段 | 含义 |
| --- | --- |
| `_value` | 对外读取到的值。普通 `ref` 包装对象时，这里会保存响应式代理 |
| `_rawValue` | 用于变化比较的原始值。避免代理对象和原始对象比较时误判 |
| `dep` | 当前 ref 自己的依赖集合，类型是 `Dep` |
| `[ReactiveFlags.IS_REF]` | 标记当前对象是 ref，供 `isRef` 判断 |
| `[ReactiveFlags.IS_SHALLOW]` | 标记是否是 `shallowRef` |

`RefImpl` 的定位可以概括为一句话：它是一个“带依赖收集能力的值容器”。

## 四、ref 为什么需要 .value？

`ref` 需要 `.value`，主要因为它要解决“任意值都能响应式”的问题，尤其是基本类型。

`reactive` 依赖 Proxy，只能代理对象：

```ts
reactive({ count: 0 })
```

但是基本类型无法被 Proxy：

```ts
const count = 0
```

如果直接返回 `0`，后续读取和赋值都没有可拦截的地方。`ref` 因此创建一个对象容器：

```ts
const count = {
  get value() {},
  set value(v) {},
}
```

这样读取 `count.value` 时可以进入 getter 收集依赖，写入 `count.value = 1` 时可以进入 setter 触发依赖。

`.value` 的设计原因：

1. 基本类型不能被 Proxy，需要一个对象容器承载 getter/setter。
2. ref 需要稳定引用。把 ref 传给函数、数组、对象后，仍然可以通过同一个容器修改内部值。
3. 读写边界清晰。访问 `.value` 表示读取或修改“被包装的内部值”。
4. 对对象值也统一。`ref({ count: 1 })` 的 `.value` 会是响应式对象，而整个 ref 容器仍然负责替换级别的依赖触发。

为了降低模板和 `setup()` 返回值中的书写成本，Vue 又提供了自动解包能力，所以很多场景下用户不需要手写 `.value`。

## 五、get value 时如何收集依赖？

源码位置：`vue3/packages/reactivity/src/ref.ts:129`

```ts
get value() {
  if (__DEV__) {
    this.dep.track({
      target: this,
      type: TrackOpTypes.GET,
      key: 'value',
    })
  } else {
    this.dep.track()
  }
  return this._value
}
```

调用链：

```text
effect(() => {
  console.log(count.value)
})
  -> ReactiveEffect.run()
    -> 设置当前 activeSub / shouldTrack
    -> 执行用户函数
      -> 读取 count.value
        -> RefImpl.get value
          -> this.dep.track()
            -> 如果当前存在 activeSub，则建立 Dep <-> Effect 的 Link
        -> 返回 this._value
```

`ref` 的依赖收集不需要通过 `targetMap` 查找，因为每个 `RefImpl` 实例自己就持有一个 `dep`：

```text
RefImpl
  ├─ _value
  ├─ _rawValue
  └─ dep: Dep
       └─ subs: effect 链表
```

`Dep.track()` 位于 `packages/reactivity/src/dep.ts:108`。它会检查当前是否有正在运行的响应式副作用：

```ts
if (!activeSub || !shouldTrack || activeSub === this.computed) {
  return
}
```

如果允许追踪，就创建或复用 `Link`，把当前 ref 的 `Dep` 和当前 `ReactiveEffect` 双向关联起来。

## 六、set value 时如何触发更新？

源码位置：`vue3/packages/reactivity/src/ref.ts:142`

```ts
set value(newValue) {
  const oldValue = this._rawValue
  const useDirectValue =
    this[ReactiveFlags.IS_SHALLOW] ||
    isShallow(newValue) ||
    isReadonly(newValue)

  newValue = useDirectValue ? newValue : toRaw(newValue)

  if (hasChanged(newValue, oldValue)) {
    this._rawValue = newValue
    this._value = useDirectValue ? newValue : toReactive(newValue)
    this.dep.trigger()
  }
}
```

调用链：

```text
count.value = newValue
  -> RefImpl.set value
    -> oldValue = this._rawValue
    -> 根据 shallow / readonly 判断是否直接保存
    -> 普通 ref：newValue = toRaw(newValue)
    -> hasChanged(newValue, oldValue)
      -> false：不触发
      -> true：
        -> this._rawValue = newValue
        -> this._value = toReactive(newValue)
        -> this.dep.trigger()
          -> dep.version++ / globalVersion++
          -> dep.notify()
            -> startBatch()
            -> 通知 dep.subs 中的 effect / computed
            -> endBatch()
```

两个细节很重要：

1. `hasChanged` 保证相同值重复赋值不会触发 effect。
2. 普通 `ref` 保存对象时会调用 `toReactive`，所以 `ref({ count: 1 }).value.count` 也是响应式的。

## 七、RefImpl 与 Dep 的关系

`ref` 的依赖结构和 `reactive` 的依赖结构不完全一样。

`ref` 的依赖就在自身实例上：

```text
countRef: RefImpl
  ├─ _rawValue: 0
  ├─ _value: 0
  └─ dep: Dep
       ├─ subs -> Link(effectA)
       └─ subs -> Link(effectB)
```

而 `reactive` 的依赖通常保存在全局 `targetMap`：

```text
targetMap: WeakMap
  rawTarget
    -> depsMap: Map
      key: "count"
        -> dep: Dep
          -> subs: effects
```

所以：

- `ref.value` 的依赖收集：`RefImpl.dep.track()`
- `reactiveObj.count` 的依赖收集：`track(target, GET, "count") -> targetMap -> Dep`

这也是为什么 `triggerRef(ref)` 可以直接拿到 ref 上的 `dep` 并触发。

## 八、ref 和 reactive 有什么区别？

| 对比项 | `ref` | `reactive` |
| --- | --- | --- |
| 可包装类型 | 任意值，包括基本类型和对象 | 主要用于对象，基本类型无法代理 |
| 返回结果 | 带 `.value` 的 ref 对象 | Proxy 代理对象 |
| 读取方式 | JS 中通常读 `x.value` | 直接读属性 `state.count` |
| 写入方式 | `x.value = next` | `state.count = next` |
| 依赖存储 | `RefImpl` 自身持有 `dep` | 通过 `targetMap` 按 target + key 保存 dep |
| 对象值处理 | 普通 `ref` 会把对象值转成 `reactive` | 对对象本身创建 Proxy |
| 替换整体值 | 可以直接 `x.value = newObj` | Proxy 本身不能被替换，只能改属性；替换变量不会触发原代理依赖 |
| 解构表现 | 解构 ref 本身不会丢，因为 ref 是稳定容器 | 直接解构 reactive 属性容易丢失响应式连接，需要 `toRef` / `toRefs` |
| 浅层版本 | `shallowRef`：只追踪 `.value` 替换 | `shallowReactive`：只代理第一层属性 |
| 模板表现 | 顶层 ref 通常自动解包 | 直接访问属性；内部 ref 属性也可能被 reactive getter 解包 |

示例：

```ts
import { reactive, ref, effect } from 'vue'

const n = ref(0)

effect(() => {
  console.log(n.value)
})

n.value++

const state = reactive({ count: 0 })

effect(() => {
  console.log(state.count)
})

state.count++
```

## 九、shallowRef 是如何实现的？

`shallowRef` 和 `ref` 复用同一个 `RefImpl`，区别只在 `createRef(value, true)`：

```ts
export function shallowRef(value?: unknown) {
  return createRef(value, true)
}
```

构造函数里：

```ts
this._rawValue = isShallow ? value : toRaw(value)
this._value = isShallow ? value : toReactive(value)
this[ReactiveFlags.IS_SHALLOW] = isShallow
```

因此：

- `ref({ count: 1 })` 会把对象转成响应式对象。
- `shallowRef({ count: 1 })` 会原样保存对象，不递归转响应式。

示例：

```ts
import { effect, shallowRef } from 'vue'

const state = shallowRef({ count: 1 })

effect(() => {
  console.log(state.value.count)
})

state.value.count++ // 不触发 effect，因为只改了内部对象属性
state.value = { count: 3 } // 触发 effect，因为替换了 .value
```

`shallowRef` 常用于：

1. 外部状态管理库返回的对象。
2. 大型不可变数据结构。
3. DOM、Canvas、编辑器实例等不希望被深度代理的对象。

## 十、triggerRef 做了什么？

源码位置：`vue3/packages/reactivity/src/ref.ts:192`

```ts
export function triggerRef(ref: Ref): void {
  if ((ref as unknown as RefImpl).dep) {
    ;(ref as unknown as RefImpl).dep.trigger()
  }
}
```

`triggerRef` 的作用是：不改变 `.value`，但强制触发依赖当前 ref 的 effect。

典型使用场景是 `shallowRef` 内部对象被深层修改后：

```ts
import { shallowRef, triggerRef, watchEffect } from 'vue'

const state = shallowRef({ count: 1 })

watchEffect(() => {
  console.log(state.value.count)
})

state.value.count = 2
// 上面不会触发，因为 shallowRef 不追踪深层属性

triggerRef(state)
// 手动触发依赖 state.value 的副作用
```

注意：`triggerRef` 依赖 ref 对象上存在 `dep`。普通 `RefImpl` 自己有 `dep`；`toRef` 创建的 `ObjectRefImpl` 也提供了 `dep` getter，会从 reactive 对象属性对应的依赖中取出 dep。

## 十一、toRef 和 toRefs 的作用是什么？

### 1. toRef

源码位置：`vue3/packages/reactivity/src/ref.ts:486`

`toRef` 有两类常见用法。

第一类：规范化值、ref、getter。

```ts
toRef(existingRef) // 原样返回 existingRef
toRef(() => props.foo) // 返回只读 GetterRefImpl
toRef(1) // 等价于 ref(1)
```

第二类：把对象上的某个属性变成 ref。

```ts
const fooRef = toRef(state, 'foo')
```

这会创建 `ObjectRefImpl`。它不是复制一份值，而是建立一个指向源对象属性的 ref 视图：

```text
fooRef.value
  -> get
    -> state.foo

fooRef.value = 2
  -> set
    -> state.foo = 2
```

示例：

```ts
import { reactive, toRef } from 'vue'

const state = reactive({ count: 1 })
const count = toRef(state, 'count')

count.value++
console.log(state.count) // 2

state.count++
console.log(count.value) // 3
```

### 2. toRefs

源码位置：`vue3/packages/reactivity/src/ref.ts:363`

`toRefs` 会遍历对象，把每个属性都转换成 `toRef(object, key)`：

```ts
export function toRefs<T extends object>(object: T): ToRefs<T> {
  const ret: any = isArray(object) ? new Array(object.length) : {}
  for (const key in object) {
    ret[key] = propertyToRef(object, key)
  }
  return ret
}
```

它主要用于解决 reactive 对象解构后丢失响应式连接的问题：

```ts
import { reactive, toRefs } from 'vue'

const state = reactive({
  count: 1,
  name: 'Vue',
})

const { count, name } = toRefs(state)

count.value++
console.log(state.count) // 2
```

如果直接这样写：

```ts
const { count } = state
```

`count` 只是一个普通值，不再经过 `state.count` 的 getter，也就失去了和源对象属性的响应式连接。

## 十二、get value / set value 调用链总览

### get value

```text
用户读取 ref.value
  -> RefImpl.get value
    -> dep.track(debugInfo?)
      -> 检查 activeSub / shouldTrack
      -> 创建 Link(activeSub, dep)
      -> link 加入 activeSub.deps 链表
      -> link 加入 dep.subs 链表
    -> 返回 _value
```

### set value

```text
用户写入 ref.value = next
  -> RefImpl.set value
    -> 读取 oldValue = _rawValue
    -> 判断是否使用直接值
       shallowRef / shallow value / readonly value -> 直接保存
       普通值 -> toRaw(next)
    -> hasChanged(next, oldValue)
       false -> 结束
       true ->
         -> 更新 _rawValue
         -> 更新 _value
            普通对象 -> toReactive(next)
            shallow/readonly -> next
         -> dep.trigger(debugInfo?)
           -> dep.version++ / globalVersion++
           -> dep.notify()
             -> startBatch()
             -> 通知订阅者 effect / computed
             -> endBatch()
```

## 十三、ref 在模板中为什么可以自动解包？

模板自动解包不是 `RefImpl` 自己完成的，而是运行时代理和编译器共同提供的语法便利。

### 1. setup 返回对象：runtime 使用 proxyRefs

源码位置：`vue3/packages/runtime-core/src/component.ts:955`

```ts
instance.setupState = proxyRefs(setupResult)
```

`proxyRefs` 的 get trap 会对属性做 `unref`：

```ts
const shallowUnwrapHandlers: ProxyHandler<any> = {
  get: (target, key, receiver) =>
    key === ReactiveFlags.RAW
      ? target
      : unref(Reflect.get(target, key, receiver)),
  set: (target, key, value, receiver) => {
    const oldValue = target[key]
    if (isRef(oldValue) && !isRef(value)) {
      oldValue.value = value
      return true
    } else {
      return Reflect.set(target, key, value, receiver)
    }
  },
}
```

组件渲染时，公共实例代理会优先从 `setupState` 取值：

```text
模板访问 count
  -> render context proxy get
    -> setupState.count
      -> proxyRefs get
        -> unref(countRef)
          -> countRef.value
```

所以普通 `setup()` 返回：

```ts
setup() {
  const count = ref(0)
  return { count }
}
```

模板中可以写：

```vue
<template>
  <button>{{ count }}</button>
</template>
```

而不是：

```vue
<template>
  <button>{{ count.value }}</button>
</template>
```

### 2. `<script setup>`：compiler 根据 binding 类型生成 `.value` 或 `unref`

`compiler-sfc` 会在分析 `<script setup>` 时标记变量类型。对于：

```ts
const count = ref(0)
```

`compileScript.ts` 会把它标记为 `BindingTypes.SETUP_REF`。

随后 `compiler-core/src/transforms/transformExpression.ts` 在处理模板表达式时：

```ts
if (type === BindingTypes.SETUP_REF) {
  return `${raw}.value`
} else if (type === BindingTypes.SETUP_MAYBE_REF) {
  return isAssignmentLVal || isUpdateArg || isDestructureAssignment
    ? `${raw}.value`
    : wrapWithUnref(raw)
}
```

也就是说：

```vue
<script setup>
const count = ref(0)
</script>

<template>
  {{ count }}
</template>
```

在编译后的渲染函数中，`count` 会被改写为类似：

```ts
count.value
```

如果编译器不能确定一个变量一定是 ref，就会生成 `unref(x)`。

### 3. reactive 对象属性中的 ref：baseHandlers 自动解包

源码位置：`vue3/packages/reactivity/src/baseHandlers.ts:120`

```ts
if (isRef(res)) {
  const value = targetIsArray && isIntegerKey(key) ? res : res.value
  return isReadonly && isObject(value) ? readonly(value) : value
}
```

因此：

```ts
const count = ref(1)
const state = reactive({ count })

console.log(state.count) // 1，而不是 RefImpl
```

但是数组的整数下标是例外：

```ts
const list = reactive([ref(1)])

console.log(list[0])       // RefImpl
console.log(list[0].value) // 1
```

这是为了避免数组元素语义过度魔法化，也和 Vue 的测试用例保持一致。

## 十四、示例代码

### 1. 基础 ref 与 effect

```ts
import { effect, ref } from 'vue'

const count = ref(0)

effect(() => {
  console.log('count:', count.value)
})

count.value = 1
count.value = 1 // 值没有变化，不会重复触发
count.value = 2
```

执行过程：

```text
首次 effect.run
  -> 读取 count.value
  -> count.dep.track()

count.value = 1
  -> count.dep.trigger()
  -> effect 重新执行
```

### 2. ref 包装对象

```ts
import { effect, ref } from 'vue'

const user = ref({ name: 'Evan' })

effect(() => {
  console.log(user.value.name)
})

user.value.name = 'Vue'
```

普通 `ref` 会把对象值通过 `toReactive` 转成响应式对象，因此修改 `user.value.name` 也能触发更新。

### 3. shallowRef 与 triggerRef

```ts
import { shallowRef, triggerRef, watchEffect } from 'vue'

const state = shallowRef({ nested: { count: 1 } })

watchEffect(() => {
  console.log(state.value.nested.count)
})

state.value.nested.count++
// 不触发

triggerRef(state)
// 触发

state.value = { nested: { count: 10 } }
// 触发
```

### 4. toRef / toRefs 保持解构后的响应式连接

```ts
import { reactive, toRef, toRefs } from 'vue'

const state = reactive({
  count: 1,
  title: 'Vue3',
})

const count = toRef(state, 'count')
count.value++
console.log(state.count) // 2

const { title } = toRefs(state)
title.value = 'Vue 3 Source'
console.log(state.title) // Vue 3 Source
```

### 5. 模板自动解包

```vue
<script setup>
import { ref } from 'vue'

const count = ref(0)
</script>

<template>
  <button @click="count++">
    {{ count }}
  </button>
</template>
```

这里模板中写的是 `count++` 和 `{{ count }}`，编译器会根据 binding 类型把它们转换成对 `.value` 的访问或更新。

## 十五、核心结论

1. `ref` 的入口在 `packages/reactivity/src/ref.ts`，最终创建 `RefImpl`。
2. `RefImpl` 是一个带 `.value` getter/setter 的响应式值容器，不是 Proxy。
3. `ref` 需要 `.value`，因为基本类型无法被 Proxy，必须有一个可拦截读写的对象属性。
4. 读取 `.value` 时调用 `dep.track()`，把当前 effect 记录到 ref 自己的 `Dep` 中。
5. 写入 `.value` 时先比较新旧值，变化后更新 `_rawValue` 和 `_value`，再调用 `dep.trigger()`。
6. 普通 `ref` 包装对象时会调用 `toReactive`，所以对象内部属性也具备响应式能力。
7. `shallowRef` 只追踪 `.value` 替换，不深度代理内部对象。
8. `triggerRef` 是手动触发 ref 依赖的工具，常用于 `shallowRef` 深层修改后。
9. `toRef` / `toRefs` 的核心价值是把对象属性转换成与源属性保持同步的 ref，避免解构丢失响应式连接。
10. 模板自动解包由 `proxyRefs`、组件实例代理、编译器表达式重写和 reactive getter 解包共同完成。

