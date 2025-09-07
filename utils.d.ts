export declare function clamp(value: number, min: number, max: number): number;
export declare function noop(): void;
export declare function fitRectContain(srcW: number, srcH: number, dstW: number, dstH: number): {
    x: number;
    y: number;
    w: number;
    h: number;
};
export declare function fitRectCover(srcW: number, srcH: number, dstW: number, dstH: number): {
    x: number;
    y: number;
    w: number;
    h: number;
};
export declare function fitRectFill(_srcW: number, _srcH: number, dstW: number, dstH: number): {
    x: number;
    y: number;
    w: number;
    h: number;
};
export declare function selectFit(mode: 'contain' | 'cover' | 'fill', sw: number, sh: number, dw: number, dh: number): {
    x: number;
    y: number;
    w: number;
    h: number;
};
export declare function runTasks<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<Array<T>>;
export declare function deepMerge<T>(obj: T, obj2: T): T;
export declare function easeOutQuad(t: number): number;
export declare function drawExitAnimation(config: {
    ctx: CanvasRenderingContext2D;
    canvas: HTMLCanvasElement;
    drawBackground: () => void;
    totalFrame: number;
    exitDirection: 'top' | 'bottom';
}): Promise<void>;
//# sourceMappingURL=utils.d.ts.map