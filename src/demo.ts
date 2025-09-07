import ScrollFrameCanvas from './ScrollFrameCanvas';

// 全局变量
let scrollFrameCanvas: ScrollFrameCanvas | null = null;
let currentFrameRatio = 0;
let scrollHint: HTMLElement | null = null;
let hintShown = false;

// 显示滚动提示
function showScrollHint (): void {
  if (scrollHint && !hintShown) {
    scrollHint.style.opacity = '1';
    hintShown = true;
  }
}

// 隐藏滚动提示
function hideScrollHint (): void {
  if (scrollHint && hintShown) {
    scrollHint.style.opacity = '0';
    hintShown = false;
  }
}

// 初始化 ScrollFrameCanvas
async function initScrollFrameCanvas (): Promise<void> {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  try {

    const base = './downloads/graded_4K_100_gm_85_1440_3-';


    // 根据当前选择的帧数比例创建 imageFactory
    const imageFactory = async (index: number) => {
      if (currentFrameRatio !== 0) {
        if (index % currentFrameRatio !== 0) {
          return null;
        }
      }
      return `${base}${String(index + 1).padStart(3, '0')}.jpg`;
    };

    scrollFrameCanvas = new ScrollFrameCanvas({
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
      onError: (e: Error & { frameIndex?: number }) => console.error('[SFC error]', e),
      onInitComplete: () => {
        console.log('[SFC] 初始化完成，可以开始滚动了！');
        // 显示交互提示
        showScrollHint();
      },
      frameMapper: (scrollPixels: number) => {
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

  } catch (error) {
    console.error('初始化失败:', error);
  }
}

// 重新渲染函数
async function rerender (): Promise<void> {
  const rerenderBtn = document.getElementById('rerenderBtn') as HTMLButtonElement;


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

  } catch (error) {
    console.error('重新渲染失败:', error);
  } finally {
    // 恢复按钮
    rerenderBtn.disabled = false;
    rerenderBtn.textContent = '重新渲染';
  }
}

// 事件监听和初始化
window.addEventListener('DOMContentLoaded', () => {
  const frameRatioSelect = document.getElementById('frameRatio') as HTMLSelectElement;
  const rerenderBtn = document.getElementById('rerenderBtn') as HTMLButtonElement;
  scrollHint = document.getElementById('scrollHint') as HTMLElement;

  frameRatioSelect.selectedIndex = 0;

  // 帧数比例变化监听
  frameRatioSelect.addEventListener('change', (e: Event) => {
    const target = e.target as HTMLSelectElement;
    currentFrameRatio = parseInt(target.value);
  });

  // 重新渲染按钮点击监听
  rerenderBtn.addEventListener('click', rerender);

  // 滚动监听 - 隐藏提示
  let scrollTimeout: number | null = null;
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
