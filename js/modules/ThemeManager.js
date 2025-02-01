import Utils from './Utils.js';

/**
 * 主题管理模块（支持10种预设主题）
 */
const ThemeManager = {
  /**
   * 初始化主题系统（自动加载本地存储的主题）
   */
  init() {
    this.applySavedTheme();
    document.querySelector('.theme-switcher').addEventListener('change', (e) => {
      this.changeTheme(e.target.value);
    });
    this.initThemePreview();
  },

  /**
   * 初始化主题预览面板（事件委托优化）
   */
  initThemePreview() {
    document.querySelectorAll('.theme-preview-item').forEach(item => {
      item.addEventListener('click', () => {
        this.changeTheme(item.dataset.theme);
      });
    });
  },

  /**
   * 可用主题列表（与CSS变量定义严格对应）
   */
  availableThemes: [
    'light',
    'dark',
    'vintage',
    'eye-care',
    'purple',
    'tech-blue',
    'warm-red',
    'nature-green',
    'minimal-gray',
    'cyberpunk',
  ],

  /**
   * 切换主题（自动更新DOM和本地存储）
   * @param {string} theme - 主题标识符
   * @throws 无效主题会触发Toast警告
   */
  changeTheme(theme) {
    if (this.availableThemes.includes(theme)) {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('musicTheme', theme);
    } else {
      Utils.showToast('无效的主题选择', 'warning');
    }
  },

  /**
   * 应用已保存主题（fallback到默认light主题）
   */
  applySavedTheme() {
    const savedTheme = localStorage.getItem('musicTheme') || 'light';
    this.changeTheme(savedTheme);
    document.querySelector('.theme-switcher').value = savedTheme;
  }
};

export default ThemeManager;