import {execSync} from "child_process";

const command = `npx ts-node --project tsconfig.typeorm.json -r tsconfig-paths/register node_modules/typeorm/cli.js migration:run -d db/mysql/dataSource.ts`;

console.log(`🛠️  Running: ${command}`);
execSync(command, { stdio: "inherit" });
