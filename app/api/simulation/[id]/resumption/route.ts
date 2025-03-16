import {NextResponse} from "@node_modules/next/server";
import {ResumeSimulationRequestBody, ResumeSimulationRequestBodyPython, SimulationData} from "@definitions/api/types";
import axios from "@node_modules/axios";
import {groupEvents} from "@utils/events";

export const POST = async (request, {params}): Promise<
    NextResponse<{ simulationData: SimulationData } | { error: string }>
> => {
    try {
        const body: ResumeSimulationRequestBody = await request.json();
        const reqBody: ResumeSimulationRequestBodyPython = {
            process_id: params.id,
            timestamp: body.requestedDate,
        }
        const response = await axios.post(
            process.env.PYTHON_MICROSERVICE_BASE_URL + `/resumption`,
            reqBody,
            { headers: { "Content-Type": "application/json" } }
        )
        const groupedEvents = groupEvents(response.data.events, body.requestedDate, body.finalDate);

        return NextResponse.json({
            simulationData: {
                frames: response.data.frames,
                batches: groupedEvents,
            }
        }, { status: 200 });
    } catch (error) {
        console.log(error)
        return NextResponse.json({ error: "Failed to get simulation data." }, { status: 500 });
    }
}
