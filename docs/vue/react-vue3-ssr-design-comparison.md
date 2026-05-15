# React SSR 与 Vue3 SSR 源码设计对比

本文从源码设计角度对比 React SSR 与 Vue3 SSR。重点不只是 API 名称，而是两者如何组织服务端渲染、流式输出、客户端 hydration、异步边界和编译优化。

一句话结论：

- React SSR 的核心是 Fizz streaming renderer：围绕运行时调度、Suspense 边界、分段 HTML、选择性 hydration 设计。
- Vue3 SSR 的核心是 compiler-ssr + server-renderer 协作：编译期生成 `ssrRender` 字符串写入逻辑，运行时负责组件执行、buffer / stream 展开和 hydration 接管。

## 1. 参考源码与文档

### React 侧

| 主题 | 位置 |
| --- | --- |
| Node streaming API | [react.dev renderToPipeableStream](https://react.dev/reference/react-dom/server/renderToPipeableStream) |
| Web Streams API | [react.dev renderToReadableStream](https://react.dev/reference/react-dom/server/renderToReadableStream) |
| Client hydration API | [react.dev hydrateRoot](https://react.dev/reference/react-dom/client/hydrateRoot) |
| React 18 SSR / Suspense / selective hydration | [React 18 release blog](https://react.dev/blog/2022/03/29/react-v18) |
| Fizz Node server renderer 源码入口 | `facebook/react/packages/react-dom/src/server/ReactDOMFizzServerNode.js` |
| hydrateRoot 源码入口 | `facebook/react/packages/react-dom/src/client/ReactDOMRoot.js` |
| Fizz 核心实现 | `facebook/react/packages/react-server/src/ReactFizzServer.js` |

### Vue3 侧

| 主题 | 本地源码文件 |
| --- | --- |
| SSR app / hydration app 入口 | `vue3/packages/runtime-dom/src/index.ts` |
| app.mount 分流 | `vue3/packages/runtime-core/src/apiCreateApp.ts` |
| hydration 实现 | `vue3/packages/runtime-core/src/hydration.ts` |
| 服务端字符串渲染 | `vue3/packages/server-renderer/src/render.ts` |
| `renderToString` | `vue3/packages/server-renderer/src/renderToString.ts` |
| stream SSR | `vue3/packages/server-renderer/src/renderToStream.ts` |
| SSR 编译入口 | `vue3/packages/compiler-ssr/src/index.ts` |
| SSR codegen 转换 | `vue3/packages/compiler-ssr/src/ssrCodegenTransform.ts` |
| SFC 编译分流 | `vue3/packages/compiler-sfc/src/compileTemplate.ts` |

## 2. React SSR / Vue3 SSR 对比表

| 对比项 | React SSR | Vue3 SSR |
| --- | --- | --- |
| Node SSR 入口 | `renderToPipeableStream(reactNode, options)` | `renderToString(app)` / `renderToNodeStream(app)` / `pipeToNodeWritable(app)` |
| Web Stream 入口 | `renderToReadableStream(reactNode, options)` | `renderToWebStream(app)` / `pipeToWebWritable(app)` |
| 客户端 hydration | `hydrateRoot(domNode, <App />)` | `createSSRApp(App).mount('#app')` |
| 服务端核心 renderer | Fizz server renderer | `@vue/server-renderer` |
| 服务端渲染单位 | React node / element tree、request、task、segment、Suspense boundary | Vue vnode、component instance、SSR buffer、`ssrRender` |
| HTML 生成方式 | 运行时遍历 React tree，按 host config 输出 HTML chunk | 优先执行编译产物 `ssrRender`，直接 `_push` HTML；无 `ssrRender` 时 fallback 到 `renderVNode` |
| 流式渲染重点 | shell 先出、Suspense fallback 先出、后续内容到达后用脚本替换 fallback | buffer / stream 展开，遇到 async buffer 可等待后继续写出 |
| Suspense SSR | React 18 起正式支持 server Suspense，与 streaming 深度绑定 | 支持 SSR Suspense helper，但主要执行 default content；async setup / serverPrefetch 由 renderer await |
| 异步组件 / 数据 | Suspense 捕获 thenable，把边界拆成可延迟的 segment | `setupComponent(instance, true)` 返回 Promise，server-renderer 等待 async setup 和 `onServerPrefetch` |
| hydration 粒度 | `hydrateRoot` 创建 hydration FiberRoot，事件可驱动优先 hydration，支持 selective hydration | `hydrate -> hydrateNode -> hydrateElement` 深度对齐已有 DOM，逐节点复用和修复 mismatch |
| mismatch 策略 | 要求服务端和客户端内容一致；开发警告；属性差异不保证全部修补；过早 `root.render` 会切到客户端渲染 | 文本 / children / 节点类型 mismatch 有明确局部修复逻辑，必要时 `patch(null, vnode)` 挂载缺失节点 |
| 事件绑定 | 根事件系统接管，hydration root 监听事件并可调度对应边界 hydration | `hydrateElement` 中通过 `patchProp` 给已有 DOM 补 `onXxx` 事件 |
| 编译模型 | JSX 主要编译成 React element 创建调用，SSR 主要依赖运行时 renderer | template 可编译成 `ssrRender(_ctx, _push, _parent, _attrs)`，服务端字符串直出 |
| 设计重点 | runtime scheduling、streaming、Suspense、selective hydration | compile-time optimization、runtime-core 复用、SSR string helpers、确定性 hydration |

## 3. SSR 入口 API 对比

### React

React 现代 SSR 推荐两个 streaming API：

```js
import { renderToPipeableStream } from 'react-dom/server'

const { pipe, abort } = renderToPipeableStream(<App />, {
  bootstrapScripts: ['/main.js'],
  onShellReady() {
    response.setHeader('content-type', 'text/html')
    pipe(response)
  },
  onAllReady() {
    // crawlers / static generation 可以等全部内容完成
  },
  onError(error) {
    console.error(error)
  }
})
```

Web Streams 环境使用：

```js
import { renderToReadableStream } from 'react-dom/server'

const stream = await renderToReadableStream(<App />, {
  bootstrapScripts: ['/main.js']
})

return new Response(stream, {
  headers: { 'content-type': 'text/html' }
})
```

源码设计上，React 的 `renderToPipeableStream` 会创建 Fizz request，然后 `startWork(request)`。真正写入 Node stream 时调用 `pipe(destination)`，内部再 `startFlowing(request, destination)`。

简化链路：

```text
renderToPipeableStream(<App />, options)
  -> createRequestImpl(children, options)
  -> createRequest(...)
  -> startWork(request)
  -> return { pipe, abort }
  -> pipe(destination)
    -> prepareForStartFlowingIfBeforeAllReady(request)
    -> startFlowing(request, destination)
```

### Vue3

Vue3 服务端入口通常是：

```js
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'

const app = createSSRApp(App)
const html = await renderToString(app)
```

源码链路：

```text
renderToString(app, context)
  -> createVNode(app._component, app._props)
  -> vnode.appContext = app._context
  -> app.provide(ssrContextKey, context)
  -> renderComponentVNode(vnode)
  -> unrollBuffer(buffer)
  -> resolveTeleports(context)
  -> return html
```

Stream API 链路：

```text
renderToNodeStream / renderToWebStream / pipeToNodeWritable / pipeToWebWritable
  -> renderToSimpleStream(input, context, stream)
  -> createVNode(app._component, app._props)
  -> renderComponentVNode(vnode)
  -> unrollBuffer(buffer, stream)
  -> stream.push(chunk)
```

Vue3 的 stream 更像是 SSR buffer 的输出方式；React 的 streaming SSR 则是渲染模型本身就围绕 shell、segment、Suspense boundary 设计。

## 4. 客户端 Hydration 入口对比

### React hydrateRoot

React 客户端接管：

```js
import { hydrateRoot } from 'react-dom/client'

hydrateRoot(document.getElementById('root'), <App />)
```

源码设计上，`hydrateRoot` 创建的是 hydration container：

```text
hydrateRoot(container, initialChildren, options)
  -> createHydrationContainer(
       initialChildren,
       null,
       container,
       ConcurrentRoot,
       hydrationCallbacks,
       ...
     )
  -> markContainerAsRoot(root.current, container)
  -> listenToAllSupportedEvents(container)
  -> return ReactDOMHydrationRoot
```

React hydration 进入 Fiber root。它把 server HTML 作为已有 host tree，在后续 Fiber render / commit / event replay 中逐步接管。由于它和 Concurrent Root、事件系统、Suspense boundary 绑定，所以 React 可以做 selective hydration：当用户和某个尚未完成 hydration 的区域交互时，事件能提高对应边界的 hydration 优先级。

### Vue3 createSSRApp().mount()

Vue3 客户端接管：

```js
import { createSSRApp } from 'vue'

createSSRApp(App).mount('#app')
```

源码链路：

```text
runtime-dom createSSRApp
  -> ensureHydrationRenderer()
  -> createHydrationRenderer(rendererOptions)
  -> app.mount(container)
  -> mount(container, true, namespace)
  -> apiCreateApp.mount()
    -> createVNode(rootComponent, rootProps)
    -> hydrate(vnode, container)
```

`hydrate` 进入：

```text
hydrate(vnode, container)
  -> container 为空：patch(null, vnode, container)，完整挂载
  -> container 有 SSR DOM：hydrateNode(container.firstChild, vnode)
  -> flushPostFlushCbs()
  -> container._vnode = vnode
```

Vue3 hydration 更直观：客户端 vnode 树逐层“认领”已有 DOM 节点。`hydrateNode` 根据 vnode 类型分发，元素走 `hydrateElement`，组件分支调用 `mountComponent` 创建实例，再在 `setupRenderEffect` 中 hydrate 组件 subTree。

## 5. 服务端渲染模型对比

### React 如何生成 HTML

React SSR 不是浏览器 DOM patch，也不是预编译字符串函数，而是 Fizz renderer 在服务端运行时遍历 React node tree。

简化模型：

```text
React element tree
  -> Fizz createRequest
  -> request 创建 task / segment
  -> startWork 调度服务端 render work
  -> function component 执行
  -> host element 转成 HTML chunk
  -> Suspense boundary 可先输出 fallback
  -> startFlowing 把已完成 segment 写到 stream
```

React 的核心优势在于它能把“HTML 生成”和“异步边界”统一进运行时调度模型：shell 可以先发，某个 Suspense boundary 未完成时先发 fallback；等内容完成后，再发后续 HTML 和用于替换 fallback 的脚本。

### Vue3 如何生成 HTML

Vue3 SSR 有两条路径：

1. 编译优化路径：组件有 `ssrRender`。
2. fallback 路径：没有 `ssrRender` 时执行普通 render 得到 vnode，再 `renderVNode`。

编译优化路径：

```text
compiler-sfc compileTemplate({ ssr: true })
  -> compiler-ssr compile()
  -> ssrCodegenTransform()
  -> 生成 ssrRender(_ctx, _push, _parent, _attrs)

server-renderer
  -> renderComponentVNode()
  -> setupComponent(instance, true)
  -> renderComponentSubTree()
  -> ssrRender(instance.proxy, push, instance, attrs, ...)
  -> push HTML 到 SSRBuffer
```

fallback 路径：

```text
renderComponentSubTree()
  -> renderComponentRoot(instance)
  -> renderVNode(push, instance.subTree)
  -> renderElementVNode / renderComponentVNode / renderVNodeChildren
```

Vue3 的核心优势在于 template 已经知道 HTML 结构，SSR 编译可以直接生成字符串拼接逻辑，减少运行时 vnode 创建与遍历成本。

## 6. 组件执行差异

### React function component

React function component 在 SSR 中会被服务端 renderer 调用：

```text
function App(props) {
  const value = useMemo(...)
  return <div>{value}</div>
}
```

服务端执行的是 render phase：

- function component 会运行并返回 React element。
- Hooks 使用服务端 dispatcher。
- `useEffect` / `useLayoutEffect` 这类依赖 DOM commit 的副作用不会在服务端执行。
- 如果组件在 Suspense 数据模型下 suspend，Fizz 会把当前边界交给 Suspense 逻辑处理。

React SSR 的组件执行模型更接近“运行 React 的渲染阶段”，重点是保持组件纯函数和可中断 / 可恢复的运行时模型。

### Vue3 setup

Vue3 SSR 中组件会创建实例并执行 setup：

```text
renderComponentVNode(vnode)
  -> createComponentInstance(vnode, parent, null)
  -> setupComponent(instance, true)
  -> setupStatefulComponent(instance, true)
  -> call setup(props, setupContext)
```

`setupComponent(instance, true)` 会设置 SSR setup 状态。这个状态会影响生命周期注册：

- `onServerPrefetch` 可以注册。
- `onMounted`、`onUpdated`、`onUnmounted` 等 post-create hooks 在 SSR setup 期间 no-op。

async setup 的处理也很直接：

```text
setup 返回 Promise
  -> isSSR 为 true
  -> setupComponent 返回 Promise
  -> server-renderer await
  -> handleSetupResult
  -> renderComponentSubTree
```

Vue3 SSR 的组件模型更接近“完整创建 Vue component instance，但只执行服务端需要的阶段”。

## 7. 异步能力对比

| 异步主题 | React SSR | Vue3 SSR |
| --- | --- | --- |
| 主要抽象 | Suspense boundary | async setup、`onServerPrefetch`、Suspense |
| 服务端等待方式 | Fizz request / task 遇到 suspend，把 boundary 拆成 segment | `renderComponentVNode` 等待 async setup 和 `instance.sp` |
| fallback 输出 | Suspense fallback 可以先进入 shell / stream | SSR Suspense helper 主要渲染 default slot；无 content 时输出注释 |
| 内容完成后 | React 发送后续 HTML 和脚本替换 fallback | async buffer resolve 后继续 unroll / push |
| 设计倾向 | 异步是 streaming SSR 架构的一等公民 | 异步更偏组件级等待与 buffer 展开 |

React 的 Suspense SSR 目标是“即使部分内容没准备好，shell 也能先到浏览器”。Vue3 SSR 的 async setup 目标更偏“组件渲染前把该等的数据等完”，再输出一致的 HTML。

## 8. 流式渲染对比

### React streaming SSR

React streaming 的关键概念是 shell 和 Suspense boundary。

```text
renderToPipeableStream(<App />, {
  onShellReady() {
    pipe(response)
  },
  onAllReady() {
    // 所有 Suspense boundary 完成
  }
})
```

当某个 Suspense boundary 尚未完成时，React 可以先发送 fallback；内容完成后，React 再发送额外 HTML 与脚本，把 fallback 替换成真实内容。

这套模型的价值是：

- TTFB 可以更早。
- 不必等待整棵树数据完成。
- Suspense boundary 既是服务端 streaming 单元，也是客户端 selective hydration 单元。

### Vue3 stream SSR

Vue3 stream 的入口是：

```text
renderToSimpleStream(input, context, stream)
  -> renderComponentVNode(vnode)
  -> unrollBuffer(buffer, stream)
  -> stream.push(content)
```

`createBuffer` 中的 item 可以是：

- 字符串。
- 子 buffer。
- Promise resolve 后的 async buffer。

`unrollBuffer` 会在展开时遇到 Promise 就等待，然后继续写 stream。

Vue3 也能 stream 输出，但它没有 React Fizz 那种“fallback 先出、真实内容后续用脚本替换”的强绑定模型。Vue3 更强调 SSR 输出与 hydration 结构稳定；React 更强调利用 Suspense 把页面拆成可渐进交付的 segment。

## 9. Hydration 机制对比

### React selective hydration

React hydration 的核心在 Fiber root：

```text
hydrateRoot(container, <App />)
  -> createHydrationContainer(...)
  -> listenToAllSupportedEvents(container)
  -> 建立 hydration FiberRoot
  -> 根据调度、事件和 Suspense boundary 渐进 hydration
```

selective hydration 的意义是：不是必须从根到叶一次性同步完成所有 hydration。React 可以结合事件优先级和 Suspense boundary，让用户正在交互的部分优先完成接管。

这背后依赖 React 的运行时调度体系：

- Concurrent Root。
- Fiber lanes / priority。
- Event replay。
- Suspense boundary。
- hydration callbacks / recoverable errors。

### Vue3 hydrateNode / hydrateElement

Vue3 hydration 的核心是递归匹配：

```text
hydrateNode(node, vnode)
  -> Text / Comment / Static / Fragment
  -> Element: hydrateElement(el, vnode)
  -> Component: mountComponent(vnode with existing el)
  -> Teleport / Suspense
```

`hydrateElement` 做三件事：

1. 复用已有 DOM 元素。
2. hydrate children。
3. patch 必要 props，尤其是 event listener。

事件补齐逻辑：

```text
isOn(key) && !isReservedProp(key)
  -> patchProp(el, key, null, props[key], ..., parentComponent)
```

mismatch 处理：

```text
文本不一致 -> 修改 textContent / data
children 多了 -> remove 多余 DOM
children 少了 -> patch(null, missingVNode)
节点类型不一致 -> remove old node + patch new vnode
```

Vue3 hydration 更像“确定性 DOM 认领算法”。它不是以调度优先级为核心，而是以 vnode 与 DOM 的结构对齐为核心。

## 10. 编译优化对比

### React JSX 运行时模型

React JSX 通常编译成 React element 创建调用：

```jsx
<div className="box">{msg}</div>
```

大致变成：

```js
jsx("div", {
  className: "box",
  children: msg
})
```

SSR 时，React runtime 仍然需要解释这个 element tree。React 的优化重心不在“把模板预编译成 SSR 字符串函数”，而在运行时调度、streaming、Suspense、hydration 优先级。

### Vue3 compiler-ssr / ssrRender

Vue3 template 在 SSR 模式下会编译成：

```js
function ssrRender(_ctx, _push, _parent, _attrs) {
  _push(`<div class="box">${_ssrInterpolate(_ctx.msg)}</div>`)
}
```

调用链：

```text
compileTemplate({ ssr: true })
  -> compiler-ssr compile()
  -> baseParse()
  -> SSR transform
  -> ssrCodegenTransform()
  -> generate()
```

这就是 Vue3 SSR 和 React SSR 的关键分叉：

- React：同一套 element / component runtime 负责解释 UI。
- Vue3：template compiler 为 SSR 生成专用函数，server-renderer 执行函数。

## 11. 服务端渲染调用链对比

### React

```text
renderToPipeableStream(<App />, options)
  -> createRequestImpl(children, options)
  -> createRequest(...)
  -> startWork(request)
  -> 执行 function component / class component render
  -> 遇到 host element 生成 HTML chunk
  -> 遇到 Suspense 拆出 boundary / segment
  -> onShellReady()
  -> pipe(response)
  -> startFlowing(request, destination)
```

### Vue3

```text
renderToString(createSSRApp(App))
  -> createVNode(app._component, app._props)
  -> renderComponentVNode(rootVNode)
  -> createComponentInstance()
  -> setupComponent(instance, true)
  -> await async setup / serverPrefetch
  -> renderComponentSubTree()
  -> ssrRender(...) 或 renderVNode(...)
  -> createBuffer()
  -> unrollBuffer()
  -> html string
```

## 12. Hydration 调用链对比

### React

```text
hydrateRoot(container, <App />)
  -> createHydrationContainer(initialChildren, ..., container, ConcurrentRoot, ...)
  -> markContainerAsRoot(root.current, container)
  -> listenToAllSupportedEvents(container)
  -> 返回 ReactDOMHydrationRoot
  -> 后续由 Fiber render / commit / event replay 渐进接管 DOM
```

### Vue3

```text
createSSRApp(App).mount('#app')
  -> ensureHydrationRenderer()
  -> mount(container, true)
  -> createVNode(rootComponent, rootProps)
  -> hydrate(vnode, container)
  -> hydrateNode(container.firstChild, vnode)
  -> hydrateElement / mountComponent / Teleport / Suspense
  -> vnode.el = existing DOM
  -> patchProp 补事件
  -> container._vnode = vnode
```

## 13. 源码设计差异

### 13.1 React SSR 是运行时优先

React 不假设你的 UI 来自 template。JSX 本质上还是 JavaScript 表达能力，组件可以任意组合。SSR renderer 必须在运行时解释 React node tree。

这带来的设计结果：

- SSR 与客户端 Fiber / 并发调度理念保持一致。
- Suspense boundary 是服务端 streaming 和客户端 hydration 的共同分割点。
- 运行时可以根据事件、优先级、边界状态做 selective hydration。
- 编译优化不是 SSR 的必要前提。

### 13.2 Vue3 SSR 是编译 + 运行时协作

Vue3 template 有明确的静态结构，因此可以在编译期知道：

- 哪些标签是静态 HTML。
- 哪些属性需要 escape。
- 哪些 children 能直接拼接。
- 哪些组件 / slot / v-if / v-for 需要 runtime helper。

这带来的设计结果：

- `compiler-ssr` 生成专门的 `ssrRender`。
- `server-renderer` 执行 `ssrRender` 并维护 buffer。
- `runtime-core` 仍然复用组件实例、setup、slots、appContext。
- hydration 使用 vnode 和 DOM 的结构匹配，不依赖复杂的 Fiber 优先级调度。

### 13.3 React 更强在渐进交付，Vue3 更强在确定性输出

React SSR 的问题意识是：

```text
页面很大，数据异步很多，能不能先把 shell 发给用户？
用户先点某个还没 hydration 的区域，能不能优先接管那里？
```

Vue3 SSR 的问题意识是：

```text
template 结构已知，能不能直接生成更少运行时成本的 HTML？
服务端 HTML 和客户端 vnode 如何稳定一致地接管？
```

这不是简单的谁更好，而是设计目标不同。

## 14. 面试高频问题总结

### 1. React SSR 和 Vue3 SSR 的最大区别是什么？

React SSR 更偏运行时 streaming renderer；Vue3 SSR 更偏编译期生成 `ssrRender`，运行时执行字符串写入函数。React 的强项是 Suspense streaming 和 selective hydration；Vue3 的强项是 template 编译优化和确定性 hydration。

### 2. React 的 renderToPipeableStream 和 Vue3 的 renderToNodeStream 是同一种东西吗？

不是。它们都是 stream API，但 React 的 stream 模型和 Suspense boundary 深度绑定，能先输出 shell 和 fallback，再流式补齐内容。Vue3 的 stream 更偏把 SSR buffer 展开到 Node/Web stream。

### 3. React hydrateRoot 和 Vue3 createSSRApp().mount 有什么区别？

React `hydrateRoot` 创建 hydration FiberRoot，并绑定事件系统，后续可结合 Concurrent Root 做 selective hydration。Vue3 `createSSRApp().mount` 进入 hydration renderer，调用 `hydrateNode` 递归匹配 vnode 和已有 DOM。

### 4. React SSR 中 function component 会执行吗？

会。React SSR 会执行 function component 的 render phase，让它返回 React element。依赖 DOM commit 的 effects 不在服务端执行。

### 5. Vue3 SSR 中 setup 会执行吗？

会。Vue3 server-renderer 在 `renderComponentVNode` 中创建组件实例，并调用 `setupComponent(instance, true)`。如果 setup 返回 Promise，server-renderer 会 await 后再渲染子树。

### 6. 两者如何处理异步？

React 主要依靠 Suspense 把异步边界纳入 streaming renderer。Vue3 主要通过 async setup / `onServerPrefetch` 在组件渲染前等待，SSR Suspense helper 参与 slot 渲染，但不是 React Fizz 那种 segment replacement 模型。

### 7. hydration mismatch 有什么差异？

React 官方要求服务端和客户端输出一致，开发模式会警告，属性差异不保证全部修补。Vue3 的 `hydrateElement` / `handleMismatch` 有更显式的局部修复路径，例如修正文本文本、删除多余节点、挂载缺失节点或替换节点。

### 8. 为什么 Vue3 SSR 需要 compiler-ssr？

因为 Vue template 的静态结构可以被提前分析。`compiler-ssr` 能把 template 编译成直接 `_push` HTML 的 `ssrRender`，减少服务端运行时创建 vnode 和遍历 vnode 的成本。

### 9. 为什么 React 不像 Vue3 一样生成 ssrRender？

React 的 UI 模型是 JavaScript / JSX，运行时表达能力更开放。React 的优化重心放在 Fiber / Fizz / Suspense / scheduler 这些运行时能力上，而不是依赖 template 静态结构。

### 10. 面试中如何一句话概括？

React SSR 是“运行时调度驱动的 streaming SSR”；Vue3 SSR 是“编译优化驱动的字符串 SSR + 运行时 hydration”。前者重在渐进渲染和选择性接管，后者重在模板静态分析、低成本字符串生成和确定性 DOM 复用。

## 15. 总结

React SSR 和 Vue3 SSR 都不会在服务端创建真实 DOM，但它们走向不同。

React 把 SSR 视为运行时调度问题：如何在异步数据、Suspense、streaming、用户交互和 hydration 之间建立统一模型。所以 React 的核心是 Fizz request / segment / boundary，以及客户端 Fiber hydration。

Vue3 把 SSR 视为编译与运行时协作问题：template 结构能提前变成 `ssrRender`，运行时只需要执行 setup、处理 async、调用 helper、输出 buffer，再让客户端 `hydrateNode` 精确接管 DOM。

学习时可以这样记：

```text
React SSR：React tree -> Fizz runtime -> stream segments -> hydrateRoot selective hydration
Vue3 SSR：Vue template -> compiler-ssr -> ssrRender -> SSRBuffer -> createSSRApp hydration
```
