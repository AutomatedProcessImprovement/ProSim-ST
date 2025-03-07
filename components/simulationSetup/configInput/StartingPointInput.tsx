"use client";

import {ChangeEvent, useContext, useEffect, useState} from "react";
import {DataContext} from "@context/DataContext";

interface Props {
    minDate: string,
    maxDate: string,
}

const StartingPointInput = ({ minDate, maxDate }: Props) => {
    const { data: { config: { starting_point } }, setData } = useContext(DataContext);
    const [value, setValue] = useState<string>(starting_point || maxDate);

    useEffect(() => {
        setToContext(value);
    }, [value]);

    const handleDateChange = (e: ChangeEvent<HTMLInputElement>) => {
        let newDate = e.target.value;

        if (newDate < minDate) newDate = minDate;
        else if (newDate > maxDate) newDate = maxDate;

        setValue(newDate);
        setToContext(newDate);
    }

    function setToContext(newDate) {
        setData((prev) => ({
            ...prev,
            config: {
                ...prev.config,
                starting_point: newDate,
            },
        }));
    }

    return <input type="datetime-local" name="starting_point" value={value} min={minDate} max={maxDate} step={1} onChange={handleDateChange}
                  className='w-1/2 rounded-2xl bg-white px-4 py-1 me-0.5 text-left data-[invalid]:border-2 data-[invalid]:border-red-500 data-[focused]:bg-slate-200' />
}

export default StartingPointInput;
