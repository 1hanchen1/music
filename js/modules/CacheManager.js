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
    return `multisearch_${encodeURIComponent(query).toLowerCase()}`;
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
      return Array.isArray(item.data) ? item.data : []; // 确保返回数组
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

export default CacheManager;