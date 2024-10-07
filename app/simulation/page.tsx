"use client";

import {useContext, useEffect, useRef, useState} from "react";
import {DataContext} from "@context/DataContext";
import { useRouter } from "next/navigation";

import Modeler from "bpmn-js/lib/Modeler";
import TokenSimulationModule from "bpmn-js-token-simulation";
import "bpmn-js-token-simulation/assets/css/bpmn-js-token-simulation.css";
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css";

const Simulation = () => {
    const viewerRef = useRef(null);
    const [xml, setXml] = useState(null);
    const { data: { bpmnFile } } = useContext(DataContext);
    const router = useRouter();

    useEffect(() => {
        if (bpmnFile === null) {
            router.replace('/');
        }

        const stream = bpmnFile?.text();

        if (stream && !xml) {
            stream.then((xml) => setXml(xml));
        }
    }, [bpmnFile]);

    useEffect(() => {
        if (xml !== null) {
            const modeler = new Modeler({
                container: viewerRef.current,
                additionalModules: [TokenSimulationModule],
                keyboard: {
                    bindTo: document
                }
            });

            modeler.importXML(xml).then(() => {
                const canvas = modeler.get('canvas');
                canvas.zoom('fit-viewport');
            });
        }
    }, [xml]);

    return <div ref={viewerRef} style={{ height: '600px', width: '100%' }}></div>;
}

export default Simulation;
