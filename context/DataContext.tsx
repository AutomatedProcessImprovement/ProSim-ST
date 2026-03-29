"use client";

import {createContext, useState} from "react";
import {TimeUnits} from "@definitions/config/enums";

export const DataContext = createContext({
    data: {
        id: '',
        mapping: {},
        config: {
            simulationHorizonValue: 8,
            simulationHorizonUnit: TimeUnits.WEEKS,
            startingPoint: '',
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
            simulationHorizonValue: 8,
            simulationHorizonUnit: TimeUnits.WEEKS,
            startingPoint: '',
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
