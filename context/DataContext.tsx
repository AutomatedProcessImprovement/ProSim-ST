"use client";

import {createContext, useState} from "react";

export const DataContext = createContext({
    data: {
        id: '',
        mapping: {},
        config: {
            window_size_value: 1,
            window_size_unit: 'days',
            starting_point: '',
        },
        bpmnFile: null,
    },
    setData: (value:any) => value,
});

export const DataProvider = ({ children }) => {
    const [data, setData] = useState({
        id: '',
        mapping: {},
        config: {
            window_size_value: 1,
            window_size_unit: 'days',
            starting_point: '',
        },
        bpmnFile: null,
    });

    return (
      <DataContext.Provider value={{ data, setData }}>
          {children}
      </DataContext.Provider>
    );
}
