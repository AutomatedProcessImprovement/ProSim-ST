"use client";

import {createContext, useState} from "react";
import {TimeUnits} from "@definitions/config/enums";

export const DataContext = createContext({
    data: {
        id: '',
        mapping: {},
        config: {
            simulation_horizon_value: 8,
            simulation_horizon_unit: TimeUnits.WEEKS,
            starting_point: '',
        },
        logFile: null,
        bpmnFile: null,
        jsonFile: null,
    },
    setData: (value:any) => value,
});

export const DataProvider = ({ children }) => {
    const [data, setData] = useState({
        id: '',
        mapping: {},
        config: {
            simulation_horizon_value: 8,
            simulation_horizon_unit: TimeUnits.WEEKS,
            starting_point: '',
        },
        logFile: null,
        bpmnFile: null,
        jsonFile: null,
    });

    return (
      <DataContext.Provider value={{ data, setData }}>
          {children}
      </DataContext.Provider>
    );
}
