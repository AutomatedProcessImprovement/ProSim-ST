"use state";

import {Children, cloneElement, ReactElement, SyntheticEvent, useId, useState} from "react";
import {ArrowLeftIcon, ArrowLongRightIcon, ArrowRightIcon} from "@heroicons/react/24/outline";
import {clsx} from "clsx/lite";
import { toast } from 'sonner';
import {PlayCircleIcon} from "@heroicons/react/24/solid";

interface Props {
    children: ReactElement[],
    onSubmit: () => void,
    className?: string,
}

const Stepper = ({children = [], onSubmit = () => {}, className = ''}: Props) => {
    const count = Children.count(children);
    const steps = Children.map(children, child => <>{child.props.children}</>);
    const headers = Children.map(children, child => child.props.label);

    const onNextHandlers = Children.map(children, child =>
        child.props.onNext ?? (() => true)
    );

    const id = useId();
    const [activeStep, setActiveStep] = useState(0);
    const [validity, setValidity] = useState(steps.map(() => undefined));

    const submit = (evt: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
        evt.preventDefault();
        const action = new URL((evt.nativeEvent.submitter as HTMLButtonElement).formAction);
        const data = new FormData(evt.currentTarget);

        if (activeStep <= count) {
            validity[activeStep] = onNextHandlers[activeStep]?.(data);
            setValidity(validity);
        }

        switch(action.pathname) {
            case 'go':
                setActiveStep(Number.parseInt(action.searchParams.get('step') as string));
                break;
            case 'next':
                setActiveStep(previous => previous + 1);
                if (activeStep === count - 1) {
                    setActiveStep(previous => previous - 1);

                    if (validity.every(value => value !== false)) {
                        onSubmit();
                    } else {
                        toast.error(
                            'Error on form submission!',
                            {description: 'Please fix the errors in the form before submitting'}
                        );
                    }
                }
                break;
            case 'prev':
                setActiveStep(activeStep - 1);
                break;
            default:
                break;
        }
    }

    return <div className='flex flex-col gap-4'>
        <ol className='mb-4 flex flex-row items-center justify-between gap-12'>
            {
                Children.map(children, (child, idx) =>
                    <>
                        {
                            cloneElement(child as any, {
                                active: idx === activeStep,
                                valid: validity[idx],
                                form: id,
                                idx: idx
                            } as any)
                        }
                        {
                            (idx < count - 1) &&
                            <li className = 'size-6 text-slate-300'>
                                <ArrowLongRightIcon />
                            </li>
                        }
                    </>
                )
            }
        </ol>
        <form id={id}
              className = {
                  clsx(
                      'w-full', 'min-h-96', 'overflow-hidden',
                      'rounded-2xl', 'border-2', 'border-slate-300',
                      'bg-slate-100', className ?? ''
                  )
              }
              onSubmit={submit}>
            <h1 className='p-4 text-center font-semibold'>{headers[activeStep]}</h1>
            {steps[activeStep]}
        </form>
        <nav className={
            clsx(
                'flex',
                activeStep === 0 && 'justify-end',
                activeStep !== 0 && 'justify-between',
                'w-full',
            )
        }>
            {
                activeStep !== 0 &&
                <button className = 'flex items-center gap-2 p-2 px-4'
                        type = 'submit'
                        form = {id}
                        formAction = 'action:prev'
                >
                    <ArrowLeftIcon className='size-4'/>
                    Previous
                </button>
            }
            {
                activeStep < count - 1 &&
                <button className = 'flex items-center gap-2 p-2 px-4'
                        type = 'submit'
                        form = {id}
                        formAction = 'action:next'
                >
                    Next
                    <ArrowRightIcon className='size-4'/>
                </button>
            }
            {
                activeStep === count - 1 &&
                <button className = {
                    clsx(
                        'flex', 'items-center', 'gap-2',
                        'p-2', 'px-4',
                        'rounded-2xl', 'border-2', 'border-slate-300', 'enabled:border-green-700',
                        'bg-green-600', 'disabled:bg-slate-100',
                        'font-semibold', 'text-green-50', 'disabled:text-slate-300',
                    )
                }
                        type = 'submit'
                        form = {id}
                        formAction = 'action:next'
                >
                    <PlayCircleIcon className='size-4' />
                    Run
                </button>
            }
        </nav>
    </div>
}

export default Stepper;
