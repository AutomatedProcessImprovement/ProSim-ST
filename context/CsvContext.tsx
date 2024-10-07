"use client";

import {createContext, useState} from "react";

export const CsvContext = createContext({
    csvData: {
        headers: new Set<string>(),
        logStartDate: '',
        logEndDate: '',
    },
    setCsvData: (value:any) => value,
});

export const CsvProvider = ({ children }) => {
    const [csvData, setCsvData] = useState({
        headers: new Set<string>(),
        logStartDate: '',
        logEndDate: '',
    });

    return (
        <CsvContext.Provider value={{ csvData, setCsvData }}>
            {children}
        </CsvContext.Provider>
    )
}
