import ThemeManager from './modules/ThemeManager.js';
import MusicPlayer from './modules/MusicPlayer.js';

/**
 * 应用入口（DOM就绪后初始化）
 * 初始化顺序：
 * 1. 主题系统 → 2. 播放器核心
 */
document.addEventListener('DOMContentLoaded', () => {
  ThemeManager.init();    // 先初始化主题（避免页面闪烁）
  MusicPlayer.init();     // 后初始化播放器（依赖DOM元素）
  MusicPlayer.initMobileOptimization(); // 初始化移动端优化
});