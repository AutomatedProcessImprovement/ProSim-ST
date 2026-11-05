import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUtcOffsetToProcessTable1792668728429 implements MigrationInterface {
    name = 'AddUtcOffsetToProcessTable1792668728429'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`process\` ADD \`utcOffset\` varchar(6) NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`process\` DROP COLUMN \`utcOffset\``);
    }

}
