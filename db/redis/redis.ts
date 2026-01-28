import Redis, {RedisOptions} from "ioredis";

export const REDIS_KEY_PREFIX_FRAMES = 'frames:';
export const REDIS_KEY_PREFIX_WORKLOAD = 'workload:';
export const REDIS_KEY_PREFIX_CYCLE_TIME = 'cycle-time:';

const getRedisConfiguration = () => {
    return {
        host: process.env.REDIS_HOST ?? 'localhost',
        password: process.env.REDIS_PASSWORD ?? '',
        port: parseInt(process.env.REDIS_PORT) ?? 6379,
    }
}

export const getRedisInstance = (config = getRedisConfiguration()) => {
    try {
        const options: RedisOptions = {
            host: config.host,
            lazyConnect: true,
            showFriendlyErrorStack: true,
            enableAutoPipelining: true,
            maxRetriesPerRequest: 0,
            retryStrategy: (times: number) => {
                if (times > 3) {
                    throw new Error(`[Redis] Could not connect after ${times} attempts`);
                }

                return Math.min(times * 200, 1000);
            },
            port: config.port,
            password: config.password,
        };

        const redis = new Redis(options);

        redis.on('error', (error: unknown) => {
            console.warn('[Redis] Error connecting', error);
        });

        return redis;
    } catch (e) {
        throw new Error(`[Redis] Could not create a Redis instance`);
    }
}
