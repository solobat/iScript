"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withCache = exports.CacheUtil = void 0;
function CacheUtil() {
    const caches = [];
    const getCache = (key) => {
        const item = caches.find((item) => item[0] === key);
        return {
            value: item ? item[1] : null,
            update: (data) => {
                item[1] = data;
            },
        };
    };
    const addCache = (script, data) => caches.push([script, data]);
    const put = (key, data) => {
        const cache = getCache(key);
        if (cache.value) {
            cache.update(data);
        }
        else {
            addCache(key, data);
        }
    };
    return {
        get: getCache,
        put,
    };
}
exports.CacheUtil = CacheUtil;
function shouldCache(res) {
    return res != null || (Array.isArray(res) && res.length > 0);
}
function withCache(fn, options = { shouldCache }) {
    const cacheUtil = CacheUtil();
    return function (key) {
        const cache = cacheUtil.get(key);
        if (cache.value) {
            return cache.value;
        }
        const res = fn(key);
        if (options.shouldCache(res)) {
            cacheUtil.put(key, res);
        }
        return res;
    };
}
exports.withCache = withCache;
