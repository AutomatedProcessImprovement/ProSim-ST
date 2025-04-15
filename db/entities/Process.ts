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
}
