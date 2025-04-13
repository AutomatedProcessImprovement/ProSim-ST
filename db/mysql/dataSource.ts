import 'dotenv/config';
import {DataSource} from "typeorm";
import { Event } from "@db/entities/Event";

const parseBool = (value?: string) => value === 'true';

export const AppDataSource = new DataSource({
    type: "mysql",
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    username: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    synchronize: parseBool(process.env.TYPEORM_SYNCHRONIZE),
    logging: parseBool(process.env.TYPEORM_LOGGING),
    entities: [Event],
    migrations: ['@db/migrations/*.ts'],
    subscribers: [],
});
