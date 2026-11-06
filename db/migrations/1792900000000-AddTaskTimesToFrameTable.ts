import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTaskTimesToFrameTable1792900000000 implements MigrationInterface {
    name = 'AddTaskTimesToFrameTable1792900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`frame\` ADD \`taskTimes\` json NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`frame\` DROP COLUMN \`taskTimes\``);
    }

}
