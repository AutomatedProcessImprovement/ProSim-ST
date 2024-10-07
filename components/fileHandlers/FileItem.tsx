import FileIcon from "./FileIcon";
import { filesize } from 'filesize';
import {ArchiveBoxXMarkIcon, EyeIcon} from "@heroicons/react/24/outline";

interface Props {
    file: File,
    onRemove?: (file: File) => void,
    onOpen?: (file: File) => void,
    showPreview?: boolean,
}

const FileItem = ({file, onRemove, onOpen, showPreview = true}: Props) => {
    return <div className='flex flex-row items-center justify-center gap-2 p-2'>
        <FileIcon type = {file.type.split('/')[1]} />
        <span className='flex flex-col justify-center px-2 text-right'>
            <h1 className='font-mono text-xl font-semibold'>{file.name}</h1>
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
