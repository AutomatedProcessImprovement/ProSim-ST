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
    return date.toISOString().slice(0, 19).replace("T", " ");
}
