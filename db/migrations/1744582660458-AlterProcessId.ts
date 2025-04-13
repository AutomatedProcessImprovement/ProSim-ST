import { MigrationInterface, QueryRunner } from "typeorm";

export class AlterProcessId1744582660458 implements MigrationInterface {
    name = 'AlterProcessId1744582660458'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`event\` DROP FOREIGN KEY \`FK_2b091541314c07a8df6cd421696\``);
        await queryRunner.query(`ALTER TABLE \`frame\` DROP FOREIGN KEY \`FK_6cfa5b974bf9df00cb8ee38809c\``);
        await queryRunner.query(`ALTER TABLE \`process\` CHANGE \`id\` \`id\` int NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`process\` DROP PRIMARY KEY`);
        await queryRunner.query(`ALTER TABLE \`process\` DROP COLUMN \`id\``);
        await queryRunner.query(`ALTER TABLE \`process\` ADD \`id\` varchar(255) NOT NULL PRIMARY KEY`);
        await queryRunner.query(`ALTER TABLE \`event\` DROP COLUMN \`processId\``);
        await queryRunner.query(`ALTER TABLE \`event\` ADD \`processId\` varchar(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`frame\` DROP COLUMN \`processId\``);
        await queryRunner.query(`ALTER TABLE \`frame\` ADD \`processId\` varchar(255) NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`event\` ADD CONSTRAINT \`FK_2b091541314c07a8df6cd421696\` FOREIGN KEY (\`processId\`) REFERENCES \`process\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`frame\` ADD CONSTRAINT \`FK_6cfa5b974bf9df00cb8ee38809c\` FOREIGN KEY (\`processId\`) REFERENCES \`process\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`frame\` DROP FOREIGN KEY \`FK_6cfa5b974bf9df00cb8ee38809c\``);
        await queryRunner.query(`ALTER TABLE \`event\` DROP FOREIGN KEY \`FK_2b091541314c07a8df6cd421696\``);
        await queryRunner.query(`ALTER TABLE \`frame\` DROP COLUMN \`processId\``);
        await queryRunner.query(`ALTER TABLE \`frame\` ADD \`processId\` int NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`event\` DROP COLUMN \`processId\``);
        await queryRunner.query(`ALTER TABLE \`event\` ADD \`processId\` int NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`process\` DROP COLUMN \`id\``);
        await queryRunner.query(`ALTER TABLE \`process\` ADD \`id\` int NOT NULL AUTO_INCREMENT`);
        await queryRunner.query(`ALTER TABLE \`process\` ADD PRIMARY KEY (\`id\`)`);
        await queryRunner.query(`ALTER TABLE \`process\` CHANGE \`id\` \`id\` int NOT NULL AUTO_INCREMENT`);
        await queryRunner.query(`ALTER TABLE \`frame\` ADD CONSTRAINT \`FK_6cfa5b974bf9df00cb8ee38809c\` FOREIGN KEY (\`processId\`) REFERENCES \`process\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`event\` ADD CONSTRAINT \`FK_2b091541314c07a8df6cd421696\` FOREIGN KEY (\`processId\`) REFERENCES \`process\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
