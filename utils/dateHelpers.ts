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

export const logTimeToUtc = (wallClock: string, utcOffset: string = "+00:00"): Date => {
    return new Date(new Date(wallClock + "Z").getTime() - offsetToMinutes(utcOffset) * 60000);
}

export const formatInLogTime = (date: Date, utcOffset: string = "+00:00") => {
    return formatDateString(new Date(date.getTime() + offsetToMinutes(utcOffset) * 60000));
}

export const toOffsetIso = (date: Date, utcOffset: string = "+00:00") => {
    return new Date(date.getTime() + offsetToMinutes(utcOffset) * 60000).toISOString().replace("Z", utcOffset);
}

export const formatUtcOffset = (utcOffset: string = "+00:00") => `UTC${utcOffset}`;

export const formatReadableDate = (wallClock: string | Date) => {
    const date = typeof wallClock === "string" ? new Date(wallClock + "Z") : wallClock;
    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
    }).format(date);
}

export const formatHorizon = (value: number, unit: string) => `${value} ${value === 1 ? unit.replace(/s$/, "") : unit}`;

export const formatDuration = (ms: number) => {
    const minutes = Math.max(0, Math.floor(ms / 60000));
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
    const days = Math.floor(hours / 24);
    return hours % 24 ? `${days} d ${hours % 24} h` : `${days} d`;
};

export const formatShortDate = (date: Date, utcOffset: string = "+00:00", withTime = false) => {
    const wallClock = new Date(formatInLogTime(date, utcOffset).replace(" ", "T") + "Z");
    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        ...(withTime ? {hour: "2-digit", minute: "2-digit", hourCycle: "h23"} : {}),
        timeZone: "UTC",
    }).format(wallClock).replace(",", "");
};
