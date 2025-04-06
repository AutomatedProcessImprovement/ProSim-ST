import {DataSource} from "@node_modules/typeorm";

const parseBool = (value?: string) => value === 'true';

export const AppDataSource = new DataSource({
    type: "mysql",
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    username: process.env.MYSQL_USERNAME,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    synchronize: parseBool(process.env.TYPEORM_SYNCHRONIZE),
    logging: parseBool(process.env.TYPEORM_LOGGING),
    entities: [],
    migrations: [],
    subscribers: [],
})
