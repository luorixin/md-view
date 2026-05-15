# Vue3 源码仓库全局导览

> 扫描对象：`vue3`  
> 当前本地源码版本：`3.5.34`，来自 `vue3/package.json`  
> 目标：帮助第一次阅读 Vue3 源码的人建立全局地图，知道每个目录和核心包负责什么，以及从哪里开始读。

## 项目整体说明

`vue3` 是 Vue 3 的 core monorepo。它不是一个单包项目，而是由多个可独立构建、发布或用于内部测试的包组成。

整体可以理解成两条主线：

1. **运行时主线**
   - `shared` 提供跨包工具和标志位。
   - `reactivity` 实现响应式系统。
   - `runtime-core` 实现平台无关的组件、VNode、调度器、渲染器核心。
   - `runtime-dom` 把 `runtime-core` 绑定到浏览器 DOM。
   - `vue` 作为用户通常安装和导入的入口包，组合 runtime 与 compiler。

2. **编译器主线**
   - `compiler-core` 实现平台无关的模板解析、AST 转换、代码生成。
   - `compiler-dom` 在 `compiler-core` 上增加 DOM 语义和 DOM 指令转换。
   - `compiler-sfc` 处理 `.vue` 单文件组件，拆分并编译 template/script/style。
   - `compiler-ssr` 和 `server-renderer` 处理 SSR 编译与渲染。

一个简化的依赖图如下：

```text
shared
  ├─ reactivity
  │    └─ runtime-core
  │          └─ runtime-dom
  │                └─ vue
  ├─ compiler-core
  │    └─ compiler-dom
  │          ├─ compiler-sfc
  │          └─ compiler-ssr
  └─ server-renderer -> compiler-ssr + vue(peer)

vue -> shared + runtime-dom + compiler-dom + compiler-sfc + server-renderer
```

这意味着第一次阅读时，不建议直接从 `vue` 包开始。`vue` 更像聚合入口；真正的机制分别藏在 `reactivity`、`runtime-core`、`runtime-dom` 和编译器包里。

## 核心目录结构

```text
vue3/
  package.json              # monorepo 根包，定义脚本、版本、开发依赖
  pnpm-workspace.yaml        # pnpm workspace 范围：packages/* 与 packages-private/*
  tsconfig.json              # TypeScript 基础配置与 @vue/* 路径别名
  tsconfig.build.json        # d.ts 构建配置
  rollup.config.js           # 生产构建配置，按 TARGET 构建各包
  rollup.dts.config.js       # 类型声明打包和补丁逻辑
  vitest.config.ts           # 单测、jsdom、e2e 等测试项目配置
  eslint.config.js           # ESLint 规则与各包运行环境限制
  scripts/                   # 构建、发布、开发、测试辅助脚本
  packages/                  # Vue 核心发布包和内部测试包
  packages-private/          # playground、类型测试、调试工程
  changelogs/                # 分版本 changelog
  .github/                   # CI、issue 模板、贡献相关配置
```

### `packages/` 目录

```text
packages/
  shared/             # 跨包共享工具、PatchFlags、ShapeFlags、DOM 标签/属性判断等
  reactivity/         # 响应式系统：reactive/ref/effect/computed/watch
  runtime-core/       # 平台无关运行时：VNode、组件、调度、renderer、内置组件
  runtime-dom/        # DOM 平台运行时：DOM 操作、属性 patch、事件、v-model、Transition
  compiler-core/      # 平台无关编译器：parse -> transform -> codegen
  compiler-dom/       # DOM 编译器：DOM parser options、v-html/v-text/v-model/v-on/v-show 等
  compiler-sfc/       # 单文件组件编译：parse/compileScript/compileTemplate/compileStyle
  compiler-ssr/       # SSR 模板编译
  server-renderer/    # SSR 运行时渲染输出
  vue/                # 用户入口包，组合 runtime-dom 与 compiler-dom
  vue-compat/         # Vue 2 兼容构建
  runtime-test/       # runtime-core 的测试渲染平台
```

### `packages-private/` 目录

```text
packages-private/
  dts-test/           # 源码类型测试
  dts-built-test/     # 构建产物类型测试
  sfc-playground/     # SFC playground
  template-explorer/  # 模板编译结果探索工具
  vite-debug/         # Vite 调试工程
```

## 根目录重要文件作用

| 文件 | 作用 |
| --- | --- |
| `package.json` | 根工作区配置，声明版本 `3.5.34`、pnpm 版本、构建/测试/类型检查/发布脚本。常用脚本包括 `dev`、`build`、`check`、`test`、`test-unit`、`test-dts`。 |
| `pnpm-workspace.yaml` | 定义 workspace 包范围：`packages/*` 和 `packages-private/*`，并集中声明 catalog 版本。 |
| `tsconfig.json` | TypeScript 基础配置，重要的是 `paths` 把 `@vue/*` 指向 `packages/*/src`，把 `vue` 指向 `packages/vue/src`。 |
| `tsconfig.build.json` | 继承根 TS 配置，只输出 declaration，用于生成各包 `.d.ts`。 |
| `rollup.config.js` | 生产构建入口。通过 `TARGET` 定位包，根据包的 `buildOptions.formats` 输出 `esm-bundler`、`cjs`、`global`、`esm-browser` 等格式，并注入 `__DEV__`、`__BROWSER__`、`__SSR__` 等编译常量。 |
| `rollup.dts.config.js` | 把 `tsc` 生成的临时类型声明合并成各包 `dist/*.d.ts`，并对导出类型做补丁。 |
| `vitest.config.ts` | 测试配置。用 alias 指向源码，设置多个测试项目：普通 unit、需要 GC 的 unit、jsdom unit、e2e。 |
| `eslint.config.js` | 代码规范配置。对核心源码限制 DOM/Node 全局变量、禁止 async/await、可选链、对象展开等会影响 ES2016 产物体积的语法。 |
| `scripts/dev.js` | 开发构建脚本，使用 esbuild watch，适合快速本地构建。 |
| `scripts/build.js` | 生产构建脚本，解析目标包并并行调用 Rollup，可选择格式、prod/dev、是否生成类型。 |
| `scripts/aliases.js` | 生成 Rollup/Vitest 共用 alias，把 `@vue/*`、`vue/compiler-sfc`、`vue/server-renderer` 等指向源码入口。 |
| `README.md` | 项目说明、文档入口、社区与贡献入口。不是源码导览文档。 |
| `CHANGELOG.md` / `changelogs/` | 主 changelog 与历史版本 changelog。 |
| `LICENSE` / `SECURITY.md` / `FUNDING.json` | 许可证、安全政策、赞助信息。 |

## 核心包职责表

| 包 | 主要职责 | 重点入口 | 直接依赖 |
| --- | --- | --- | --- |
| `@vue/shared` | 所有包共享的基础工具、类型判断、字符串处理、PatchFlags、ShapeFlags、SlotFlags、DOM 标签/属性判断、HTML escape 等。 | `packages/shared/src/index.ts` | 无内部依赖 |
| `@vue/reactivity` | Vue 响应式内核：依赖收集、触发更新、Proxy handler、`ref`、`reactive`、`computed`、`watch`、effect scope。 | `packages/reactivity/src/index.ts` | `@vue/shared` |
| `@vue/runtime-core` | 平台无关运行时：组件实例、VNode、renderer、调度器、生命周期、依赖注入、内置组件、Composition API runtime 层。 | `packages/runtime-core/src/index.ts` | `@vue/shared`、`@vue/reactivity` |
| `@vue/runtime-dom` | 浏览器 DOM 平台适配：真实 DOM 操作、属性/事件/style/class patch、DOM 指令、DOM Transition、`createApp`。 | `packages/runtime-dom/src/index.ts` | `@vue/shared`、`@vue/runtime-core`、`@vue/reactivity`、`csstype` |
| `@vue/compiler-core` | 平台无关模板编译器：tokenizer/parser、AST、transform pipeline、directive transforms、codegen。 | `packages/compiler-core/src/index.ts` | `@vue/shared`、`@babel/parser`、`entities`、`estree-walker`、`source-map-js` |
| `@vue/compiler-dom` | DOM 模板编译器：在 core 编译器上追加 DOM parser options、DOM 节点转换、DOM 指令转换、静态字符串化优化。 | `packages/compiler-dom/src/index.ts` | `@vue/shared`、`@vue/compiler-core` |
| `@vue/compiler-sfc` | `.vue` SFC 编译：解析 descriptor，编译 template/script/style，处理 `<script setup>` 宏、scoped CSS、CSS modules、资源 URL。 | `packages/compiler-sfc/src/index.ts` | `@vue/compiler-core`、`@vue/compiler-dom`、`@vue/compiler-ssr`、`@vue/shared` 等 |
| `@vue/compiler-ssr` | SSR 编译：把模板编译成服务端渲染函数相关代码。 | `packages/compiler-ssr/src/index.ts` | `@vue/shared`、`@vue/compiler-dom` |
| `@vue/server-renderer` | SSR 渲染器：把 app/vnode 渲染为字符串或 stream。 | `packages/server-renderer/src/index.ts` | `@vue/shared`、`@vue/compiler-ssr`，peer `vue` |
| `vue` | 对用户暴露的主入口包。runtime-only 构建导出 `runtime-dom`；full build 注册 `compiler-dom`，支持运行时模板编译。 | `packages/vue/src/index.ts`、`packages/vue/src/runtime.ts` | `@vue/shared`、`@vue/runtime-dom`、`@vue/compiler-dom`、`@vue/compiler-sfc`、`@vue/server-renderer` |
| `@vue/compat` | Vue 2 兼容构建入口。 | `packages/vue-compat/src/index.ts` | peer `vue`，并打入兼容逻辑 |
| `@vue/runtime-test` | 测试用 renderer 平台，用来验证 `runtime-core` 的平台无关 renderer 行为。 | `packages/runtime-test/src/index.ts` | `@vue/shared`、`@vue/runtime-core` |

## 每个核心包解决什么问题

### `shared`

`shared` 解决的是“跨包重复基础能力”的问题。比如：

- `general.ts`：通用类型判断、对象扩展、字符串工具。
- `patchFlags.ts`：编译器和运行时共享的 patch 标志。
- `shapeFlags.ts`：VNode 类型和子节点形态标志。
- `slotFlags.ts`：slot 稳定性标志。
- `domTagConfig.ts` / `domAttrConfig.ts`：DOM 标签和属性判断。
- `normalizeProp.ts`：class/style 归一化。
- `toDisplayString.ts`：模板插值展示值转换。

它处在依赖图底部，其他核心包都可以依赖它，但它不应该反向依赖 runtime 或 compiler。

### `reactivity`

`reactivity` 解决“状态变化如何被追踪，并自动通知使用者重新执行”的问题。它不关心组件，也不关心 DOM。

核心文件：

- `reactive.ts`：创建 reactive/readonly/shallowReactive/shallowReadonly Proxy。
- `baseHandlers.ts`：普通对象/数组的 Proxy get/set/delete/has/ownKeys 行为。
- `collectionHandlers.ts`：Map/Set/WeakMap/WeakSet 的响应式处理。
- `dep.ts`：依赖容器、`track`、`trigger`、targetMap。
- `effect.ts`：`ReactiveEffect`、effect 执行、批处理、dirty 检查。
- `ref.ts`：`ref`、`shallowRef`、`customRef`、`toRef`、`toRefs`。
- `computed.ts`：computed ref 的缓存、脏检查和触发。
- `watch.ts`：底层 watch 实现，runtime-core 再包装调度策略。
- `effectScope.ts`：批量管理 effect 生命周期。

先读这个包能理解 Vue 最基础的“数据变了为什么视图会更新”。

### `runtime-core`

`runtime-core` 解决“如何把组件树变成可更新的虚拟节点树，并通过抽象 host 操作渲染到某个平台”的问题。

它刻意不直接写 DOM API，而是通过 `RendererOptions` 接收平台操作。因此它既能被 `runtime-dom` 用来渲染浏览器 DOM，也能被测试包或自定义 renderer 复用。

核心文件：

- `renderer.ts`：核心 patch 算法、mount/patch/unmount、组件更新、children diff、内置组件处理。
- `vnode.ts`：VNode 结构、block tree、`createVNode`、`cloneVNode`、children 归一化。
- `component.ts`：组件实例、setup 流程、runtime compiler 注册、组件完成设置。
- `componentProps.ts` / `componentSlots.ts` / `componentEmits.ts`：props、slots、emits 初始化和更新。
- `componentRenderUtils.ts`：执行组件 render，处理 attrs fallthrough，判断组件是否需要更新。
- `scheduler.ts`：更新队列、`nextTick`、pre/post flush。
- `apiCreateApp.ts`：`createApp` API、插件、mixin、component/directive 注册。
- `apiWatch.ts` / `apiComputed.ts`：基于 reactivity 的 runtime API 包装。
- `components/KeepAlive.ts`、`Suspense.ts`、`Teleport.ts`、`BaseTransition.ts`：内置组件。
- `hydration.ts` / `hydrationStrategies.ts`：SSR hydration。

这个包是 Vue 运行时最重的部分，也是阅读难度最高的部分。

### `runtime-dom`

`runtime-dom` 解决“runtime-core 的抽象 renderer 如何落到浏览器 DOM”的问题。

核心文件：

- `index.ts`：组合 `nodeOps` 与 `patchProp`，创建 DOM renderer，暴露 `render`、`hydrate`、`createApp`、`createSSRApp`。
- `nodeOps.ts`：真实 DOM 节点增删改查，例如 createElement、insert、remove、setText。
- `patchProp.ts`：决定一个 prop 应该按 class/style/event/attr/DOM prop 哪种方式更新。
- `modules/class.ts`：class patch。
- `modules/style.ts`：style patch，包含自动前缀和 `!important` 等处理。
- `modules/events.ts`：事件 patch，invoker 缓存，事件选项解析。
- `modules/attrs.ts`：attribute patch。
- `modules/props.ts`：DOM property patch。
- `directives/vModel.ts`：不同表单元素的 `v-model` runtime 行为。
- `directives/vShow.ts`：`v-show` runtime 行为。
- `directives/vOn.ts`：事件修饰符和按键修饰符。
- `components/Transition.ts` / `TransitionGroup.ts`：DOM transition。
- `apiCustomElement.ts`：Vue Custom Element 支持。

读完 `runtime-core` 后再看它，会发现 `runtime-dom` 更像平台适配层。

### `compiler-core`

`compiler-core` 解决“模板字符串如何变成 render 函数代码”的平台无关问题。

编译流程可以简化为：

```text
template string
  -> baseParse / parser / tokenizer
  -> AST
  -> transform
  -> codegen node
  -> generate
  -> render function code
```

核心文件：

- `compile.ts`：`baseCompile`，串起 parse、transform、generate。
- `parser.ts`：`baseParse`，把模板解析成 AST。
- `tokenizer.ts`：底层 token 状态机。
- `ast.ts`：AST 节点类型和 AST 构造函数。
- `transform.ts`：transform 上下文、节点遍历、结构指令转换工具。
- `codegen.ts`：把 AST/codegen node 输出成 render 函数字符串。
- `runtimeHelpers.ts`：编译器生成代码时引用的 runtime helper 名称。
- `transforms/vIf.ts`、`vFor.ts`、`vOn.ts`、`vBind.ts`、`vModel.ts`、`vSlot.ts`：核心指令转换。
- `transforms/transformElement.ts`：元素/组件节点转换为 VNode call。
- `transforms/transformExpression.ts`：表达式前缀、作用域和标识符处理。
- `transforms/transformText.ts`：文本与插值合并。
- `transforms/cacheStatic.ts`：静态提升和常量类型分析。

这个包适合在已经理解 runtime VNode 后阅读，否则很难理解编译器为什么生成那些 helper 调用。

### `compiler-dom`

`compiler-dom` 解决“HTML/DOM 模板的特殊语义如何接入 compiler-core”的问题。

核心文件：

- `index.ts`：暴露 `compile` 和 `parse`，把 DOM transform 注入 `baseCompile`。
- `parserOptions.ts`：HTML 解析选项，处理原生标签、命名空间、文本模式等。
- `runtimeHelpers.ts`：DOM runtime helper。
- `transforms/vHtml.ts`：`v-html`。
- `transforms/vText.ts`：`v-text`。
- `transforms/vModel.ts`：DOM 表单 `v-model` 编译。
- `transforms/vOn.ts`：DOM 事件修饰符编译。
- `transforms/vShow.ts`：`v-show` 编译。
- `transforms/Transition.ts`：`Transition` 相关转换。
- `transforms/stringifyStatic.ts`：静态节点字符串化优化。
- `transforms/validateHtmlNesting.ts`：开发环境 HTML 嵌套校验。
- `transforms/ignoreSideEffectTags.ts`：忽略 `<script>` / `<style>` 等副作用标签。

它的职责不是重新实现编译器，而是给 core 编译器补充 DOM 平台知识。

### `compiler-sfc`

`compiler-sfc` 解决“`.vue` 单文件组件如何拆开、分析和分别编译”的问题。

核心文件：

- `parse.ts`：把 `.vue` 文件解析成 `SFCDescriptor`，包含 template/script/style/custom blocks。
- `compileTemplate.ts`：编译 `<template>`，内部使用 `compiler-dom` 或 SSR compiler。
- `compileScript.ts`：处理 `<script>` 和 `<script setup>`，展开宏并生成组件脚本。
- `script/context.ts`：script 编译上下文。
- `script/defineProps.ts`、`defineEmits.ts`、`defineModel.ts`、`defineExpose.ts`、`defineOptions.ts`、`defineSlots.ts`：`<script setup>` 宏处理。
- `script/resolveType.ts`：从 TypeScript 类型推导 runtime props/emits 等信息。
- `compileStyle.ts`：编译 style，处理 scoped、CSS modules、preprocessor。
- `style/pluginScoped.ts`：scoped CSS 选择器重写。
- `template/transformAssetUrl.ts`：模板资源 URL 转 import。

这个包和构建工具关系更近，比如 Vite 的 Vue 插件会大量使用它。

## 不同包之间的依赖关系

### 运行时依赖链

```text
@vue/shared
  -> @vue/reactivity
      -> @vue/runtime-core
          -> @vue/runtime-dom
              -> vue
```

说明：

- `reactivity` 只依赖 `shared`，所以它可以脱离组件系统独立使用。
- `runtime-core` 依赖 `reactivity`，组件 render effect、computed、watch 都建立在响应式系统上。
- `runtime-dom` 依赖 `runtime-core`，只是提供 DOM host 操作和 DOM 指令。
- `vue` 依赖 `runtime-dom`，作为用户入口重新导出 runtime API。

### 编译器依赖链

```text
@vue/shared
  -> @vue/compiler-core
      -> @vue/compiler-dom
          -> @vue/compiler-sfc
          -> @vue/compiler-ssr
```

说明：

- `compiler-core` 平台无关，负责通用编译流程。
- `compiler-dom` 注入 DOM 平台规则。
- `compiler-sfc` 处理 `.vue` 文件，并调用 DOM/SSR 编译器编译 template。
- `compiler-ssr` 依赖 DOM 编译器能力生成 SSR 分支。

### 用户入口包 `vue`

`vue` 包有两个关键入口：

- `packages/vue/src/runtime.ts`：runtime-only 构建，导出 `@vue/runtime-dom`，不支持运行时模板编译。
- `packages/vue/src/index.ts`：full build，导入 `@vue/compiler-dom`，通过 `registerRuntimeCompiler` 注册运行时模板编译能力，然后导出 `@vue/runtime-dom`。

因此，当用户使用 bundler 默认入口时，通常走 runtime-only；当使用包含 compiler 的构建时，才支持在浏览器中把 template 字符串即时编译成 render 函数。

## 推荐阅读顺序

### 第一轮：建立主干，不追所有细节

1. `shared`
   - 先理解 PatchFlags、ShapeFlags 和常用工具。它们会在 compiler/runtime 中反复出现。

2. `reactivity`
   - 先读 `reactive -> baseHandlers -> dep/effect -> ref -> computed`。
   - 目标是理解依赖如何收集、如何触发、effect 如何重新执行。

3. `runtime-core` 的 VNode 和 scheduler
   - 先读 `vnode.ts` 和 `scheduler.ts`。
   - 目标是理解 Vue 更新的基本数据结构和异步调度模型。

4. `runtime-core` 的 renderer
   - 再读 `renderer.ts`。
   - 不要一开始就逐行读完整文件，先围绕 mount/patch/unmount/component update 建立地图。

5. `runtime-dom`
   - 读 `index.ts`、`nodeOps.ts`、`patchProp.ts`。
   - 目标是理解平台适配层如何把 runtime-core 的 renderer 接到 DOM。

6. `compiler-core`
   - 读 `compile.ts`，再按 `parser -> transform -> codegen` 走。
   - 目标是理解模板如何变成 render function code。

7. `compiler-dom`
   - 读 `index.ts` 和几个 DOM 指令 transform。
   - 目标是理解 DOM 平台如何扩展 core compiler。

8. `compiler-sfc`
   - 最后读 `parse.ts`、`compileScript.ts`、`compileTemplate.ts`、`compileStyle.ts`。
   - 目标是理解 `.vue` 文件如何拆解并喂给 runtime/compiler。

### 第二轮：按问题深入

| 想理解的问题 | 推荐切入点 |
| --- | --- |
| `reactive` 为什么能追踪读取和写入？ | `reactivity/src/reactive.ts`、`baseHandlers.ts`、`dep.ts`、`effect.ts` |
| `ref` 和 `reactive` 的区别是什么？ | `reactivity/src/ref.ts`、`reactivity/src/reactive.ts` |
| 组件为什么会自动更新？ | `runtime-core/src/component.ts`、`renderer.ts`、`scheduler.ts` |
| `patch` 如何 diff children？ | `runtime-core/src/renderer.ts` |
| `createApp().mount()` 做了什么？ | `runtime-dom/src/index.ts`、`runtime-core/src/apiCreateApp.ts` |
| DOM 属性、事件、style 怎么更新？ | `runtime-dom/src/patchProp.ts`、`modules/events.ts`、`modules/style.ts` |
| template 如何生成 render 函数？ | `compiler-core/src/compile.ts`、`parser.ts`、`transform.ts`、`codegen.ts` |
| `v-if` / `v-for` 如何编译？ | `compiler-core/src/transforms/vIf.ts`、`vFor.ts` |
| `v-model` 为什么分 runtime 和 compiler？ | `compiler-dom/src/transforms/vModel.ts`、`runtime-dom/src/directives/vModel.ts` |
| `<script setup>` 宏如何展开？ | `compiler-sfc/src/compileScript.ts`、`script/defineProps.ts`、`script/defineEmits.ts` |
| scoped CSS 如何实现？ | `compiler-sfc/src/compileStyle.ts`、`style/pluginScoped.ts` |

## 第一阶段应该重点看的源码文件

第一阶段目标不是读完所有源码，而是拿到 Vue3 的主链路：

```text
响应式数据
  -> effect 触发组件更新
  -> render 生成 VNode
  -> renderer patch
  -> runtime-dom 操作 DOM
```

建议按下面顺序阅读：

### 1. 共享常量和标志

- `vue3/packages/shared/src/general.ts`
- `vue3/packages/shared/src/patchFlags.ts`
- `vue3/packages/shared/src/shapeFlags.ts`
- `vue3/packages/shared/src/slotFlags.ts`
- `vue3/packages/shared/src/normalizeProp.ts`

阅读目标：

- 看懂源码中大量出现的 `isObject`、`extend`、`EMPTY_OBJ`、`NOOP`。
- 看懂 compiler 生成的 PatchFlags 如何指导 runtime patch。
- 看懂 VNode 的 ShapeFlags 如何表达元素、组件、文本 children、数组 children 等形态。

### 2. 响应式主链路

- `vue3/packages/reactivity/src/reactive.ts`
- `vue3/packages/reactivity/src/baseHandlers.ts`
- `vue3/packages/reactivity/src/dep.ts`
- `vue3/packages/reactivity/src/effect.ts`
- `vue3/packages/reactivity/src/ref.ts`
- `vue3/packages/reactivity/src/computed.ts`

阅读目标：

- `reactive()` 如何创建 Proxy。
- Proxy `get` 时如何 `track`。
- Proxy `set/delete` 时如何 `trigger`。
- `ReactiveEffect` 如何记录和清理依赖。
- `ref.value` 如何接入同一套依赖系统。
- `computed` 如何缓存并在依赖变化后变脏。

### 3. VNode 和调度器

- `vue3/packages/runtime-core/src/vnode.ts`
- `vue3/packages/runtime-core/src/scheduler.ts`

阅读目标：

- VNode 里有哪些字段：`type`、`props`、`children`、`shapeFlag`、`patchFlag`、`dynamicChildren`。
- block tree 的基本作用。
- `queueJob`、`queuePostFlushCb`、`nextTick` 如何把同步触发合并成异步更新。

### 4. 组件实例和组件更新

- `vue3/packages/runtime-core/src/component.ts`
- `vue3/packages/runtime-core/src/componentProps.ts`
- `vue3/packages/runtime-core/src/componentSlots.ts`
- `vue3/packages/runtime-core/src/componentRenderUtils.ts`

阅读目标：

- 组件实例如何创建。
- `setup()` 如何执行，返回值如何处理。
- props、slots 如何初始化。
- render 函数如何执行并产出子树 VNode。
- 组件是否需要更新如何判断。

### 5. Renderer 主流程

- `vue3/packages/runtime-core/src/renderer.ts`

阅读目标：

- `createRenderer()` 接收哪些平台操作。
- `patch()` 如何按 VNode 类型分发。
- element、component、text、fragment 如何 mount/patch。
- children diff 的主要分支是什么。
- 组件更新 effect 如何和 scheduler 连起来。

提示：这个文件很长，第一遍可以只找以下关键词：

- `createRenderer`
- `baseCreateRenderer`
- `patch`
- `processElement`
- `mountElement`
- `patchElement`
- `patchChildren`
- `patchKeyedChildren`
- `processComponent`
- `mountComponent`
- `updateComponent`
- `setupRenderEffect`
- `unmount`

### 6. DOM 平台适配

- `vue3/packages/runtime-dom/src/index.ts`
- `vue3/packages/runtime-dom/src/nodeOps.ts`
- `vue3/packages/runtime-dom/src/patchProp.ts`
- `vue3/packages/runtime-dom/src/modules/events.ts`
- `vue3/packages/runtime-dom/src/modules/style.ts`
- `vue3/packages/runtime-dom/src/modules/class.ts`
- `vue3/packages/runtime-dom/src/modules/attrs.ts`
- `vue3/packages/runtime-dom/src/modules/props.ts`

阅读目标：

- `runtime-dom` 如何把 `nodeOps + patchProp` 传给 `createRenderer`。
- `createApp` 为什么要包装 mount。
- DOM 节点插入、删除、文本设置在哪里发生。
- class/style/event/attr/prop 如何分流更新。

### 7. 编译器最小闭环

- `vue3/packages/compiler-core/src/compile.ts`
- `vue3/packages/compiler-core/src/parser.ts`
- `vue3/packages/compiler-core/src/ast.ts`
- `vue3/packages/compiler-core/src/transform.ts`
- `vue3/packages/compiler-core/src/codegen.ts`
- `vue3/packages/compiler-core/src/transforms/transformElement.ts`
- `vue3/packages/compiler-core/src/transforms/vIf.ts`
- `vue3/packages/compiler-core/src/transforms/vFor.ts`
- `vue3/packages/compiler-core/src/transforms/vOn.ts`
- `vue3/packages/compiler-core/src/transforms/vBind.ts`

阅读目标：

- `baseCompile()` 如何串起整个流程。
- AST 节点类型如何设计。
- transform 如何遍历节点并生成 codegenNode。
- codegen 如何生成 render 函数字符串。
- 常见指令如何被转换成运行时 helper 调用。

### 8. DOM 编译器和 SFC 入门

- `vue3/packages/compiler-dom/src/index.ts`
- `vue3/packages/compiler-dom/src/parserOptions.ts`
- `vue3/packages/compiler-dom/src/transforms/vModel.ts`
- `vue3/packages/compiler-dom/src/transforms/vOn.ts`
- `vue3/packages/compiler-dom/src/transforms/vShow.ts`
- `vue3/packages/compiler-sfc/src/parse.ts`
- `vue3/packages/compiler-sfc/src/compileTemplate.ts`
- `vue3/packages/compiler-sfc/src/compileScript.ts`
- `vue3/packages/compiler-sfc/src/compileStyle.ts`

阅读目标：

- DOM 编译器如何给 core compiler 注入 DOM transform。
- `.vue` 文件如何被拆成 descriptor。
- `<template>` 如何进入 compiler-dom。
- `<script setup>` 宏在哪里处理。
- scoped CSS 和 CSS modules 在哪里处理。

## 一个适合第一次学习的路线图

```text
第 0 步：看根配置
  package.json
  pnpm-workspace.yaml
  tsconfig.json
  scripts/aliases.js

第 1 步：看 shared
  general.ts
  patchFlags.ts
  shapeFlags.ts

第 2 步：看 reactivity
  reactive.ts
  baseHandlers.ts
  dep.ts
  effect.ts
  ref.ts
  computed.ts

第 3 步：看 runtime 的数据结构
  vnode.ts
  scheduler.ts

第 4 步：看组件和 renderer
  component.ts
  componentRenderUtils.ts
  renderer.ts

第 5 步：看 DOM 适配
  runtime-dom/src/index.ts
  nodeOps.ts
  patchProp.ts

第 6 步：看编译器闭环
  compiler-core/src/compile.ts
  parser.ts
  transform.ts
  codegen.ts

第 7 步：看 DOM 编译和 SFC
  compiler-dom/src/index.ts
  compiler-sfc/src/parse.ts
  compileScript.ts
  compileTemplate.ts
```

## 阅读时的几个定位技巧

1. **从入口看导出**
   - 每个核心包的 `src/index.ts` 都是最好的地图。
   - 先看它导出了什么，再反推源码文件职责。

2. **从 `package.json` 看依赖边界**
   - 包依赖比目录名字更可靠。
   - 例如 `runtime-core` 依赖 `reactivity`，但不依赖 `runtime-dom`，说明它是平台无关层。

3. **从测试看行为**
   - 每个包的 `__tests__` 往往比源码更适合作为行为说明书。
   - 例如响应式行为可从 `packages/reactivity/__tests__` 对照源码读。

4. **先读主链路，再读兼容和边缘分支**
   - `compat`、SSR hydration、devtools、HMR、custom element 都可以放到第二阶段。
   - 第一阶段先建立 `reactivity -> runtime-core -> runtime-dom` 和 `compiler-core -> compiler-dom` 两条主线。

5. **把 compiler 和 runtime 对着读**
   - compiler 生成的 helper、PatchFlags、VNode call，最终都服务 runtime patch。
   - 读 `compiler-core` 时遇到 helper，可以回到 `runtime-core/src/index.ts` 或相关 helper 文件找 runtime 实现。

## 总结

Vue3 源码的核心不是单一入口，而是清晰分层：

- `shared` 是底座。
- `reactivity` 是状态变化的驱动系统。
- `runtime-core` 是平台无关的组件和渲染核心。
- `runtime-dom` 是浏览器平台绑定。
- `compiler-core` 是模板编译通用管线。
- `compiler-dom` 是 DOM 编译扩展。
- `compiler-sfc` 是 `.vue` 文件到 template/script/style 编译结果的桥梁。
- `vue` 是面向用户的聚合入口。

第一次学习时，推荐先完成运行时主线，再回头看编译器主线。这样读到 compiler 生成的 render code、PatchFlags 和 helper 调用时，能知道它们最终会如何被 runtime 消费。
