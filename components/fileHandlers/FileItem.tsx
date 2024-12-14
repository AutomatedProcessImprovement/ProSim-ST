import FileIcon from "./FileIcon";
import { filesize } from 'filesize';
import {ArchiveBoxXMarkIcon, EyeIcon} from "@heroicons/react/24/outline";
import {FileType} from "@definitions/config";

interface Props {
    file: File,
    onRemove?: (file: File) => void,
    onOpen?: (file: File) => void,
    showPreview?: boolean,
    isSingle?: boolean,
    type?: FileType,
}

const FileItem = ({file, onRemove, onOpen, showPreview = true, isSingle = true, type = "CSV"}: Props) => {
    return <div className={`flex flex-row items-center ${isSingle ? 'justify-center' : 'w-full'}`}>
        <FileIcon type = {type} />
        <span className={`flex flex-col ${isSingle ? '' : 'w-2/3'}`}>
            <h1 className='font-mono text-xl text-start font-semibold break-words'>{file.name}</h1>
            <span className='font-mono'>
                {filesize(file.size, {base: 2, standard: 'iec'})}
            </span>
            <menu className='mt-4 flex gap-4'>
                {showPreview && <li>
                    <button className='flex cursor-pointer justify-end gap-1 font-mono text-xs hover:underline'
                            type='button'
                            onClick={() => !!onOpen && onOpen(file)}
                    >
                        <EyeIcon className='size-3.5 stroke-1'/>
                        Preview file
                    </button>
                </li>}
                <li>
                    <button className='flex cursor-pointer justify-end gap-1 font-mono text-xs hover:underline'
                            type='button'
                            onClick={() => !!onRemove && onRemove(file)}
                    >
                        <ArchiveBoxXMarkIcon className='size-3.5 stroke-1'/>
                        Discard file
                    </button>
                </li>
            </menu>
        </span>
    </div>
}

export default FileItem;
