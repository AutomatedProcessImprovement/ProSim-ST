"use client";

import {useEffect, useState} from "react";
import {readLines} from "@utils/fileHelpers";
import {Dialog, DialogBackdrop, DialogPanel, DialogTitle} from "@headlessui/react";
import {clsx} from "clsx/lite";
import {filesize} from "filesize";
import {XMarkIcon} from "@heroicons/react/24/outline";

interface Props {
    file: File | null
    onClose: () => void
}

const FilePreview = ({file, onClose}: Props) => {
    const [isPending, setIsPending] = useState<boolean>(true);
    const [content, setContent] = useState<string[]>([]);

    useEffect(() => {
        if (file) {
            readLines(file, {removeWhite: true}).then(text => {
                setContent(text)
                setIsPending(false)
            })
        }
    }, [isPending, file]);

    if (!file) return;

    const parseRow = (line: number, row?: string) => {
        return <tr key={line}>
            <td className='bg-slate-200 px-4'>{line > 0 ? line : ''}</td>
            {
                (row as string)?.split(',').map((cell, idx) => {
                    return <td className='px-4' key={`${line}.${idx}`}>{cell}</td>
                })
            }
        </tr>
    }

    const parseHeader = (row?: string) => {
        return <tr>
            <th></th>
            {
                (row as string)?.split(',').map((cell, idx) => {
                    return <th className='px-4 text-left' key={`header.${idx}`}>{cell}</th>
                })
            }
        </tr>
    }

    return <Dialog open = {!!file}
                   onClose = {onClose}>
        <DialogBackdrop transition className = 'fixed inset-0 bg-slate-900/75' />
        <div className='fixed inset-0 flex w-screen items-center justify-center p-4'>
            <DialogPanel className={
                clsx(
                    'w-3/4', 'h-[70vh]', 'overflow-hidden',
                    'bg-slate-50', 'rounded-2xl', 'shadow-xl',
                )
            }>
                <DialogTitle className='relative p-2 text-center font-mono text-lg font-black'>
                    {file.name}
                    <span className='pl-4 text-sm font-normal text-slate-400'>
                        {
                            filesize(file.size, {
                                base: 2,
                                standard: 'iec'
                            })
                        }
                    </span>
                    <button onClick={onClose}
                            className='absolute inset-y-0 right-0 flex items-center justify-center px-4'>
                        <XMarkIcon className='size-5'/>
                    </button>
                </DialogTitle>
                <div className = {
                    clsx(
                        'relative',
                        'h-[calc(70vh-45px)]',
                        isPending && 'overflow-hidden',
                        !isPending && 'overflow-auto',
                    )
                }>
                    <table className='text-nowrap font-mono text-sm'>
                        <thead className='bg-slate-300 font-black'>
                            {parseHeader(content[0])}
                        </thead>
                        <tbody>
                        {
                            content.slice(1, 100).map((line, idx) => parseRow(idx + 1, line))
                        }
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan = {10000}
                                    className = {
                                        clsx(
                                            'w-full', 'px-4', 'pt-1',
                                            'bg-slate-300', 'text-xs', 'text-slate-700',
                                        )
                                    }>
                                    And {content.length - 100} more lines...
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </DialogPanel>
        </div>
    </Dialog>
}

export default FilePreview;
