import {Column, Entity, PrimaryGeneratedColumn, JoinColumn, ManyToOne} from "typeorm";
import {Process} from "./Process";

@Entity("frame")
export class Frame {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    caseId: number;

    @Column({ type: "json" })
    activeElements: Record<string, string>;

    // When the case started, as found in the event log (UTC)
    @Column({ type: "datetime", nullable: true })
    arrivalTime: string | null;

    @ManyToOne(() => Process)
    @JoinColumn({ name: "processId" })
    process: Process;

    @Column()
    processId: string;
}
