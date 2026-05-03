import {GenericContainer, StartedTestContainer, Wait} from 'testcontainers';
import Redis from 'ioredis';

export type TestRedis = {
    container: StartedTestContainer;
    client: Redis;
};

export const startTestRedis = async (): Promise<TestRedis> => {
    const container = await new GenericContainer('redis:7-alpine')
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage(/.*Ready to accept connections.*/i))
        .start();

    const client = new Redis({
        host: container.getHost(),
        port: container.getMappedPort(6379),
        lazyConnect: false,
        maxRetriesPerRequest: 3,
    });

    return {container, client};
};

export const stopTestRedis = async ({container, client}: TestRedis): Promise<void> => {
    client.disconnect();
    await container.stop();
};

export const makeRedisFactory = (container: StartedTestContainer) => (): Redis => {
    return new Redis({
        host: container.getHost(),
        port: container.getMappedPort(6379),
        maxRetriesPerRequest: 3,
        lazyConnect: false,
    });
};
