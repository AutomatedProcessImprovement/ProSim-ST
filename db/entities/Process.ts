import {Column, Entity, PrimaryColumn} from "typeorm";

@Entity()
export class Process {
    @PrimaryColumn()
    id: string;

    @Column()
    fileName: string;

    @Column({ type: "datetime" })
    startDate: string;

    @Column({ type: "datetime" })
    endDate: string;

    @Column({ type: "datetime", default: () => "CURRENT_TIMESTAMP" })
    lastAccessedAt: Date;

    @Column({ type: "boolean", default: false })
    setToDelete: boolean;
}
