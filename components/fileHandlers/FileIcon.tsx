import {DocumentIcon} from "@heroicons/react/24/outline";
import { clsx } from 'clsx/lite';

interface Props {
    type ?: string,
}

const FileIcon = ({ type = '' }: Props) => {
    return <span className = 'relative flex flex-col items-center'>
        <DocumentIcon className = 'size-32 fill-white stroke-1'/>
        <span className = {
            clsx(
                'absolute', 'bottom-5',
                'w-fit', 'px-2', 'py-1',
                'rounded', 'bg-emerald-700', 'border-2', 'border-emerald-900',
                'text-emerald-50', 'font-bold', 'leading-none',
            )
        }>
            { type }
        </span>
    </span>
}

export default FileIcon;
