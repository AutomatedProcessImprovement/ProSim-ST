export const SAMPLE_PROCESSES = [
    {name: "loanApplication", label: "Loan application", size: "1.3 MB"},
    {name: "p2p", label: "Purchase-to-pay", size: "16 MB"},
    {name: "bpic2017", label: "BPIC 2017 loan applications", size: "10 MB"},
    {name: "p2pfin", label: "P2PFin, anonymised", size: "1.7 MB"},
] as const;

export const SAMPLE_FILES = {
    log: {fileName: "ongoing_event_log.csv", contentType: "text/csv"},
    bpmn: {fileName: "bpmn_model.bpmn", contentType: "text/xml"},
    json: {fileName: "json_parameters.json", contentType: "application/json"},
} as const;
