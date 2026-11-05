import {NextResponse} from "next/server";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {CaseEvent} from "@utils/casePath";

export const GET = async (
    request: Request,
    context: { params: Promise<{ id: string; caseId: string }> }
): Promise<NextResponse<CaseEvent[] | {error: string}>> => {
    try {
        const {id, caseId} = await context.params;
        if (!/^\d+$/.test(caseId)) return NextResponse.json({ error: "Invalid case" }, { status: 400 });

        const appDataSource = await createMySQLConnection();
        const rows: Array<Omit<CaseEvent, "paths"> & {paths: CaseEvent["paths"] | string}> = await appDataSource.query(`
            SELECT lifecycle, nodeId, CAST(timestamp AS CHAR) AS timestamp, paths
            FROM event
            WHERE processId = ? AND caseId = ?
            ORDER BY timestamp ASC, id ASC
        `, [id, Number(caseId)]);

        return NextResponse.json(rows.map(row => ({
            ...row,
            paths: typeof row.paths === "string" ? JSON.parse(row.paths) : row.paths,
        })), { status: 200 });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Failed to load the case." }, { status: 500 });
    }
}
