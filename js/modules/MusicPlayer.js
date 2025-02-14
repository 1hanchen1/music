import Utils from './Utils.js';
import CacheManager from './CacheManager.js';

/**
 * 音乐播放器核心模块（事件驱动架构）
 */
const MusicPlayer = {
  currentAudio: null, // 当前播放器实例（单例控制）

  qualityMap: {
    '标准音质': 'standard',
    '高品音质': 'hq',
    '无损音质': 'sq',
    'Hi-Res': 'hi-res',
    '高清环绕声': 'hi-res',
    '沉浸环绕声': 'hi-res',
    '超清母带': 'hi-res'
  },

  getQualityClass(quality) {
    const normalizedQuality = quality?.toLowerCase() || 'standard';
    return this.qualityMap[normalizedQuality] || 'standard';
  },

  // API 配置
  apiConfig: {
    'QQ音乐': {
      url: 'https://www.hhlqilongzhu.cn/api/dg_shenmiMusic_SQ.php',
      params: { msg: '', type: 'json', n: '', num: 20, br: 1 }
    },
    '网易云': {
      url: 'https://www.hhlqilongzhu.cn/api/dg_wyymusic.php',
      params: { gm: '', type: 'json', n: '', num: 20, br: 1 }
    },
    '酷狗音乐': {
      url: 'https://www.hhlqilongzhu.cn/api/dg_kgmusic.php', 
      params: { gm: '', type: 'json', n: '', num: 20, br: 1 }
    }
  },

  // 构建请求 URL
  buildApiUrl(source, query, id = '') {
    const config = this.apiConfig[source];
    if (!config) throw new Error(`未知的 API 来源: ${source}`);

    const params = { ...config.params };
    params[source === 'QQ音乐' ? 'msg' : source === '网易云' ? 'gm' : source === '酷狗音乐' ? 'gm' : 'query'] = encodeURIComponent(query);
    if (id) params[source === 'QQ音乐' ? 'n' : source === '网易云' ? 'n' : source === '酷狗音乐' ? 'n' : 'id'] = id;

    const queryString = Object.entries(params)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    return `${config.url}?${queryString}`;
  },

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

    // 修改歌曲列表点击事件，传递来源信息
    document.getElementById('songList').addEventListener('click', (e) => {
      const item = e.target.closest('.song-item');
      if (item) {
        const source = item.dataset.source; // 获取来源
        const id = parseInt(item.dataset.id, 10); // 确保 id 是数字
        const query = item.dataset.query; // 获取搜索关键词

        // 添加调试日志
        console.log('点击的歌曲项:', { source, id, query });

        if (isNaN(id)) {
          Utils.showToast('无效的歌曲 ID', 'error');
          return;
        }

        this.showSongDetail(source, id, query); // 传递source、id和query
      }
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

      // 同时调用两个API
      const [api1Response, api2Response, api3Response] = await Promise.allSettled([
        Utils.safeFetch(this.buildApiUrl('QQ音乐', query)),
        Utils.safeFetch(this.buildApiUrl('网易云', query)),
        Utils.safeFetch(this.buildApiUrl('酷狗音乐', query))
      ]);

      // 打印 API 响应
      console.log('API1 响应:', api1Response);
      console.log('API2 响应:', api2Response);
      console.log('API3 响应:', api3Response);

      // 处理API1结果
      const api1Data = api1Response.status === 'fulfilled' ?
        this.validateDataAPI1(api1Response.value) : [];

      // 处理API2结果
      const api2Data = api2Response.status === 'fulfilled' ?
        this.validateDataAPI2(api2Response.value) : [];

      // 处理API3结果
      const api3Data = api3Response.status === 'fulfilled' ?
        this.validateDataAPI3(api3Response.value) : [];

      // 合并结果并去重
      const mergedData = this.mergeResults([...api1Data, ...api2Data, ...api3Data]);

      if (mergedData.length > 0) {
        CacheManager.set(query, mergedData);
      }

      this.renderResults(mergedData);

    } catch (error) {
      let errorMessage = `搜索失败: ${error.message}`;
      if (error.status === 404) errorMessage = '未找到相关歌曲，请尝试其他关键词';
      Utils.showToast(errorMessage, 'error');
    } finally {
      searchBtn.disabled = false;
      searchBtn.textContent = '搜索';
    }
  },

  // API1数据验证
  validateDataAPI1(response) {
    // 假设 API1 返回格式为 { code: 200, data: [...] }
    if (!response || response.code !== 200 || !Array.isArray(response.data)) {
      console.error('API1 数据格式错误:', response);
      return [];
    }
    return response.data.map(song => ({
      source: 'QQ音乐',
      id: song.n,
      title: String(song.song_title),
      artist: song.song_singer,
      quality: song.quality || '标准音质'
    }));
  },

  // API2数据验证
  validateDataAPI2(response) {
    // 假设 API2 返回格式为 { code: 200, data: [...] }
    if (!response || response.code !== 200 || !Array.isArray(response.data)) {
      console.error('API2 数据格式错误:', response);
      return [];
    }
    return response.data.map(song => ({
      source: '网易云',
      id: song.n,
      title: String(song.title),
      artist: song.singer,
      quality: this.mapQuality(song.br || 1)
    }));
  },

  // API3数据验证
  validateDataAPI3(response) {
    // 假设 API3 返回格式为 { data: [...] }
    if (!response || !Array.isArray(response.data)) {
      console.error('API3 数据格式错误:', response);
      return [];
    }

    // 手动添加 code: 200 字段
    const formattedResponse = {
      code: 200,
      data: response.data.map(song => ({
        source: '酷狗音乐',
        id: song.n,
        title: String(song.title), // 确保 title 是字符串
        artist: song.singer,
        quality: this.mapQuality(song.br || 1)
      }))
    };

    return formattedResponse.data; // 返回格式化后的数据
  },

  // 清理标题中的冗余信息（如 "泡沫 -- G.E.M.邓紫棋" → "泡沫"）
  cleanTitle(title) {
    return title
      .split(' -- ')[0]    // 去除 "--" 后内容
      .replace(/\(.*?\)/g, '') // 删除括号内容
      .trim();
  },

  // 音质映射
  mapQuality(br) {
    const qualityMap = {
      1: '标准音质',
      2: '高品音质',
      3: '无损音质',
      4: 'Hi-Res',
      5: '高清环绕声',
      6: '沉浸环绕声',
      7: '超清母带',
      8: 'HQ高品质'
    };
    return qualityMap[br] || '未知音质';
  },

  // 合并结果去重
  mergeResults(data) {
    if (!Array.isArray(data)) {
      console.error('合并数据格式错误:', data);
      return [];
    }

    const seen = new Set();
    return data.filter(item => {
      const title = String(item.title || '');
      const artist = String(item.artist || '');
      const key = `${title.toLowerCase()}|${artist.toLowerCase()}`;
      return seen.has(key) ? false : seen.add(key);
    });
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
      div.dataset.source = song.source; // 设置来源
      div.dataset.id = song.id; // 确保 id 是数字
      div.dataset.query = Utils.escapeHtml(document.getElementById('searchInput').value); // 设置搜索关键词

      // 添加来源标识
      div.innerHTML = `
        <div>${Utils.escapeHtml(song.title)}</div>
        <small>
          ${Utils.escapeHtml(song.artist)} 
          <span class="quality-tag ${song.source.toLowerCase()}">
            ${song.quality} (${song.source})
          </span>
        </small>
      `;
      fragment.appendChild(div);
    });

    listContainer.appendChild(fragment);
  },

  // 改进版详情获取
  async showSongDetail(source, id, query) {
    try {
      // 验证 source 有效性
      const validSources = ['QQ音乐', '网易云', '酷狗音乐'];
      if (!validSources.includes(source)) {
        throw new Error(`无效的数据源: ${source}`);
      }
      const apiUrl = this.buildApiUrl(source, query, id);
      const response = await Utils.safeFetch(apiUrl, {}, 8000);

      // 验证数据
      if (!response || response.code !== 200) {
        throw new Error(`API 响应异常: ${response?.code || '无响应'}`);
      }

      // 统一数据访问逻辑
      let detailData;
      switch (source) {
        case 'QQ音乐':
          detailData = response.data;
          break;
        case '网易云':
        case '酷狗音乐':
          detailData = response;
          break;
        default:
          throw new Error('不支持的 API 来源');
      }

      // 检查必要字段
      if (!detailData.song_name && !detailData.title) {
        throw new Error('缺少歌曲名称字段');
      }

      // 渲染详情
      this.renderSongDetail(detailData, source);

    } catch (error) {
      let errorMessage = `获取详情失败: ${error.message}`;
      if (error.status === 404) errorMessage = '未找到歌曲详情，请尝试其他歌曲';
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
   * 渲染歌曲详情（适配多API来源）
   */
  renderSongDetail(detail, source) {
    // 检查 detail 是否存在
    if (!detail || typeof detail !== 'object') {
      Utils.showToast('歌曲详情数据异常', 'error');
      return;
    }

    // 字段映射表
    const fieldMap = {
      'QQ音乐': {
        title: 'song_name',
        artist: 'song_singer',
        lyric: 'lyric',
        cover: 'cover',
        url: 'music_url'
      },
      '网易云': {
        title: 'title',
        artist: 'singer',
        lyric: 'lrc',
        cover: 'cover',
        url: 'music_url'
      },
      '酷狗音乐': {
        title: 'title',
        artist: 'singer',
        lyric: 'lyrics',
        cover: 'cover',
        url: 'music_url'
      },
      // 添加默认映射
      'default': {
        title: 'title',
        artist: 'singer',
        lyric: 'lyric',
        cover: 'cover',
        url: 'music_url'
      }
    };
    // 确保 fields 始终有效
    let fields = fieldMap[source] || fieldMap.default;

    // 安全获取字段值（使用空值合并和可选链）
    const songName = detail[fields.title] ?? '未知歌曲';
    const artist = detail[fields.artist] ?? '未知歌手';
    const rawLyric = detail[fields.lyric] ?? '';
    const cover = detail[fields.cover] ?
      new URL(detail[fields.cover], this.apiConfig[source].url).href : // 将相对路径转换为绝对路径
      'default-cover.jpg'; // 默认图片
    const musicUrl = detail[fields.url] ?? '';

    // 防御性检查
    if (!songName || !artist) {
      Utils.showToast('详情数据不完整', 'warning');
      return;
    }

    // 防御性检查
    if (!fields) {
      console.error('字段映射未定义，使用默认值');
      fields = fieldMap.default;
    }

    if (fieldMap[source]) {
      fields = fieldMap[source];
    } else {
      console.warn(`未找到 ${source} 的字段映射，使用默认值`);
      fields = fieldMap.default;
    }

    // 设置网站标题
    const defaultTitle = "神秘音乐搜索"; // 默认标题
    const finalTitle = (songName !== '未知歌曲' && artist !== '未知歌手') 
      ? `${songName} - ${artist}` 
      : defaultTitle;
    document.title = finalTitle;

    // 渲染详情
    const detailContainer = document.getElementById('songDetail');
    if (!detailContainer) {
      console.error('详情容器未找到');
      return;
    }

    detailContainer.innerHTML = `
      <h2>${Utils.escapeHtml(songName)}</h2>
      <p>歌手：${Utils.escapeHtml(artist)}</p>
      <p>音质：
        <span class="quality-tag ${this.getQualityClass(detail.quality)}">
          ${detail.quality || '标准音质'}
        </span>
      </p>
      <img src="${Utils.escapeHtml(cover)}" 
         class="cover-img" 
         alt="${Utils.escapeHtml(songName)}专辑封面"> <!-- 加载失败时显示默认图片 -->
      ${musicUrl ? `
          <audio controls>
            <source src="${Utils.escapeHtml(musicUrl)}" type="audio/mpeg">
            您的浏览器不支持音频播放
          </audio>
          <div class="download-container">
            <button class="download-btn">
              <span class="download-icon"><i class="fas fa-download"></i></span>
              <span class="download-text">下载</span>
            </button>
          </div>` :
       '<p class="error">暂无播放资源</p>'
      }
      <div class="lyrics">
        ${rawLyric ? this.parseLyric(rawLyric).map(line => `
          <div data-time="${line.time}" class="lyric-time">${line.text}</div>
        `).join('') :
        '<div class="no-lyric">暂无歌词</div>'
      }
      </div>
    `;

    // 绑定下载事件
    if (musicUrl) {
      const downloadBtn = detailContainer.querySelector('.download-btn');
      downloadBtn.addEventListener('click', () => {
        // 先检查是否已有进行中的下载
        if (!document.querySelector('.download-progress')) {
          this.downloadSong(musicUrl, songName, artist);
        } else {
          Utils.showToast('已有文件正在下载', 'warning');
        }
      });
    }
    const img = detailContainer.querySelector('img');
    if (img) {
      img.src = cover;
    }

    const audioElement = detailContainer.querySelector('audio');
    if (audioElement) {
      this.setupAudioHandling(audioElement);
      this.setupLyricsSync(audioElement); // 初始化歌词同步
    }
  },

  // 新增下载方法
  downloadSong(url, songName, artist) {
    const cleanName = (str) => str.replace(/[/\\?%*:|"<>]/g, '');
    const safeSongName = cleanName(songName);
    const safeArtist = cleanName(artist);
  
    // 获取文件扩展名
    const [pathPart] = url.split(/[?#]/);
    const fileName = pathPart.split('/').pop() || 'audio';
    const extensionMatch = fileName.match(/\.([a-z0-9]+)$/i);
    const extension = extensionMatch ? extensionMatch[1] : 'unknown';
    const filename = `${safeSongName} - ${safeArtist}.${extension}`.replace(/\.+/g, '.');
  
    // 显示加载状态
    Utils.showToast('开始下载，请稍候...', 'info');
  
    // 创建进度条容器
    const progressContainer = document.createElement('div');
    progressContainer.className = 'download-progress';
    progressContainer.innerHTML = `
      <div class="progress-bar">
        <div class="progress-fill" style="width: 0%;"></div>
      </div>
      <span class="progress-text">0%</span>
    `;
    document.body.appendChild(progressContainer);
  
    const progressBar = progressContainer.querySelector('.progress-fill');
    const progressText = progressContainer.querySelector('.progress-text');
  
    fetch(url, { method: 'GET' })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
  
        // 获取总文件大小
        const totalSize = parseInt(response.headers.get('content-length'), 10);
        let loadedSize = 0;
        const chunks = [];
  
        return new Promise((resolve, reject) => {
          const reader = response.body.getReader();
          function push() {
            reader.read().then(({ done, value }) => {
              if (done) {
                resolve(chunks);
                return;
              }
  
              loadedSize += value.length;
              const progress = Math.round((loadedSize / totalSize) * 100);
              progressBar.style.width = `${progress}%`;
              progressText.textContent = `${progress}%`;
  
              chunks.push(value);
              push();
            }).catch(err => {
              reject(err);
            });
          }
          push();
        });
      })
      .then(chunks => {
        // 合并 chunks 为一个 Blob
        const blob = new Blob(chunks, { type: 'audio/mpeg' });
  
        // 创建 Blob 链接
        const blobUrl = URL.createObjectURL(blob);
  
        // 创建隐藏的下载链接
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        link.style.display = 'none';
  
        // 确保添加到 DOM
        document.body.appendChild(link);
  
        // 触发下载
        link.click();
  
        // 延迟移除
        setTimeout(() => {
          if (link.parentNode) {
            document.body.removeChild(link);
          }
          URL.revokeObjectURL(blobUrl);
          document.body.removeChild(progressContainer); // 移除进度条
        }, 100);
  
        // 显示成功提示
        Utils.showToast('下载成功', 'success');
        console.log(`成功下载: ${filename}`);
      })
      .catch(error => {
        console.error('下载失败:', error);
        Utils.showToast(`下载失败: ${error.message}`, 'error');
        document.body.removeChild(progressContainer); // 移除进度条
      });
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

export default MusicPlayer;