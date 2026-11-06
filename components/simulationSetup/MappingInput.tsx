import {useContext, useMemo, useState} from "react";
import {DataContext} from "@context/DataContext";
import {suggestMapping} from "@utils/columnMapping";
import {Field, Label, Listbox, ListboxButton, ListboxOption, ListboxOptions} from "@headlessui/react";
import {CheckIcon, ChevronDownIcon} from "@heroicons/react/24/outline";
import {CommandLineIcon} from "@heroicons/react/20/solid";
import {CsvContext} from "@context/CsvContext";

interface Props {
    field: string,
    label: string
}

const MappingInput = ({field, label}: Props) => {
    const { csvData: { headers, firstLine } } = useContext(CsvContext);
    const { data: { mapping } } = useContext(DataContext);
    const suggested = useMemo(() => suggestMapping(headers), [headers]);
    const [value, setValue] = useState(mapping[field] || suggested[field]);
    const [isValid, setIsValid] = useState(Object.values(mapping).filter(value => value == mapping[field]).length <= 1);

    const sample = value === '__DISCOVER__' ? undefined : firstLine[headers.indexOf(value as string)];

    return <Field className = 'flex h-8 flex-row items-center justify-between gap-4'>
        <div className='flex min-w-0 flex-1 items-baseline gap-3'>
            <Label className='shrink-0'>{ label }</Label>
            {
                sample &&
                <span className='truncate font-mono text-xs text-slate-400' title={sample}>e.g. {sample}</span>
            }
        </div>
        <Listbox name={field}
                 value={value}
                 onChange={_value => {
                     setIsValid(true)
                     setValue(_value)
                 }}
                 invalid={!isValid}>
            <ListboxButton className = {`group flex w-1/2 flex-row items-center 
                    justify-between rounded-2xl bg-white px-4 py-1 text-left
                    data-[invalid]:border-2 data-[invalid]:border-red-500 
                    data-[open]:bg-slate-200`}>
                <span className = {value === '__DISCOVER__' ? 'italic' : ''} >{value === '__DISCOVER__' ? 'Compute from the log' : value as string}</span>
                <ChevronDownIcon className='size-4 text-slate-500 group-data-[open]:rotate-180'/>
            </ListboxButton>
            <ListboxOptions anchor='bottom' className='mt-1 flex w-[var(--button-width)] flex-col gap-1 rounded-2xl bg-white p-1 shadow'>
                {
                    field === 'enablement' &&
                    <>
                        <ListboxOption className = 'group flex cursor-pointer items-center justify-between overflow-hidden rounded-2xl px-4 py-1 hover:bg-slate-200 data-[selected]:bg-slate-300 data-[selected]:font-semibold0'
                                       value = '__DISCOVER__'>
                            <span className = 'flex flex-row items-center gap-2 italic'>
                                <CommandLineIcon className = 'size-4 stroke-1'/>
                                Compute from the log
                            </span>
                            <CheckIcon className = 'hidden size-4 group-data-[selected]:inline'/>
                        </ListboxOption>
                        <hr className = '-mx-1 border-slate-200' />
                    </>
                }
                {
                    [...headers].map((header: string) =>
                        <ListboxOption className = 'group flex cursor-pointer items-center justify-between overflow-hidden rounded-2xl bg-white px-4 py-1 hover:bg-slate-200 data-[selected]:bg-slate-300 data-[selected]:font-semibold'
                                       key = {`${field}.${header}`}
                                       value = {header}>
                            {header}
                            <CheckIcon className='hidden size-4 group-data-[selected]:inline'/>
                        </ListboxOption>
                    )
                }
            </ListboxOptions>
        </Listbox>
    </Field>
}

export default MappingInput;
