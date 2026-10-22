// Sample processes bundled in sampleProcesses/<name>/, offered on the home page
export const SAMPLE_PROCESSES = [
    {name: "loanApplication", label: "Loan application", size: "1.6 MB"},
    {name: "p2p", label: "Purchase-to-pay", size: "24 MB"},
] as const;

export const SAMPLE_FILES = {
    log: {fileName: "ongoing_event_log.csv", contentType: "text/csv"},
    bpmn: {fileName: "bpmn_model.bpmn", contentType: "text/xml"},
    json: {fileName: "json_parameters.json", contentType: "application/json"},
} as const;
