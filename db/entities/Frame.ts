import {Column, Entity, PrimaryGeneratedColumn, JoinColumn, ManyToOne} from "typeorm";
import {Process} from "./Process";
import type {OpenTaskTimes} from "@definitions/simulation/types";

@Entity("frame")
export class Frame {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    caseId: number;

    @Column({ type: "json" })
    activeElements: Record<string, string>;

    @Column({ type: "datetime", nullable: true })
    arrivalTime: string | null;

    @Column({ type: "json", nullable: true })
    taskTimes: OpenTaskTimes | null;

    @ManyToOne(() => Process)
    @JoinColumn({ name: "processId" })
    process: Process;

    @Column()
    processId: string;
}
