import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangeTimestampFormat1744542045230 implements MigrationInterface {
    name = 'ChangeTimestampFormat1744542045230'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`event\` DROP COLUMN \`timestamp\``);
        await queryRunner.query(`ALTER TABLE \`event\` ADD \`timestamp\` datetime NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`event\` DROP COLUMN \`timestamp\``);
        await queryRunner.query(`ALTER TABLE \`event\` ADD \`timestamp\` timestamp NOT NULL`);
    }

}
