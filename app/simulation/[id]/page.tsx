"use client";

import {useEffect, useRef, useState} from "react";
import { useRouter, useParams } from "next/navigation";

import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import simulateToken from "@modules/simulation";
import axios from "axios";
import {SimulationData} from "@definitions/simulation/types";
import {ConfigData} from "@definitions/config/types";

const Simulation = () => {
    const viewerRef = useRef(null);
    const [xml, setXml] = useState<string>(null);
    const [simulationData, setSimulationData] = useState<SimulationData>();
    const [configData, setConfigData] = useState<ConfigData>();
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
                setConfigData({
                    startDate: new Date(data.configData.startDate),
                    endDate: new Date(data.configData.endDate),
                });

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
                additionalModules: [simulateToken(simulationData, configData)]
            });

            viewer.importXML(xml).then(() => {
                viewer.get('canvas').zoom('fit-viewport');

                const tokenSimulation = viewer.get('tokenSimulation');
                tokenSimulation.start();
            });
        }
    }, [xml]);

    return <div ref={viewerRef} style={{ height: '600px', width: '100%' }}></div>;
}

export default Simulation;
