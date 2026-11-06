/**
 * @jest-environment node
 */
import axios from "axios";
import {GET} from "./route";

jest.mock("axios", () => ({get: jest.fn()}));

const context = {params: Promise.resolve({id: "p1"})};

describe("run details route", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env.PYTHON_MICROSERVICE_BASE_URL = "http://py";
    });

    it("passes on what the simulator knows about the run", async () => {
        const details = {seed: 7, files: null, stateSeconds: 1, simulationSeconds: 2};
        (axios.get as jest.Mock).mockResolvedValue({data: details});

        const response = await GET(new Request("http://app"), context);

        expect(axios.get).toHaveBeenCalledWith("http://py/run/p1");
        expect(await response.json()).toEqual(details);
    });

    it("answers 404 for a run the simulator no longer has", async () => {
        (axios.get as jest.Mock).mockRejectedValue({response: {status: 404}});

        expect((await GET(new Request("http://app"), context)).status).toBe(404);
    });

    it("answers 500 when the simulator cannot be reached", async () => {
        jest.spyOn(console, "error").mockImplementation(() => {});
        (axios.get as jest.Mock).mockRejectedValue(new Error("down"));

        expect((await GET(new Request("http://app"), context)).status).toBe(500);
    });
});
