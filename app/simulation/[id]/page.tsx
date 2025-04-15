"use client";

import {useEffect, useRef, useState} from "react";
import { useRouter, useParams } from "next/navigation";
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import simulation from "@modules/simulation";
import axios from "axios";
import {SimulationData} from "@definitions/api/types";
import {Canvas} from "@node_modules/bpmn-js/lib/features/context-pad/ContextPadProvider";

const speeds = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

const Simulation = () => {
    const viewerRef = useRef(null);
    const [xml, setXml] = useState<string>(null);
    const [simulationData, setSimulationData] = useState<SimulationData>();
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
            .then((data: SimulationData) => {
                setSimulationData(data);

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
                additionalModules: [simulation(simulationData)]
            });

            viewer.importXML(xml).then(() => {
                const canvas = viewer.get('canvas') as Canvas;
                canvas.zoom('fit-viewport');

                const tokenSimulation = viewer.get('tokenSimulation') as Canvas;
                tokenSimulation.start();
            });
        }
    }, [xml]);

    return <>
        <div ref={viewerRef} style={{ height: '600px', width: '100%' }}></div>
        <div id={'timeline'} className={'timeline'}>
            <div id={'progress-bar'} className={'progress-bar'}></div>
            <div id={'pointer'} className={'pointer'}></div>
            <small id={'start-date'} className={'start-date'}></small>
            <small id={'end-date'} className={'end-date'}></small>
        </div>
        <div id={'timeline-tooltip'} className={'timeline-tooltip'}></div>
        <div id={'play-controls'} className={'play-controls'}>
            <button id={'go-to-start-btn'} className={'control-btn'}>⏮</button>
            <button id={'play-pause-btn'} className={'control-btn'}>⏸</button>
            <button id={'go-to-end-btn'} className={'control-btn'}>⏭</button>
        </div>
        <div id={'simulated-time-box'} className={'simulated-time-box'}>--</div>
        <select id={'speed-select'} className={'speed-select'} defaultValue={1}>
            {speeds.map(speed => (
                <option value={speed} key={speed}>{speed}x</option>
            ))}
        </select>
    </>;
}

export default Simulation;
