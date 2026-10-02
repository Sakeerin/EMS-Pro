import { getRedisClient } from '../config/redis.js';

export const DASHBOARD_STATS_KEY = 'dashboard:stats';

// Drops the cached dashboard stats after a successful write, so the next
// dashboard load reflects the change. Failed writes leave the cache alone.
export const invalidateDashboardStats = (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        res.on('finish', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                getRedisClient()?.del(DASHBOARD_STATS_KEY).catch((err) => {
                    console.warn('Redis cache invalidation error:', err.message);
                });
            }
        });
    }
    next();
};
