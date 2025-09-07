import { EventEmitter } from './events';
import { clamp, deepMerge, noop, runTasks, selectFit, drawExitAnimation } from './utils';

export interface ScrollFrameCanvasOptions {
  canvasEle: HTMLCanvasElement;
  scrollbarEle: HTMLElement | Window | Document;
  images?: Array<HTMLImageElement | ImageBitmap | string>;
  total?: number;
  imageFactory?: (index: number) => Promise<HTMLImageElement | ImageBitmap | string | null>;
  large?: {
    enabled?: boolean;
    factor?: number;
    showBackgroundProgress?: boolean;
  },
  onFrame?: (frame: number, offset: number) => void;
  onComplete?: () => void;
  onInitComplete?: () => void;
  onError?: (error: Error & { frameIndex?: number }) => void;
  customMainLoading?: (params: {
    ctx: CanvasRenderingContext2D;
    canvas: HTMLCanvasElement;
    progress: number;
    progressCount: number;
    totalProgress: number;
    canvasWidth: number;
    canvasHeight: number;
  }) => void;
  customBackgroundLoading?: (params: {
    ctx: CanvasRenderingContext2D;
    canvas: HTMLCanvasElement;
    progress: number;
    progressCount: number;
    totalFrames: number;
    canvasWidth: number;
    canvasHeight: number;
  }) => void;
  scaleMode?: 'contain' | 'cover' | 'fill';
  scrollAxis: 'x' | 'y';
  frameMapper: (scrollPixels: number, totalScrollPixels: number, totalFrames: number) => number;
  resetScrollOnInit?: boolean;
  maxConcurrentLoads?: number;
  exitAnimationFrameRate?: number;
}

/**
 * 基于滚动条驱动的 Canvas 帧序列渲染器
 */
export default class ScrollFrameCanvas extends EventEmitter {
  private options: ScrollFrameCanvasOptions;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private scrollbarEle: HTMLElement | Window | Document;
  private images: Array<HTMLImageElement | ImageBitmap | string> | null;
  private total: number;
  private totalProgress: number;
  private imageFactory: ((index: number) => Promise<HTMLImageElement | ImageBitmap | string | null>) | null;

  // 运行时状态
  private _playing: boolean = false;
  private _rAFId: number = 0;
  private _currentFrame: number = 0;
  private _lastDrawnFrame: number = -1;
  private _lastRealDrawFrame: number = -1;
  private _destroyed: boolean = false;

  // 预渲染的帧数据
  private _preRenderedFrames: ImageBitmap[] = [];

  // 加载动画状态
  private _loadingAnimationId: number = 0;
  private _loadingProgressCount: number = 0;
  private _loadingProgress: number = 0;
  private _loadingCompleted: boolean = false;
  private _originalScrollBehavior: string = '';
  private _originalScrollRestoration: ScrollRestoration | null = null;

  // 后续层加载动画状态
  private _backgroundLoadingAnimationId: number = 0;
  private _backgroundLoadingProgressCount: number = 0;
  private _backgroundLoadingProgress: number = 0;
  private _backgroundLoadingCompleted: boolean = false;

  private _boundOnScroll: () => void;

  constructor (options: ScrollFrameCanvasOptions) {
    super();
    if (!options || !options.canvasEle) throw new Error('canvasEle 必填');
    if (!options.scrollbarEle) throw new Error('scrollbarEle 必填');

    this.options = deepMerge<ScrollFrameCanvasOptions>({
      scaleMode: 'contain',
      resetScrollOnInit: true,
      maxConcurrentLoads: 6,
      exitAnimationFrameRate: 75,
      onFrame: noop,
      onComplete: noop,
      onError: noop,
      large: { enabled: true, factor: 4, showBackgroundProgress: true },
    } as unknown as ScrollFrameCanvasOptions, options);

    if (!this.options.frameMapper) {
      throw new Error('frameMapper 是必填项');
    }
    if (!this.options.scrollAxis || (this.options.scrollAxis !== 'x' && this.options.scrollAxis !== 'y')) {
      throw new Error('scrollAxis 必须指定为 "x" 或 "y"');
    }

    this.canvas = this.options.canvasEle;
    this.ctx = this.canvas.getContext('2d');

    this.scrollbarEle = this.options.scrollbarEle;

    // 源图像数据
    this.images = Array.isArray(this.options.images) ? this.options.images.slice() : null;
    this.total = this.images ? this.images.length : (this.options.total || 0);

    if (this.total <= 1) {
      throw new Error('总帧数必须大于 1');
    }

    if (this.options.large.enabled) {
      const { factor } = this.options.large;
      if (factor <= 2) {
        throw new Error('large.factor 必须大于 2');
      }
      if ((factor & (factor - 1)) !== 0) {
        throw new Error('large.factor 必须是2的幂次方（2, 4, 8, 16, 32, 64...）');
      }
      if (this.total < factor * 2) {
        throw new Error('总帧数必须大于 large.factor * 2');
      }
    }

    this.totalProgress = this.total;
    this.imageFactory = this.options.imageFactory || null;
    if (!this.images && (!this.total || !this.imageFactory)) {
      throw new Error('必须提供 images 或 total+imageFactory');
    }

    // 绑定回调（事件系统 + 直连回调）
    if (this.options.onFrame) this.on('frame', this.options.onFrame);
    if (this.options.onComplete) this.on('complete', this.options.onComplete);
    if (this.options.onInitComplete) this.on('initComplete', this.options.onInitComplete);
    if (this.options.onError) this.on('error', this.options.onError);

    // 监听
    this._boundOnScroll = () => this._handleScroll();

    this._attachScroll();
  }

  /** 启动 */
  async init (): Promise<this> {
    const total = this.getTotalFrames();
    this._preRenderedFrames = new Array(total);

    // 创建 OffscreenCanvas 用于预渲染
    const offscreenCanvas = new OffscreenCanvas(this.canvas.width, this.canvas.height);
    const offscreenCtx = offscreenCanvas.getContext('2d');

    if (!offscreenCtx) {
      throw new Error('无法创建 OffscreenCanvas 上下文');
    }

    // 禁止滚动
    this._disableScroll();

    // 开始显示加载动画
    this._startLoadingAnimation();

    try {
      const large = this.options.large;
      if (large.enabled) {
        let factor = large.factor;
        const factorList = [];
        while (factor !== 1) {
          factorList.push(factor);
          factor = factor / 2;
        }
        factorList.push(1);

        const groups: number[][] = Array.from<number[], number[]>({ length: factorList.length }, () => {
          return [];
        });
        // 第一轮必然加载首位两帧
        groups[0].push(0, this.total - 1);

        const dup = new Set<number>([0, this.total - 1]);
        for (let i = 0; i < this.total; i++) {
          if (dup.has(i)) {
            continue;
          }
          for (let j = 0; j < factorList.length; j++) {
            if (i % factorList[j] === 0) {
              groups[j].push(i);
              dup.add(i);
              break;
            }
          }
        }
        groups[0].sort((a, b) => a - b);
        this.totalProgress = groups[0].length;

        await runTasks(
          groups[0].map((i) => () => {
            return this._preloadAndRenderFrame(i, offscreenCanvas, offscreenCtx);
          }),
          this.options.maxConcurrentLoads!,
        );

        await this._stopLoadingAnimation();

        this.totalProgress = this.total;
        Promise.resolve()
          .then(async () => {
            // 启动后续层加载进度动画
            this._startBackgroundLoadingAnimation();

            for (const item of groups) {
              if (item === groups[0]) {
                continue;
              }

              await runTasks(
                item.map((i) => async () => {
                  const result = await this._preloadAndRenderFrame(i, offscreenCanvas, offscreenCtx);
                  // 更新后续层加载进度
                  this._updateBackgroundLoadingProgress();
                  return result;
                }),
                this.options.maxConcurrentLoads!,
              );
            }

          })
          .finally(() => {
            // 停止后续层加载进度动画
            this._stopBackgroundLoadingAnimation();
          });
      } else {
        // 并行加载所有图片并预渲染
        await runTasks(
          Array.from({ length: total }, (_, i) => () => {
            return this._preloadAndRenderFrame(i, offscreenCanvas, offscreenCtx);
          }),
          this.options.maxConcurrentLoads!,
        );
        // 移除 null 元素并更新 total
        this._cleanupNullFrames();
        await this._stopLoadingAnimation();
      }

      // 恢复滚动
      this._enableScroll();

      // 触发初始化完成事件
      this.emit('initComplete');
      return this;
    } catch (error) {
      // 出错时也要停止动画并恢复滚动
      this._enableScroll();
      await this._stopLoadingAnimation();
      throw error;
    }
  }

  /** 开始播放（启用渲染循环） */
  play (): void {
    if (this._playing) return;
    this._playing = true;
    this._tick();
  }

  /** 暂停播放 */
  pause (): void {
    this._playing = false;
    if (this._rAFId) {
      cancelAnimationFrame(this._rAFId);
      this._rAFId = 0;
    }
  }

  /** 停止并重置到 0 帧 */
  stop (): void {
    this.pause();
    this.setFrame(0);
  }

  /**
   * 设置当前帧
   */
  setFrame (frameIndex: number): void {
    const idx = clamp(Math.round(frameIndex), 0, this.getTotalFrames() - 1);
    this._currentFrame = idx;
    this._renderIfNeeded();
  }

  /** 获取当前帧索引 */
  getCurrentFrame (): number {
    return this._currentFrame;
  }

  /** 获取总帧数 */
  getTotalFrames (): number {
    return this.total;
  }

  /** 销毁并清理资源 */
  destroy (): void {
    if (this._destroyed) return;
    this.pause();
    this._detachScroll();

    // 停止加载动画
    if (this._loadingAnimationId) {
      cancelAnimationFrame(this._loadingAnimationId);
      this._loadingAnimationId = 0;
    }
    this._loadingCompleted = false;

    // 停止后续层加载动画
    if (this._backgroundLoadingAnimationId) {
      cancelAnimationFrame(this._backgroundLoadingAnimationId);
      this._backgroundLoadingAnimationId = 0;
    }
    this._backgroundLoadingCompleted = false;

    // 恢复滚动
    this._enableScroll();

    this._destroyed = true;
  }

  private _cleanupNullFrames (): void {
    // 移除 null 元素，重新排列数组
    const validFrames: ImageBitmap[] = [];
    const originalLength = this._preRenderedFrames.length;

    for (let i = 0; i < originalLength; i++) {
      const frame = this._preRenderedFrames[i];
      if (frame !== null && frame !== undefined) {
        validFrames.push(frame);
      }
    }

    // 更新预渲染帧数组和总数
    this._preRenderedFrames = validFrames;
    this.total = validFrames.length;

    // 如果当前帧索引超出新的总数，重置到最后一帧
    if (this._currentFrame >= this.total) {
      this._currentFrame = Math.max(0, this.total - 1);
    }
  }

  private async _preloadAndRenderFrame (
    index: number, offscreenCanvas: OffscreenCanvas, offscreenCtx: OffscreenCanvasRenderingContext2D,
    isBack = false,
  ): Promise<void> {
    if (this._destroyed) {
      throw new Error('ScrollFrameCanvas 已销毁');
    }
    try {
      const image = await this._loadFrame(index);

      // 如果 image 为 null，跳过渲染，但保留数组位置
      if (image === null) {
        this._preRenderedFrames[index] = null as any; // 标记为 null
        if (!isBack) {
          this.totalProgress--;
          this._updateLoadingProgress(0);
        }
        return;
      }
      await this._parseImageData(index, offscreenCanvas, offscreenCtx, image);

      if (!isBack) {
        this._updateLoadingProgress();
      }
    } catch (err) {
      const error = new Error(`预加载帧 ${index} 失败: ${err instanceof Error ? err.message : String(err)}`);
      (error as any).frameIndex = index;
      this.emit('error', error);
      throw error;
    }
  }

  private async _parseImageData (index: number, offscreenCanvas: OffscreenCanvas, offscreenCtx: OffscreenCanvasRenderingContext2D, image: ImageBitmap | HTMLImageElement): Promise<void> {
    try {
      if (image instanceof ImageBitmap) {
        this._preRenderedFrames[index] = image;
        return;
      }
      // 清空 OffscreenCanvas
      offscreenCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
      // 在 OffscreenCanvas 上绘制图片
      this._drawImageToOffscreen(image, offscreenCtx, offscreenCanvas.width, offscreenCanvas.height);
      // 将 OffscreenCanvas 转换为 ImageBitmap 并存储
      this._preRenderedFrames[index] = await createImageBitmap(offscreenCanvas);
    } catch (err) {
      const error = new Error(`预加载帧 ${index} 失败: ${err instanceof Error ? err.message : String(err)}`);
      (error as any).frameIndex = index;
      this.emit('error', error);
      throw error;
    }
  }

  private async _loadFrame (index: number): Promise<HTMLImageElement | ImageBitmap | null> {
    const image = await this._getImage(index);
    if (image === null) {
      return null;
    }
    if (typeof image === 'string') {
      return this._loadImageFromURL(image);
    }
    return image;
  }

  private async _getImage (index: number): Promise<HTMLImageElement | ImageBitmap | string | null> {
    if (this.images) {
      if (this.images[index] === undefined) {
        throw new Error(`images 数组索引 ${index} 对应的图片为 undefined`);
      }
      return this.images[index];
    }

    if (!this.imageFactory) {
      throw new Error('无可用的 imageFactory 或 images');
    }

    const result = await this.imageFactory(index);
    if (result === undefined) {
      throw new Error(`imageFactory 返回 undefined for index ${index}`);
    }
    return result;
  }

  private _loadImageFromURL (url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image load error'));
      img.src = url;
    });
  }

  private _drawImageToOffscreen (img: HTMLImageElement | ImageBitmap, ctx: OffscreenCanvasRenderingContext2D, canvasW: number, canvasH: number): void {
    if (this._destroyed) return;
    const natW = (img as HTMLImageElement).naturalWidth || img.width || 1;
    const natH = (img as HTMLImageElement).naturalHeight || img.height || 1;

    const fit = selectFit(this.options.scaleMode!, natW, natH, canvasW, canvasH);

    ctx.drawImage(img, 0, 0, natW, natH, Math.round(fit.x), Math.round(fit.y), Math.round(fit.w), Math.round(fit.h));
  }

  private _disableScroll (): void {
    const el = this.scrollbarEle;
    if (el === window || el === document || el === document.body) {
      // 保存原始滚动行为
      this._originalScrollBehavior = document.body.style.overflow;
      // 根据配置决定是否重置滚动位置
      if (this.options.resetScrollOnInit) {
        this._originalScrollRestoration = history.scrollRestoration;
        history.scrollRestoration = 'manual';
        document.documentElement.scrollTop = 0;
        document.documentElement.scrollLeft = 0;
      }
      document.body.style.overflow = 'hidden';
    } else {
      const htmlEl = el as HTMLElement;
      // 保存原始滚动行为
      this._originalScrollBehavior = htmlEl.style.overflow;
      // 根据配置决定是否重置滚动位置
      if (this.options.resetScrollOnInit) {
        htmlEl.scrollTop = 0;
        htmlEl.scrollLeft = 0;
      }
      htmlEl.style.overflow = 'hidden';
    }
  }

  private _enableScroll (): void {
    const el = this.scrollbarEle;
    if (el === window || el === document || el === document.body) {
      // 恢复原始滚动行为
      if (this._originalScrollRestoration) {
        history.scrollRestoration = this._originalScrollRestoration;
      }
      document.body.style.overflow = this._originalScrollBehavior;
    } else {
      const htmlEl = el as HTMLElement;
      // 恢复原始滚动行为
      htmlEl.style.overflow = this._originalScrollBehavior;
    }
  }

  private _attachScroll (): void {
    const el = this.scrollbarEle;
    if (!el) return;
    const opts = { passive: true };
    if (el === window || el === document) {
      window.addEventListener('scroll', this._boundOnScroll, opts);
      window.addEventListener('touchmove', this._boundOnScroll, opts);
    } else {
      el.addEventListener('scroll', this._boundOnScroll, opts);
      el.addEventListener('touchmove', this._boundOnScroll, opts);
    }
  }

  private _detachScroll (): void {
    const el = this.scrollbarEle;
    if (!el) return;
    if (el === window || el === document) {
      window.removeEventListener('scroll', this._boundOnScroll);
      window.removeEventListener('touchmove', this._boundOnScroll);
    } else {
      el.removeEventListener('scroll', this._boundOnScroll);
      el.removeEventListener('touchmove', this._boundOnScroll);
    }
  }


  private _getScrollPixels (): { scrollPixels: number; totalScrollPixels: number } {
    const el = this.scrollbarEle;
    const axis = this.options.scrollAxis;

    if (el === window || el === document) {
      const doc = document.documentElement;
      const scrollTop = window.pageYOffset || doc.scrollTop || 0;
      const scrollLeft = window.pageXOffset || doc.scrollLeft || 0;

      const maxY = (doc.scrollHeight - doc.clientHeight) || 1;
      const maxX = (doc.scrollWidth - doc.clientWidth) || 1;

      const scrollPixels = axis === 'x' ? scrollLeft : scrollTop;
      const totalScrollPixels = axis === 'x' ? maxX : maxY;
      return { scrollPixels, totalScrollPixels };
    } else {
      const htmlEl = el as HTMLElement;
      const maxY = (htmlEl.scrollHeight - htmlEl.clientHeight) || 1;
      const maxX = (htmlEl.scrollWidth - htmlEl.clientWidth) || 1;

      const scrollPixels = axis === 'x' ? htmlEl.scrollLeft : htmlEl.scrollTop;
      const totalScrollPixels = axis === 'x' ? maxX : maxY;
      return { scrollPixels, totalScrollPixels };
    }
  }

  private _handleScroll (): void {
    if (!this._playing) return;
    // 只更新帧索引，不直接绘制
    this._currentFrame = this._calcFrameFromScroll();
  }

  private _tick (): void {
    if (!this._playing) return;
    this._rAFId = requestAnimationFrame(() => {
      // 检查当前帧是否需要绘制
      if (this._currentFrame !== this._lastDrawnFrame) {
        this._renderIfNeeded();
        if (this._backgroundLoadingAnimationId !== 0 && !this._backgroundLoadingCompleted) {
          this._drawBackgroundLoadingAnimation();
        }
        // const animate = () => {
        //   if (this._backgroundLoadingAnimationId === 0) return;
        //   if (this._backgroundLoadingCompleted) return;
        // };
        // this._backgroundLoadingAnimationId = requestAnimationFrame(animate);
      }
      // 继续循环
      if (this._playing) {
        this._tick();
      }
    });
  }

  private _calcFrameFromScroll (): number {
    const total = this.getTotalFrames();
    const { scrollPixels, totalScrollPixels } = this._getScrollPixels();
    const frameIndex = this.options.frameMapper(scrollPixels, totalScrollPixels, total);
    return clamp(Math.round(frameIndex), 0, total - 1);
  }

  private _renderIfNeeded (force: boolean = false, usePrevRealFrame = false, event = true) {
    if (this._destroyed) return;
    const frame = this._currentFrame;
    if (!force) {
      if (frame === this._lastDrawnFrame) {
        return;
      }
    }
    let realFrame = frame;
    if (usePrevRealFrame) {
      realFrame = this._lastRealDrawFrame;
    }
    try {
      // 使用预渲染的帧数据
      let preRenderedFrame = this._preRenderedFrames[realFrame];
      if (!preRenderedFrame) {
        if (this.options.large.enabled) {
          for (let i = realFrame + 1; i < this._preRenderedFrames.length; i++) {
            if (this._preRenderedFrames[i]) {
              preRenderedFrame = this._preRenderedFrames[i];
              realFrame = i;
              break;
            }
          }
          if (!preRenderedFrame) {
            throw new Error(`帧 ${realFrame} 及其后续都没有可用的帧`);
          }
        } else {
          if (!preRenderedFrame) {
            throw new Error(`帧 ${realFrame} 未预渲染或已被清理`);
          }
        }
      }

      this._drawPreRenderedFrame(preRenderedFrame);
      this._lastDrawnFrame = frame;
      this._lastRealDrawFrame = realFrame;

      if (event) {
        const { scrollPixels, totalScrollPixels } = this._getScrollPixels();
        const offset = totalScrollPixels > 0 ? scrollPixels / totalScrollPixels : 0;
        this.emit('frame', frame, offset);
      }

      if (frame === this.getTotalFrames() - 1) {
        this.emit('complete');
      }
    } catch (err) {
      const error = new Error(`渲染帧失败: ${err instanceof Error ? err.message : String(err)}`);
      (error as any).frameIndex = frame;
      this.emit('error', error);
    }
  }

  private _drawPreRenderedFrame (preRenderedFrame: ImageBitmap): void {
    if (this._destroyed) return;
    if (!this.ctx) return;

    const ctx = this.ctx;
    const canvasW = this.canvas.width;
    const canvasH = this.canvas.height;

    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.drawImage(preRenderedFrame, 0, 0, canvasW, canvasH);
  }

  private _startLoadingAnimation () {
    this._loadingProgress = 0;
    this._loadingProgressCount = 0;
    this._loadingCompleted = false;
  }

  private _stopLoadingAnimation (): Promise<void> {
    this._drawLoadingAnimation();

    this._loadingCompleted = true;
    cancelAnimationFrame(this._loadingAnimationId);
    this._loadingAnimationId = 0;
    if (this._destroyed) return Promise.resolve();

    this._currentFrame = 0;
    return drawExitAnimation({
      ctx: this.ctx, canvas: this.canvas,
      totalFrame: this.options.exitAnimationFrameRate!,
      exitDirection: 'top',
      drawBackground: () => {
        this._renderIfNeeded(true, false, false)
      }
    })
  }

  private _updateLoadingProgress (incr = 1): void {
    this._loadingProgressCount += incr;
    this._loadingProgress = Math.min(1, Math.max(0, this._loadingProgressCount / this.totalProgress));

    const animate = () => {
      if (this._loadingAnimationId === 0) return;
      if (this._loadingCompleted) return;
      this._drawLoadingAnimation();
    };

    this._loadingAnimationId = requestAnimationFrame(animate);
  }

  private _drawLoadingAnimation (): void {
    if (this._destroyed) return;
    if (this._loadingCompleted) return;
    if (!this.ctx) return;

    const ctx = this.ctx;
    const canvasW = this.canvas.width;
    const canvasH = this.canvas.height;

    // 如果有自定义主加载渲染函数，使用它
    if (this.options.customMainLoading) {
      this.options.customMainLoading({
        ctx,
        canvas: this.canvas,
        progress: this._loadingProgress,
        progressCount: this._loadingProgressCount,
        totalProgress: this.totalProgress,
        canvasWidth: canvasW,
        canvasHeight: canvasH,
      });
      return;
    }

    // 默认的主加载动画
    // 清空画布
    ctx.clearRect(0, 0, canvasW, canvasH);

    // 设置深色背景，类似图像中的米色/浅灰背景
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // 绘制数字百分比
    const percentage = Math.round(this._loadingProgress * 100);
    const percentageStr = percentage.toString();

    // 设置柔和的字体颜色，类似图像中的深色数字
    ctx.fillStyle = '#8a8a7a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 计算字体大小（基于 canvas 宽度）
    const fontSize = canvasW * 0.07;

    // 使用更粗的字体来模拟图像中的效果
    ctx.font = `900 ${fontSize}px 'Arial', sans-serif`;
    ctx.fillText(percentageStr, canvasW / 2, canvasH / 2 - fontSize * 0.1);

    // 绘制"LOADING"文本
    const loadingFontSize = canvasW * 0.0125;
    ctx.font = `400 ${loadingFontSize}px 'Arial', sans-serif`;
    ctx.fillStyle = '#6a6a6a';
    ctx.fillText('LOADING', canvasW / 2, canvasH / 2 + fontSize * 0.35);

    // 添加动态点效果
    const time = Date.now();
    const dotCount = Math.floor((time / 500) % 4); // 每500ms切换一次
    const dots = '.'.repeat(dotCount);
    ctx.fillText(dots, canvasW / 2 + ctx.measureText('LOADING').width / 2 + canvasW * 0.01, canvasH / 2 + fontSize * 0.35);
  }

  private _startBackgroundLoadingAnimation (): void {
    if (!this.options.large?.showBackgroundProgress) return;

    this._backgroundLoadingProgress = 0;
    this._backgroundLoadingProgressCount = 0;
    this._backgroundLoadingCompleted = false;
  }

  private _stopBackgroundLoadingAnimation (): void {
    if (!this.options.large?.showBackgroundProgress) return;

    this._backgroundLoadingCompleted = true;
    if (this._backgroundLoadingAnimationId) {
      cancelAnimationFrame(this._backgroundLoadingAnimationId);
      this._backgroundLoadingAnimationId = 0;
    }
    requestAnimationFrame(() => this._renderIfNeeded(true, true));
  }

  private _updateBackgroundLoadingProgress (): void {
    if (!this.options.large?.showBackgroundProgress) return;

    const totalFrames = this.total;
    this._backgroundLoadingProgressCount++;
    this._backgroundLoadingProgress = Math.min(1, Math.max(0, this._backgroundLoadingProgressCount / totalFrames));
    const animate = () => {
      if (this._backgroundLoadingAnimationId === 0) return;
      if (this._backgroundLoadingCompleted) return;
      this._drawBackgroundLoadingAnimation();
    };
    this._backgroundLoadingAnimationId = requestAnimationFrame(animate);
  }

  private _drawBackgroundLoadingAnimation (): void {
    if (this._destroyed) return;
    if (this._backgroundLoadingCompleted || !this.ctx) return;
    if (!this.options.large?.showBackgroundProgress) return;
    this._renderIfNeeded(true, true);

    const ctx = this.ctx;
    const canvasW = this.canvas.width;
    const canvasH = this.canvas.height;

    // 如果有自定义后续层加载渲染函数，使用它
    if (this.options.customBackgroundLoading) {
      this.options.customBackgroundLoading({
        ctx,
        canvas: this.canvas,
        progress: this._backgroundLoadingProgress,
        progressCount: this._backgroundLoadingProgressCount,
        totalFrames: this.total,
        canvasWidth: canvasW,
        canvasHeight: canvasH,
      });
      return;
    }

    // 默认的后续层加载动画
    const fontSize = canvasW * 0.006;
    const textY = canvasH - fontSize;
    const centerX = canvasW / 2;

    // 绘制主要文字 - "完整动画加载中"
    const percentage = Math.round(this._backgroundLoadingProgress * 100);
    const text = `加载中: ${percentage}%`;

    ctx.font = `${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 测量文本宽度
    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;
    const textHeight = fontSize;

    // 计算背景框的位置和大小
    const padding = fontSize * 0.75; // 内边距
    const bgWidth = textWidth + padding * 2;
    const bgHeight = textHeight + padding;
    const bgX = centerX - bgWidth / 2;
    const bgY = textY - 5 - bgHeight / 2;
    const borderRadius = fontSize * 0.3; // 圆角半径

    // 绘制带圆角的背景
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; // 浅灰色半透明背景
    ctx.beginPath();
    ctx.roundRect(bgX, bgY, bgWidth, bgHeight, borderRadius);
    ctx.fill();

    // 绘制文字
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; // 浅灰色文字
    ctx.fillText(text, centerX, textY - 5);
  }

}
