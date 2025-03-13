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
    const day = date.getDay() < 10 ? '0' + date.getDay() : date.getDay();
    const month = date.getMonth() + 1 < 10 ? '0' + date.getMonth() : date.getMonth();
    const hours = date.getHours() < 10 ? '0' + date.getHours() : date.getHours();
    const minutes = date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes();
    const seconds = date.getSeconds() < 10 ? '0' + date.getSeconds() : date.getSeconds();

    return day + "/" + month + "/" + date.getFullYear() + ", " + hours + ":" + minutes + ":" + seconds;
}
