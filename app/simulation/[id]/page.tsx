"use client";

import {useEffect, useRef, useState} from "react";
import { useRouter, useParams } from "next/navigation";

import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import TokenSimulationModule from "bpmn-js-token-simulation/lib/viewer";
import "bpmn-js-token-simulation/assets/css/bpmn-js-token-simulation.css";
import axios from "axios";

const Simulation = () => {
    const viewerRef = useRef(null);
    const [xml, setXml] = useState(null);
    const [simulationData, setSimulationData] = useState({});
    const router = useRouter();
    const { id } = useParams();

    const fetchSimulationData = async () => {
        try {
            const res = await axios.get(`/api/simulation/${id}`);

            return res.data;
        } catch (error) {
            router.replace('/');
        }
    }

    useEffect(() => {
        fetchSimulationData()
            .then(data => {
                setSimulationData(data.simulationData);

                const buffer = Buffer.from(data.file);
                const blob = new Blob([buffer], { type: 'application/octet-stream' });

                return blob.text();
            })
            .then((text) => {
                if (text && !xml) {
                    setXml(text);
                }
            })
            .catch(() => {});
    }, [id]);

    useEffect(() => {
        if (xml !== null && typeof window !== "undefined") {
            const viewer = new NavigatedViewer({
                container: viewerRef.current,
                additionalModules: [TokenSimulationModule]
            });

            viewer.importXML(xml).then(() => {
                viewer.get('canvas').zoom('fit-viewport');
            });
        }
    }, [xml]);

    return <div ref={viewerRef} style={{ height: '600px', width: '100%' }}></div>;
}

export default Simulation;
