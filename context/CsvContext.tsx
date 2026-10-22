"use client";

import {createContext, useState} from "react";

export const CsvContext = createContext({
    csvData: {
        headers: new Array<string>(),
        firstLine: new Array<string>(),
        lastLine: new Array<string>(),
        logStartDate: '',
        logEndDate: '',
        logUtcOffset: '+00:00',
    },
    setCsvData: (value:unknown) => value,
});

export const CsvProvider = ({ children }) => {
    const [csvData, setCsvData] = useState({
        headers: new Array<string>(),
        firstLine: new Array<string>(),
        lastLine: new Array<string>(),
        logStartDate: '',
        logEndDate: '',
        logUtcOffset: '+00:00',
    });

    return (
        <CsvContext.Provider value={{ csvData, setCsvData }}>
            {children}
        </CsvContext.Provider>
    )
}
