import {Accept, ErrorCode, useDropzone} from "@node_modules/react-dropzone-esm";
import {clsx} from "clsx/lite";
import {ArrowDownTrayIcon, ArrowUpTrayIcon, NoSymbolIcon} from "@node_modules/@heroicons/react/24/outline";
import {filesize} from "filesize";
import {toast} from "sonner";

interface Props {
    onChange: (files: File[]) => void,
    accepts: Accept,
    maxSize: number,
}

const FileInput = ({ onChange, accepts, maxSize }: Props) => {
    const {
        getRootProps,
        getInputProps,
        open,
        isDragActive,
        isDragReject,
    } = useDropzone({
        accept: accepts,
        maxSize: maxSize,
        maxFiles: 1,
        multiple: false,
        noClick: true,
        onDropAccepted: onChange,
        onDropRejected: fileRejections => {
            for (const rejection of fileRejections) {
                for (const error of rejection.errors) {
                    if (error.code === ErrorCode.FileTooLarge){
                        const [size] = (error.message.match(/\d+/g)) as string[]
                        const formattedSize = filesize(size, {base: 2, standard: 'iec'})

                        toast.error(`Error uploading ${rejection.file.name}`, {
                            description: error.message.replace(`${size} bytes`, formattedSize)
                        })
                    } else {
                        toast.error(`Error uploading ${rejection.file.name}`, {
                            description: error.message
                        })
                    }
                }
            }
        }
    });

    return <div {
        ...getRootProps({
            className: clsx(
                'flex', 'flex-col', 'justify-center', 'items-center',
                'h-full', 'flex-1', 'p-8',
                'rounded-2xl', 'border-2', 'border-dashed', 'border-slate-950',
                isDragActive && 'border-green-700 bg-green-50' ,
                isDragReject && 'border-red-700 bg-red-50'
            )
        })
    }>
        {
            isDragActive && !isDragReject &&
            <ArrowDownTrayIcon className='size-24 animate-bounce stroke-green-700 stroke-1'/>
        }
        {
            isDragReject && <>
                <NoSymbolIcon className='size-24 stroke-red-700 stroke-1'/>
                <p className='mt-12 text-center font-black text-red-700'>
                    Only CSV files allowed!
                </p>
            </>
        }
        {
            !isDragActive && <>
                <ArrowUpTrayIcon className='size-24 stroke-1'/>
                <p className='mt-12 text-center font-black'>
                    Drop your log file or click
                    <button onClick={open}
                            type='button'
                            className = {
                                clsx(
                                    'mx-2',
                                    'cursor-pointer', 'underline', 'underline-offset-2',
                                    'hover:bg-slate-950', 'hover:text-slate-50',
                                )
                            }
                    >
                        here
                    </button>
                    to start (max {filesize(maxSize, {base: 2, standard: 'iec'})})
                </p>
            </>
        }
        <input {...getInputProps({
            name: 'file-input',
            id: 'file-input',
            type: 'file',
            hidden: true,
        })}/>
    </div>
}

export default FileInput;
