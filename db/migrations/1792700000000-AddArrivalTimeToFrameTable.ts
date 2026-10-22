import { MigrationInterface, QueryRunner } from "typeorm";

export class AddArrivalTimeToFrameTable1792700000000 implements MigrationInterface {
    name = 'AddArrivalTimeToFrameTable1792700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`frame\` ADD \`arrivalTime\` datetime NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`frame\` DROP COLUMN \`arrivalTime\``);
    }

}
