import {AppDataSource} from "@db/mysql/dataSource";

export const createMySQLConnection = async () => {
    if (!AppDataSource.isInitialized) {
        try {
            await AppDataSource.initialize();
            console.log('DataSource has been initialized!');
        } catch (error) {
            console.error('Error during DataSource initialization', error);
        }
    }

    return AppDataSource;
}
