"use client";

import {ChangeEvent, useContext, useEffect, useState} from "react";
import {DataContext} from "@context/DataContext";
import {Listbox, ListboxButton, ListboxOption, ListboxOptions} from "@headlessui/react";
import {CheckIcon, ChevronDownIcon} from "@heroicons/react/24/outline";
import {floor} from "@floating-ui/utils";
import {TimeUnits} from "@definitions/config/enums";

const SimulationHorizonInput = () => {
    const { data: { config: { simulation_horizon_value, simulation_horizon_unit } }, setData } = useContext(DataContext);
    const [value, setValue] = useState(simulation_horizon_value || 8);
    const [unit, setUnit] = useState(simulation_horizon_unit || TimeUnits.WEEKS);
    const units: Array<TimeUnits> = [TimeUnits.DAYS, TimeUnits.WEEKS, TimeUnits.MONTHS];

    useEffect(() => {
        setData((prev) => ({
            ...prev,
            config: { ...prev.config, simulation_horizon_value: value },
        }));
    }, [value, setData]);

    useEffect(() => {
        setData((prev) => ({
            ...prev,
            config: { ...prev.config, simulation_horizon_unit: unit },
        }));
    }, [unit, setData]);

    const handleValueChange = (e: ChangeEvent<HTMLInputElement>) => {
        setValue(Math.max(1, floor(Number(e.target.value))));
    };

    const handleUnitChange = (val: TimeUnits) => {
        setUnit(units.includes(val) ? val : TimeUnits.WEEKS);
    }

    return <>
        <input type="number" name="simulation_horizon_value" value={value} onChange={handleValueChange} min={1}
               className='w-1/2 rounded-2xl bg-white px-4 py-1 me-0.5 text-left data-[invalid]:border-2 data-[invalid]:border-red-500 data-[focused]:bg-slate-200'/>
        <Listbox name="simulation_horizon_unit" value={unit} onChange={handleUnitChange}>
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
                        <ListboxOption
                            className =
                                "group flex cursor-pointer items-center justify-between overflow-hidden rounded-2xl bg-white px-4 py-1hover:bg-slate-200 data-[selected]:bg-slate-300 data-[selected]:font-semibold"
                            key = {key} value = {u}
                        >
                            {u}<CheckIcon className='hidden size-4 group-data-[selected]:inline'/>
                        </ListboxOption>
                    )
                }
            </ListboxOptions>
        </Listbox>
    </>
}

export default SimulationHorizonInput;
