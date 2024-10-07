import {clsx} from "clsx/lite";
import {cloneElement, ReactElement} from "react";
import {ExclamationCircleIcon} from "@heroicons/react/16/solid";

interface Props {
    form?: string,
    idx?: number,
    active?: boolean,
    icon?: ReactElement,
    label: string,
    valid?: boolean,
    onNext?: (data: FormData) => boolean
}

const Step = ({form, idx, active, icon, label, valid}: Props) => {
    return <li className='relative'>
        <button form = {form}
                formAction = {`action:go?step=${idx}`}
                type = 'submit'
                className={
                    clsx(
                        'flex', 'flex-col', 'justify-center', 'items-center', 'gap-2',
                        'p-2', 'cursor-pointer', active ? 'font-semibold' : '', !active && 'text-slate-400'
                    )
                }>
            {
                icon &&
                cloneElement(icon as any, {className: `size-6 ${icon.props.className}`})
            }
            <span className='text-center text-xs'>{label}</span>
        </button>
        {
            valid === false &&
            <span className='absolute right-14 top-0'>
                <ExclamationCircleIcon className='absolute size-4 animate-ping rounded-full bg-red-500 text-red-500'/>
                <ExclamationCircleIcon className='absolute size-4 text-red-500' />
            </span>
        }
    </li>
}

export default Step;
