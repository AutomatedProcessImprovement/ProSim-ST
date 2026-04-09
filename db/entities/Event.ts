import {Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn} from "typeorm";
import {Process} from "./Process";
import {LifecycleTypes} from "@definitions/simulation/enums";

@Entity("event")
export class Event {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    caseId: number;

    @Column({ type: "varchar", length: 255 })
    lifecycle: LifecycleTypes;

    @Column({ type: "datetime" })
    timestamp: string;

    @Column()
    nodeId: string;

    @Column({ type: "json" })
    paths: { [tokenId: string]: string[]; };

    @ManyToOne(() => Process)
    @JoinColumn({ name: "processId" })
    process: Process;

    @Column()
    processId: string;
}
