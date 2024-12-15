"use client";

import FileItem from "@components/fileHandlers/FileItem";
import FileInput from "@components/fileHandlers/FileInput";
import {useContext, useState} from "react";
import {DataContext} from "@context/DataContext";
import {FileTypes} from "@definitions/config/enums";

const ConfigFileInput = ({ type }: { type: FileTypes }) => {
    const { data: { bpmnFile, jsonFile }, setData } = useContext(DataContext);
    let initialState: Array<File>;
    switch (type) {
        case FileTypes.BPMN:
            initialState = bpmnFile ? [bpmnFile] : [];
            break;
        case FileTypes.JSON:
            initialState = jsonFile ? [jsonFile] : [];
            break;
    }
    const [files, setFiles] = useState<File[]>(initialState);

    const removeFile = (file: File) => {
        const newFiles = files.filter(_file => _file.name !== file.name);
        setFiles(newFiles);
        setData(prev => setDataHandler(prev, newFiles));
    };

    const onFilesChanged = (_files: File[]) => {
        const filenames = files.map(file => file.name);
        const newFiles = [...files, ..._files.filter(file => !filenames.includes(file.name))];
        setFiles(newFiles);
        setData(prev => setDataHandler(prev, newFiles));
    };

    const setDataHandler = (prev, newFiles) => {
        const resultData = { ...prev };

        switch (type) {
            case FileTypes.BPMN:
                resultData.bpmnFile = newFiles[0] ?? null;
                break;
            case FileTypes.JSON:
                resultData.jsonFile = newFiles[0] ?? null;
                break;
        }

        return resultData
    }

    const getAcceptableFileTypes = () => {
        switch (type) {
            case FileTypes.BPMN:
                return { 'text/bpmn': ['.bpmn'] };
            case FileTypes.JSON:
                return { 'application/json': ['.json'] }
        }
    }

    return <div>
        {
            files.length > 0 &&
            <FileItem
                file={files[0]}
                key={files[0].name}
                onRemove={removeFile}
                showPreview={false}
                isSingle={false}
                type={type}
            />
        }
        {
            files.length === 0 &&
            <FileInput
                maxSize = { 1024*1024*50 }
                accepts = { getAcceptableFileTypes() }
                onChange = { onFilesChanged }
                message={`Drop your ${type} file or click`}
                type={type}
            />
        }
    </div>
}

export default ConfigFileInput;
