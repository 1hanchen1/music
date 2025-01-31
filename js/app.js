// ====================== 工具模块 ======================
// 在Utils对象顶部添加队列变量
const Utils = {
  toastQueue: [],
  isShowingToast: false,
  
  // HTML转义防止XSS
  escapeHtml: (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  // Toast通知组件  
  showToast: function (message, type = 'info') {
    this.toastQueue.push({ message, type });
	if (!this.isShowingToast) this.processToastQueue();
  },
  
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

  // 安全fetch封装
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

// ====================== 主题管理模块 ======================
const ThemeManager = {
  init() {
    this.applySavedTheme();
    document.querySelector('.theme-switcher').addEventListener('change', (e) => {
      this.changeTheme(e.target.value);
    });
	this.initThemePreview();
  },
  
  initThemePreview() {
    document.querySelectorAll('.theme-preview-item').forEach(item => {
      item.addEventListener('click', () => {
        this.changeTheme(item.dataset.theme);
      });
    });
  },

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

  changeTheme(theme) {
	if (this.availableThemes.includes(theme)) {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('musicTheme', theme);
    } else {
		Utils.showToast('无效的主题选择', 'warning')
	}
  },
	
  applySavedTheme() {
    const savedTheme = localStorage.getItem('musicTheme') || 'light';
    this.changeTheme(savedTheme);
    document.querySelector('.theme-switcher').value = savedTheme;
  }
};

// ====================== 缓存管理模块 ======================
const CacheManager = {
  // 缓存配置
  config: {
    maxItems: 15,          // 最大缓存数量
    expireHours: 2,        // 缓存小时数
    storageKey: 'musicCache'
  },

  // 生成缓存键
  generateKey(query) {
    return `search_${encodeURIComponent(query).toLowerCase()}`;
  },

  // 获取缓存
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

  // 设置缓存
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

  // 清理缓存
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

  // 更新最近使用时间
  updateLRU(cache, key) {
    if (cache[key]) {
      cache[key].lru = Date.now();
      localStorage.setItem(this.config.storageKey, JSON.stringify(cache));
    }
  },

  // 清空缓存（可绑定到清除按钮）
  clear() {
    localStorage.removeItem(this.config.storageKey);
  },
  
  // 删除单个缓存
  deleteKey(query) {
    const cache = JSON.parse(localStorage.getItem(this.config.storageKey)) || {};
    const key = this.generateKey(query);
    delete cache[key];
    localStorage.setItem(this.config.storageKey, JSON.stringify(cache));
  },
};

// ====================== 音乐播放器模块 ======================
const MusicPlayer = {
  currentAudio: null,
  
  init() {
    this.bindEvents();
    this.setupGlobalErrorHandling();
  },
  
  // 事件绑定
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
	
    // 移动端按钮事件
    document.querySelector('.mobile-controls button:first-child').addEventListener('click', () => this.searchSongs());
    document.querySelector('.mobile-controls button:last-child').addEventListener('click', () => this.scrollToTop());

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

  // 搜索功能
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
  
  // 增强版数据验证
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

  // 渲染歌曲详情
  renderSongDetail(detail) {
    const detailContainer = document.getElementById('songDetail');
    const lyrics = this.formatLyrics(detail.lyric);

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
      <div class="lyrics">${lyrics}</div>
    `;

    // 图片懒加载
    const img = detailContainer.querySelector('img');
    img.src = img.dataset.src;
	
    // 音频错误处理
    this.setupAudioHandling(detailContainer.querySelector('audio'));
  },
  
  // 格式化歌词
  formatLyrics(lyric) {
    return lyric
      .replace(/\\n/g, '\n')
      .replace(/\[(\d{2}):(\d{2})\.\d{2,3}\]/g, (match, min, sec) => {
        const timestamp = parseInt(min) * 60 + parseInt(sec);
        return `<span data-time="${timestamp}" class="lyric-time">`;
      })
      .trim();
  },

  // 音频处理
  setupAudioHandling(audioElement) {
    if (this.currentAudio) {
      this.currentAudio.pause();
    }
    this.currentAudio = audioElement;

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

  // 全局错误处理
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
  
  // 返回顶部
  scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }
};

// ====================== 初始化应用 ======================
document.addEventListener('DOMContentLoaded', () => {
  ThemeManager.init();
  MusicPlayer.init();
});