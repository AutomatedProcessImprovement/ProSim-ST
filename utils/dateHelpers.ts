import {AlgorithmConfiguration} from "@definitions/config/interfaces";
import {TimeUnits} from "@definitions/config/enums";

export const calculateEndDate = (data: AlgorithmConfiguration): Date => {
    const currentDate = new Date(data.startingPoint + "Z");
    const horizon = data.simulationHorizonValue;
    const newEndDate = new Date(currentDate);

    switch (data.simulationHorizonUnit) {
        case TimeUnits.DAYS:
            newEndDate.setDate(currentDate.getDate() + Number(horizon));
            break;
        case TimeUnits.WEEKS:
            newEndDate.setDate(currentDate.getDate() + Number(horizon) * 7);
            break;
        case TimeUnits.MONTHS:
            newEndDate.setMonth(currentDate.getMonth() + Number(horizon));
            break;
    }

    return newEndDate;
}

export const formatDateString = (date: Date) => {
    return date.toISOString().slice(0, 19).replace("T", " ");
}

export const getHourDifference = (date1: Date, date2: Date) => {
    const diffMs = Math.abs(date2.getTime() - date1.getTime());
    const diffHours = diffMs / (1000 * 60 * 60);
    return Math.ceil(diffHours);
}

const offsetToMinutes = (utcOffset: string = "+00:00") => {
    const match = utcOffset.match(/^([+-])(\d{2}):(\d{2})$/);
    if (!match) return 0;
    const minutes = Number(match[2]) * 60 + Number(match[3]);
    return match[1] === "-" ? -minutes : minutes;
}

// Turns a wall-clock time from the log ("2025-04-04T15:46:14") in the log's UTC offset into an absolute date
export const logTimeToUtc = (wallClock: string, utcOffset: string = "+00:00"): Date => {
    return new Date(new Date(wallClock + "Z").getTime() - offsetToMinutes(utcOffset) * 60000);
}

// Formats an absolute date as wall-clock time in the log's UTC offset, e.g. "2025-04-04 15:46:14"
export const formatInLogTime = (date: Date, utcOffset: string = "+00:00") => {
    return formatDateString(new Date(date.getTime() + offsetToMinutes(utcOffset) * 60000));
}

export const formatUtcOffset = (utcOffset: string = "+00:00") => `UTC${utcOffset}`;

// Formats a wall-clock time (a "2025-04-04T15:46:14" string, or a Date whose UTC fields hold it) as "4 Apr 2025, 15:46"
export const formatReadableDate = (wallClock: string | Date) => {
    const date = typeof wallClock === "string" ? new Date(wallClock + "Z") : wallClock;
    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
    }).format(date);
}

// "8 weeks", "1 week"
export const formatHorizon = (value: number, unit: string) => `${value} ${value === 1 ? unit.replace(/s$/, "") : unit}`;
