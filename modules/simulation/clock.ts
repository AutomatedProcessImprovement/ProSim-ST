import {SimulationData} from "@definitions/api/types";

export type SimulationClock = {
    initial: Date;
    final: Date;
    utcOffset: string;
    current?: Date;
};

export const createClock = (simulationData: SimulationData): SimulationClock => ({
    initial: new Date(simulationData.startDate + 'Z'),
    final: new Date(simulationData.endDate + 'Z'),
    utcOffset: simulationData.utcOffset ?? "+00:00",
});

export const nowOf = (clock: SimulationClock) => (clock.current ?? clock.initial).getTime();
