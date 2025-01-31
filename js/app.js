// ====================== 工具模块 ======================
const Utils = {
  // HTML转义防止XSS
  escapeHtml: (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  // Toast通知组件
  showToast: (message, type = 'info') => {
    const toast = document.createElement('div');
	toast.className = `toast toast-${type}`;
	toast.textContent = message;
	document.body.appendChild(toast);

	// 显示动画
	setTimeout(() => toast.classList.add('toast-visible'), 10);

	// 自动移除
	setTimeout(() => {
      toast.classList.remove('toast-visible');
      setTimeout(() => toast.remove(), 300);
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
        const error = new Error(`HTTP错误 ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        error.message = `请求超时（${timeout}ms）`;
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
  },
	
  changeTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('musicTheme', theme);
  },
	
  applySavedTheme() {
    const savedTheme = localStorage.getItem('musicTheme') || 'light';
    this.changeTheme(savedTheme);
    document.querySelector('.theme-switcher').value = savedTheme;
  }
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
	
	// 移动端按钮
	document.querySelector('.mobile-controls').addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') {
        e.target.textContent === '搜索' ? this.searchSongs() : this.scrollToTop();
      }
    });
  },

  // 搜索功能
  async searchSongs() {
    const searchBtn = document.querySelector('.search-box button');
    const query = document.getElementById('searchInput').value.trim();
	
	try {
      if (!query) {
        Utils.showToast('请输入搜索内容', 'warning');
        return;
      }

      // 显示加载状态
      searchBtn.disabled = true;
      searchBtn.innerHTML = '<span class="loader"></span> 搜索中...';
	  
	  const data = await Utils.safeFetch(
	    `https://www.hhlqilongzhu.cn/api/dg_shenmiMusic_SQ.php?msg=${encodeURIComponent(query)}&type=json`,
        {},
        8000
      );
	  
	  if (data.code !== 200) throw new Error(data.msg || '搜索失败');
	  this.renderSongList(data.data);
	} catch (error) {
	  Utils.showToast(`搜索失败: ${error.message}`, 'error');
	  console.error('搜索错误:', error);
    } finally {
	  searchBtn.disabled = false;
	  searchBtn.textContent = '搜索';
	}
  },

  // 渲染歌曲列表
  renderSongList(songs) {
    const listContainer = document.getElementById('songList');
    const query = Utils.escapeHtml(document.getElementById('searchInput').value);
	
	// 使用文档碎片优化性能
	const fragment = document.createDocumentFragment();
	
	songs.forEach(song => {
      const div = document.createElement('div');
      div.className = 'song-item';
      div.dataset.query = query;
      div.dataset.n = song.n;
      div.innerHTML = `
        <div>${song.n}. ${Utils.escapeHtml(song.song_title)}</div>
        <small>${Utils.escapeHtml(song.song_singer)}</small>
      `;
      fragment.appendChild(div);
    });

    listContainer.innerHTML = '';
    listContainer.appendChild(fragment);
  },
  
  // 显示歌曲详情
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
	  Utils.showToast(`获取详情失败: ${error.message}`, 'error');
      console.error('详情错误:', error);
    }
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
        case 1: message += ' (操作中止)'; break;
        case 2: message += ' (网络错误)'; break;
        case 3: message += ' (解码错误)'; break;
        case 4: message += ' (格式不支持)'; break;
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