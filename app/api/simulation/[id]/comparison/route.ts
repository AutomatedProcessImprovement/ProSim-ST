import {NextResponse} from "next/server";
import {In} from "typeorm";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {Process} from "@db/entities/Process";
import {Scenario} from "@db/entities/Scenario";
import {ComparisonResponse} from "@definitions/api/types";

export const GET = async (
    request: Request,
    context: { params: Promise<{ id: string }> }
): Promise<NextResponse<ComparisonResponse | {error: string}>> => {
    try {
        const {id} = await context.params;
        const dataSource = await createMySQLConnection();
        const scenario = await dataSource.getRepository(Scenario).findOne({where: {processId: id}});
        if (!scenario) return NextResponse.json({error: "Comparison not found"}, {status: 404});

        const processes = dataSource.getRepository(Process);
        const run = await processes.findOne({select: {utcOffset: true}, where: {id}});
        await processes.update({id: In([id, scenario.baseProcessId])}, {lastAccessedAt: new Date()});

        return NextResponse.json({
            processId: id,
            baseProcessId: scenario.baseProcessId,
            label: scenario.label,
            edits: scenario.edits,
            utcOffset: run?.utcOffset ?? "+00:00",
            comparison: scenario.comparison,
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({error: "Failed to load the comparison."}, {status: 500});
    }
}
