import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateEventTable1744459073817 implements MigrationInterface {
    name = 'CreateEventTable1744459073817'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`event\` (\`id\` int NOT NULL AUTO_INCREMENT, \`caseId\` int NOT NULL, \`lifecycle\` varchar(255) NOT NULL, \`timestamp\` timestamp NOT NULL, \`nodeId\` varchar(255) NOT NULL, \`paths\` json NOT NULL, \`processId\` varchar(255) NOT NULL, INDEX \`PROCESS_ID_IDX\` (\`processId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`PROCESS_ID_IDX\` ON \`event\``);
        await queryRunner.query(`DROP TABLE \`event\``);
    }

}
