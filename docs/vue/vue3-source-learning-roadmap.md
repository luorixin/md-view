# Vue3 源码系统学习路线

> 基于当前本地源码：`vue3`  
> 版本参考：`vue3/package.json` 中的 `3.5.34`  
> 使用方式：按阶段推进。每个阶段先读入口文件，再读核心函数，最后用“学完后应该能回答的问题”自测。

## 总体路线

```text
仓库结构
  -> reactivity 总览
  -> effect 依赖收集与触发
  -> reactive/readonly/shallowReactive
  -> ref/computed/watch/watchEffect
  -> createApp
  -> 组件实例与 setup
  -> render 函数与 vnode
  -> patch 主流程
  -> 组件更新
  -> diff 算法
  -> scheduler
  -> template 编译
  -> compiler-core AST 转换
  -> SFC 编译
```

建议先跑通运行时主线，再进入编译器主线：

```text
reactive state
  -> track / trigger
  -> component render effect
  -> vnode
  -> patch
  -> DOM update

template
  -> parse
  -> transform
  -> codegen
  -> render function
```

---

## 第一阶段：Vue3 源码仓库结构

### 1. 学习目标

- 理解 Vue3 是 monorepo，而不是单包项目。
- 理解 `packages` 与 `packages-private` 的区别。
- 建立 runtime 主线和 compiler 主线的全局地图。
- 知道根目录构建、测试、类型检查、alias 配置从哪里开始。

### 2. 需要阅读的源码文件

- `vue3/package.json`
- `vue3/pnpm-workspace.yaml`
- `vue3/tsconfig.json`
- `vue3/tsconfig.build.json`
- `vue3/rollup.config.js`
- `vue3/rollup.dts.config.js`
- `vue3/vitest.config.ts`
- `vue3/eslint.config.js`
- `vue3/scripts/aliases.js`
- `vue3/scripts/dev.js`
- `vue3/scripts/build.js`
- `vue3/packages/*/package.json`
- `vue3/packages/*/src/index.ts`

### 3. 核心函数

- `scripts/aliases.js`
  - `resolveEntryForPkg`
- `scripts/build.js`
  - `run`
  - `buildAll`
  - `build`
  - `runParallel`
- `rollup.config.js`
  - `createConfig`
  - `resolveDefine`
  - `resolveExternal`
  - `resolveNodePlugins`

### 4. 需要理解的数据结构

- 根 `package.json` 的 `scripts`、`devDependencies`、`simple-git-hooks`。
- 每个包 `package.json` 中的：
  - `name`
  - `exports`
  - `dependencies`
  - `peerDependencies`
  - `buildOptions`
- `tsconfig.json` 中的 `paths`。
- `pnpm-workspace.yaml` 中的 workspace 范围和 catalog。
- Rollup 构建格式：
  - `esm-bundler`
  - `esm-browser`
  - `cjs`
  - `global`
  - `*-runtime`

### 5. 推荐阅读顺序

1. 先看 `pnpm-workspace.yaml`，确认包范围。
2. 再看根 `package.json`，理解常用脚本。
3. 看 `tsconfig.json` 的 `paths`，理解源码 alias。
4. 看 `scripts/aliases.js`，确认 `@vue/*` 如何映射。
5. 看各包 `package.json`，画出依赖关系。
6. 最后看 `rollup.config.js` 和 `scripts/build.js`，理解构建如何按包执行。

### 6. 学完后应该能回答的问题

- Vue3 为什么拆成 `shared`、`reactivity`、`runtime-core`、`runtime-dom`、`compiler-*` 多个包？
- `vue` 包和 `@vue/runtime-dom` 是什么关系？
- `@vue/runtime-core` 为什么不直接依赖 DOM？
- `@vue/compiler-core` 和 `@vue/compiler-dom` 的职责边界是什么？
- `packages-private` 里的 playground 和类型测试为什么不算核心发布包？
- 构建一个指定包时，`TARGET`、`FORMATS`、`buildOptions` 如何一起工作？

---

## 第二阶段：响应式系统 reactivity

### 1. 学习目标

- 建立响应式包的全局地图。
- 理解 `reactive`、`ref`、`computed`、`watch` 都建立在同一套依赖系统之上。
- 理解响应式系统本身不关心组件和 DOM。

### 2. 需要阅读的源码文件

- `vue3/packages/reactivity/src/index.ts`
- `vue3/packages/reactivity/src/constants.ts`
- `vue3/packages/reactivity/src/reactive.ts`
- `vue3/packages/reactivity/src/baseHandlers.ts`
- `vue3/packages/reactivity/src/collectionHandlers.ts`
- `vue3/packages/reactivity/src/dep.ts`
- `vue3/packages/reactivity/src/effect.ts`
- `vue3/packages/reactivity/src/ref.ts`
- `vue3/packages/reactivity/src/computed.ts`
- `vue3/packages/reactivity/src/watch.ts`
- `vue3/packages/reactivity/src/effectScope.ts`
- `vue3/packages/reactivity/__tests__/reactive.spec.ts`
- `vue3/packages/reactivity/__tests__/effect.spec.ts`

### 3. 核心函数

- `reactive`
- `readonly`
- `shallowReactive`
- `shallowReadonly`
- `createReactiveObject`
- `track`
- `trigger`
- `effect`
- `stop`
- `ref`
- `computed`
- `watch`
- `effectScope`

### 4. 需要理解的数据结构

- `ReactiveFlags`
- `TrackOpTypes`
- `TriggerOpTypes`
- `Target`
- `targetMap: WeakMap<object, KeyToDepMap>`
- `KeyToDepMap`
- `Dep`
- `Link`
- `ReactiveEffect`
- `Subscriber`
- `RefImpl`
- `ComputedRefImpl`
- `EffectScope`

### 5. 推荐阅读顺序

1. 从 `index.ts` 看 reactivity 对外导出了哪些 API。
2. 读 `constants.ts`，先认识响应式标志和 track/trigger 类型。
3. 读 `reactive.ts`，理解 Proxy 创建入口。
4. 读 `baseHandlers.ts`，理解普通对象的 get/set 如何接入 `track` / `trigger`。
5. 读 `dep.ts` 和 `effect.ts`，理解依赖图和 effect 执行。
6. 读 `ref.ts`、`computed.ts`、`watch.ts`，看上层 API 如何复用依赖系统。
7. 对照 `__tests__` 看行为边界。

### 6. 学完后应该能回答的问题

- `reactivity` 包为什么可以脱离 Vue 组件单独使用？
- 响应式对象、ref、computed、watch 的共同底层机制是什么？
- `track` 和 `trigger` 为什么不直接写在 `reactive.ts` 里？
- `WeakMap -> Map -> Dep` 这一层依赖结构分别解决什么问题？
- 为什么 Map/Set 需要单独的 `collectionHandlers.ts`？

---

## 第三阶段：effect 依赖收集与触发

### 1. 学习目标

- 理解 effect 是“响应式副作用”的执行单元。
- 理解依赖收集时如何从 target/key 找到 Dep。
- 理解触发更新时如何从 Dep 找到需要重新执行的 effect。
- 理解 Vue3 当前实现中的 `Dep`、`Link`、`Subscriber` 关系。

### 2. 需要阅读的源码文件

- `vue3/packages/reactivity/src/effect.ts`
- `vue3/packages/reactivity/src/dep.ts`
- `vue3/packages/reactivity/src/constants.ts`
- `vue3/packages/reactivity/src/baseHandlers.ts`
- `vue3/packages/reactivity/src/collectionHandlers.ts`
- `vue3/packages/reactivity/__tests__/effect.spec.ts`

### 3. 核心函数

- `effect`
- `ReactiveEffect.run`
- `ReactiveEffect.stop`
- `ReactiveEffect.trigger`
- `ReactiveEffect.notify`
- `track`
- `trigger`
- `Dep.track`
- `Dep.trigger`
- `Dep.notify`
- `batch`
- `startBatch`
- `endBatch`
- `prepareDeps`
- `cleanupDeps`
- `isDirty`

### 4. 需要理解的数据结构

- `ReactiveEffect`
- `Subscriber`
- `Dep`
- `Link`
- `targetMap`
- `activeSub`
- `shouldTrack`
- `globalVersion`
- `EffectFlags`
- `TrackOpTypes.GET`
- `TrackOpTypes.HAS`
- `TrackOpTypes.ITERATE`
- `TriggerOpTypes.SET`
- `TriggerOpTypes.ADD`
- `TriggerOpTypes.DELETE`
- `TriggerOpTypes.CLEAR`

### 5. 推荐阅读顺序

1. 先读 `effect.ts` 中的 `ReactiveEffect` 类。
2. 再读 `effect()` 如何创建 runner。
3. 读 `dep.ts` 的 `Dep` 和 `Link`，理解依赖连接方式。
4. 从 `baseHandlers.ts` 的 `get` 进入 `track`。
5. 从 `baseHandlers.ts` 的 `set/deleteProperty` 进入 `trigger`。
6. 读 `trigger` 对数组、Map、Set、迭代 key 的特殊处理。
7. 最后读 `batch/startBatch/endBatch`，理解触发不是简单立即递归执行。

### 6. 学完后应该能回答的问题

- 为什么 `effect(() => state.count)` 读取时能自动建立依赖？
- `activeSub` 的作用是什么？
- `targetMap` 为什么要用 WeakMap？
- `Dep` 和 `ReactiveEffect` 为什么通过 `Link` 连接？
- `SET`、`ADD`、`DELETE`、`CLEAR` 的触发范围有什么不同？
- 数组 length 改变为什么会影响索引依赖？
- 为什么 effect 需要 cleanup？

---

## 第四阶段：reactive / readonly / shallowReactive

### 1. 学习目标

- 理解 `reactive`、`readonly`、`shallowReactive`、`shallowReadonly` 的入口和分支。
- 理解普通对象和集合类型为什么使用不同 handler。
- 理解深层响应式与浅层响应式的区别。
- 理解 readonly 如何阻止写入但仍允许读取追踪相关标志。

### 2. 需要阅读的源码文件

- `vue3/packages/reactivity/src/reactive.ts`
- `vue3/packages/reactivity/src/baseHandlers.ts`
- `vue3/packages/reactivity/src/collectionHandlers.ts`
- `vue3/packages/reactivity/src/constants.ts`
- `vue3/packages/reactivity/src/arrayInstrumentations.ts`
- `vue3/packages/reactivity/__tests__/reactive.spec.ts`
- `vue3/packages/reactivity/__tests__/readonly.spec.ts`
- `vue3/packages/reactivity/__tests__/shallowReactive.spec.ts`
- `vue3/packages/reactivity/__tests__/shallowReadonly.spec.ts`
- `vue3/packages/reactivity/__tests__/reactiveArray.spec.ts`

### 3. 核心函数

- `reactive`
- `readonly`
- `shallowReactive`
- `shallowReadonly`
- `createReactiveObject`
- `getTargetType`
- `targetTypeMap`
- `isReactive`
- `isReadonly`
- `isShallow`
- `isProxy`
- `toRaw`
- `markRaw`
- `toReactive`
- `toReadonly`
- `BaseReactiveHandler.get`
- `MutableReactiveHandler.set`
- `MutableReactiveHandler.deleteProperty`
- `ReadonlyReactiveHandler.set`
- `createInstrumentations`
- `createInstrumentationGetter`

### 4. 需要理解的数据结构

- `ReactiveFlags`
- `Target`
- `TargetType`
- `reactiveMap`
- `shallowReactiveMap`
- `readonlyMap`
- `shallowReadonlyMap`
- `mutableHandlers`
- `readonlyHandlers`
- `shallowReactiveHandlers`
- `shallowReadonlyHandlers`
- `mutableCollectionHandlers`
- `readonlyCollectionHandlers`
- `arrayInstrumentations`

### 5. 推荐阅读顺序

1. 读 `reactive.ts` 四个 API 入口。
2. 读 `createReactiveObject`，理解缓存、raw、target type、handler 选择。
3. 读 `baseHandlers.ts` 的 `get`，看深层对象如何递归转 reactive/readonly。
4. 读 `baseHandlers.ts` 的 `set`、`deleteProperty`、`has`、`ownKeys`。
5. 读 `arrayInstrumentations.ts`，理解数组方法为什么要特殊处理。
6. 读 `collectionHandlers.ts`，理解 Map/Set 的读取、遍历、写入如何追踪。
7. 对照 readonly/shallow 的测试确认行为差异。

### 6. 学完后应该能回答的问题

- `reactive(obj)` 多次调用为什么返回同一个 Proxy？
- `readonly(reactiveObj)` 和 `reactive(readonlyObj)` 会发生什么？
- shallow 为什么只代理第一层？
- readonly 为什么 set 时不触发真实修改？
- `toRaw` 和 `markRaw` 分别解决什么问题？
- 数组 `includes/indexOf` 为什么要特殊处理？
- Map 的 key/value/iterate 依赖为什么比普通对象复杂？

---

## 第五阶段：ref / computed / watch / watchEffect

### 1. 学习目标

- 理解 `ref` 如何为基本类型提供响应式容器。
- 理解 `computed` 的缓存、dirty 标记和依赖触发。
- 理解 `watch` 的 source 归一化、cleanup、deep traverse。
- 理解 `watchEffect` 在 runtime-core 中如何包装底层 watch。

### 2. 需要阅读的源码文件

- `vue3/packages/reactivity/src/ref.ts`
- `vue3/packages/reactivity/src/computed.ts`
- `vue3/packages/reactivity/src/watch.ts`
- `vue3/packages/reactivity/src/effect.ts`
- `vue3/packages/runtime-core/src/apiComputed.ts`
- `vue3/packages/runtime-core/src/apiWatch.ts`
- `vue3/packages/reactivity/__tests__/ref.spec.ts`
- `vue3/packages/reactivity/__tests__/computed.spec.ts`
- `vue3/packages/reactivity/__tests__/watch.spec.ts`
- `vue3/packages/runtime-core/__tests__/apiWatch.spec.ts`

### 3. 核心函数

- `ref`
- `shallowRef`
- `createRef`
- `triggerRef`
- `customRef`
- `toRef`
- `toRefs`
- `proxyRefs`
- `computed`
- `ComputedRefImpl.notify`
- `ComputedRefImpl.value`
- `refreshComputed`
- `watch`
- `traverse`
- `onWatcherCleanup`
- `watchEffect`
- `watchPostEffect`
- `watchSyncEffect`
- `doWatch`

### 4. 需要理解的数据结构

- `Ref`
- `RefImpl`
- `CustomRefImpl`
- `ObjectRefImpl`
- `GetterRefImpl`
- `ComputedRefImpl`
- `WatchSource`
- `WatchCallback`
- `WatchOptions`
- `WatchHandle`
- `WatchScheduler`
- `cleanupMap`
- `activeWatcher`

### 5. 推荐阅读顺序

1. 读 `ref.ts` 的 `RefImpl`，理解 `.value` 的 get/set。
2. 读 `toRef/toRefs/proxyRefs`，理解 ref 与对象属性的桥接。
3. 读 `computed.ts` 的 `ComputedRefImpl`。
4. 回到 `effect.ts` 的 `refreshComputed` 和 dirty 判断。
5. 读 `reactivity/src/watch.ts`，理解底层 watch。
6. 读 `runtime-core/src/apiWatch.ts`，理解 flush、scheduler、组件实例绑定。
7. 对照 watch/computed 测试看边界行为。

### 6. 学完后应该能回答的问题

- 为什么基本类型需要 `ref` 包装？
- `ref(object)` 和 `reactive(object)` 的关系是什么？
- computed 为什么能缓存？
- computed 依赖变化时为什么不是立刻重新计算？
- `watch(source, cb)` 的 source 可以有哪些类型？
- `watchEffect` 和 `watch` 的依赖收集方式有什么区别？
- `flush: 'pre' | 'post' | 'sync'` 分别影响什么？
- cleanup 回调在 watch 中何时执行？

---

## 第六阶段：createApp 应用创建流程

### 1. 学习目标

- 理解 `createApp` 从 DOM 平台入口到 runtime-core app API 的调用链。
- 理解 `App`、`AppContext`、plugin、component、directive、mount 的关系。
- 理解 runtime-only 与 full build 的入口差异。

### 2. 需要阅读的源码文件

- `vue3/packages/runtime-dom/src/index.ts`
- `vue3/packages/runtime-core/src/apiCreateApp.ts`
- `vue3/packages/runtime-core/src/renderer.ts`
- `vue3/packages/vue/src/runtime.ts`
- `vue3/packages/vue/src/index.ts`
- `vue3/packages/runtime-dom/__tests__/createApp.spec.ts`
- `vue3/packages/runtime-core/__tests__/apiCreateApp.spec.ts`

### 3. 核心函数

- `runtime-dom/src/index.ts`
  - `ensureRenderer`
  - `ensureHydrationRenderer`
  - `createApp`
  - `createSSRApp`
  - `normalizeContainer`
  - `resolveRootNamespace`
- `runtime-core/src/apiCreateApp.ts`
  - `createAppContext`
  - `createAppAPI`
  - `app.use`
  - `app.mixin`
  - `app.component`
  - `app.directive`
  - `app.mount`
  - `app.unmount`
  - `app.provide`
- `runtime-core/src/renderer.ts`
  - `createRenderer`
  - `baseCreateRenderer`

### 4. 需要理解的数据结构

- `App`
- `AppConfig`
- `AppContext`
- `Plugin`
- `CreateAppFunction`
- `Renderer`
- `HydrationRenderer`
- `RendererOptions`
- root `VNode`
- root container `__vue_app__`

### 5. 推荐阅读顺序

1. 从 `vue/src/runtime.ts` 看 runtime-only 入口只导出 `runtime-dom`。
2. 看 `vue/src/index.ts`，理解 full build 如何注册 compiler。
3. 读 `runtime-dom/src/index.ts` 的 `createApp` 包装。
4. 读 `ensureRenderer`，看 DOM renderer 如何懒创建。
5. 读 `runtime-core/src/apiCreateApp.ts` 的 `createAppContext`。
6. 读 `createAppAPI`，看 app 对象如何实现。
7. 回到 `app.mount`，追到 renderer 的 `render`。

### 6. 学完后应该能回答的问题

- `createApp(App).mount('#app')` 中 `#app` 是在哪里解析成 DOM 节点的？
- 为什么 `runtime-dom` 要包装 `app.mount`？
- `app.use` 如何避免重复安装插件？
- 全局 component/directive/provide 存在哪里？
- `AppContext` 如何传给根组件？
- runtime-only 构建为什么不能运行时编译 template？
- full build 是如何通过 `registerRuntimeCompiler` 接入 compiler 的？

---

## 第七阶段：组件实例创建与 setup 执行

### 1. 学习目标

- 理解 VNode 进入组件分支后，组件实例如何创建。
- 理解 props、slots、attrs、setup context 的初始化。
- 理解 `setup()` 的执行时机、参数和返回值处理。
- 理解 render 函数如何最终挂到组件实例上。

### 2. 需要阅读的源码文件

- `vue3/packages/runtime-core/src/renderer.ts`
- `vue3/packages/runtime-core/src/component.ts`
- `vue3/packages/runtime-core/src/componentProps.ts`
- `vue3/packages/runtime-core/src/componentSlots.ts`
- `vue3/packages/runtime-core/src/componentPublicInstance.ts`
- `vue3/packages/runtime-core/src/componentRenderUtils.ts`
- `vue3/packages/runtime-core/src/apiSetupHelpers.ts`
- `vue3/packages/runtime-core/__tests__/component.spec.ts`
- `vue3/packages/runtime-core/__tests__/componentProps.spec.ts`
- `vue3/packages/runtime-core/__tests__/componentSlots.spec.ts`

### 3. 核心函数

- `renderer.ts`
  - `processComponent`
  - `mountComponent`
  - `setupRenderEffect`
- `component.ts`
  - `createComponentInstance`
  - `setupComponent`
  - `setupStatefulComponent`
  - `handleSetupResult`
  - `finishComponentSetup`
  - `createSetupContext`
  - `getCurrentInstance`
  - `setCurrentInstance`
  - `unsetCurrentInstance`
- `componentProps.ts`
  - `initProps`
  - `setFullProps`
  - `normalizePropsOptions`
- `componentSlots.ts`
  - `initSlots`
  - `normalizeObjectSlots`
  - `normalizeVNodeSlots`
- `componentRenderUtils.ts`
  - `renderComponentRoot`

### 4. 需要理解的数据结构

- `ComponentInternalInstance`
- `Component`
- `ConcreteComponent`
- `ComponentOptions`
- `FunctionalComponent`
- `SetupContext`
- `Data`
- `Attrs`
- `Slots`
- `RawSlots`
- `NormalizedPropsOptions`
- `ComponentPublicInstance`
- `InternalRenderFunction`

### 5. 推荐阅读顺序

1. 从 `renderer.ts` 的 `processComponent` 开始。
2. 进入 `mountComponent`，看 `createComponentInstance`。
3. 读 `ComponentInternalInstance` 接口，先建立实例字段地图。
4. 读 `setupComponent`，看 props 和 slots 初始化。
5. 读 `setupStatefulComponent`，看 `setup()` 如何被调用。
6. 读 `handleSetupResult`，理解 setup 返回函数或对象的处理。
7. 读 `finishComponentSetup`，理解 render/template/compiler 的关系。
8. 读 `createSetupContext`，理解 attrs/slots/emit/expose。

### 6. 学完后应该能回答的问题

- 组件实例是在哪一步创建的？
- `setup(props, ctx)` 的 `props` 和 `ctx` 分别来自哪里？
- `setup` 返回对象和返回函数有什么不同？
- `getCurrentInstance()` 为什么只能在特定时机拿到实例？
- props 和 attrs 如何区分？
- slots 为什么要规范化成函数？
- 没有 render 但有 template 时，Vue 如何得到 render？

---

## 第八阶段：render 函数与 vnode

### 1. 学习目标

- 理解 render 函数的产物是 VNode。
- 理解 VNode 的字段、类型、shapeFlag、patchFlag、dynamicChildren。
- 理解 `h`、`createVNode`、block tree 和 compiler 生成代码之间的关系。

### 2. 需要阅读的源码文件

- `vue3/packages/runtime-core/src/vnode.ts`
- `vue3/packages/runtime-core/src/h.ts`
- `vue3/packages/runtime-core/src/componentRenderUtils.ts`
- `vue3/packages/runtime-core/src/helpers/renderSlot.ts`
- `vue3/packages/runtime-core/src/helpers/renderList.ts`
- `vue3/packages/shared/src/shapeFlags.ts`
- `vue3/packages/shared/src/patchFlags.ts`
- `vue3/packages/runtime-core/__tests__/vnode.spec.ts`
- `vue3/packages/runtime-core/__tests__/h.spec.ts`

### 3. 核心函数

- `h`
- `createVNode`
- `_createVNode`
- `createBaseVNode`
- `createElementBlock`
- `createBlock`
- `openBlock`
- `closeBlock`
- `setupBlock`
- `normalizeVNode`
- `normalizeChildren`
- `cloneVNode`
- `mergeProps`
- `isVNode`
- `isSameVNodeType`
- `renderComponentRoot`

### 4. 需要理解的数据结构

- `VNode`
- `VNodeTypes`
- `VNodeProps`
- `VNodeChild`
- `VNodeArrayChildren`
- `VNodeNormalizedChildren`
- `VNodeNormalizedRef`
- `Fragment`
- `Text`
- `Comment`
- `Static`
- `ShapeFlags`
- `PatchFlags`
- `blockStack`
- `currentBlock`
- `dynamicChildren`

### 5. 推荐阅读顺序

1. 先读 `VNode` interface，记住主要字段。
2. 读 `Fragment/Text/Comment/Static` 这些特殊 VNode type。
3. 读 `createVNode` 到 `_createVNode`。
4. 读 `createBaseVNode` 和 `normalizeChildren`。
5. 读 `openBlock/createBlock/setupBlock`，理解动态节点收集。
6. 读 `h.ts`，理解手写 render API 的参数归一化。
7. 读 `renderComponentRoot`，看组件 render 如何生成子树 VNode。

### 6. 学完后应该能回答的问题

- VNode 的 `type` 可以有哪些值？
- `shapeFlag` 和 `patchFlag` 分别是谁设置、谁消费？
- block tree 为什么能帮助优化更新？
- `h` 和 `createVNode` 是什么关系？
- `Fragment` 为什么需要特殊处理？
- children 为什么要归一化？
- `isSameVNodeType` 用什么判断两个节点是否可复用？

---

## 第九阶段：patch 流程

### 1. 学习目标

- 理解 renderer 的核心是 `patch(n1, n2, container, ...)`。
- 理解不同 VNode 类型如何分发到不同处理函数。
- 理解 mount、patch、unmount 的整体关系。
- 理解 `runtime-core` 为什么通过 `RendererOptions` 抽象平台操作。

### 2. 需要阅读的源码文件

- `vue3/packages/runtime-core/src/renderer.ts`
- `vue3/packages/runtime-dom/src/index.ts`
- `vue3/packages/runtime-dom/src/nodeOps.ts`
- `vue3/packages/runtime-dom/src/patchProp.ts`
- `vue3/packages/shared/src/shapeFlags.ts`
- `vue3/packages/shared/src/patchFlags.ts`
- `vue3/packages/runtime-core/__tests__/rendererElement.spec.ts`
- `vue3/packages/runtime-core/__tests__/rendererFragment.spec.ts`
- `vue3/packages/runtime-dom/__tests__/nodeOps.spec.ts`

### 3. 核心函数

- `createRenderer`
- `createHydrationRenderer`
- `baseCreateRenderer`
- `patch`
- `processText`
- `processCommentNode`
- `mountStaticNode`
- `patchStaticNode`
- `processElement`
- `mountElement`
- `patchElement`
- `mountChildren`
- `patchChildren`
- `unmount`
- `remove`
- `move`
- `patchProp`
- `nodeOps.insert`
- `nodeOps.remove`
- `nodeOps.createElement`
- `nodeOps.setElementText`

### 4. 需要理解的数据结构

- `Renderer`
- `HydrationRenderer`
- `RendererOptions`
- `RendererInternals`
- `RendererNode`
- `RendererElement`
- `PatchFn`
- `VNode`
- `ShapeFlags`
- `PatchFlags`
- `ElementNamespace`

### 5. 推荐阅读顺序

1. 从 `runtime-dom/src/index.ts` 看 `rendererOptions = extend({ patchProp }, nodeOps)`。
2. 读 `runtime-core/src/renderer.ts` 的 `RendererOptions` 接口。
3. 读 `createRenderer` 和 `baseCreateRenderer`。
4. 读 `patch` 的类型分发逻辑。
5. 读 `processElement -> mountElement -> patchElement`。
6. 读 `patchChildren`，先理解 children 的大分支。
7. 读 `unmount/remove/move`，理解节点移除和移动。

### 6. 学完后应该能回答的问题

- `patch` 的 `n1` 和 `n2` 分别代表什么？
- 首次挂载和更新为什么都走 patch？
- `runtime-core` 如何在不知道 DOM API 的情况下完成渲染？
- 元素节点和组件节点在 patch 中如何分流？
- `patchFlag` 如何减少 prop 和 children 的比较成本？
- `nodeOps` 和 `patchProp` 分别负责什么？

---

## 第十阶段：组件更新流程

### 1. 学习目标

- 理解组件首次挂载和后续更新共用 render effect。
- 理解响应式触发如何进入组件更新 job。
- 理解父组件传入 props 改变时，子组件如何判断是否更新。
- 理解 update 前后生命周期在流程中的位置。

### 2. 需要阅读的源码文件

- `vue3/packages/runtime-core/src/renderer.ts`
- `vue3/packages/runtime-core/src/component.ts`
- `vue3/packages/runtime-core/src/componentRenderUtils.ts`
- `vue3/packages/runtime-core/src/componentProps.ts`
- `vue3/packages/runtime-core/src/scheduler.ts`
- `vue3/packages/reactivity/src/effect.ts`
- `vue3/packages/runtime-core/__tests__/rendererComponent.spec.ts`
- `vue3/packages/runtime-core/__tests__/componentProps.spec.ts`

### 3. 核心函数

- `mountComponent`
- `setupRenderEffect`
- `updateComponent`
- `updateComponentPreRender`
- `renderComponentRoot`
- `shouldUpdateComponent`
- `updateProps`
- `updateSlots`
- `queueJob`
- `ReactiveEffect`
- `effect.run`
- `effect.scheduler`

### 4. 需要理解的数据结构

- `ComponentInternalInstance`
- `instance.update`
- `instance.job`
- `instance.subTree`
- `instance.next`
- `instance.vnode`
- `instance.render`
- `instance.effect`
- `SchedulerJob`
- `SchedulerJobFlags`
- `VNode`
- `PatchFlags`

### 5. 推荐阅读顺序

1. 读 `setupRenderEffect` 的首次挂载分支。
2. 看它如何创建 `ReactiveEffect` 和 `instance.update/job`。
3. 读响应式数据变化时 scheduler 如何 `queueJob`。
4. 读 `setupRenderEffect` 的更新分支。
5. 读 `updateComponent`，看父组件 patch 子组件 VNode 时如何判断更新。
6. 读 `shouldUpdateComponent`，理解 patchFlag 对组件更新判断的优化。
7. 读 `updateComponentPreRender`，看 props/slots/next vnode 如何刷新。

### 6. 学完后应该能回答的问题

- 组件首次渲染时 render effect 在哪里创建？
- 响应式数据变化后为什么不是立即同步 patch DOM？
- `instance.subTree` 的作用是什么？
- `instance.next` 什么时候有值？
- 父组件更新时子组件一定会重新 render 吗？
- `shouldUpdateComponent` 如何利用 patchFlag？
- 组件更新前后生命周期如何被调度？

---

## 第十一阶段：Vue3 diff 算法

### 1. 学习目标

- 理解 Vue3 children diff 的整体分支。
- 理解 keyed diff 的五段式处理。
- 理解最长递增子序列在最小化移动中的作用。
- 理解 compiler 生成的 fragment patchFlag 如何影响 diff 策略。

### 2. 需要阅读的源码文件

- `vue3/packages/runtime-core/src/renderer.ts`
- `vue3/packages/runtime-core/src/vnode.ts`
- `vue3/packages/shared/src/patchFlags.ts`
- `vue3/packages/runtime-core/__tests__/rendererChildren.spec.ts`
- `vue3/packages/runtime-core/__tests__/rendererOptimizedMode.spec.ts`

### 3. 核心函数

- `patchChildren`
- `patchKeyedChildren`
- `patchUnkeyedChildren`
- `patchBlockChildren`
- `isSameVNodeType`
- `move`
- `unmount`
- `getSequence`

### 4. 需要理解的数据结构

- old children：`c1`
- new children：`c2`
- `keyToNewIndexMap`
- `newIndexToOldIndexMap`
- `maxNewIndexSoFar`
- `moved`
- `increasingNewIndexSequence`
- `PatchFlags.KEYED_FRAGMENT`
- `PatchFlags.UNKEYED_FRAGMENT`
- `PatchFlags.STABLE_FRAGMENT`
- `dynamicChildren`

### 5. 推荐阅读顺序

1. 先读 `patchChildren`，理解文本 children、数组 children、空 children 的分支。
2. 看 `PatchFlags.KEYED_FRAGMENT` 如何进入 `patchKeyedChildren`。
3. 读 `patchKeyedChildren` 的头部同步。
4. 读尾部同步。
5. 读新节点多出来时的 mount 分支。
6. 读旧节点多出来时的 unmount 分支。
7. 读未知序列 diff：构建 key map、patch 可复用节点、卸载旧节点。
8. 最后读 `getSequence`，理解为什么只移动不在 LIS 中的节点。

### 6. 学完后应该能回答的问题

- keyed diff 为什么先从两端同步？
- 新旧 children 中间未知序列如何匹配？
- `newIndexToOldIndexMap` 为什么保存 oldIndex + 1？
- 为什么需要最长递增子序列？
- 哪些节点会被移动，哪些节点可以保持不动？
- unkeyed diff 和 keyed diff 的差异是什么？
- `STABLE_FRAGMENT` 为什么能跳过更重的 diff？

---

## 第十二阶段：scheduler 批量更新机制

### 1. 学习目标

- 理解 Vue 如何把多次响应式触发合并成一次队列刷新。
- 理解 `nextTick` 和微任务的关系。
- 理解 pre flush、post flush、普通 job 的执行顺序。
- 理解 scheduler 如何避免重复入队和递归更新失控。

### 2. 需要阅读的源码文件

- `vue3/packages/runtime-core/src/scheduler.ts`
- `vue3/packages/runtime-core/src/apiWatch.ts`
- `vue3/packages/runtime-core/src/renderer.ts`
- `vue3/packages/reactivity/src/effect.ts`
- `vue3/packages/runtime-core/__tests__/scheduler.spec.ts`
- `vue3/packages/runtime-core/__tests__/apiWatch.spec.ts`

### 3. 核心函数

- `nextTick`
- `queueJob`
- `queueFlush`
- `queuePostFlushCb`
- `flushPreFlushCbs`
- `flushPostFlushCbs`
- `flushJobs`
- `findInsertionIndex`
- `getId`
- `checkRecursiveUpdates`
- `doWatch`
- `queuePostRenderEffect`

### 4. 需要理解的数据结构

- `SchedulerJob`
- `SchedulerJobs`
- `SchedulerJobFlags`
- `queue`
- `pendingPostFlushCbs`
- `activePostFlushCbs`
- `flushIndex`
- `postFlushIndex`
- `currentFlushPromise`
- `resolvedPromise`
- `RECURSION_LIMIT`
- `CountMap`

### 5. 推荐阅读顺序

1. 读 `SchedulerJob` 和 `SchedulerJobFlags`。
2. 读 `queueJob`，理解去重、排序和入队。
3. 读 `queueFlush`，理解为什么用 Promise 微任务。
4. 读 `flushJobs`，理解主队列执行和 finally 清理。
5. 读 `queuePostFlushCb` 和 `flushPostFlushCbs`。
6. 读 `flushPreFlushCbs`。
7. 回到 `apiWatch.ts`，看 watch 的 flush 选项如何映射到 scheduler。
8. 回到 `renderer.ts`，看组件更新 job 如何入队。

### 6. 学完后应该能回答的问题

- 多次 `state.count++` 为什么通常只触发一次组件更新？
- `nextTick` 等待的是什么？
- job 为什么需要 id 排序？
- pre flush 和 post flush 分别适合什么场景？
- `watch(..., { flush: 'sync' })` 为什么会绕过队列？
- scheduler 如何避免同一个 job 重复入队？
- 递归更新为什么需要限制？

---

## 第十三阶段：template 编译流程

### 1. 学习目标

- 理解 template 到 render function code 的三段流程：parse、transform、generate。
- 理解 `compiler-dom` 如何调用 `compiler-core`。
- 理解 DOM 指令 transform 如何覆盖 core 指令 transform。
- 理解 runtime full build 如何把 compiler 接入运行时。

### 2. 需要阅读的源码文件

- `vue3/packages/compiler-core/src/compile.ts`
- `vue3/packages/compiler-core/src/parser.ts`
- `vue3/packages/compiler-core/src/transform.ts`
- `vue3/packages/compiler-core/src/codegen.ts`
- `vue3/packages/compiler-core/src/runtimeHelpers.ts`
- `vue3/packages/compiler-dom/src/index.ts`
- `vue3/packages/compiler-dom/src/parserOptions.ts`
- `vue3/packages/compiler-dom/src/runtimeHelpers.ts`
- `vue3/packages/vue/src/index.ts`
- `vue3/packages/compiler-core/__tests__/compile.spec.ts`
- `vue3/packages/compiler-dom/__tests__/index.spec.ts`

### 3. 核心函数

- `compiler-dom/src/index.ts`
  - `compile`
  - `parse`
- `compiler-core/src/compile.ts`
  - `baseCompile`
  - `getBaseTransformPreset`
- `compiler-core/src/parser.ts`
  - `baseParse`
- `compiler-core/src/transform.ts`
  - `transform`
  - `createTransformContext`
  - `traverseNode`
- `compiler-core/src/codegen.ts`
  - `generate`
- `vue/src/index.ts`
  - `compileToFunction`
  - `registerRuntimeCompiler`

### 4. 需要理解的数据结构

- `CompilerOptions`
- `ParserOptions`
- `TransformOptions`
- `CodegenOptions`
- `RootNode`
- `CodegenResult`
- `TransformPreset`
- `DOMNodeTransforms`
- `DOMDirectiveTransforms`
- `helperNameMap`
- `RenderFunction`

### 5. 推荐阅读顺序

1. 从 `compiler-dom/src/index.ts` 的 `compile` 开始，看 DOM 如何包装 `baseCompile`。
2. 进入 `compiler-core/src/compile.ts` 的 `baseCompile`。
3. 读 `baseParse`，只先理解输出 RootNode。
4. 读 `getBaseTransformPreset`，看默认 transform 组合。
5. 读 `transform`，理解 AST 如何被遍历修改。
6. 读 `generate`，理解代码字符串如何生成。
7. 回到 `vue/src/index.ts`，看运行时模板编译如何 new Function。

### 6. 学完后应该能回答的问题

- `compile(template)` 的输出是什么？
- `compiler-core` 和 `compiler-dom` 在编译流程中分别做什么？
- DOM 指令 transform 是如何注入的？
- parse、transform、generate 三步分别改变了什么？
- full build 中 template 字符串如何变成真正的 render 函数？
- 为什么 runtime-only 构建不包含 compiler？

---

## 第十四阶段：compiler-core AST 转换

### 1. 学习目标

- 深入理解 AST 节点类型和 transform pipeline。
- 理解结构指令 `v-if`、`v-for` 如何重写 AST。
- 理解元素、props、slot、表达式如何生成 codegen node。
- 理解 PatchFlags 如何在编译期产生并被运行时消费。

### 2. 需要阅读的源码文件

- `vue3/packages/compiler-core/src/ast.ts`
- `vue3/packages/compiler-core/src/transform.ts`
- `vue3/packages/compiler-core/src/transforms/transformElement.ts`
- `vue3/packages/compiler-core/src/transforms/transformExpression.ts`
- `vue3/packages/compiler-core/src/transforms/transformText.ts`
- `vue3/packages/compiler-core/src/transforms/vIf.ts`
- `vue3/packages/compiler-core/src/transforms/vFor.ts`
- `vue3/packages/compiler-core/src/transforms/vOn.ts`
- `vue3/packages/compiler-core/src/transforms/vBind.ts`
- `vue3/packages/compiler-core/src/transforms/vModel.ts`
- `vue3/packages/compiler-core/src/transforms/vSlot.ts`
- `vue3/packages/compiler-core/src/transforms/cacheStatic.ts`
- `vue3/packages/compiler-core/src/codegen.ts`
- `vue3/packages/shared/src/patchFlags.ts`
- `vue3/packages/compiler-core/__tests__/transform.spec.ts`

### 3. 核心函数

- `createRoot`
- `createVNodeCall`
- `createCallExpression`
- `createObjectExpression`
- `createSimpleExpression`
- `createCompoundExpression`
- `createTransformContext`
- `transform`
- `traverseNode`
- `traverseChildren`
- `createStructuralDirectiveTransform`
- `transformElement`
- `buildProps`
- `resolveComponentType`
- `transformExpression`
- `processExpression`
- `transformText`
- `transformIf`
- `processIf`
- `transformFor`
- `processFor`
- `transformOn`
- `transformBind`
- `transformModel`
- `buildSlots`
- `cacheStatic`
- `getConstantType`
- `generate`

### 4. 需要理解的数据结构

- `NodeTypes`
- `ElementTypes`
- `ConstantTypes`
- `RootNode`
- `ElementNode`
- `DirectiveNode`
- `SimpleExpressionNode`
- `CompoundExpressionNode`
- `IfNode`
- `IfBranchNode`
- `ForNode`
- `VNodeCall`
- `CallExpression`
- `ObjectExpression`
- `FunctionExpression`
- `TransformContext`
- `NodeTransform`
- `DirectiveTransform`
- `StructuralDirectiveTransform`
- `BindingTypes`
- `PatchFlags`

### 5. 推荐阅读顺序

1. 先读 `ast.ts` 的 `NodeTypes` 和主要 Node interface。
2. 读 `createRoot/createVNodeCall` 等 AST 构造函数。
3. 读 `transform.ts` 的 `TransformContext`。
4. 读 `traverseNode`，理解 transform 如何进入、退出节点。
5. 读 `createStructuralDirectiveTransform`。
6. 读 `vIf.ts` 和 `vFor.ts`，理解结构指令如何替换节点。
7. 读 `transformElement.ts`，理解元素如何生成 VNodeCall。
8. 读 `buildProps`，理解 props、指令、PatchFlags 生成。
9. 读 `transformExpression.ts`，理解表达式前缀和作用域。
10. 读 `codegen.ts` 的 `genNode/genVNodeCall`，把 AST 和最终代码连起来。

### 6. 学完后应该能回答的问题

- AST 中 template 节点、元素节点、表达式节点分别如何表示？
- NodeTransform 为什么可以返回退出函数？
- `v-if` 为什么会变成 `IfNode` 和条件表达式？
- `v-for` 为什么会生成 `renderList` 相关调用？
- `transformElement` 如何区分原生元素和组件？
- PatchFlags 是如何在编译阶段算出来的？
- `BindingTypes` 对 `<script setup>` 和表达式转换有什么影响？
- codegen 为什么不直接从原始 AST 生成代码，而要依赖 codegenNode？

---

## 第十五阶段：SFC 单文件组件编译

### 1. 学习目标

- 理解 `.vue` 文件如何被解析成 `SFCDescriptor`。
- 理解 template、script、style 三块如何分别编译。
- 理解 `<script setup>` 宏的处理流程。
- 理解 scoped CSS、CSS modules、资源 URL transform 的位置。
- 理解 SFC 编译器和构建工具之间的职责边界。

### 2. 需要阅读的源码文件

- `vue3/packages/compiler-sfc/src/index.ts`
- `vue3/packages/compiler-sfc/src/parse.ts`
- `vue3/packages/compiler-sfc/src/compileTemplate.ts`
- `vue3/packages/compiler-sfc/src/compileScript.ts`
- `vue3/packages/compiler-sfc/src/compileStyle.ts`
- `vue3/packages/compiler-sfc/src/script/context.ts`
- `vue3/packages/compiler-sfc/src/script/defineProps.ts`
- `vue3/packages/compiler-sfc/src/script/defineEmits.ts`
- `vue3/packages/compiler-sfc/src/script/defineModel.ts`
- `vue3/packages/compiler-sfc/src/script/defineExpose.ts`
- `vue3/packages/compiler-sfc/src/script/defineOptions.ts`
- `vue3/packages/compiler-sfc/src/script/defineSlots.ts`
- `vue3/packages/compiler-sfc/src/script/resolveType.ts`
- `vue3/packages/compiler-sfc/src/template/transformAssetUrl.ts`
- `vue3/packages/compiler-sfc/src/style/pluginScoped.ts`
- `vue3/packages/compiler-sfc/__tests__/parse.spec.ts`
- `vue3/packages/compiler-sfc/__tests__/compileScript.spec.ts`
- `vue3/packages/compiler-sfc/__tests__/compileTemplate.spec.ts`
- `vue3/packages/compiler-sfc/__tests__/compileStyle.spec.ts`

### 3. 核心函数

- `parse`
- `createBlock`
- `generateSourceMap`
- `hmrShouldReload`
- `compileTemplate`
- `doCompileTemplate`
- `compileScript`
- `ScriptCompileContext`
- `processDefineProps`
- `genRuntimeProps`
- `processDefineEmits`
- `genRuntimeEmits`
- `resolveTypeElements`
- `inferRuntimeType`
- `compileStyle`
- `compileStyleAsync`
- `doCompileStyle`
- `preprocess`
- `transformAssetUrl`
- `createAssetUrlTransformWithOptions`
- `scopedPlugin`
- `rewriteSelector`

### 4. 需要理解的数据结构

- `SFCParseOptions`
- `SFCParseResult`
- `SFCDescriptor`
- `SFCBlock`
- `SFCTemplateBlock`
- `SFCScriptBlock`
- `SFCStyleBlock`
- `SFCTemplateCompileOptions`
- `SFCTemplateCompileResults`
- `SFCScriptCompileOptions`
- `SFCStyleCompileOptions`
- `SFCStyleCompileResults`
- `ScriptCompileContext`
- `ImportBinding`
- `BindingMetadata`
- `TypeResolveContext`
- `TypeScope`
- `AssetURLOptions`
- `AssetURLTagConfig`

### 5. 推荐阅读顺序

1. 从 `compiler-sfc/src/index.ts` 看对外 API。
2. 读 `parse.ts`，理解 `.vue` 如何变成 descriptor。
3. 读 `SFCDescriptor` 和各类 block interface。
4. 读 `compileTemplate.ts`，看 template 如何调用 DOM/SSR compiler。
5. 读 `compileScript.ts`，先找 `MACROS` 和主流程。
6. 读 `script/context.ts`，理解 script 编译上下文。
7. 读 `defineProps.ts`、`defineEmits.ts`，理解宏如何生成 runtime 选项。
8. 读 `resolveType.ts`，理解类型到 runtime props/emits 的推导。
9. 读 `compileStyle.ts` 和 `style/pluginScoped.ts`，理解 style 编译和 scoped 重写。
10. 读 `template/transformAssetUrl.ts`，理解静态资源 URL 如何转 import。

### 6. 学完后应该能回答的问题

- `.vue` 文件经过 `parse` 后会得到什么结构？
- `template`、`script`、`style` 为什么分开编译？
- `<script setup>` 中 `defineProps`、`defineEmits` 为什么不需要 import？
- TypeScript 类型是如何推导成 runtime props 的？
- scoped CSS 的 `data-v-xxx` 选择器是在哪里注入的？
- 模板里的 `<img src="./logo.png">` 为什么能变成资源 import？
- `compiler-sfc` 和 Vite 插件分别负责什么？
- SFC 编译结果最终如何接入 runtime render 流程？

---

## 阶段完成标准

完成每个阶段时，建议做三件事：

1. **画调用链**
   - 用 5 到 10 个函数画出该阶段主流程。

2. **标数据结构**
   - 写出该阶段最核心的 3 到 5 个 interface/class/Map。

3. **回答自测问题**
   - 如果本阶段问题能不用看答案讲清楚，就进入下一阶段。

## 推荐节奏

```text
第 1 周：阶段 1 - 4
  仓库结构、响应式总览、effect、reactive 家族

第 2 周：阶段 5 - 8
  ref/computed/watch、createApp、组件实例、VNode

第 3 周：阶段 9 - 12
  patch、组件更新、diff、scheduler

第 4 周：阶段 13 - 15
  template 编译、AST transform、SFC 编译
```

如果时间有限，最小闭环优先读：

```text
reactivity/src/reactive.ts
reactivity/src/baseHandlers.ts
reactivity/src/dep.ts
reactivity/src/effect.ts
runtime-core/src/vnode.ts
runtime-core/src/component.ts
runtime-core/src/renderer.ts
runtime-core/src/scheduler.ts
runtime-dom/src/index.ts
runtime-dom/src/nodeOps.ts
runtime-dom/src/patchProp.ts
compiler-core/src/compile.ts
compiler-core/src/transform.ts
compiler-core/src/codegen.ts
compiler-sfc/src/parse.ts
```
