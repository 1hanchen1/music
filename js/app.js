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
		Utils.showToast('无效的主题选择', 'warning')
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

/**
 * 缓存管理模块（LRU算法 + 过期清理）
 */
const CacheManager = {
  /**
   * 缓存配置（最大15条，过期2小时）
   */
  config: {
    maxItems: 15,          // 最大缓存数量
    expireHours: 2,        // 缓存过期时间（小时）
    storageKey: 'musicCache' // 本地存储的键名
  },

  /**
   * 生成标准缓存键（小写URL编码 + search_前缀）
   * @param {string} query - 原始搜索词
   * @returns {string} 例如 "search_%e6%ad%8c"
   */
  generateKey(query) {
    return `search_${encodeURIComponent(query).toLowerCase()}`;
  },

  /**
   * 获取缓存（自动更新LRU时间戳）
   * @returns {Object|null} 有效数据或null
   */
  get(query) {
    const cache = JSON.parse(localStorage.getItem(this.config.storageKey)) || {};
    const key = this.generateKey(query);
    const item = cache[key];

    if (item && !this.isExpired(item.timestamp)) {
      this.updateLRU(cache, key); // 更新最近使用
      return item.data;
    }
    return null;
  },

  /**
   * 设置缓存（自动执行清理策略）
   * @param {string} query - 搜索关键词
   * @param {Object} data - 需缓存的结构化数据
   */
  set(query, data) {
    let cache = JSON.parse(localStorage.getItem(this.config.storageKey)) || {};
    const key = this.generateKey(query);

    // 清理过期和超出数量的缓存
    cache = this.cleanCache(cache);

    cache[key] = {
      data: data,
      timestamp: Date.now(),
      lru: Date.now()
    };
        
    localStorage.setItem(this.config.storageKey, JSON.stringify(cache));
  },

  // 检查是否过期
  isExpired(timestamp) {
    const hoursDiff = (Date.now() - timestamp) / (1000 * 60 * 60);
    return hoursDiff > this.config.expireHours;
  },

  /**
   * 清理缓存（双重策略：过期时间 + LRU）
   * @param {Object} cache - 原始缓存对象
   * @returns {Object} 清理后的缓存对象
   */
  cleanCache(cache) {
    // 删除过期项
    Object.keys(cache).forEach(key => {
      if (this.isExpired(cache[key].timestamp)) {
        delete cache[key];
      }
    });

    // 如果仍超过数量限制，删除最久未使用的
    const keys = Object.keys(cache);
    if (keys.length > this.config.maxItems) {
      keys.sort((a, b) => cache[a].lru - cache[b].lru);
      keys.slice(0, keys.length - this.config.maxItems).forEach((k) => delete cache[k]);
    }

    return cache;
  },

  /**
   * 更新最近使用时间戳（用于LRU算法）
   */
  updateLRU(cache, key) {
    if (cache[key]) {
      cache[key].lru = Date.now();
      localStorage.setItem(this.config.storageKey, JSON.stringify(cache));
    }
  },

  /**
   * 清空所有缓存。
   */
  clear() {
    localStorage.removeItem(this.config.storageKey);
  },
  
  /**
   * 删除单个缓存
   */
  deleteKey(query) {
    const cache = JSON.parse(localStorage.getItem(this.config.storageKey)) || {};
    const key = this.generateKey(query);
    delete cache[key];
    localStorage.setItem(this.config.storageKey, JSON.stringify(cache));
  },
};


/**
 * 音乐播放器核心模块（事件驱动架构）
 */
const MusicPlayer = {
  currentAudio: null, // 当前播放器实例（单例控制）

  /**
   * 初始化播放器（事件绑定 + 错误监控）
   */
  init() {
    this.bindEvents();
    this.setupGlobalErrorHandling();
    this.initLazyLoadImages();
    this.initAudioPreload();
  },
  
  /**
   * 初始化图片懒加载。
   */
  initLazyLoadImages() {
    document.querySelectorAll('.cover-img').forEach(img => this.lazyLoadImage(img));
  },
  
  /**
   * 图片懒加载优化。
   */
  lazyLoadImage(imgElement) {
    imgElement.style.backgroundColor = '#f0f0f0';
    imgElement.addEventListener('load', () => {
      imgElement.style.backgroundColor = 'transparent';
    });
    imgElement.addEventListener('error', () => {
      imgElement.src = 'fallback.jpg';
      imgElement.alt = '图片加载失败';
    });
    imgElement.loading = 'lazy';
    imgElement.src = imgElement.dataset.src;
  },

  /**
   * 初始化音频预加载。
   */
  initAudioPreload() {
    document.querySelectorAll('audio').forEach(audio => this.optimizeAudioPreload(audio));
  },

  /**
   * 音频预加载优化。
   */
  optimizeAudioPreload(audioElement) {
    audioElement.preload = 'none';
    audioElement.addEventListener('play', () => {
      if (!audioElement.src) {
        audioElement.src = audioElement.dataset.src;
      }
    });
    audioElement.addEventListener('error', () => {
      Utils.showToast('音频加载失败，请稍后重试', 'error');
    });
  },
  
  /**
   * 改进版歌词同步（精确匹配当前行）
   */
  setupLyricsSync(audioElement) {
    if (!audioElement || !audioElement.parentElement) return;

    const lyricsContainer = audioElement.parentElement.querySelector('.lyrics');
    if (!lyricsContainer) return;

    // 清空旧事件监听器
    audioElement.removeEventListener('timeupdate', this.handleTimeUpdate);

    // 绑定新事件
    this.handleTimeUpdate = () => {
      const currentTime = audioElement.currentTime;
      const lyricLines = lyricsContainer.querySelectorAll('[data-time]');

      let activeLine = null;
      for (let i = 0; i < lyricLines.length; i++) {
        const lineTime = parseFloat(lyricLines[i].dataset.time);
        const nextLineTime = i < lyricLines.length - 1 ? parseFloat(lyricLines[i + 1].dataset.time) : Infinity;

        // 匹配当前时间所在的区间
        if (currentTime >= lineTime && currentTime < nextLineTime) {
          activeLine = lyricLines[i];
          break;
        }
      }

      if (activeLine && activeLine !== this.lastHighlightedLine) {
		// 移除旧高亮
        this.lastHighlightedLine?.classList.remove('highlight');
		// 添加新高亮
        activeLine.classList.add('highlight');
        this.lastHighlightedLine = activeLine;
		
		// 计算滚动位置
      const containerHeight = lyricsContainer.clientHeight;
      const lineTop = activeLine.offsetTop;
      const lineHeight = activeLine.offsetHeight;
      const targetScrollTop = lineTop - (containerHeight / 2) + (lineHeight / 2);
      
        // 平滑滚动到中央
        lyricsContainer.scrollTo({
          top: targetScrollTop,
          behavior: 'smooth'
        });
	  }
    };

    audioElement.addEventListener('timeupdate', this.handleTimeUpdate);
  },
  
  /**
   * 绑定所有交互事件（使用事件委托优化性能）
   * 包含：
   * - 搜索按钮点击
   * - 回车键搜索
   * - 歌曲项点击（事件委托）
   * - 移动端操作按钮
   * - 输入框防抖（500ms）
   */
  bindEvents() {
    // 搜索按钮
	document.querySelector('.search-box button').addEventListener('click', () => this.searchSongs());
	
	// 回车键搜索
	document.getElementById('searchInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.searchSongs();
    });
	
	// 歌曲列表点击（事件委托）
	document.getElementById('songList').addEventListener('click', (e) => {
      const item = e.target.closest('.song-item');
      if (item) this.showSongDetail(item.dataset.query, item.dataset.n);
    });

    // 清除缓存按钮事件
    document.querySelector('.clear-cache-btn').addEventListener('click', () => {
      CacheManager.clear();
      Utils.showToast('已清除所有缓存', 'success');
    });
	
	// 搜索输入框防抖
    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        if (e.target.value.trim()) this.searchSongs();
      }, 500);
    });
  },

  /**
   * 解析歌词（过滤元数据）
   * @param {string} lyric - 原始歌词字符串
   * @returns {Array} 解析后的歌词数组
   */
  parseLyric(lyric) {
    // 替换转义换行符
    const lines = lyric.replace(/\\n/g, '\n').split('\n');
    const parsedLyrics = [];

    lines.forEach(line => {
      // 匹配时间戳行（格式：[00:00.00]歌词内容）
      const match = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
      if (match) {
        const min = parseInt(match[1]);    // 分钟
        const sec = parseInt(match[2]);    // 秒
        const ms = parseInt(match[3].padEnd(3, '0')); // 补全毫秒（如 "81" → "810"）
        const text = match[4].trim();      // 歌词内容
		const time = min * 60 + sec + ms / 1000;      // 转换为浮点秒数

        parsedLyrics.push({ time, text });
      }
      // 忽略其他元数据（如 [ti:...], [ar:...]）
    });

    return parsedLyrics;
  },

  /**
   * 执行歌曲搜索（带缓存策略）
   * 流程：
   * 1. 检查缓存 → 2. 显示加载状态 → 3. API请求 → 4. 数据验证 → 5. 渲染结果
   * @throws 自定义错误（网络错误/数据格式错误）
   */
  async searchSongs() {
    const searchBtn = document.querySelector('.search-box button');
    const query = document.getElementById('searchInput').value.trim();
	
    try {
	  // 显示加载状态
      searchBtn.disabled = true;
      searchBtn.innerHTML = '<span class="loader"></span> 搜索中...';
        
      // 优先读取缓存
      const cachedData = CacheManager.get(query);
      if (cachedData) {
        this.showCachedResults(cachedData, query);
        return;
      }

      // 无缓存则请求API
      const response = await Utils.safeFetch(
        `https://www.hhlqilongzhu.cn/api/dg_shenmiMusic_SQ.php?msg=${encodeURIComponent(query)}&type=json`
      );

      const validData = this.validateData(response);

	  // 缓存有效数据
	  if (validData.length > 0) {
		CacheManager.set(query, validData);
	  }
	  
	  this.renderResults(validData);
        
    } catch (error) {
      let errorMessage = `搜索失败: ${error.message}`;
      if (error.status === 404) errorMessage = '未找到相关歌曲，请尝试其他关键词';
      else if (error.status === 500) errorMessage = '服务器内部错误，请稍后重试';
      else if (error.message.includes('超时')) errorMessage = '请求超时，请检查网络连接';
      Utils.showToast(errorMessage, 'error');
    } finally {
      searchBtn.disabled = false;
      searchBtn.textContent = '搜索';
    }
  },

  // 显示带缓存标识的结果
  showCachedResults(data, query) {
    this.renderResults(data);
    Utils.showToast(`已显示缓存结果 (${new Date().toLocaleTimeString()})`, 'info');
    
    // 添加缓存标识
    const resultHeader = document.createElement('div');
    resultHeader.className = 'cache-indicator';
    resultHeader.innerHTML = `
      <span>📁 缓存结果 - 搜索时间: ${new Date().toLocaleString()}</span>
      <button class="refresh-btn">刷新结果</button>
    `;
    
    document.getElementById('songList').prepend(resultHeader);
    
    // 绑定刷新按钮
    resultHeader.querySelector('.refresh-btn').addEventListener('click', () => {
      CacheManager.deleteKey(query); // 或仅删除该查询的缓存
      this.searchSongs();
    });
  },
  
  /**
   * 高级数据验证（防御性编程）
   * @param {Object} data - 原始API响应
   * @returns {Array} 有效歌曲数据
   * @throws 当数据格式无效时中断流程
   */
  validateData(data) {
    if (!Array.isArray(data?.data)) throw new Error('无效的歌曲数据格式');
	
	const validData = data.data.filter(song => song.n && song.song_title && song.song_singer);
    if (validData.length === 0) throw new Error('未找到有效歌曲数据');
    
    return validData;
  },

  renderResults(data) {
    const listContainer = document.getElementById('songList');
    listContainer.innerHTML = '';

    if (data.length === 0) {
      listContainer.innerHTML = '<div class="empty-state">暂无结果</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    data.forEach(song => {
      const div = document.createElement('div');
      div.className = 'song-item';
      div.dataset.query = Utils.escapeHtml(document.getElementById('searchInput').value);
      div.dataset.n = song.n;
      div.innerHTML = `
        <div>${song.n}. ${Utils.escapeHtml(song.song_title)}</div>
        <small>${Utils.escapeHtml(song.song_singer)}</small>
      `;
      fragment.appendChild(div);
    });

    listContainer.appendChild(fragment);
  },

  // 改进版详情获取
  async showSongDetail(query, n) {
    try {
      const data = await Utils.safeFetch(
        `https://www.hhlqilongzhu.cn/api/dg_shenmiMusic_SQ.php?msg=${encodeURIComponent(query)}&type=json&n=${n}`,
        {},
        8000
      );

      if (data.code !== 200) throw new Error(data.msg || '获取详情失败');
      this.renderSongDetail(data.data);
	} catch (error) {
      let errorMessage = `获取详情失败: ${error.message}`;
      if (error.status === 404) errorMessage = '未找到歌曲详情，请尝试其他歌曲';
      else if (error.status === 500) errorMessage = '服务器内部错误，请稍后重试';
      else if (error.message.includes('超时')) errorMessage = '请求超时，请检查网络连接';
      Utils.showToast(errorMessage, 'error');
      console.error('详情错误:', error);
    }
  },
  
  // 增强版全局错误处理
  setupGlobalErrorHandling() {
    window.addEventListener('error', (e) => {
      let errorMessage = '发生意外错误';
      if (e.error instanceof Error) errorMessage = e.error.message;
      Utils.showToast(errorMessage, 'error');
      console.error('全局错误:', e.error);
    });

    window.addEventListener('unhandledrejection', (e) => {
      let errorMessage = '异步操作失败';
      if (e.reason instanceof Error) errorMessage = e.reason.message;
      Utils.showToast(errorMessage, 'error');
      console.error('未处理的Promise错误:', e.reason);
    });
  },

  /**
   * 渲染歌曲详情
   */
  renderSongDetail(detail) {
    const detailContainer = document.getElementById('songDetail');
    const parsedLyrics = this.parseLyric(detail.lyric);

    // 渲染歌词
    const lyricsHTML = parsedLyrics
      .map(line => `<div data-time="${line.time}" class="lyric-time">${line.text}</div>`)
      .join('');

    detailContainer.innerHTML = `
      <h2>${Utils.escapeHtml(detail.song_name)}</h2>
      <p>歌手：${Utils.escapeHtml(detail.song_singer)}</p>
      <p>音质：${Utils.escapeHtml(detail.quality)}</p>
      <img src="data:image/png;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" 
           data-src="${Utils.escapeHtml(detail.cover)}" 
           class="cover-img" 
           alt="专辑封面"
           loading="lazy">
      <a href="${Utils.escapeHtml(detail.link)}" class="player-link" target="_blank">播放页面</a>
      <audio controls>
        <source src="${Utils.escapeHtml(detail.music_url)}" type="audio/flac">
        您的浏览器不支持音频播放
      </audio>
      <h3>歌词：</h3>
      <div class="lyrics">${lyricsHTML}</div>
    `;

    const img = detailContainer.querySelector('img');
    img.src = img.dataset.src;

    const audioElement = detailContainer.querySelector('audio');
    if (audioElement) {
      this.setupAudioHandling(audioElement);
      this.setupLyricsSync(audioElement); // 初始化歌词同步
    }
  },

  // 音频处理
  setupAudioHandling(audioElement) {
    if (this.currentAudio) {
      this.currentAudio.pause();
    }
    this.currentAudio = audioElement;
	this.setupLyricsSync(audioElement); // 新增调用

    // 歌词点击跳转
    audioElement.parentElement.querySelector('.lyrics').addEventListener('click', (e) => {
      const target = e.target.closest('.lyric-time');
      if (target) {
        audioElement.currentTime = parseFloat(target.dataset.time);
        audioElement.play();
      }
    });

    // 音频错误监听
    audioElement.addEventListener('error', () => {
      let message = '音频加载失败';
      switch (audioElement.error.code) {
        case 1:
          message += ' (操作中止)';
          break;
        case 2:
          message += ' (网络错误)';
          break;
        case 3:
          message += ' (解码错误)';
          break;
        case 4:
          message += ' (格式不支持)';
          break;
      }
      Utils.showToast(message, 'error');
    });
  },
  
  /**
   * 新增：移动端优化
   */
  initMobileOptimization() {
    if (window.innerWidth <= 768) {
      document.getElementById('searchInput').focus();
      document.querySelector('.theme-preview').style.display = 'none';

      document.querySelectorAll('.song-item').forEach(item => {
        item.addEventListener('touchstart', () => item.style.transform = 'scale(0.98)');
        item.addEventListener('touchend', () => item.style.transform = 'scale(1)');
      });
    }
  },

  /**
   * 全局错误监控（Window级错误捕获）
   * 处理：
   * - 未捕获的同步错误
   * - 未处理的Promise拒绝
   */
  setupGlobalErrorHandling() {
    window.addEventListener('error', (e) => {
      Utils.showToast('发生意外错误', 'error');
      console.error('全局错误:', e.error);
    });

    window.addEventListener('unhandledrejection', (e) => {
      Utils.showToast('异步操作失败', 'error');
      console.error('未处理的Promise错误:', e.reason);
    });
  },
  
};

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