// 轻量事件系统，支持优先级与可选防抖
type ListenerInfo = {
  fn: Function;
  priority: number;
  debounceMs: number;
  wrapped: Function;
};

type EventOptions = {
  priority?: number;
  debounceMs?: number;
};

export class EventEmitter {
  private _listeners: Map<string, ListenerInfo[]> = new Map();

  /**
   * 监听事件
   */
  on(event: string, listener: Function, options: EventOptions = {}): this {
    const priority = Number.isFinite(options.priority) ? options.priority! : 0;
    const debounceMs = Number.isFinite(options.debounceMs) ? options.debounceMs! : 0;
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
  off(event: string, listener: Function): this {
    const arr = this._listeners.get(event);
    if (!arr) return this;
    const idx = arr.findIndex((l) => l.fn === listener);
    if (idx >= 0) {
      arr.splice(idx, 1);
    }
    if (arr.length === 0) this._listeners.delete(event);
    return this;
  }

  /**
   * 触发事件
   */
  emit(event: string, ...args: any[]): boolean {
    const arr = this._listeners.get(event);
    if (!arr || arr.length === 0) return false;
    for (const { wrapped } of arr) {
      try { 
        wrapped(...args); 
      } catch (err) { 
        setTimeout(() => { throw err; }, 0); 
      }
    }
    return true;
  }
}

/**
 * 简易防抖
 */
export function debounce<T extends Function>(fn: T, wait: number): T {
  let t: NodeJS.Timeout | null = null;
  return ((...args: any[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn.apply(undefined, args), wait);
  }) as unknown as T;
}
