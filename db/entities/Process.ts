import {Column, Entity, PrimaryColumn} from "typeorm";

@Entity()
export class Process {
    @PrimaryColumn()
    id: string;

    @Column()
    fileName: string;
}
