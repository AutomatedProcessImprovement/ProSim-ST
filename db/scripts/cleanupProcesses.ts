import {join} from "path";
import {createMySQLConnection} from "../mysql/typeorm";
import {cleanupOldProcesses} from "../cleanup";

async function main() {
    const dataSource = await createMySQLConnection();
    try {
        const result = await cleanupOldProcesses(dataSource, {
            retentionDays: Number(process.env.RETENTION_DAYS ?? 30),
            pythonBaseUrl: process.env.PYTHON_MICROSERVICE_BASE_URL,
            assetsDir: join(process.cwd(), "public/assets"),
        });
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.failed.length ? 1 : 0);
    } finally {
        await dataSource.destroy();
    }
}

main().catch(error => {
    console.error("Cleanup failed:", error);
    process.exit(1);
});
