<div align="center">

[![npm version](https://img.shields.io/npm/v/%40byte.n%2Fscroll-frame-canvas.svg?style=flat&color=blue)](https://www.npmjs.com/package/@byte.n/scroll-frame-canvas)

</div>

## scroll-frame-canvas

一个基于滚动条驱动的 Canvas 帧序列渲染器。支持超大序列的渐进式加载（分层预取）、OffscreenCanvas 预渲染、`contain/cover/fill` 缩放、滚动轴映射、自定义加载动画与事件回调，适用于产品页沉浸式滚动动画、分镜头切换与高分辨率影像浏览。

### 功能特性
- 渐进式加载：通过 `large.factor` 分层取样，先快后全，体验流畅
- OffscreenCanvas 预渲染：将图片转换为 `ImageBitmap`，渲染更高效
- 任意滚动轴：`x` 或 `y`，由 `frameMapper` 精确映射到帧索引
- 多种缩放：`contain` / `cover` / `fill`
- 事件系统：`frame`、`complete`、`initComplete`、`error`
- 自定义加载动画：主加载与背景层加载均可自定义绘制
- 并发控制与重试：`maxConcurrentLoads` 

文档 & Demo：https://byte-n.github.io/scroll-frame-canvas/

---


### 安装

```bash
pnpm add @byte.n/scroll-frame-canvas
# 或
npm i @byte.n/scroll-frame-canvas
# 或
yarn add @byte.n/scroll-frame-canvas
```

### 快速开始

```ts
import ScrollFrameCanvas from '@byte.n/scroll-frame-canvas'

const canvas = document.querySelector('canvas')!

const sfc = new ScrollFrameCanvas({
  canvasEle: canvas,
  scrollbarEle: window,
  scrollAxis: 'y',
  // 传入完整数组，或使用 total + imageFactory
  total: 281,
  imageFactory: (index) => `/images/frame-${String(index + 1).padStart(3, '0')}.jpg`,
  scaleMode: 'contain',
  large: { enabled: true, factor: 16, showBackgroundProgress: true },
  maxConcurrentLoads: 8,
  frameMapper: (scrollPixels, totalScrollPixels, totalFrames) => {
    const ratio = totalScrollPixels ? scrollPixels / totalScrollPixels : 0
    return Math.round(ratio * (totalFrames - 1))
  },
  onInitComplete: () => console.log('初始化完成'),
  onError: (e) => console.error(e),
})

await sfc.init()
sfc.play()
```

### 常见问题

- 关于大序列：开启 `large.enabled` 后会分层取样，先加载关键帧，随后后台补齐，保证首屏可用与流畅度。
- 关于 `frameMapper`：请根据页面可滚动距离与交互节奏自定义映射关系。
- 跨域图像：从 URL 加载时设置了 `crossOrigin = 'anonymous'`，请确保 CDN 允许跨域。

### 本地开发与示例

```bash
pnpm i
pnpm dev
# 打开 http://localhost:8080 查看 demo
```


### License

MIT

