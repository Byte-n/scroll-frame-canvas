type EventOptions = {
    priority?: number;
    debounceMs?: number;
};
export declare class EventEmitter {
    private _listeners;
    /**
     * 监听事件
     */
    on(event: string, listener: Function, options?: EventOptions): this;
    /**
     * 取消事件
     */
    off(event: string, listener: Function): this;
    /**
     * 触发事件
     */
    emit(event: string, ...args: any[]): boolean;
}
/**
 * 简易防抖
 */
export declare function debounce<T extends Function>(fn: T, wait: number): T;
export {};
//# sourceMappingURL=events.d.ts.map