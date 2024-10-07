import {clsx} from "clsx/lite";
import {ReactNode} from "react";

interface Props {
    label: ReactNode,
    children: ReactNode,
}

const Preview = ({label, children}: Props) => {
    return <div className = {clsx('relative', 'flex-1 ', 'p-4', 'rounded-2xl', 'border', 'border-slate-300', 'bg-slate-100', 'overflow-x-clip')}>
        <h3 className='absolute -top-4 bg-slate-100 px-2'>{ label }</h3>
        { children }
    </div>
}

export default Preview;
