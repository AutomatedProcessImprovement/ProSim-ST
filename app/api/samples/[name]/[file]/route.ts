import {NextResponse} from "next/server";
import {readFile} from "fs/promises";
import {join} from "path";
import {SAMPLE_FILES, SAMPLE_PROCESSES} from "@definitions/samples";

// Serves the bundled sample processes from sampleProcesses/ (copied into the standalone build by next.config.ts)
export const GET = async (_request: Request, context: { params: Promise<{ name: string, file: string }> }) => {
    const {name, file} = await context.params;
    const sample = SAMPLE_PROCESSES.find(sample => sample.name === name);
    const sampleFile = Object.values(SAMPLE_FILES).find(sampleFile => sampleFile.fileName === file);

    if (!sample || !sampleFile) {
        return NextResponse.json({error: "Sample not found"}, {status: 404});
    }

    try {
        const content = await readFile(join(process.cwd(), "sampleProcesses", sample.name, sampleFile.fileName));
        return new NextResponse(content, {
            status: 200,
            headers: {
                "Content-Type": sampleFile.contentType,
                "Cache-Control": "public, max-age=86400",
            },
        });
    } catch (error) {
        console.log(error);
        return NextResponse.json({error: "Sample not found"}, {status: 404});
    }
}
