import {AlgorithmConfiguration} from "@definitions/config/interfaces";
import {TimeUnits} from "@definitions/config/enums";

export const calculateEndDate = (data: AlgorithmConfiguration): Date => {
    const currentDate = new Date(data.starting_point + "Z");
    const horizon = data.simulation_horizon_value;
    const newEndDate = new Date(currentDate);

    switch (data.simulation_horizon_unit) {
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
    const day = date.getUTCDay() < 10 ? '0' + date.getUTCDay() : date.getUTCDay();
    const month = date.getUTCMonth() + 1 < 10 ? '0' + (date.getUTCMonth() + 1) : date.getUTCMonth() + 1;
    const hours = date.getUTCHours() < 10 ? '0' + date.getUTCHours() : date.getUTCHours();
    const minutes = date.getUTCMinutes() < 10 ? '0' + date.getUTCMinutes() : date.getUTCMinutes();
    const seconds = date.getUTCSeconds() < 10 ? '0' + date.getUTCSeconds() : date.getUTCSeconds();

    return day + "/" + month + "/" + date.getUTCFullYear() + ", " + hours + ":" + minutes + ":" + seconds;
}
