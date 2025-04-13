import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateProcessTable1744581634514 implements MigrationInterface {
    name = 'CreateProcessTable1744581634514'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`PROCESS_ID_IDX\` ON \`frame\``);
        await queryRunner.query(`DROP INDEX \`PROCESS_ID_IDX\` ON \`event\``);
        await queryRunner.query(`CREATE TABLE \`process\` (\`id\` int NOT NULL AUTO_INCREMENT, \`fileName\` varchar(255) NOT NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`frame\` DROP COLUMN \`processId\``);
        await queryRunner.query(`ALTER TABLE \`frame\` ADD \`processId\` int NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`event\` DROP COLUMN \`processId\``);
        await queryRunner.query(`ALTER TABLE \`event\` ADD \`processId\` int NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`frame\` ADD CONSTRAINT \`FK_6cfa5b974bf9df00cb8ee38809c\` FOREIGN KEY (\`processId\`) REFERENCES \`process\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`event\` ADD CONSTRAINT \`FK_2b091541314c07a8df6cd421696\` FOREIGN KEY (\`processId\`) REFERENCES \`process\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`event\` DROP FOREIGN KEY \`FK_2b091541314c07a8df6cd421696\``);
        await queryRunner.query(`ALTER TABLE \`frame\` DROP FOREIGN KEY \`FK_6cfa5b974bf9df00cb8ee38809c\``);
        await queryRunner.query(`ALTER TABLE \`event\` DROP COLUMN \`processId\``);
        await queryRunner.query(`ALTER TABLE \`event\` ADD \`processId\` varchar(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`frame\` DROP COLUMN \`processId\``);
        await queryRunner.query(`ALTER TABLE \`frame\` ADD \`processId\` varchar(255) NOT NULL`);
        await queryRunner.query(`DROP TABLE \`process\``);
        await queryRunner.query(`CREATE INDEX \`PROCESS_ID_IDX\` ON \`event\` (\`processId\`)`);
        await queryRunner.query(`CREATE INDEX \`PROCESS_ID_IDX\` ON \`frame\` (\`processId\`)`);
    }

}
