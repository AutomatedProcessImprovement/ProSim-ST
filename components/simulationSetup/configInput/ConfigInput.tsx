import {ReactNode} from "react";
import {Field, Description, Label} from "@headlessui/react";

interface Props {
    children: Readonly<ReactNode>,
    label: string,
    description: string,
}

const ConfigInput = ({ children, label, description }: Props) => {
    return <Field>
        <Label>{label}</Label>
        <Description className='px-4 py-2 text-justify text-sm font-medium italic text-slate-400'>{description}</Description>
        <div className="flex flex-row">{children}</div>
    </Field>
}

export default ConfigInput;
