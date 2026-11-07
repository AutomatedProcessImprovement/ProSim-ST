export const SAMPLE_PROCESSES = [
    {name: "loanApplication", label: "Loan application", size: "1.6 MB", startingPoint: "2025-03-25T10:00:00"},
    {name: "p2p", label: "Purchase-to-pay", size: "24 MB", startingPoint: "2020-02-12T10:00:00"},
    {name: "bpic2017", label: "BPIC 2017 loan applications", size: "17 MB", startingPoint: "2016-10-10T13:00:00"},
    {name: "p2pfin", label: "P2PFin, anonymised", size: "2.8 MB", startingPoint: "2023-12-11T10:00:00"},
] as const;

export const SAMPLE_FILES = {
    log: {fileName: "ongoing_event_log.csv", contentType: "text/csv"},
    bpmn: {fileName: "bpmn_model.bpmn", contentType: "text/xml"},
    json: {fileName: "json_parameters.json", contentType: "application/json"},
} as const;
