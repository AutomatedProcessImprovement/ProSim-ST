"use client";

import FileItem from "@components/fileHandlers/FileItem";
import FileInput from "@components/fileHandlers/FileInput";
import {useContext, useState} from "react";
import {DataContext} from "@context/DataContext";

const BpmnInput = () => {
    const { data: { bpmnFile }, setData } = useContext(DataContext);
    const [files, setFiles] = useState<File[]>(bpmnFile ? [bpmnFile] : []);

    const removeFile = (file: File) => {
        const newFiles = files.filter(_file => _file.name != file.name);
        setFiles(newFiles);
        setData(prev => ({
            ...prev,
            bpmnFile: newFiles[0] ?? null,
        }));
    };

    const onFilesChanged = (_files: File[]) => {
        const filenames = files.map(file => file.name);
        const newFiles = [...files, ..._files.filter(file => !filenames.includes(file.name))];
        setFiles(newFiles);
        setData(prev => ({
            ...prev,
            bpmnFile: newFiles[0] ?? null,
        }));
    };

    return <div className='flex aspect-video min-h-96 flex-row items-center justify-center gap-4'>
        {
            files.length > 0 &&
            <FileItem file={files[0]} key={files[0].name} onRemove={removeFile} showPreview={false} />
        }
        {
            files.length === 0 &&
            <FileInput
                maxSize = { 1024*1024*50 }
                accepts = {{ 'text/bpmn': ['.bpmn'] }}
                onChange = { onFilesChanged }
                message={'Drop your BPMN model or click'}
            />
        }
    </div>
}

export default BpmnInput;
