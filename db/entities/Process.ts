import {Column, Entity, PrimaryColumn} from "typeorm";

@Entity("process")
export class Process {
    @PrimaryColumn()
    id: string;

    @Column()
    fileName: string;

    @Column({ type: "datetime" })
    startDate: string;

    @Column({ type: "datetime" })
    endDate: string;

    // UTC offset of the uploaded log (e.g. "+02:00"), used to show times as they appear in the log
    @Column({ type: "varchar", length: 6, nullable: true })
    utcOffset: string | null;

    @Column({ type: "datetime", default: () => "CURRENT_TIMESTAMP" })
    lastAccessedAt: Date;

    @Column({ type: "boolean", default: false })
    setToDelete: boolean;
}
