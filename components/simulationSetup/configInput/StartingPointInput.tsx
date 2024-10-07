"use client";

import {ChangeEvent, useContext, useState} from "react";
import {DataContext} from "@context/DataContext";

interface Props {
    minDate: string,
    maxDate: string,
}

const StartingPointInput = ({ minDate, maxDate }: Props) => {
    const { data: { config: { starting_point } } } = useContext(DataContext);
    const [value, setValue] = useState<string>(starting_point || minDate);

    const handleDateChange = (e: ChangeEvent<HTMLInputElement>) => {
        const newDate = e.target.value;

        if (newDate < minDate) setValue(minDate);
        else if (newDate > maxDate) setValue(maxDate);
        else setValue(newDate);
    }

    return <input type="date" name="starting_point" value={value} min={minDate} max={maxDate} onChange={handleDateChange}
                  className='w-1/2 rounded-2xl bg-white px-4 py-1 me-0.5 text-left data-[invalid]:border-2 data-[invalid]:border-red-500 data-[focused]:bg-slate-200' />
}

export default StartingPointInput;
