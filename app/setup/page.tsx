"use client";

import {useContext, useEffect, useRef, useState} from "react";
import {DataContext} from "@context/DataContext";
import {useRouter} from "next/navigation";
import {
    AdjustmentsHorizontalIcon,
    ArrowRightIcon,
    ArrowsRightLeftIcon,
    DocumentTextIcon,
    ShieldCheckIcon,
    WindowIcon
} from "@heroicons/react/24/outline";
import {AlgorithmConfiguration, LogMapping} from "@definitions/config/interfaces";
import {FileTypes, TimeUnits} from "@definitions/config/enums";
import {toast} from "sonner";
import {ConfigFileInput, MappingInput, Preview, Step, Stepper} from "@components/simulationSetup";
import {ConfigInput, SimulationHorizonInput, StartingPointInput} from "@components/simulationSetup/configInput";
import {CsvContext} from "@context/CsvContext";
import {clsx} from "clsx/lite";
import axios from "axios";
import {calculateEndDate, formatHorizon, formatReadableDate, formatUtcOffset, logTimeToUtc} from "@utils/dateHelpers";
import Loader from "@components/Loader";
import {getCellByHeader, getLogUtcOffset, normalizeLogDate} from "@utils/fileHelpers";
import {clearSetup, loadSetup, saveSetup} from "@utils/setupStorage";
import {CaseSpans, countOngoingCases, readCaseSpans} from "@utils/ongoingCases";

const MAPPING_LABELS: Record<string, string> = {
    case: 'Case ID',
    activity: 'Activity',
    enablement: 'Enablement',
    start: 'Start',
    end: 'End',
    resource: 'Resource',
};

const Setup = () => {
    const { data, setData } = useContext(DataContext);
    const { csvData, setCsvData } = useContext(CsvContext);
    const [ endDate, setEndDate ] = useState<Date>(new Date());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const router = useRouter();

    const [isRestoring, setIsRestoring] = useState(!data.id);
    const [caseSpans, setCaseSpans] = useState<CaseSpans | null>(null);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    // After a refresh the in-memory setup is gone: restore it from this browser, or go back to the upload page
    useEffect(() => {
        if (data.id) return;

        let cancelled = false;
        loadSetup()
            .then((saved) => {
                if (cancelled) return;
                if (saved && (saved.data as typeof data)?.id) {
                    setData(saved.data);
                    setCsvData(saved.csvData);
                    setIsRestoring(false);
                } else {
                    router.replace('/');
                }
            })
            .catch(() => {
                if (!cancelled) router.replace('/');
            });

        return () => { cancelled = true; };
        // Only on the first render: later changes of data.id come from the restore itself
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!data.id) return;

        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            saveSetup({data, csvData}).catch(() => {});
        }, 500);

        return () => clearTimeout(saveTimeoutRef.current);
    }, [data, csvData]);

    useEffect(() => {
        if (data.config.startingPoint) {
            setEndDate(calculateEndDate(data.config));
        }
    }, [ data.config ]);

    // Spans of the cases in the log, to tell how many are in progress at the chosen starting point
    const { case: caseColumn, start: startColumn, end: endColumn } = data.mapping as Record<string, string>;
    useEffect(() => {
        if (!data.logFile || !caseColumn || !endColumn) return;

        let cancelled = false;
        setCaseSpans(null);
        readCaseSpans(data.logFile, caseColumn, startColumn, endColumn)
            .then(spans => { if (!cancelled) setCaseSpans(spans); })
            .catch(() => {});

        return () => { cancelled = true; };
    }, [data.logFile, caseColumn, startColumn, endColumn]);

    const ongoingCases = (caseSpans && data.config.startingPoint)
        ? countOngoingCases(caseSpans, logTimeToUtc(data.config.startingPoint, csvData.logUtcOffset).getTime())
        : null;

    const ongoingCasesNote = ongoingCases === null
        ? null
        : ongoingCases === 0
            ? <p className='rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900'>
                No case in the uploaded log is in progress at this starting point, so the simulation starts
                without ongoing work and only shows new arrivals. Choose an earlier starting point to start from
                a busy process.
            </p>
            : <p className='text-sm text-slate-600'>
                {ongoingCases} {ongoingCases === 1 ? 'case is' : 'cases are'} in progress in the uploaded log at
                this starting point.
            </p>;

    const onMappingCompleted = (data: FormData) => {
        const logMapping: LogMapping = {
            case: data.get('case') as string,
            activity: data.get('activity') as string,
            enablement: data.get('enablement') as string,
            start: data.get('start') as string,
            end: data.get('end') as string,
            resource: data.get('resource') as string,
        }

        logMapping.attributes = Object.fromEntries(
            csvData.headers.filter(header => !Object.values(logMapping).includes(header)).map(header => [header, header])
        );

        setData((prev) => ({
            ...prev,
            mapping: logMapping,
        }));

        const startLog = normalizeLogDate(getCellByHeader(csvData.firstLine, csvData.headers, logMapping.start));
        const rawEndLog = getCellByHeader(csvData.lastLine, csvData.headers, logMapping.end);
        const endLog = normalizeLogDate(rawEndLog);

        setCsvData((prev) => ({
            ...prev,
            logStartDate: startLog ?? "",
            logEndDate: endLog ?? "",
            logUtcOffset: getLogUtcOffset(rawEndLog),
        }))

        if (new Set(Object.keys(logMapping)).size === new Set(Object.values(logMapping)).size) {
            return true
        } else {
            toast.error('Invalid mapping', {description: 'You assigned the same column to multiple attributes!'})
            return false
        }
    }

    const onConfigCompleted = (data: FormData) => {
        const algorithmConfiguration: AlgorithmConfiguration = {
            simulationHorizonValue: data.has('simulationHorizonValue') ? Number(data.get('simulationHorizonValue')) : undefined,
            simulationHorizonUnit: data.has('simulationHorizonUnit') ? data.get('simulationHorizonUnit') as TimeUnits : undefined,
            startingPoint: data.has('startingPoint') ? data.get('startingPoint') as string : undefined,
            utcOffset: csvData.logUtcOffset,
        }

        setData((prev) => ({
            ...prev,
            config: algorithmConfiguration,
        }));

        if (Object.values(algorithmConfiguration).some(value => value === undefined)) {
            toast.error('Invalid configuration', {description: 'You have to set a value for every configuration parameter!'});
            return false;
        } else {
            return true;
        }
    }

    const onBpmnCompleted = () => {
        if (data.bpmnFile && data.jsonFile) return true;
        else {
            if (!data.bpmnFile) {
                toast.error('Invalid BPMN', {description: 'You have to upload a BPMN model!'});
                return false;
            }
            if (!data.jsonFile) {
                toast.error('Invalid JSON', {description: 'You have to upload a JSON file!'});
                return false;
            }
        }
    }

    const onSubmit = async () => {
        if (isSubmitting) return;

        setIsSubmitting(true);

        const formData = new FormData();
        Object.keys(data).forEach((key) => {
            let value = data[key];
            if (!(data[key] instanceof File) && (typeof data[key] === 'object')) {
                value = JSON.stringify(data[key]);
            }
            formData.append(key, value);
        });

        try {
            const res = await axios.post('/api/simulation', formData);

            clearTimeout(saveTimeoutRef.current);
            await clearSetup().catch(() => {});
            router.push(`/simulation/${res.data.id}`);
        } catch (error) {
            setIsSubmitting(false);
            toast.error("Error occurred!", {
                description: error?.response?.data?.error ?? "The simulation could not be started. Please try again.",
            });
        }
    }

    if (isRestoring || !data.id) {
        return <p className="p-16 text-center text-sm text-slate-400">Restoring your setup…</p>;
    }

    return <div className={'max-w-screen-lg mx-auto p-4'}>
        {isSubmitting && (
            <div className="fixed inset-0 z-50 grid place-items-center bg-black/30">
                <Loader />
            </div>
        )}

        <Stepper onSubmit={onSubmit}>
            <Step label='Setup the log mapping'
                  icon={<ArrowsRightLeftIcon/>}
                  onNext={onMappingCompleted}
            >
                <p className = 'mb-4 px-4 text-justify text-sm font-medium italic text-slate-400'>
                    Configure the mapping between the log attributes and the CSV file columns.
                    Only mandatory attributes need to be mapped.
                    The rest of the columns from the CSV file will be considered as additional log attributes.
                </p>
                <div className = 'flex flex-col gap-2 p-4'>
                    <MappingInput field = 'case' label = 'Case ID' />
                    <MappingInput field = 'activity' label = 'Activity' />
                    <MappingInput field = 'enablement' label = 'Enablement timestamp' />
                    <MappingInput field = 'start' label = 'Start timestamp' />
                    <MappingInput field = 'end' label = 'End timestamp' />
                    <MappingInput field = 'resource' label = 'Resource' />
                </div>
            </Step>
            <Step label='Setup your experiment'
                  icon={<AdjustmentsHorizontalIcon/>}
                  onNext={onConfigCompleted}
            >
                <div className = 'flex flex-col gap-4 p-4'>
                    <ConfigInput label='Starting Point' description='The time at which the short-term simulation begins (by default, the end of the uploaded event log).'>
                        <StartingPointInput minDate={csvData.logStartDate} maxDate={csvData.logEndDate} />
                    </ConfigInput>
                    <ConfigInput label='Simulation Horizon' description='The duration (in time) to simulate, starting from the specified starting point.'>
                        <SimulationHorizonInput />
                    </ConfigInput>
                    <small>
                        With the current configuration, ProST will compute the state of the process
                        at {formatReadableDate(data.config.startingPoint)} and
                        simulate the execution of the process until {formatReadableDate(endDate)}
                        {" "}({formatUtcOffset(csvData.logUtcOffset)}, the time zone of the uploaded log)
                    </small>
                    {ongoingCasesNote}
                </div>
            </Step>
            <Step label='Upload the BPMN model and JSON file'
                  icon={<WindowIcon />}
                  onNext={onBpmnCompleted}
            >
                <div className = 'flex'>
                    <div className = 'w-1/2'>
                        <p className = 'mb-4 px-4 text-justify text-sm font-medium italic text-slate-400'>
                            Only the files with the <code>.bpmn</code> extension are accepted
                        </p>
                        <ConfigFileInput type={FileTypes.BPMN} />
                    </div>
                    <div className = 'w-1/2'>
                        <p className = 'mb-4 px-4 text-justify text-sm font-medium italic text-slate-400'>
                            Only the files with the <code>.json</code> extension are accepted
                        </p>
                        <ConfigFileInput type={FileTypes.JSON} />
                    </div>
                </div>
            </Step>
            <Step label='Validate configuration'
                  icon={<ShieldCheckIcon />}
                  onNext={() => true}
            >
                <p className = 'mb-4 px-4 text-justify text-sm font-medium italic text-slate-400'>
                    Please, check that the files, mapping and configuration specified are correct.
                </p>
                <div className = 'flex flex-col gap-2 p-4'>
                    <div className='mb-4 grid grid-cols-3 gap-2'>
                        <Preview label='Files'>
                            <ul>
                                <li className='flex items-center gap-2 font-mono mb-2'>
                                    <DocumentTextIcon className='size-3'/>
                                    <span className='w-11/12 break-words'>{(data.bpmnFile as File)?.name}</span>
                                </li>
                                <li className='flex items-center gap-2 font-mono'>
                                    <DocumentTextIcon className='size-3'/>
                                    <span className='w-11/12 break-words'>{(data.jsonFile as File)?.name}</span>
                                </li>
                            </ul>
                        </Preview>
                        <Preview label = 'Mapping'>
                            <table className = 'w-full font-mono'>
                                <tbody>
                                {
                                    Object.entries(data.mapping)
                                        .filter((entry) => entry[0] !== 'attributes')
                                        .map(([key, value]) =>
                                            <tr key={key}>
                                                <td className='font-sans'>{MAPPING_LABELS[key] ?? key}</td>
                                                <td className = 'px-2'>
                                                    <ArrowRightIcon className='size-3'/>
                                                </td>
                                                <td className = { clsx('text-right', value === '__DISCOVER__' && 'italic') }>
                                                    {value === '__DISCOVER__' ? 'Discover' : value as string}
                                                </td>
                                            </tr>
                                        )
                                }
                                </tbody>
                            </table>
                        </Preview>
                        <Preview label = 'Setup'>
                            <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1'>
                                {
                                    [
                                        ['Starting point', formatReadableDate(data.config.startingPoint)],
                                        ['Horizon', formatHorizon(data.config.simulationHorizonValue, data.config.simulationHorizonUnit)],
                                        ['Simulated until', formatReadableDate(endDate)],
                                        ['Time zone', formatUtcOffset(csvData.logUtcOffset)],
                                        ['Cases in progress', ongoingCases ?? '…'],
                                    ].map(([label, value]) =>
                                        <div key={label as string} className='contents'>
                                            <dt>{label}</dt>
                                            <dd className='whitespace-nowrap text-right text-slate-500'>{value}</dd>
                                        </div>
                                    )
                                }
                            </dl>
                            {ongoingCases === 0 && <div className='mt-3'>{ongoingCasesNote}</div>}
                        </Preview>
                    </div>
                </div>
            </Step>
        </Stepper>
    </div>
}

export default Setup;
