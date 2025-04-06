import {AppDataSource} from "@db/mysql/dataSource";

export const createMySQLConnection = async () => {
    if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
    }

    return AppDataSource;
}
