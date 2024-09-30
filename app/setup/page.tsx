"use client";

import {useContext} from "react";
import {HeadersContext} from "@context/headers";

const Setup = () => {
    const { headers } = useContext(HeadersContext);
    console.log(headers);

    return (
        <p>Salam, Setup</p>
    )
}

export default Setup;
