"use client";

import {createContext, useState} from "react";

export const HeadersContext = createContext({
    headers: new Set<string>(),
    setHeaders: (value:any) => value,
});

export const HeadersProvider = ({ children }) => {
    const [headers, setHeaders] = useState(new Set<string>());

    return (
      <HeadersContext.Provider value={{ headers, setHeaders }}>
          {children}
      </HeadersContext.Provider>
    );
}
