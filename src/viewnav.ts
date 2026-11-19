import { flushSync } from 'react-dom';

/** 当前参与共享元素过渡的卡片图（详情大图的配对源） */
let heroEl: HTMLElement | null = null;

/** 点击物品卡时登记其图片为过渡源；换点另一张卡时自动清除旧的 */
export function setHeroEl(el: HTMLElement | null) {
  if (heroEl && heroEl !== el) heroEl.style.viewTransitionName = '';
  heroEl = el;
  if (heroEl) heroEl.style.viewTransitionName = 'wugui-hero';
}

const reduceMotion = () =>
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

/** 过渡完成后把焦点交给可见页面的标题（无障碍上下文路由） */
function focusTopHeading() {
  const h = [...document.querySelectorAll('h1')].find((x) => x.offsetParent !== null);
  if (h && !h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
  (h as HTMLElement | undefined)?.focus({ preventScroll: true });
}

/**
 * 方向感知的视图过渡导航：push=forward(右进) / pop·reset=backward(左进)。
 * React 状态更新须 flushSync 包进 update 回调，DOM 在回调内同步提交。
 * 不支持/减动效时立即执行 update。
 */
export function viewNav(dir: 'forward' | 'backward' | 'none', update: () => void) {
  const doc = document as any;
  if (typeof doc.startViewTransition !== 'function' || reduceMotion()) {
    update();
    focusTopHeading();
    return;
  }
  const vt = doc.startViewTransition({
    update: () => flushSync(update),
    types: dir === 'none' ? [] : [dir],
  });
  vt.finished.finally(() => {
    focusTopHeading();
    // 返回完成后清除卡片上的临时过渡名，避免下次导航错配
    if (dir === 'backward' && heroEl) {
      heroEl.style.viewTransitionName = '';
      heroEl = null;
    }
  }).catch(() => {});
}
