import {Column, Entity, PrimaryGeneratedColumn, JoinColumn, ManyToOne} from "typeorm";
import {Process} from "./Process";

@Entity()
export class Frame {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    caseId: number;

    @Column({ type: "json" })
    activeElements: Record<string, string>;

    @ManyToOne(() => Process)
    @JoinColumn({ name: "processId" })
    process: Process;

    @Column()
    processId: string;
}
