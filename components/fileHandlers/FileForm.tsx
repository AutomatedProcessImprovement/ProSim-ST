"use client";

import {useContext, useState} from "react";
import FileItem from "@components/fileHandlers/FileItem";
import FileInput from "@components/fileHandlers/FileInput";
import FilePreview from "@components/fileHandlers/FilePreview";
import {PlayIcon} from "@heroicons/react/24/solid";
import {BeakerIcon} from "@heroicons/react/24/outline";
import {toast} from "sonner";
import {SAMPLE_FILES, SAMPLE_PROCESSES} from "@definitions/samples";
import {DataContext} from "@context/DataContext";
import {LogFileError, parseCsvFile} from "@utils/fileHelpers";
import {useRouter} from "next/navigation";
import { v4 as uuid } from 'uuid';
import {CsvContext} from "@context/CsvContext";

const FileForm = () => {
    const [files, setFiles] = useState<File[]>([]);
    const [preview, setPreview] = useState<File | null>(null)
    const [loadingSample, setLoadingSample] = useState<string | null>(null);
    const { setData } = useContext(DataContext);
    const { setCsvData } = useContext(CsvContext);
    const router = useRouter();

    const onFilePreviewOpen = (file: File) => setPreview(file);
    const onFilePreviewClose = () => setPreview(null);

    const removeFile = (file: File) => {
        setFiles(files.filter(_file => _file.name != file.name));
    };

    const onFilesChanged = (_files: File[]) => {
        const filenames = files.map(file => file.name);
        setFiles([...files, ..._files.filter(file => !filenames.includes(file.name))]);
    };

    const startSetup = async (logFile: File, sample: { bpmnFile?: File, jsonFile?: File, startingPoint?: string } = {}) => {
        const { fileHeaders, fileFirstLine, fileLastLine } = await parseCsvFile(logFile);

        setData(prevData => ({
            ...prevData,
            id: uuid(),
            mapping: {},
            config: { ...prevData.config, startingPoint: sample.startingPoint ?? '' },
            logFile,
            bpmnFile: sample.bpmnFile ?? null,
            jsonFile: sample.jsonFile ?? null,
        }));
        setCsvData(prevData => ({
            ...prevData,
            headers: fileHeaders,
            firstLine: fileFirstLine,
            lastLine: fileLastLine,
        }));

        router.push('/setup');
    }

    const onFormSubmit = async (e) => {
        e.preventDefault();
        if (files.length === 0) return;
        try {
            await startSetup(files[0]);
        } catch (error) {
            toast.error(`${files[0].name} cannot be used as a log`, {
                description: error instanceof LogFileError ? error.message : 'The file could not be read as CSV.',
                duration: 15000,
            });
        }
    }

    const onSampleSelected = async (name: string, startingPoint: string) => {
        if (loadingSample) return;
        setLoadingSample(name);

        try {
            const [logFile, bpmnFile, jsonFile] = await Promise.all(
                [SAMPLE_FILES.log, SAMPLE_FILES.bpmn, SAMPLE_FILES.json].map(async ({ fileName, contentType }) => {
                    const response = await fetch(`/api/samples/${name}/${fileName}`);
                    if (!response.ok) throw new Error(`Could not load ${fileName}`);
                    return new File([await response.blob()], fileName, { type: contentType });
                })
            );
            await startSetup(logFile, { bpmnFile, jsonFile, startingPoint });
        } catch (error) {
            console.log(error);
            toast.error('Could not load the sample', { description: 'Please try again in a moment.' });
            setLoadingSample(null);
        }
    }

    return (
      <form className='w-full inset-0 flex flex-col justify-center gap-4 container h-full'
            onSubmit={onFormSubmit}>
          <div className='flex aspect-video min-h-96 flex-row items-center justify-center gap-4'>
              {
                  files.length > 0 &&
                  <FileItem file={files[0]} key={files[0].name} onOpen = {onFilePreviewOpen} onRemove={removeFile} />
              }
              {
                  files.length === 0 &&
                  <FileInput maxSize = { 1024*1024*50 } accepts = {{ 'text/csv': ['.csv'] }} onChange = { onFilesChanged } />
              }
              <FilePreview file = {preview} onClose = {onFilePreviewClose} />
          </div>
          <button className = 'flex items-center justify-center gap-2 rounded-2xl border-2 border-emerald-800 bg-emerald-600 px-8 py-2 font-bold text-green-50 disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-300'
                  disabled = { files.length === 0 } type = 'submit'>
              Configure & Run <PlayIcon className = 'size-4'/>
          </button>
          <div className='flex flex-wrap items-center justify-center gap-2 text-sm text-slate-600'>
              <BeakerIcon className='size-4'/>
              <span>No log at hand? Try with sample data:</span>
              {
                  SAMPLE_PROCESSES.map(sample =>
                      <button key={sample.name} type='button' onClick={() => onSampleSelected(sample.name, sample.startingPoint)}
                              disabled={loadingSample !== null}
                              className='rounded-2xl border border-slate-300 bg-white px-3 py-1 font-semibold hover:bg-slate-100 disabled:text-slate-300'>
                          {loadingSample === sample.name ? 'Loading…' : `${sample.label} (${sample.size})`}
                      </button>
                  )
              }
          </div>
      </form>
    );
}

export default FileForm;
