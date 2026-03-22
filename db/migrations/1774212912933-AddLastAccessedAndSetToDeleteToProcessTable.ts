import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLastAccessedAndSetToDeleteToProcessTable1774212912933 implements MigrationInterface {
    name = 'AddLastAccessedAndSetToDeleteToProcessTable1774212912933'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`process\` ADD \`lastAccessedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE \`process\` ADD \`setToDelete\` tinyint NOT NULL DEFAULT 0`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`process\` DROP COLUMN \`setToDelete\``);
        await queryRunner.query(`ALTER TABLE \`process\` DROP COLUMN \`lastAccessedAt\``);
    }

}
