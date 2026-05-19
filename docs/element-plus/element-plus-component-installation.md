# Element Plus 组件注册和安装机制分析

## 1. 核心结论

Element Plus 把组件注册统一抽象成 Vue 插件机制。

它有两层安装能力：

1. **全量安装**：`app.use(ElementPlus)`，一次性注册所有组件、指令型插件、服务型插件，并注入全局配置。
2. **单组件安装**：`app.use(ElButton)` 或 `app.use(ElTable)`，只注册某个组件以及它的附属子组件。

这两层能力的关键都在于：给对象挂上符合 Vue 插件规范的 `install(app)` 方法。

核心链路：

```text
packages/components/button/src/button.vue
  ↓
packages/components/button/index.ts
  ↓ withInstall(Button, { ButtonGroup })
ElButton.install = (app) => app.component(...)
  ↓
packages/components/index.ts
  ↓
packages/element-plus/index.ts
  ↓
用户 import { ElButton } from 'element-plus'
```

全量安装链路：

```text
packages/element-plus/component.ts
packages/element-plus/plugin.ts
  ↓
packages/element-plus/defaults.ts
  ↓ makeInstaller([...Components, ...Plugins])
ElementPlus.install = (app, options) => {
  components.forEach((c) => app.use(c))
  provideGlobalConfig(options)
}
  ↓
app.use(ElementPlus)
```

## 2. packages/element-plus/index.ts 的作用

源码：

```ts
import installer from './defaults'

export * from '@element-plus/components'
export * from '@element-plus/constants'
export * from '@element-plus/directives'
export * from '@element-plus/hooks'
export * from './make-installer'

export const install = installer.install
export const version = installer.version
export default installer

export { default as dayjs } from 'dayjs'
```

文件位置：

```text
element-plus-dev/packages/element-plus/index.ts
```

它是 `element-plus` 主包的源码入口，承担四个职责。

### 2.1 导出默认插件对象

```ts
export default installer
```

这使用户可以：

```ts
import ElementPlus from 'element-plus'

app.use(ElementPlus)
```

这里的 `ElementPlus` 本质上是 `makeInstaller` 返回的对象：

```ts
{
  version,
  install
}
```

### 2.2 导出具名 install 和 version

```ts
export const install = installer.install
export const version = installer.version
```

这让主包本身也具备类似插件入口的导出形态。

### 2.3 重新导出组件、常量、指令、hooks

```ts
export * from '@element-plus/components'
export * from '@element-plus/constants'
export * from '@element-plus/directives'
export * from '@element-plus/hooks'
```

这就是用户可以按需写下面代码的原因：

```ts
import { ElButton, ElTable, useNamespace } from 'element-plus'
```

`ElButton` 实际来自 `@element-plus/components/button`，但被 `packages/element-plus/index.ts` 重新导出后，用户只需要面向 `element-plus` 主包。

### 2.4 额外导出 dayjs

```ts
export { default as dayjs } from 'dayjs'
```

这让 Element Plus 内部使用的 `dayjs` 也能从主包暴露给用户。

## 3. makeInstaller 的实现逻辑

源码：

```ts
import { provideGlobalConfig } from '@element-plus/components/config-provider'
import { INSTALLED_KEY } from '@element-plus/constants'
import { version } from './version'

import type { App, Plugin } from 'vue'
import type { ConfigProviderContext } from '@element-plus/components/config-provider'

export const makeInstaller = (components: Plugin[] = []) => {
  const install = (app: App, options?: ConfigProviderContext) => {
    if (app[INSTALLED_KEY]) return

    app[INSTALLED_KEY] = true
    components.forEach((c) => app.use(c))

    if (options) provideGlobalConfig(options, app, true)
  }

  return {
    version,
    install,
  }
}
```

文件位置：

```text
element-plus-dev/packages/element-plus/make-installer.ts
```

### 3.1 输入：Plugin 数组

```ts
export const makeInstaller = (components: Plugin[] = []) => {}
```

这里的 `components` 虽然命名叫 components，但类型是 Vue 的 `Plugin[]`。

这很重要：传进来的不只是真正的 Vue 组件，也包括：

- 普通组件：`ElButton`、`ElTable`、`ElInput`
- 组件子项：`ElButtonGroup`、`ElTableColumn`
- 指令型插件：`ElInfiniteScroll`、`ElPopoverDirective`
- 服务型插件：`ElMessage`、`ElNotification`、`ElMessageBox`

这些对象只要具备 `install` 方法，就能被 `app.use()` 消费。

### 3.2 防止重复安装

```ts
if (app[INSTALLED_KEY]) return

app[INSTALLED_KEY] = true
```

`INSTALLED_KEY` 定义在：

```ts
export const INSTALLED_KEY = Symbol('INSTALLED_KEY')
```

也就是：

```text
element-plus-dev/packages/constants/key.ts
```

作用是给 Vue app 实例打一个私有 Symbol 标记，避免同一个 app 多次执行 Element Plus 全量安装。

### 3.3 遍历所有插件并安装

```ts
components.forEach((c) => app.use(c))
```

这一句是全量安装的核心。

它不是直接调用 `app.component()`，而是调用每个组件或插件自己的 `install`。

这样每个条目可以拥有自己的安装策略：

- SFC 组件通过 `withInstall` 注册 `app.component()`。
- 子组件通过 `withNoopInstall` 在全量列表里保持插件形态，但不重复注册。
- 函数服务通过 `withInstallFunction` 挂到 `app.config.globalProperties`。
- 指令通过 `withInstallDirective` 注册 `app.directive()`。

### 3.4 注入全局配置

```ts
if (options) provideGlobalConfig(options, app, true)
```

用户全量安装时可以传配置：

```ts
app.use(ElementPlus, {
  size: 'large',
  zIndex: 3000,
})
```

`makeInstaller` 会把这些配置交给 `ConfigProvider` 的全局配置逻辑。

### 3.5 返回 Vue 插件对象

```ts
return {
  version,
  install,
}
```

Vue 插件可以是一个函数，也可以是一个带 `install` 方法的对象。Element Plus 返回的是对象型插件。

## 4. defaults.ts、component.ts、plugin.ts 如何组织全量安装

`packages/element-plus/defaults.ts`：

```ts
import { makeInstaller } from './make-installer'
import Components from './component'
import Plugins from './plugin'

export default makeInstaller([...Components, ...Plugins])
```

它把组件列表和插件列表合并，然后交给 `makeInstaller`。

### 4.1 component.ts

`packages/element-plus/component.ts` 显式导入所有组件：

```ts
import { ElButton, ElButtonGroup } from '@element-plus/components/button'
import { ElTable, ElTableColumn } from '@element-plus/components/table'
```

然后放入数组：

```ts
export default [
  ElButton,
  ElButtonGroup,
  ElTable,
  ElTableColumn,
  // ...
] as Plugin[]
```

这份数组就是全量安装时要执行 `app.use(c)` 的组件清单。

### 4.2 plugin.ts

`packages/element-plus/plugin.ts` 管理非普通组件类插件：

```ts
import { ElInfiniteScroll } from '@element-plus/components/infinite-scroll'
import { ElLoading } from '@element-plus/components/loading'
import { ElMessage } from '@element-plus/components/message'
import { ElMessageBox } from '@element-plus/components/message-box'
import { ElNotification } from '@element-plus/components/notification'
import { ElPopoverDirective } from '@element-plus/components/popover'

export default [
  ElInfiniteScroll,
  ElLoading,
  ElMessage,
  ElMessageBox,
  ElNotification,
  ElPopoverDirective,
] as Plugin[]
```

这里体现了 Element Plus 的统一模型：组件、服务、指令都尽量变成 Vue Plugin，再由安装器统一处理。

## 5. withInstall / withNoopInstall 的实现逻辑

源码位置：

```text
element-plus-dev/packages/utils/vue/install.ts
```

### 5.1 withInstall

源码：

```ts
export const withInstall = <T, E extends Record<string, any>>(
  main: T,
  extra?: E
) => {
  ;(main as SFCWithInstall<T>).install = (app): void => {
    for (const comp of [main, ...Object.values(extra ?? {})]) {
      app.component(comp.name, comp)
    }
  }

  if (extra) {
    for (const [key, comp] of Object.entries(extra)) {
      ;(main as any)[key] = comp
    }
  }
  withPropsDefaultsSetter(main)
  return main as SFCWithInstall<T> & E
}
```

它做了四件事。

第一，给主组件挂 `install`：

```ts
main.install = (app) => {
  for (const comp of [main, ...Object.values(extra ?? {})]) {
    app.component(comp.name, comp)
  }
}
```

这让组件对象本身变成 Vue 插件。

第二，注册主组件和附属组件：

```ts
[main, ...Object.values(extra ?? {})]
```

例如 Button 的 `extra` 是 `ButtonGroup`，Table 的 `extra` 是 `TableColumn`。执行 `app.use(ElButton)` 时，会同时注册：

- `ElButton`
- `ElButtonGroup`

执行 `app.use(ElTable)` 时，会同时注册：

- `ElTable`
- `ElTableColumn`

第三，把附属组件挂到主组件对象上：

```ts
main.ButtonGroup = ButtonGroup
main.TableColumn = TableColumn
```

这样库内部和用户侧都可以通过主组件访问附属组件。

第四，注入 `setPropsDefaults` 能力：

```ts
withPropsDefaultsSetter(main)
```

这让组件对象可以被设置 props 默认值。它不是注册机制的核心，但属于 Element Plus 对组件对象的增强能力。

### 5.2 withNoopInstall

源码：

```ts
export const withNoopInstall = <T>(component: T) => {
  ;(component as SFCWithInstall<T>).install = NOOP
  withPropsDefaultsSetter(component)
  return component as SFCWithInstall<T>
}
```

它给组件挂一个空的 `install`。

为什么需要空安装？

以 Button 为例：

```ts
export const ElButton = withInstall(Button, {
  ButtonGroup,
})
export const ElButtonGroup = withNoopInstall(ButtonGroup)
```

`ElButton.install(app)` 已经会同时注册 `Button` 和 `ButtonGroup`。

但是 `component.ts` 里全量安装数组又包含：

```ts
ElButton,
ElButtonGroup,
```

如果 `ElButtonGroup.install` 再注册一次，就会重复。于是 `withNoopInstall` 让它保持插件类型，但实际安装为空操作。

换句话说：

- 主组件：负责安装自己和附属组件。
- 附属组件：可以被具名导出，但全量安装时不重复注册。

## 6. 单个组件如何变成可以 app.use() 或按需 import 的组件

以 `ElButton` 为例。

### 6.1 原始 SFC

源码组件：

```text
packages/components/button/src/button.vue
```

它本质是一个 Vue 组件对象。

### 6.2 组件入口包装

`packages/components/button/index.ts`：

```ts
import { withInstall, withNoopInstall } from '@element-plus/utils'
import Button from './src/button.vue'
import ButtonGroup from './src/button-group.vue'

export const ElButton = withInstall(Button, {
  ButtonGroup,
})
export const ElButtonGroup = withNoopInstall(ButtonGroup)
export default ElButton
```

包装后：

```ts
ElButton.install = (app) => {
  app.component('ElButton', Button)
  app.component('ElButtonGroup', ButtonGroup)
}
```

所以单组件安装成立：

```ts
import { ElButton } from 'element-plus'

app.use(ElButton)
```

### 6.3 进入 components 总入口

`packages/components/index.ts`：

```ts
export * from './button'
```

### 6.4 被 element-plus 主入口重新导出

`packages/element-plus/index.ts`：

```ts
export * from '@element-plus/components'
```

所以按需 import 成立：

```ts
import { ElButton } from 'element-plus'
```

### 6.5 样式按需入口

Button 的 CSS 入口：

```ts
import '@element-plus/components/base/style/css'
import '@element-plus/theme-chalk/el-button.css'
```

对应文件：

```text
packages/components/button/style/css.ts
```

用户按需使用时通常还需要引入样式：

```ts
import { ElButton } from 'element-plus'
import 'element-plus/es/components/button/style/css'
```

或者通过自动导入插件自动处理组件和样式。

## 7. 为什么组件库要把 install 挂到组件对象上

这是组件库常见设计，Element Plus 在这里的收益很明确。

### 7.1 兼容 Vue 插件机制

Vue 的 `app.use(plugin)` 会消费插件的 `install(app, ...options)`。

把 `install` 挂到组件对象上后，组件对象本身就成为插件：

```ts
app.use(ElButton)
```

这比要求用户手动写：

```ts
app.component(ElButton.name, ElButton)
```

更统一。

### 7.2 同时支持全量安装和单组件安装

同一个 `ElButton` 对象可以用于两种场景：

```ts
app.use(ElementPlus)
app.use(ElButton)
```

全量安装时，`ElementPlus.install` 内部也是遍历调用：

```ts
components.forEach((c) => app.use(c))
```

所以全量安装没有另写一套组件注册逻辑，而是复用每个组件自己的 `install`。

### 7.3 组件可以声明自己的附属组件

`ElButton` 知道自己应该一起注册 `ElButtonGroup`。

`ElTable` 知道自己应该一起注册 `ElTableColumn`。

这让关系更靠近组件本身，而不是全部堆在全量安装器里硬编码。

### 7.4 类型层面更清晰

`SFCWithInstall<T>` 定义为：

```ts
export type SFCWithInstall<T> = T & ObjectPlugin & SFCWithPropsDefaultsSetter<T>
```

也就是组件类型加上 Vue `ObjectPlugin` 能力，再加上 Element Plus 自己的 props 默认值设置能力。

## 8. Vue 插件机制在这里是如何使用的

Vue 插件机制的核心约定是：

```ts
app.use(plugin)
```

如果 `plugin` 是带 `install` 方法的对象，Vue 会调用：

```ts
plugin.install(app, ...options)
```

Element Plus 基于这个约定做了分层：

### 8.1 主包是插件

`packages/element-plus/index.ts` 默认导出 `installer`：

```ts
export default installer
```

所以：

```ts
app.use(ElementPlus)
```

会执行：

```ts
ElementPlus.install(app, options)
```

### 8.2 单组件也是插件

`withInstall(Button)` 后：

```ts
ElButton.install(app)
```

所以：

```ts
app.use(ElButton)
```

会注册 `ElButton` 和 `ElButtonGroup`。

### 8.3 指令也是插件

`withInstallDirective` 的逻辑是：

```ts
directive.install = (app) => {
  app.directive(name, directive)
}
```

所以指令也可以被 `app.use()` 安装。

### 8.4 函数服务也是插件

`withInstallFunction` 的逻辑是：

```ts
fn.install = (app) => {
  fn._context = app._context
  app.config.globalProperties[name] = fn
}
```

这类机制适合 `ElMessage`、`ElNotification` 这类服务型 API。

## 9. ElButton 完整链路示例

### 9.1 源码组件

```text
packages/components/button/src/button.vue
packages/components/button/src/button-group.vue
```

### 9.2 组件入口包装

```ts
export const ElButton = withInstall(Button, {
  ButtonGroup,
})

export const ElButtonGroup = withNoopInstall(ButtonGroup)
```

效果近似于：

```ts
ElButton.install = (app) => {
  app.component('ElButton', Button)
  app.component('ElButtonGroup', ButtonGroup)
}

ElButton.ButtonGroup = ButtonGroup
ElButtonGroup.install = () => {}
```

### 9.3 被 components 包导出

```ts
export * from './button'
```

### 9.4 被主包 element-plus 重新导出

```ts
export * from '@element-plus/components'
```

### 9.5 用户按需使用

```ts
import { ElButton } from 'element-plus'
import 'element-plus/es/components/button/style/css'

app.use(ElButton)
```

或者在局部组件中直接使用：

```ts
import { ElButton } from 'element-plus'
```

### 9.6 用户全量使用

```ts
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'

app.use(ElementPlus)
```

全量安装内部会执行：

```ts
app.use(ElButton)
app.use(ElButtonGroup)
```

其中 `ElButton` 负责真正注册 Button 和 ButtonGroup；`ElButtonGroup` 的安装是空操作，避免重复。

## 10. ElTable 完整链路示例

`packages/components/table/index.ts`：

```ts
import { withInstall, withNoopInstall } from '@element-plus/utils'
import Table from './src/table.vue'
import TableColumn from './src/tableColumn'

export const ElTable = withInstall(Table, {
  TableColumn,
})
export default ElTable
export const ElTableColumn = withNoopInstall(TableColumn)
```

效果近似于：

```ts
ElTable.install = (app) => {
  app.component('ElTable', Table)
  app.component('ElTableColumn', TableColumn)
}

ElTable.TableColumn = TableColumn
ElTableColumn.install = () => {}
```

用户按需：

```ts
import { ElTable, ElTableColumn } from 'element-plus'
import 'element-plus/es/components/table/style/css'

app.use(ElTable)
```

注意：`app.use(ElTable)` 已经会注册 `ElTableColumn`，所以通常不需要再 `app.use(ElTableColumn)`。

Table 的样式入口还会引入依赖组件样式：

```ts
import '@element-plus/components/base/style/css'
import '@element-plus/theme-chalk/el-table.css'
import '@element-plus/components/checkbox/style/css'
import '@element-plus/components/tooltip/style/css'
import '@element-plus/components/scrollbar/style/css'
```

这说明复杂组件的按需样式不只包含自己的 CSS，也会包含内部依赖组件的 CSS。

## 11. 简化版 withInstall 实现

下面是一个去掉类型增强、默认 props 设置等复杂能力后的最小版实现。

```ts
import type { App, Component } from 'vue'

type ComponentWithInstall<T> = T & {
  install(app: App): void
}

export function withInstall<T extends Component>(
  component: T,
  extra?: Record<string, Component>
): ComponentWithInstall<T> {
  const main = component as ComponentWithInstall<T>

  main.install = (app: App) => {
    const components = [component, ...Object.values(extra ?? {})]

    components.forEach((item) => {
      if (item.name) {
        app.component(item.name, item)
      }
    })
  }

  if (extra) {
    Object.entries(extra).forEach(([key, item]) => {
      ;(main as any)[key] = item
    })
  }

  return main
}

export function withNoopInstall<T extends Component>(
  component: T
): ComponentWithInstall<T> {
  const main = component as ComponentWithInstall<T>

  main.install = () => {}

  return main
}
```

使用示例：

```ts
import Button from './button.vue'
import ButtonGroup from './button-group.vue'

export const ElButton = withInstall(Button, {
  ButtonGroup,
})

export const ElButtonGroup = withNoopInstall(ButtonGroup)
```

## 12. 总结

Element Plus 的注册安装机制可以概括为：

```text
Vue SFC
  ↓ withInstall
带 install 的组件插件
  ↓ components/index.ts
组件包统一导出
  ↓ element-plus/index.ts
主包重新导出
  ↓ 用户 import
按需使用
```

以及：

```text
所有组件插件 + 指令插件 + 服务插件
  ↓ makeInstaller
ElementPlus 插件对象
  ↓ app.use(ElementPlus)
全量注册
```

关键设计点：

- `withInstall` 让单组件变成 Vue 插件。
- `withNoopInstall` 让附属组件保持插件类型但避免重复注册。
- `makeInstaller` 让主包变成 Vue 插件。
- `packages/element-plus/index.ts` 同时提供全量安装入口和按需导出入口。
- Vue 的 `app.use()` 是贯穿全量安装、单组件安装、指令安装、函数服务安装的统一机制。

