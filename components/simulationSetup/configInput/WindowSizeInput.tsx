"use client";

import {useContext, useState, ChangeEvent} from "react";
import {DataContext} from "@context/DataContext";
import {Listbox, ListboxOptions, ListboxOption, ListboxButton} from "@headlessui/react";
import {CheckIcon, ChevronDownIcon} from "@heroicons/react/24/outline";
import {floor} from "@floating-ui/utils";

const WindowSizeInput = () => {
    const { data: { config: { window_size_value, window_size_unit } } } = useContext(DataContext);
    const [value, setValue] = useState(window_size_value || 1);
    const [unit, setUnit] = useState(window_size_unit || 'days');
    const units = ['days', 'weeks', 'months'];
    const maxValues = { days: 90, weeks: 13, months: 3 };

    const handleValueChange = (e: ChangeEvent<HTMLInputElement>) => {
        setValue(Math.max(1, Math.min(maxValues[unit], floor(Number(e.target.value)))));
    };

    const handleUnitChange = (val: string) => {
        const newUnit = units.includes(val) ? val : 'days';

        setUnit(newUnit);
        setValue(value > maxValues[newUnit] ? maxValues[newUnit] : value);
    }

    return <>
        <input type="number" name="window_size_value" value={value} onChange={handleValueChange} min={1} max={maxValues[unit]}
               className='w-1/2 rounded-2xl bg-white px-4 py-1 me-0.5 text-left data-[invalid]:border-2 data-[invalid]:border-red-500 data-[focused]:bg-slate-200'/>
        <Listbox name="window_size_unit" value={unit as any} onChange={handleUnitChange}>
            <ListboxButton className = {`group flex w-1/2 flex-row items-center 
                    justify-between rounded-2xl bg-white px-4 py-1 text-left
                    data-[invalid]:border-2 data-[invalid]:border-red-500 
                    data-[open]:bg-slate-200 ms-0.5`}>
                <span>{unit}</span>
                <ChevronDownIcon className='size-4 text-slate-500 group-data-[open]:rotate-180'/>
            </ListboxButton>
            <ListboxOptions anchor='bottom' className='mt-1 flex w-[var(--button-width)] flex-col gap-1 rounded-2xl bg-white p-1 shadow'>
                {
                    units.map((u: string, key: number) =>
                        <ListboxOption className = 'group flex cursor-pointer items-center justify-between overflow-hidden rounded-2xl bg-white px-4 py-1
                                                    hover:bg-slate-200 data-[selected]:bg-slate-300 data-[selected]:font-semibold' key = {key} value = {u as any}>
                            {u}<CheckIcon className='hidden size-4 group-data-[selected]:inline'/>
                        </ListboxOption>
                    )
                }
            </ListboxOptions>
        </Listbox>
    </>
}

export default WindowSizeInput;
