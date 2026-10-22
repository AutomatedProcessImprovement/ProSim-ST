import {TimeUnits} from "@definitions/config/enums";

export interface LogMapping {
    [key: string]: string | undefined | object
    case?: string
    activity?: string
    enablement?: string
    start?: string
    end?: string
    resource?: string
    attributes?: {
        [key: string]: string
    }
}

export interface AlgorithmConfiguration {
    simulationHorizonValue?: number,
    simulationHorizonUnit?: TimeUnits,
    startingPoint?: string,
    // UTC offset of the uploaded log, e.g. "+02:00"; startingPoint is wall-clock time in this offset
    utcOffset?: string,
}
