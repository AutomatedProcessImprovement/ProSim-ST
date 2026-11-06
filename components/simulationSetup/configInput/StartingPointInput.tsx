"use client";

import {ChangeEvent, useCallback, useContext, useEffect} from "react";
import {DataContext} from "@context/DataContext";

interface Props {
    minDate: string,
    maxDate: string,
}

const StartingPointInput = ({ minDate, maxDate }: Props) => {
    const { data: { config: { startingPoint } }, setData } = useContext(DataContext);
    const value = startingPoint || maxDate;

    const setStartingPoint = useCallback((newDate: string) => {
        setData((prev) => ({
            ...prev,
            config: { ...prev.config, startingPoint: newDate },
        }));
    }, [setData]);

    useEffect(() => {
        if (!startingPoint && maxDate) setStartingPoint(maxDate);
    }, [startingPoint, maxDate, setStartingPoint]);

    const handleDateChange = (e: ChangeEvent<HTMLInputElement>) => {
        let newDate = e.target.value;

        if (newDate < minDate) newDate = minDate;
        else if (newDate > maxDate) newDate = maxDate;

        setStartingPoint(newDate);
    }

    return <input type="datetime-local" name="startingPoint" value={value} min={minDate} max={maxDate} step={1} onChange={handleDateChange}
                  className='w-1/2 rounded-2xl bg-white px-4 py-1 me-0.5 text-left data-[invalid]:border-2 data-[invalid]:border-red-500 data-[focused]:bg-slate-200' />
}

export default StartingPointInput;
