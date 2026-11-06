import {NextResponse} from "next/server";
import axios from "axios";
import {RunDetails} from "@definitions/api/types";

export const GET = async (
    request: Request,
    context: { params: Promise<{ id: string }> }
): Promise<NextResponse<RunDetails | {error: string}>> => {
    try {
        const {id} = await context.params;
        const {data} = await axios.get<RunDetails>(`${process.env.PYTHON_MICROSERVICE_BASE_URL}/run/${encodeURIComponent(id)}`);
        return NextResponse.json(data);
    } catch (error) {
        if (error?.response?.status === 404) {
            return NextResponse.json({error: "The simulator no longer has this run."}, {status: 404});
        }
        console.error(error);
        return NextResponse.json({error: "Failed to load the run details."}, {status: 500});
    }
}
