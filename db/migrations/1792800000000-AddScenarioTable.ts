import { MigrationInterface, QueryRunner } from "typeorm";

export class AddScenarioTable1792800000000 implements MigrationInterface {
    name = 'AddScenarioTable1792800000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`scenario\` (\`processId\` varchar(255) NOT NULL, \`baseProcessId\` varchar(255) NOT NULL, \`label\` text NOT NULL, \`edits\` json NOT NULL, \`comparison\` json NOT NULL, \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX \`IDX_scenario_baseProcessId\` (\`baseProcessId\`), PRIMARY KEY (\`processId\`), CONSTRAINT \`FK_scenario_process\` FOREIGN KEY (\`processId\`) REFERENCES \`process\`(\`id\`) ON DELETE CASCADE) ENGINE=InnoDB`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE \`scenario\``);
    }

}
