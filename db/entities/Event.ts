import {Column, Entity, Index, PrimaryGeneratedColumn} from "typeorm";

@Entity()
@Index('PROCESS_ID_IDX', ['processId'])
export class Event {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    caseId: number;

    @Column()
    lifecycle: string;

    @Column({ type: "datetime" })
    timestamp: Date;

    @Column()
    nodeId: string;

    @Column({ type: "json" })
    paths: Record<string, string[]>;

    @Column()
    processId: string;
}
