import {NextResponse} from "next/server";
import {readFile} from "fs/promises";
import {join} from "path";
import {SAMPLE_FILES, SAMPLE_PROCESSES} from "@definitions/samples";
import {zip} from "@utils/zip";

const archives = new Map<string, Promise<Buffer>>();

const archive = (name: string) => {
    if (!archives.has(name)) {
        const built = Promise.all(Object.values(SAMPLE_FILES).map(async ({fileName}) => ({
            name: `${name}/${fileName}`,
            content: await readFile(join(process.cwd(), "sampleProcesses", name, fileName)),
        }))).then(entries => zip(entries));
        built.catch(() => archives.delete(name));
        archives.set(name, built);
    }
    return archives.get(name)!;
};

export const GET = async (_request: Request, context: { params: Promise<{ name: string }> }) => {
    const {name} = await context.params;
    const sample = SAMPLE_PROCESSES.find(sample => sample.name === name);
    if (!sample) {
        return NextResponse.json({error: "Sample not found"}, {status: 404});
    }

    try {
        return new NextResponse(new Uint8Array(await archive(sample.name)), {
            status: 200,
            headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename="prosim-st-${sample.name}.zip"`,
                "Cache-Control": "public, max-age=86400",
            },
        });
    } catch (error) {
        console.log(error);
        return NextResponse.json({error: "Sample not found"}, {status: 404});
    }
}
