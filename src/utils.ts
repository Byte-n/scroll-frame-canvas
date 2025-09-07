export function clamp (value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function noop (): void {
}

export function fitRectContain (srcW: number, srcH: number, dstW: number, dstH: number) {
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  if (srcRatio > dstRatio) {
    const w = dstW;
    const h = w / srcRatio;
    const x = 0;
    const y = (dstH - h) / 2;
    return { x, y, w, h };
  } else {
    const h = dstH;
    const w = h * srcRatio;
    const x = (dstW - w) / 2;
    const y = 0;
    return { x, y, w, h };
  }
}

export function fitRectCover (srcW: number, srcH: number, dstW: number, dstH: number) {
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  if (srcRatio < dstRatio) {
    const w = dstW;
    const h = w / srcRatio;
    const x = 0;
    const y = (dstH - h) / 2;
    return { x, y, w, h };
  } else {
    const h = dstH;
    const w = h * srcRatio;
    const x = (dstW - w) / 2;
    const y = 0;
    return { x, y, w, h };
  }
}

export function fitRectFill (_srcW: number, _srcH: number, dstW: number, dstH: number) {
  return { x: 0, y: 0, w: dstW, h: dstH };
}

export function selectFit (mode: 'contain' | 'cover' | 'fill', sw: number, sh: number, dw: number, dh: number) {
  switch (mode) {
    case 'cover':
      return fitRectCover(sw, sh, dw, dh);
    case 'fill':
      return fitRectFill(sw, sh, dw, dh);
    case 'contain':
    default:
      return fitRectContain(sw, sh, dw, dh);
  }
}


export async function runTasks<T> (tasks: Array<() => Promise<T>>, concurrency: number): Promise<Array<T>> {
  const taskCount = tasks.length;
  if (taskCount === 0) {
    return [];
  }

  concurrency = Math.max(1, Math.floor(concurrency || 1));
  concurrency = Math.min(concurrency, taskCount);

  const list: Array<[() => Promise<T>, number]> = tasks.map((v, idx) => [v, idx]);

  const queue: Array<Promise<number>> = [];
  const results: Array<T> = [];

  const next = async (task: () => Promise<T>, slotIdx: number, taskIdx: number) => {
    const result = await task();
    results[taskIdx] = result;
    return slotIdx;
  };

  while (list.length > 0) {
    if (queue.length) {
      const slotIdx = await Promise.race<number>(queue);
      const [fn, taskIdx] = list.shift();
      queue[slotIdx] = next(fn, slotIdx, taskIdx);
      continue;
    }
    queue.push(
      ...list.splice(0, concurrency)
        .map(([fn, taskIdx], slotIdx: number) => {
          return next(fn, slotIdx, taskIdx);
        }),
    );
  }
  await Promise.all(queue);

  return results;
}

export function deepMerge<T> (obj: T, obj2: T): T {
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
  const result = {} as T;

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
      } else {
        // 否则直接覆盖
        result[key] = obj2[key];
      }
    }
  }

  return result;
}

export function easeOutQuad (t: number): number {
  const tt = clamp(t, 0, 1);
  return 1 - (1 - tt) * (1 - tt);
}

export function drawExitAnimation (config: {
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  drawBackground: () => void,
  totalFrame: number;
  exitDirection: 'top' | 'bottom'
}) {
  const { ctx, canvas, drawBackground, totalFrame, exitDirection } = config;
  const ofc = new OffscreenCanvas(canvas.width, canvas.height);
  const opcCtx = ofc.getContext('2d');
  opcCtx.drawImage(canvas, 0, 0);

  return new Promise<void>((resolve) => {

    let frame = 0;
    const drawExit = () => {
      if (frame === totalFrame) {
        ctx.globalAlpha = 1;
        return resolve();
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.globalAlpha = 1;
      drawBackground();

      const t = frame / totalFrame;
      const eased = easeOutQuad(t);

      ctx.globalAlpha = 1 - eased;
      ctx.drawImage(ofc, 0, exitDirection === 'top' ? -canvas.height * eased : canvas.height * eased);

      frame++;
      requestAnimationFrame(drawExit);
    };

    requestAnimationFrame(drawExit);
  });
}
