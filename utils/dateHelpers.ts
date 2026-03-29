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
