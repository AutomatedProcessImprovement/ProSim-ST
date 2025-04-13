import {Column, Entity, Index, PrimaryGeneratedColumn} from "typeorm";

@Entity()
@Index('PROCESS_ID_IDX', ['processId'])
export class Frame {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    caseId: number;

    @Column({ type: "json" })
    activeElements: Record<string, string>;

    @Column()
    processId: string;
}
