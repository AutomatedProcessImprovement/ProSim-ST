import { MigrationInterface, QueryRunner } from "typeorm";

export class AddStartAndEndDatesToProcessTable1744586126707 implements MigrationInterface {
    name = 'AddStartAndEndDatesToProcessTable1744586126707'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`process\` ADD \`startDate\` datetime NOT NULL`);
        await queryRunner.query(`ALTER TABLE \`process\` ADD \`endDate\` datetime NOT NULL`);

        await queryRunner.query(`
          UPDATE process p
          JOIN (
            SELECT processId, MIN(timestamp) as startDate, MAX(timestamp) as endDate
            FROM event
            GROUP BY processId
          ) e ON p.id = e.processId
          SET p.startDate = e.startDate,
              p.endDate = e.endDate
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`process\` DROP COLUMN \`endDate\``);
        await queryRunner.query(`ALTER TABLE \`process\` DROP COLUMN \`startDate\``);
    }

}
