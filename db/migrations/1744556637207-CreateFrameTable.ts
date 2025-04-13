import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateFrameTable1744556637207 implements MigrationInterface {
    name = 'CreateFrameTable1744556637207'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`frame\` (\`id\` int NOT NULL AUTO_INCREMENT, \`caseId\` int NOT NULL, \`activeElements\` json NOT NULL, \`processId\` varchar(255) NOT NULL, INDEX \`PROCESS_ID_IDX\` (\`processId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`PROCESS_ID_IDX\` ON \`frame\``);
        await queryRunner.query(`DROP TABLE \`frame\``);
    }

}
