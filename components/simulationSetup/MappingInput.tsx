import {useContext, useState} from "react";
import {DataContext} from "@context/DataContext";
import levenshtein from "js-levenshtein";
import {Field, Label, Listbox, ListboxButton, ListboxOption, ListboxOptions} from "@headlessui/react";
import {CheckIcon, ChevronDownIcon} from "@heroicons/react/24/outline";
import {CommandLineIcon} from "@heroicons/react/20/solid";
import {CsvContext} from "@context/CsvContext";

const findOptimalMatch = (field: string, headers:string[]) => {
    if (field === 'enablement') {
        return '__DISCOVER__';
    }

    const distances = [...headers].map(_header => [_header, levenshtein(_header, field)])
        .toSorted(([, d1], [, d2]) => (d1 as number) - (d2 as number));
    const minDistance = Math.min(...distances.map(([, d]) => d as number));
    const options = distances.filter(([, d]) => d === minDistance).map(([header]) => header as string);
    const withSubstring = options.filter(header => header.includes(field) || field.includes(header));

    if (options.length === 1) return options[0];
    if (withSubstring.length > 0) return withSubstring[0];

    return options[0];
}

interface Props {
    field: string,
    label: string
}

const MappingInput = ({field, label}: Props) => {
    const { csvData: { headers } } = useContext(CsvContext);
    const { data: { mapping } } = useContext(DataContext);
    const [value, setValue] = useState(mapping[field] || findOptimalMatch(field, [...headers]));
    const [isValid, setIsValid] = useState(Object.values(mapping).filter(value => value == mapping[field]).length <= 1);

    return <Field className = 'flex h-8 flex-row items-center justify-between'>
        <Label>{ label }</Label>
        <Listbox name={field}
                 value={value as any}
                 onChange={_value => {
                     setIsValid(true)
                     setValue(_value)
                 }}
                 invalid={!isValid}>
            <ListboxButton className = {`group flex w-1/2 flex-row items-center 
                    justify-between rounded-2xl bg-white px-4 py-1 text-left
                    data-[invalid]:border-2 data-[invalid]:border-red-500 
                    data-[open]:bg-slate-200`}>
                <span className = {value === '__DISCOVER__' ? 'italic' : ''} >{value === '__DISCOVER__' ? 'Discover from log' : value as string}</span>
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
                                Discover from log
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
                                       value = {header as any}>
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
