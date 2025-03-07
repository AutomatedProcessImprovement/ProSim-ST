"use client";

import {useContext, useState} from "react";
import FileItem from "@components/fileHandlers/FileItem";
import FileInput from "@components/fileHandlers/FileInput";
import FilePreview from "@components/fileHandlers/FilePreview";
import {PlayIcon} from "@heroicons/react/24/solid";
import {DataContext} from "@context/DataContext";
import {parseCsvFile} from "@utils/fileHelpers";
import {useRouter} from "next/navigation";
import { v4 as uuid } from 'uuid';
import {CsvContext} from "@context/CsvContext";

const FileForm = () => {
    const [files, setFiles] = useState<File[]>([]);
    const [preview, setPreview] = useState<File | null>(null)
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

    const onFormSubmit = async (e) => {
        e.preventDefault();

        let logStartDate = '';
        let logEndDate = '';
        let headers = new Set<string>();

        for (const file of files) {
            const { fileHeaders, startLog, endLog } = await parseCsvFile(file);

            logStartDate = startLog;
            logEndDate = endLog;
            headers = new Set([...headers, ...fileHeaders]);
        }
        setData(prevData => ({
            ...prevData,
            id: uuid(),
            logFile: files[0],
        }));
        setCsvData(prevData => ({
            ...prevData,
            headers,
            logStartDate,
            logEndDate,
        }));

        router.push('/setup');
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
      </form>
    );
}

export default FileForm;
