import { createClient } from 'redis';

let redisClient = null;

export const connectRedis = async () => {
    try {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        
        // Disable Redis if REDIS_URL is explicitly set to 'disabled'
        // or just let it fail gracefully and log a warning
        redisClient = createClient({
            url: redisUrl
        });

        redisClient.on('error', (err) => {
            console.warn('⚠️  Redis connection error. Caching and distributed rate limiting will be disabled.');
            redisClient = null; // Unset client so app can fallback to memory
        });

        await redisClient.connect();
        console.log('📦 Redis connected successfully');
    } catch (error) {
        console.warn('⚠️  Could not connect to Redis. Running in fallback mode (Memory).');
        redisClient = null;
    }
};

export const getRedisClient = () => redisClient;

export default connectRedis;
