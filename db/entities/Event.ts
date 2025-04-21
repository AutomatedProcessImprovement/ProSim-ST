import {Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn} from "typeorm";
import {Process} from "./Process";

@Entity()
export class Event {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    caseId: number;

    @Column()
    lifecycle: string;

    @Column({ type: "datetime" })
    timestamp: string;

    @Column()
    nodeId: string;

    @Column({ type: "json" })
    paths: string;

    @ManyToOne(() => Process)
    @JoinColumn({ name: "processId" })
    process: Process;

    @Column()
    processId: string;
}
