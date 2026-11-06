import {Column, Entity, Index, JoinColumn, OneToOne, PrimaryColumn} from "typeorm";
import {Process} from "./Process";
import type {Comparison, ScenarioEdits} from "@definitions/api/types";

@Entity("scenario")
export class Scenario {
    @PrimaryColumn()
    processId: string;

    @OneToOne(() => Process)
    @JoinColumn({name: "processId"})
    process: Process;

    @Index()
    @Column()
    baseProcessId: string;

    @Column({type: "text"})
    label: string;

    @Column({type: "json"})
    edits: ScenarioEdits;

    @Column({type: "json"})
    comparison: Comparison;

    @Column({type: "datetime", default: () => "CURRENT_TIMESTAMP"})
    createdAt: Date;
}
