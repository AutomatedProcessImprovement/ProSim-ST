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
    window_size_value?: number,
    window_size_unit?: string,
    starting_point?: string,
}
