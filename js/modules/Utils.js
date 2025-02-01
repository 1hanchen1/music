/**
 * 工具模块，提供通用的工具函数和组件。
 */
const Utils = {
  toastQueue: [],          // Toast通知队列
  isShowingToast: false,   // 当前是否有Toast正在显示

  /**
   * HTML转义，防止XSS攻击（使用textContent自动转义）
   * @param {string} str - 原始字符串
   * @returns {string} 安全转义后的HTML字符串
   * @example
   * escapeHtml('<script>alert(1)</script>') // 返回 "&lt;script&gt;alert(1)&lt;/script&gt;"
   */
  escapeHtml: (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  /**
   * 显示Toast通知（支持队列和动画）
   * @param {string} message - 显示内容（自动截断至100字符）
   * @param {string} [type='info'] - 通知类型，可选值：info/success/error/warning
   */
  showToast: function (message, type = 'info') {
    this.toastQueue.push({ message, type });
    if (!this.isShowingToast) this.processToastQueue();
  },

  /**
   * 处理Toast队列（私有方法）
   */
  processToastQueue: function () {
    if (this.toastQueue.length === 0) {
      this.isShowingToast = false;
      return;
    }

    this.isShowingToast = true;
    const { message, type } = this.toastQueue.shift();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // 显示动画
    setTimeout(() => toast.classList.add('toast-visible'), 10);

    // 自动移除
    setTimeout(() => {
      toast.classList.remove('toast-visible');
      setTimeout(() => {
        toast.remove();
        this.processToastQueue();
      }, 300);
    }, 3000);
  },

  /**
   * 安全Fetch封装（含超时和状态码处理）
   * @param {string} url - 请求地址
   * @param {Object} [options={}] - Fetch配置项
   * @param {number} [timeout=10000] - 超时时间（毫秒）
   * @returns {Promise<Object>} 解析后的JSON数据
   * @throws {Error} 包含状态码的自定义错误对象
   * @example
   * await safeFetch('/api', { method: 'GET' }, 5000)
   */
  safeFetch: async (url, options = {}, timeout = 10000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = `HTTP错误 ${response.status}`;
        switch (response.status) {
          case 400: errorMessage = '请求参数错误'; break;
          case 401: errorMessage = '未授权，请登录'; break;
          case 403: errorMessage = '禁止访问'; break;
          case 404: errorMessage = '资源未找到'; break;
          case 500: errorMessage = '服务器内部错误'; break;
          case 503: errorMessage = '服务不可用'; break;
          default: errorMessage = `HTTP错误 ${response.status}`;
        }
        const error = new Error(errorMessage);
        error.status = response.status;
        throw error;
      }
      return response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        error.message = `请求超时（${timeout}ms）`;
      } else if (error.name === 'TypeError') {
        error.message = '网络请求失败，请检查网络连接';
      }
      throw error;
    }
  }
};

export default Utils;