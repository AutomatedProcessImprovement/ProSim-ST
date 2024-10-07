import {clsx} from "clsx/lite";
import {Cog6ToothIcon} from "@heroicons/react/24/outline";

const Loader = () => {
    return <div className = {
        clsx('fixed', 'inset-0', 'z-[999]', 'flex', 'flex-col',
            'justify-center', 'items-center', 'bg-slate-950/75')
    }>
        <div className='mb-24 text-white'>
            <Cog6ToothIcon className='-ml-8 size-16 animate-spin stroke-1'/>
            <Cog6ToothIcon className='-mt-6 ml-3 size-12 animate-spin stroke-1'/>
            <Cog6ToothIcon className='-mt-20 ml-6 size-10 animate-spin stroke-1'/>
        </div>

        <p className='animate-pulse font-semibold text-white'>Preparing coffee...</p>
    </div>
}

export default Loader;
