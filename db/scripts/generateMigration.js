import { execSync } from "child_process";

const args = process.argv.slice(2);

if (args.length === 0) {
    console.error("❌ Please provide a migration name");
    process.exit(1);
}

const migrationName = args[0];
const migrationPath = `db/migrations/${migrationName}`;

const command = `npx ts-node --project tsconfig.typeorm.json -r tsconfig-paths/register node_modules/typeorm/cli.js migration:generate -d db/mysql/dataSource.ts ${migrationPath}`;

console.log(`🛠️  Running: ${command}`);
execSync(command, { stdio: "inherit" });
