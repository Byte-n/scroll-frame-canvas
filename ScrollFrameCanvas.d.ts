import { EventEmitter } from './events';
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
    };
    onFrame?: (frame: number, offset: number) => void;
    onComplete?: () => void;
    onInitComplete?: () => void;
    onError?: (error: Error & {
        frameIndex?: number;
    }) => void;
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
}
/**
 * 基于滚动条驱动的 Canvas 帧序列渲染器
 */
export default class ScrollFrameCanvas extends EventEmitter {
    private options;
    private canvas;
    private ctx;
    private scrollbarEle;
    private images;
    private total;
    private totalProgress;
    private imageFactory;
    private _playing;
    private _rAFId;
    private _currentFrame;
    private _lastDrawnFrame;
    private _lastRealDrawFrame;
    private _destroyed;
    private _preRenderedFrames;
    private _loadingAnimationId;
    private _loadingProgressCount;
    private _loadingProgress;
    private _loadingCompleted;
    private _originalScrollBehavior;
    private _originalScrollRestoration;
    private _backgroundLoadingAnimationId;
    private _backgroundLoadingProgressCount;
    private _backgroundLoadingProgress;
    private _backgroundLoadingCompleted;
    private _boundOnScroll;
    constructor(options: ScrollFrameCanvasOptions);
    /** 启动 */
    init(): Promise<this>;
    /** 开始播放（启用渲染循环） */
    play(): void;
    /** 暂停播放 */
    pause(): void;
    /** 停止并重置到 0 帧 */
    stop(): void;
    /**
     * 设置当前帧
     */
    setFrame(frameIndex: number): void;
    /** 获取当前帧索引 */
    getCurrentFrame(): number;
    /** 获取总帧数 */
    getTotalFrames(): number;
    /** 销毁并清理资源 */
    destroy(): void;
    private _cleanupNullFrames;
    private _preloadAndRenderFrame;
    private _parseImageData;
    private _loadFrame;
    private _getImage;
    private _loadImageFromURL;
    private _drawImageToOffscreen;
    private _disableScroll;
    private _enableScroll;
    private _attachScroll;
    private _detachScroll;
    private _getScrollPixels;
    private _handleScroll;
    private _tick;
    private _calcFrameFromScroll;
    private _renderIfNeeded;
    private _drawPreRenderedFrame;
    private _startLoadingAnimation;
    private _stopLoadingAnimation;
    private _updateLoadingProgress;
    private _drawLoadingAnimation;
    private _startBackgroundLoadingAnimation;
    private _stopBackgroundLoadingAnimation;
    private _updateBackgroundLoadingProgress;
    private _drawBackgroundLoadingAnimation;
}
//# sourceMappingURL=ScrollFrameCanvas.d.ts.map