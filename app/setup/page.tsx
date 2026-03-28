"use client";

import {useContext, useEffect, useState} from "react";
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
import {calculateEndDate} from "@utils/dateHelpers";
import Loader from "@components/Loader";
import {getCellByHeader, normalizeLogDate} from "@utils/fileHelpers";

const Setup = () => {
    const { data, setData } = useContext(DataContext);
    const { csvData, setCsvData } = useContext(CsvContext);
    const [ endDate, setEndDate ] = useState<Date>(new Date());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const router = useRouter();

    useEffect(() => {
        if (!data.id) {
            router.replace('/');
        }
    }, [data.id, router]);

    useEffect(() => {
        if (data.config.starting_point) {
            setEndDate(calculateEndDate(data.config));
        }
    }, [ data.config ]);

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
        const endLog = normalizeLogDate(getCellByHeader(csvData.lastLine, csvData.headers, logMapping.end));

        setCsvData((prev) => ({
            ...prev,
            logStartDate: startLog ?? "",
            logEndDate: endLog ?? "",
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
            simulation_horizon_value: data.has('simulation_horizon_value') ? data.get('simulation_horizon_value') as unknown as number : undefined,
            simulation_horizon_unit: data.has('simulation_horizon_unit') ? data.get('simulation_horizon_unit') as TimeUnits : undefined,
            starting_point: data.has('starting_point') ? data.get('starting_point') as string : undefined,
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

            router.push(`/simulation/${res.data.id}`);
        } catch (error) {
            toast.error("Error occurred!", {description: error.response.data.error});
        }
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
                        at {data.config.starting_point.slice(0, 16).replace("T", ", ")} and
                        simulate the execution of the process until {endDate.toISOString().slice(0, 16).replace("T", ", ")}
                    </small>
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
                    Also, if you want to receive a notification in your email when the results are available, please introduce your address below.
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
                                                <td>{key}</td>
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
                            <ul className='flex w-full flex-col font-mono'>
                                {
                                    Object.entries(data.config).map(([key, value]) =>
                                        <li key={key} className = 'flex flex-row justify-between'>
                                            <span>{key}</span>
                                            <span className = 'text-right italic text-slate-400'>{value}</span>
                                        </li>
                                    )
                                }
                            </ul>
                        </Preview>
                    </div>
                </div>
            </Step>
        </Stepper>
    </div>
}

export default Setup;
