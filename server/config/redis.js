import { createClient } from 'redis';

let redisClient = null;
let warnedDisconnected = false;

export const connectRedis = async () => {
    try {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

        // The client keeps reconnecting in the background, so callers should
        // go through getRedisClient() and fall back to memory while it is down
        redisClient = createClient({
            url: redisUrl
        });

        redisClient.on('error', () => {
            if (!warnedDisconnected) {
                console.warn('⚠️  Redis connection error. Caching and distributed rate limiting will be disabled until it reconnects.');
                warnedDisconnected = true;
            }
        });

        redisClient.on('ready', () => {
            if (warnedDisconnected) {
                console.log('📦 Redis reconnected');
                warnedDisconnected = false;
            }
        });

        await redisClient.connect();
        console.log('📦 Redis connected successfully');
    } catch (error) {
        console.warn('⚠️  Could not connect to Redis. Running in fallback mode (Memory).');
    }
};

// Returns the client only while it can serve commands, otherwise null
export const getRedisClient = () => (redisClient?.isReady ? redisClient : null);

export default connectRedis;
