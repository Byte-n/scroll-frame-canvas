/******/ var __webpack_modules__ = ({

/***/ "./src/ScrollFrameCanvas.ts":
/*!**********************************!*\
  !*** ./src/ScrollFrameCanvas.ts ***!
  \**********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ ScrollFrameCanvas)
/* harmony export */ });
/* harmony import */ var _events__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./events */ "./src/events.ts");
/* harmony import */ var _utils__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./utils */ "./src/utils.ts");


/**
 * 基于滚动条驱动的 Canvas 帧序列渲染器
 */
class ScrollFrameCanvas extends _events__WEBPACK_IMPORTED_MODULE_0__.EventEmitter {
    constructor(options) {
        super();
        // 运行时状态
        this._playing = false;
        this._rAFId = 0;
        this._currentFrame = 0;
        this._lastDrawnFrame = -1;
        this._lastRealDrawFrame = -1;
        this._destroyed = false;
        // 预渲染的帧数据
        this._preRenderedFrames = [];
        // 加载动画状态
        this._loadingAnimationId = 0;
        this._loadingProgressCount = 0;
        this._loadingProgress = 0;
        this._loadingCompleted = false;
        this._originalScrollBehavior = '';
        this._originalScrollRestoration = null;
        // 后续层加载动画状态
        this._backgroundLoadingAnimationId = 0;
        this._backgroundLoadingProgressCount = 0;
        this._backgroundLoadingProgress = 0;
        this._backgroundLoadingCompleted = false;
        if (!options || !options.canvasEle)
            throw new Error('canvasEle 必填');
        if (!options.scrollbarEle)
            throw new Error('scrollbarEle 必填');
        this.options = (0,_utils__WEBPACK_IMPORTED_MODULE_1__.deepMerge)({
            scaleMode: 'contain',
            resetScrollOnInit: true,
            maxConcurrentLoads: 6,
            onFrame: _utils__WEBPACK_IMPORTED_MODULE_1__.noop,
            onComplete: _utils__WEBPACK_IMPORTED_MODULE_1__.noop,
            onError: _utils__WEBPACK_IMPORTED_MODULE_1__.noop,
            large: { enabled: true, factor: 4, showBackgroundProgress: true },
        }, options);
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
        if (this.options.onFrame)
            this.on('frame', this.options.onFrame);
        if (this.options.onComplete)
            this.on('complete', this.options.onComplete);
        if (this.options.onInitComplete)
            this.on('initComplete', this.options.onInitComplete);
        if (this.options.onError)
            this.on('error', this.options.onError);
        // 监听
        this._boundOnScroll = () => this._handleScroll();
        this._attachScroll();
    }
    /** 启动 */
    async init() {
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
                const groups = Array.from({ length: factorList.length }, () => {
                    return [];
                });
                // 第一轮必然加载首位两帧
                groups[0].push(0, this.total - 1);
                const dup = new Set([0, this.total - 1]);
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
                await (0,_utils__WEBPACK_IMPORTED_MODULE_1__.runTasks)(groups[0].map((i) => () => {
                    return this._preloadAndRenderFrame(i, offscreenCanvas, offscreenCtx);
                }), this.options.maxConcurrentLoads);
                this.totalProgress = this.total;
                Promise.resolve()
                    .then(async () => {
                    // 启动后续层加载进度动画
                    this._startBackgroundLoadingAnimation();
                    for (const item of groups) {
                        if (item === groups[0]) {
                            continue;
                        }
                        await (0,_utils__WEBPACK_IMPORTED_MODULE_1__.runTasks)(item.map((i) => async () => {
                            const result = await this._preloadAndRenderFrame(i, offscreenCanvas, offscreenCtx);
                            // 更新后续层加载进度
                            this._updateBackgroundLoadingProgress();
                            return result;
                        }), this.options.maxConcurrentLoads);
                    }
                })
                    .finally(() => {
                    // 停止后续层加载进度动画
                    this._stopBackgroundLoadingAnimation();
                });
            }
            else {
                // 并行加载所有图片并预渲染
                await (0,_utils__WEBPACK_IMPORTED_MODULE_1__.runTasks)(Array.from({ length: total }, (_, i) => () => {
                    return this._preloadAndRenderFrame(i, offscreenCanvas, offscreenCtx);
                }), this.options.maxConcurrentLoads);
                // 移除 null 元素并更新 total
                this._cleanupNullFrames();
            }
            // 恢复滚动
            this._enableScroll();
            // 触发初始化完成事件
            this.emit('initComplete');
            return this;
        }
        catch (error) {
            // 出错时也要停止动画并恢复滚动
            this._enableScroll();
            throw error;
        }
        finally {
            this._stopLoadingAnimation();
        }
    }
    /** 开始播放（启用渲染循环） */
    play() {
        if (this._playing)
            return;
        this._playing = true;
        this._tick();
    }
    /** 暂停播放 */
    pause() {
        this._playing = false;
        if (this._rAFId) {
            cancelAnimationFrame(this._rAFId);
            this._rAFId = 0;
        }
    }
    /** 停止并重置到 0 帧 */
    stop() {
        this.pause();
        this.setFrame(0);
    }
    /**
     * 设置当前帧
     */
    setFrame(frameIndex) {
        const idx = (0,_utils__WEBPACK_IMPORTED_MODULE_1__.clamp)(Math.round(frameIndex), 0, this.getTotalFrames() - 1);
        this._currentFrame = idx;
        this._renderIfNeeded();
    }
    /** 获取当前帧索引 */
    getCurrentFrame() {
        return this._currentFrame;
    }
    /** 获取总帧数 */
    getTotalFrames() {
        return this.total;
    }
    /** 销毁并清理资源 */
    destroy() {
        if (this._destroyed)
            return;
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
    _cleanupNullFrames() {
        // 移除 null 元素，重新排列数组
        const validFrames = [];
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
    async _preloadAndRenderFrame(index, offscreenCanvas, offscreenCtx, isBack = false) {
        try {
            const image = await this._loadFrame(index);
            // 如果 image 为 null，跳过渲染，但保留数组位置
            if (image === null) {
                this._preRenderedFrames[index] = null; // 标记为 null
                if (!isBack) {
                    this.totalProgress--;
                    this._updateLoadingProgress();
                }
                return;
            }
            await this._parseImageData(index, offscreenCanvas, offscreenCtx, image);
            if (!isBack) {
                this._updateLoadingProgress();
            }
        }
        catch (err) {
            const error = new Error(`预加载帧 ${index} 失败: ${err instanceof Error ? err.message : String(err)}`);
            error.frameIndex = index;
            this.emit('error', error);
            throw error;
        }
    }
    async _parseImageData(index, offscreenCanvas, offscreenCtx, image) {
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
        }
        catch (err) {
            const error = new Error(`预加载帧 ${index} 失败: ${err instanceof Error ? err.message : String(err)}`);
            error.frameIndex = index;
            this.emit('error', error);
            throw error;
        }
    }
    async _loadFrame(index) {
        const image = await this._getImage(index);
        if (image === null) {
            return null;
        }
        if (typeof image === 'string') {
            return this._loadImageFromURL(image);
        }
        return image;
    }
    async _getImage(index) {
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
    _loadImageFromURL(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Image load error'));
            img.src = url;
        });
    }
    _drawImageToOffscreen(img, ctx, canvasW, canvasH) {
        const natW = img.naturalWidth || img.width || 1;
        const natH = img.naturalHeight || img.height || 1;
        const fit = (0,_utils__WEBPACK_IMPORTED_MODULE_1__.selectFit)(this.options.scaleMode, natW, natH, canvasW, canvasH);
        ctx.drawImage(img, 0, 0, natW, natH, Math.round(fit.x), Math.round(fit.y), Math.round(fit.w), Math.round(fit.h));
    }
    _disableScroll() {
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
        }
        else {
            const htmlEl = el;
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
    _enableScroll() {
        const el = this.scrollbarEle;
        if (el === window || el === document || el === document.body) {
            // 恢复原始滚动行为
            if (this._originalScrollRestoration) {
                history.scrollRestoration = this._originalScrollRestoration;
            }
            document.body.style.overflow = this._originalScrollBehavior;
        }
        else {
            const htmlEl = el;
            // 恢复原始滚动行为
            htmlEl.style.overflow = this._originalScrollBehavior;
        }
    }
    _attachScroll() {
        const el = this.scrollbarEle;
        if (!el)
            return;
        const opts = { passive: true };
        if (el === window || el === document) {
            window.addEventListener('scroll', this._boundOnScroll, opts);
            window.addEventListener('touchmove', this._boundOnScroll, opts);
        }
        else {
            el.addEventListener('scroll', this._boundOnScroll, opts);
            el.addEventListener('touchmove', this._boundOnScroll, opts);
        }
    }
    _detachScroll() {
        const el = this.scrollbarEle;
        if (!el)
            return;
        if (el === window || el === document) {
            window.removeEventListener('scroll', this._boundOnScroll);
            window.removeEventListener('touchmove', this._boundOnScroll);
        }
        else {
            el.removeEventListener('scroll', this._boundOnScroll);
            el.removeEventListener('touchmove', this._boundOnScroll);
        }
    }
    _getScrollPixels() {
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
        }
        else {
            const htmlEl = el;
            const maxY = (htmlEl.scrollHeight - htmlEl.clientHeight) || 1;
            const maxX = (htmlEl.scrollWidth - htmlEl.clientWidth) || 1;
            const scrollPixels = axis === 'x' ? htmlEl.scrollLeft : htmlEl.scrollTop;
            const totalScrollPixels = axis === 'x' ? maxX : maxY;
            return { scrollPixels, totalScrollPixels };
        }
    }
    _handleScroll() {
        if (!this._playing)
            return;
        // 只更新帧索引，不直接绘制
        this._currentFrame = this._calcFrameFromScroll();
    }
    _tick() {
        if (!this._playing)
            return;
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
    _calcFrameFromScroll() {
        const total = this.getTotalFrames();
        const { scrollPixels, totalScrollPixels } = this._getScrollPixels();
        const frameIndex = this.options.frameMapper(scrollPixels, totalScrollPixels, total);
        return (0,_utils__WEBPACK_IMPORTED_MODULE_1__.clamp)(Math.round(frameIndex), 0, total - 1);
    }
    _renderIfNeeded(force = false, usePrevRealFrame = false) {
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
                }
                else {
                    if (!preRenderedFrame) {
                        throw new Error(`帧 ${realFrame} 未预渲染或已被清理`);
                    }
                }
            }
            this._drawPreRenderedFrame(preRenderedFrame);
            this._lastDrawnFrame = frame;
            this._lastRealDrawFrame = realFrame;
            const { scrollPixels, totalScrollPixels } = this._getScrollPixels();
            const offset = totalScrollPixels > 0 ? scrollPixels / totalScrollPixels : 0;
            this.emit('frame', frame, offset);
            if (frame === this.getTotalFrames() - 1) {
                this.emit('complete');
            }
        }
        catch (err) {
            const error = new Error(`渲染帧失败: ${err instanceof Error ? err.message : String(err)}`);
            error.frameIndex = frame;
            this.emit('error', error);
        }
    }
    _drawPreRenderedFrame(preRenderedFrame) {
        if (!this.ctx)
            return;
        const ctx = this.ctx;
        const canvasW = this.canvas.width;
        const canvasH = this.canvas.height;
        ctx.clearRect(0, 0, canvasW, canvasH);
        ctx.drawImage(preRenderedFrame, 0, 0, canvasW, canvasH);
    }
    _startLoadingAnimation() {
        this._loadingProgress = 0;
        this._loadingProgressCount = 0;
        this._loadingCompleted = false;
    }
    _stopLoadingAnimation() {
        this._loadingCompleted = true;
        cancelAnimationFrame(this._loadingAnimationId);
        this._loadingAnimationId = 0;
        // 清空画布
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }
    _updateLoadingProgress() {
        this._loadingProgressCount++;
        this._loadingProgress = Math.min(1, Math.max(0, this._loadingProgressCount / this.totalProgress));
        const animate = () => {
            if (this._loadingAnimationId === 0)
                return;
            if (this._loadingCompleted)
                return;
            this._drawLoadingAnimation();
        };
        this._loadingAnimationId = requestAnimationFrame(animate);
    }
    _drawLoadingAnimation() {
        if (this._loadingCompleted)
            return;
        if (!this.ctx)
            return;
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
    _startBackgroundLoadingAnimation() {
        if (!this.options.large?.showBackgroundProgress)
            return;
        this._backgroundLoadingProgress = 0;
        this._backgroundLoadingProgressCount = 0;
        this._backgroundLoadingCompleted = false;
    }
    _stopBackgroundLoadingAnimation() {
        if (!this.options.large?.showBackgroundProgress)
            return;
        this._backgroundLoadingCompleted = true;
        if (this._backgroundLoadingAnimationId) {
            cancelAnimationFrame(this._backgroundLoadingAnimationId);
            this._backgroundLoadingAnimationId = 0;
        }
        requestAnimationFrame(() => this._renderIfNeeded(true, true));
    }
    _updateBackgroundLoadingProgress() {
        if (!this.options.large?.showBackgroundProgress)
            return;
        const totalFrames = this.total;
        this._backgroundLoadingProgressCount++;
        this._backgroundLoadingProgress = Math.min(1, Math.max(0, this._backgroundLoadingProgressCount / totalFrames));
        const animate = () => {
            if (this._backgroundLoadingAnimationId === 0)
                return;
            if (this._backgroundLoadingCompleted)
                return;
            this._drawBackgroundLoadingAnimation();
        };
        this._backgroundLoadingAnimationId = requestAnimationFrame(animate);
    }
    _drawBackgroundLoadingAnimation() {
        if (this._backgroundLoadingCompleted || !this.ctx)
            return;
        if (!this.options.large?.showBackgroundProgress)
            return;
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


/***/ }),

/***/ "./src/events.ts":
/*!***********************!*\
  !*** ./src/events.ts ***!
  \***********************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   EventEmitter: () => (/* binding */ EventEmitter),
/* harmony export */   debounce: () => (/* binding */ debounce)
/* harmony export */ });
class EventEmitter {
    constructor() {
        this._listeners = new Map();
    }
    /**
     * 监听事件
     */
    on(event, listener, options = {}) {
        const priority = Number.isFinite(options.priority) ? options.priority : 0;
        const debounceMs = Number.isFinite(options.debounceMs) ? options.debounceMs : 0;
        let wrapped = listener;
        if (debounceMs > 0) {
            wrapped = debounce(listener, debounceMs);
        }
        const arr = this._listeners.get(event) || [];
        arr.push({ fn: listener, priority, debounceMs, wrapped });
        arr.sort((a, b) => b.priority - a.priority);
        this._listeners.set(event, arr);
        return this;
    }
    /**
     * 取消事件
     */
    off(event, listener) {
        const arr = this._listeners.get(event);
        if (!arr)
            return this;
        const idx = arr.findIndex((l) => l.fn === listener);
        if (idx >= 0) {
            arr.splice(idx, 1);
        }
        if (arr.length === 0)
            this._listeners.delete(event);
        return this;
    }
    /**
     * 触发事件
     */
    emit(event, ...args) {
        const arr = this._listeners.get(event);
        if (!arr || arr.length === 0)
            return false;
        for (const { wrapped } of arr) {
            try {
                wrapped(...args);
            }
            catch (err) {
                setTimeout(() => { throw err; }, 0);
            }
        }
        return true;
    }
}
/**
 * 简易防抖
 */
function debounce(fn, wait) {
    let t = null;
    return ((...args) => {
        if (t)
            clearTimeout(t);
        t = setTimeout(() => fn.apply(undefined, args), wait);
    });
}


/***/ }),

/***/ "./src/utils.ts":
/*!**********************!*\
  !*** ./src/utils.ts ***!
  \**********************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   clamp: () => (/* binding */ clamp),
/* harmony export */   deepMerge: () => (/* binding */ deepMerge),
/* harmony export */   fitRectContain: () => (/* binding */ fitRectContain),
/* harmony export */   fitRectCover: () => (/* binding */ fitRectCover),
/* harmony export */   fitRectFill: () => (/* binding */ fitRectFill),
/* harmony export */   noop: () => (/* binding */ noop),
/* harmony export */   runTasks: () => (/* binding */ runTasks),
/* harmony export */   selectFit: () => (/* binding */ selectFit)
/* harmony export */ });
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function noop() { }
function fitRectContain(srcW, srcH, dstW, dstH) {
    const srcRatio = srcW / srcH;
    const dstRatio = dstW / dstH;
    if (srcRatio > dstRatio) {
        const w = dstW;
        const h = w / srcRatio;
        const x = 0;
        const y = (dstH - h) / 2;
        return { x, y, w, h };
    }
    else {
        const h = dstH;
        const w = h * srcRatio;
        const x = (dstW - w) / 2;
        const y = 0;
        return { x, y, w, h };
    }
}
function fitRectCover(srcW, srcH, dstW, dstH) {
    const srcRatio = srcW / srcH;
    const dstRatio = dstW / dstH;
    if (srcRatio < dstRatio) {
        const w = dstW;
        const h = w / srcRatio;
        const x = 0;
        const y = (dstH - h) / 2;
        return { x, y, w, h };
    }
    else {
        const h = dstH;
        const w = h * srcRatio;
        const x = (dstW - w) / 2;
        const y = 0;
        return { x, y, w, h };
    }
}
function fitRectFill(_srcW, _srcH, dstW, dstH) {
    return { x: 0, y: 0, w: dstW, h: dstH };
}
function selectFit(mode, sw, sh, dw, dh) {
    switch (mode) {
        case 'cover': return fitRectCover(sw, sh, dw, dh);
        case 'fill': return fitRectFill(sw, sh, dw, dh);
        case 'contain':
        default: return fitRectContain(sw, sh, dw, dh);
    }
}
async function runTasks(tasks, concurrency) {
    const taskCount = tasks.length;
    if (taskCount === 0) {
        return [];
    }
    concurrency = Math.max(1, Math.floor(concurrency || 1));
    concurrency = Math.min(concurrency, taskCount);
    const list = tasks.map((v, idx) => [v, idx]);
    const queue = [];
    const results = [];
    const next = async (task, slotIdx, taskIdx) => {
        const result = await task();
        results[taskIdx] = result;
        return slotIdx;
    };
    while (list.length > 0) {
        if (queue.length) {
            const slotIdx = await Promise.race(queue);
            const [fn, taskIdx] = list.shift();
            queue[slotIdx] = next(fn, slotIdx, taskIdx);
            continue;
        }
        queue.push(...list.splice(0, concurrency)
            .map(([fn, taskIdx], slotIdx) => {
            return next(fn, slotIdx, taskIdx);
        }));
    }
    await Promise.all(queue);
    return results;
}
function deepMerge(obj, obj2) {
    // 如果 obj2 是 null 或 undefined，返回 obj 的副本
    if (obj2 === null) {
        return obj ? JSON.parse(JSON.stringify(obj)) : obj2;
    }
    // 如果 obj 是 null 或 undefined，返回 obj2 的副本
    if (obj === null) {
        return JSON.parse(JSON.stringify(obj2));
    }
    // 如果两个参数都不是对象，返回 obj2
    if (typeof obj !== 'object' || typeof obj2 !== 'object') {
        return obj2;
    }
    // 如果 obj2 是数组，直接返回 obj2 的副本
    if (Array.isArray(obj2)) {
        return JSON.parse(JSON.stringify(obj2));
    }
    // 如果 obj 是数组但 obj2 不是，返回 obj2 的副本
    if (Array.isArray(obj)) {
        return JSON.parse(JSON.stringify(obj2));
    }
    // 深度合并对象
    const result = {};
    // 先复制 obj 的所有属性
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            result[key] = obj[key];
        }
    }
    // 然后合并 obj2 的属性
    for (const key in obj2) {
        if (obj2.hasOwnProperty(key)) {
            if (typeof obj2[key] === 'object' && obj2[key] !== null && !Array.isArray(obj2[key]) &&
                typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key])) {
                // 如果两个值都是对象，递归合并
                result[key] = deepMerge(result[key], obj2[key]);
            }
            else {
                // 否则直接覆盖
                result[key] = obj2[key];
            }
        }
    }
    return result;
}


/***/ })

/******/ });
/************************************************************************/
/******/ // The module cache
/******/ var __webpack_module_cache__ = {};
/******/ 
/******/ // The require function
/******/ function __webpack_require__(moduleId) {
/******/ 	// Check if module is in cache
/******/ 	var cachedModule = __webpack_module_cache__[moduleId];
/******/ 	if (cachedModule !== undefined) {
/******/ 		return cachedModule.exports;
/******/ 	}
/******/ 	// Create a new module (and put it into the cache)
/******/ 	var module = __webpack_module_cache__[moduleId] = {
/******/ 		// no module.id needed
/******/ 		// no module.loaded needed
/******/ 		exports: {}
/******/ 	};
/******/ 
/******/ 	// Execute the module function
/******/ 	__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 
/******/ 	// Return the exports of the module
/******/ 	return module.exports;
/******/ }
/******/ 
/************************************************************************/
/******/ /* webpack/runtime/define property getters */
/******/ (() => {
/******/ 	// define getter functions for harmony exports
/******/ 	__webpack_require__.d = (exports, definition) => {
/******/ 		for(var key in definition) {
/******/ 			if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 				Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 			}
/******/ 		}
/******/ 	};
/******/ })();
/******/ 
/******/ /* webpack/runtime/hasOwnProperty shorthand */
/******/ (() => {
/******/ 	__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ })();
/******/ 
/******/ /* webpack/runtime/make namespace object */
/******/ (() => {
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = (exports) => {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/ })();
/******/ 
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
/*!*********************!*\
  !*** ./src/demo.ts ***!
  \*********************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _ScrollFrameCanvas__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./ScrollFrameCanvas */ "./src/ScrollFrameCanvas.ts");

// 全局变量
let scrollFrameCanvas = null;
let currentFrameRatio = 0;
let scrollHint = null;
let hintShown = false;
// 显示滚动提示
function showScrollHint() {
    if (scrollHint && !hintShown) {
        scrollHint.style.opacity = '1';
        hintShown = true;
    }
}
// 隐藏滚动提示
function hideScrollHint() {
    if (scrollHint && hintShown) {
        scrollHint.style.opacity = '0';
        hintShown = false;
    }
}
// 初始化 ScrollFrameCanvas
async function initScrollFrameCanvas() {
    const canvas = document.getElementById('canvas');
    try {
        const base = './downloads/graded_4K_100_gm_85_1440_3-';
        // 根据当前选择的帧数比例创建 imageFactory
        const imageFactory = async (index) => {
            if (currentFrameRatio !== 0) {
                if (index % currentFrameRatio !== 0) {
                    return null;
                }
            }
            return `${base}${String(index + 1).padStart(3, '0')}.jpg`;
        };
        scrollFrameCanvas = new _ScrollFrameCanvas__WEBPACK_IMPORTED_MODULE_0__["default"]({
            total: 281,
            imageFactory: imageFactory,
            canvasEle: canvas,
            scrollbarEle: window,
            scrollAxis: 'y',
            scaleMode: 'contain',
            large: {
                enabled: currentFrameRatio === 0,
                showBackgroundProgress: true,
                factor: 16,
            },
            maxConcurrentLoads: 8, // 控制并行加载数量
            onError: (e) => console.error('[SFC error]', e),
            onInitComplete: () => {
                console.log('[SFC] 初始化完成，可以开始滚动了！');
                // 显示交互提示
                showScrollHint();
            },
            frameMapper: (scrollPixels) => {
                // console.log('totalFrames:', totalFrames);
                return Math.round(scrollPixels / (9 * Math.max(1, currentFrameRatio)));
            },
        });
        const beginSecond = Date.now() / 1000;
        await scrollFrameCanvas.init();
        const endSecond = Date.now() / 1000;
        console.log('初始化完成，耗时:', endSecond - beginSecond, '秒');
        scrollFrameCanvas.setFrame(0);
        scrollFrameCanvas.play();
    }
    catch (error) {
        console.error('初始化失败:', error);
    }
}
// 重新渲染函数
async function rerender() {
    const rerenderBtn = document.getElementById('rerenderBtn');
    try {
        // 禁用按钮
        rerenderBtn.disabled = true;
        rerenderBtn.textContent = '渲染中...';
        // 隐藏提示
        hideScrollHint();
        // 销毁当前实例
        if (scrollFrameCanvas) {
            scrollFrameCanvas.destroy();
            scrollFrameCanvas = null;
        }
        // 重新初始化
        await initScrollFrameCanvas();
    }
    catch (error) {
        console.error('重新渲染失败:', error);
    }
    finally {
        // 恢复按钮
        rerenderBtn.disabled = false;
        rerenderBtn.textContent = '重新渲染';
    }
}
// 事件监听和初始化
window.addEventListener('DOMContentLoaded', () => {
    const frameRatioSelect = document.getElementById('frameRatio');
    const rerenderBtn = document.getElementById('rerenderBtn');
    scrollHint = document.getElementById('scrollHint');
    frameRatioSelect.selectedIndex = 0;
    // 帧数比例变化监听
    frameRatioSelect.addEventListener('change', (e) => {
        const target = e.target;
        currentFrameRatio = parseInt(target.value);
    });
    // 重新渲染按钮点击监听
    rerenderBtn.addEventListener('click', rerender);
    // 滚动监听 - 隐藏提示
    let scrollTimeout = null;
    window.addEventListener('scroll', () => {
        // 防抖处理
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
        }
        scrollTimeout = window.setTimeout(() => {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            if (scrollTop > 50 && hintShown) {
                hideScrollHint();
            }
        }, 100);
    });
    // 按钮悬停效果
    rerenderBtn.addEventListener('mouseenter', () => {
        if (!rerenderBtn.disabled) {
            rerenderBtn.style.background = '#005a9e';
        }
    });
    rerenderBtn.addEventListener('mouseleave', () => {
        if (!rerenderBtn.disabled) {
            rerenderBtn.style.background = '#007acc';
        }
    });
    // 初始化
    initScrollFrameCanvas();
});

})();


//# sourceMappingURL=demo.esm.js.map