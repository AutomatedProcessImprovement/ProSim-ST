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
    simulation_horizon_value?: number,
    simulation_horizon_unit?: string,
    starting_point?: string,
}
