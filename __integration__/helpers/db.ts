import 'reflect-metadata';
import {GenericContainer, StartedTestContainer, Wait} from 'testcontainers';
import {DataSource} from 'typeorm';
import {Process} from '../../db/entities/Process';
import {Event} from '../../db/entities/Event';
import {Frame} from '../../db/entities/Frame';

export type TestDb = {
    container: StartedTestContainer;
    dataSource: DataSource;
};

const DB_ROOT_PASS = 'prost_root';
const DB_NAME = 'prost_test';

export const startTestDb = async (): Promise<TestDb> => {
    const container = await new GenericContainer('mysql:8.0')
        .withCommand(['--default-authentication-plugin=mysql_native_password'])
        .withEnvironment({
            MYSQL_ROOT_PASSWORD: DB_ROOT_PASS,
            MYSQL_DATABASE: DB_NAME,
        })
        .withExposedPorts(3306)
        .withWaitStrategy(Wait.forLogMessage(/.*ready for connections.*/i, 2))
        .start();

    const dataSource = new DataSource({
        type: 'mysql',
        host: container.getHost(),
        port: container.getMappedPort(3306),
        username: 'root',
        password: DB_ROOT_PASS,
        database: DB_NAME,
        entities: [Process, Event, Frame],
        synchronize: true,
        logging: false,
    });

    // Retry a few times: MySQL may still be finalising auth setup despite the log message
    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            await dataSource.initialize();
            break;
        } catch (e) {
            if (attempt === 5) throw e;
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    return {container, dataSource};
};

export const stopTestDb = async ({container, dataSource}: TestDb): Promise<void> => {
    if (dataSource.isInitialized) {
        await dataSource.destroy();
    }
    await container.stop();
};

export const clearTables = async (dataSource: DataSource): Promise<void> => {
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
    await dataSource.query('TRUNCATE TABLE frame');
    await dataSource.query('TRUNCATE TABLE event');
    await dataSource.query('TRUNCATE TABLE process');
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
};
