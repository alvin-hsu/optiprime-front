import React, { useState } from "react";
import { useSpring, animated } from "react-spring";
import { rsIDtoHg38Coords, coordsToRefSequence } from "./Utils"

const Prompt = ({ text }) => {
    return (
        <div className="Prompt">
            {text}
        </div>
    );
}

const Step0 = ({handleStep}) => {
    return (
        <div>
            <Prompt text="Is the genotype you want to edit from the human genome?" />
            <button className="menu-btn" onClick={() => handleStep(0, 1)}>Yes</button>
            <button className="menu-btn" onClick={() => handleStep(0, 4)}>No</button>
        </div>
    )
}

const Step1 = ({data, handleStep, setData}) => {
    const [rsID, setRsID] = useState("rsID" in data ? data.rsID : "");
    const [loadingText, setLoadingText] = useState("");
    const handleInputChange = (event) => {
        const newRsId = event.target.value.replace(/\D/g, "")
        setRsID("rs" + newRsId);
    };
    const handleSubmit = () => {
        setData(prevData => ({...prevData, rsID: rsID}));
        setLoadingText("Querying dbSNP...");
        rsIDtoHg38Coords(rsID).then(entry => {
            setData(prevData => ({...prevData, coords:
                    {assembly: "hg38",
                     chrom: "chr" + entry[1],
                     pos: entry[2],
                     gene: entry[3],
                     alleles: entry[4],
                     mode: "install"}}));
        }).finally(() => {
            setLoadingText("Querying UCSC genome browser...");
            handleStep(1, 3);
        }).catch(error => {
            console.error(error);
        });
    }
    return (
        <div>
            <Prompt text="Do you have an rsID for the mutation you're interested in?" /><br />
            rsID: <input id="rsID" value={rsID} onChange={handleInputChange}></input>
            <button className="menu-btn" onClick={handleSubmit}>Submit</button>
            <button className="menu-btn" onClick={() => handleStep(1, 2)}>No</button>
            <div>{loadingText}</div>
        </div>
    );
}

const Step2 = ({data, handleStep, setData}) => {
    const initHasCoords = ("coords" in data)
    const [coords, setCoords] = useState(initHasCoords ? data.coords : {});
    const [assembly, setAssembly] = useState(initHasCoords ? data.coords.assembly : "");
    const [inputVisible, setInputVisible] = useState(initHasCoords);
    const [chrCoords, setChrCoords] = useState(initHasCoords ? data.coords.chrcoord : "")

    const handleDropdownChange = (event) => {
        setAssembly(event.target.value);
        setInputVisible(!(event.target.value === ""));
    };

    const handleInputChange = (event) => {
        setChrCoords(event.target.value);
    }

    const dropdownOptions = [
        { value: "hg18", label: "hg18 (NCBI36)" },
        { value: "hg19", label: "hg19 (GRCh37)" },
        { value: "hg38", label: "hg38 (GRCh38)" },
        { value: "hs1",  label: "T2T-CHM13v2.0" }
    ];

    return (
        <div>
            <Prompt text="Do you have genomic coordinates for the allele you want to edit?" />
            <select value={assembly} onChange={handleDropdownChange}>
                <option value="">Genome assembly:</option>
                {dropdownOptions.map(option => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
            {inputVisible && <input value={chrCoords} onChange={handleInputChange}></input>}
        </div>
    );
}

function Step3({data, handleStep, setData}) {
    console.log(data);
    return <div>Step3</div>
}

function Step4({data, handleStep, setData}) {
    console.log(data);
    return <div>Step4</div>
}

function Step5({data, handleStep, setData}) {
    console.log(data);
    return <div>Step5</div>
}

function Step6({data, handleStep, setData}) {
    console.log(data);
    return <div>Step6</div>
}

const BackButton = (step, handleBack) => {
    if (step > 0) {
        return (
            <div>
                <br />
                <button className="BackButton" onClick={handleBack}>
                    Back
                </button>
            </div>
        );
    } else {
        return null;
    }
}

export default function Design() {
    const [step, setStep] = useState(0);
    const [stack, setStack] = useState([]);
    const [data, setData] = useState({});

    const [transition, api] = useSpring(() => ({
        from: { opacity: 0, transform: 'translate3d(100%,0,0)' },
        to: { opacity: 1, transform: 'translate3d(0%,0,0)' },
    }));

    const handleStep = (currStep, nextStep) => {
        setStep(nextStep);
        setStack(oldStack => [...oldStack, currStep]);
        api.start({
            from: { opacity: 0, transform: 'translate3d(100%,0,0)' },
            to: { opacity: 1, transform: 'translate3d(0%,0,0)' }
        })
    }

    const handleBack = () => {
        setStep(stack[stack.length - 1]);
        setStack(oldStack => oldStack.slice(0, oldStack.length - 1));
    }

    const renderStep = () => {
        switch (step) {
            case 0:
                // Human?
                return <Step0 handleStep={handleStep} />;
            case 1:
                // Human. rsID?
                return <Step1 data={data} handleStep={handleStep} setData={setData} />;
            case 2:
                // Human. No rsID. Coords?
                return <Step2 data={data} handleStep={handleStep} setData={setData} />;
            case 3:
                // Human. Yes coords. Mutation?
                return <Step3 data={data} handleStep={handleStep} setData={setData} />;
            case 4:
                // Unedited?
                return <Step4 data={data} handleStep={handleStep} setData={setData} />
            case 5:
                // Edited?
                return <Step5 data={data} handleStep={handleStep} setData={setData} />
            case 6:
                // Codons?
                return <Step6 data={data} handleStep={handleStep} setData={setData} />
            default:
                return <div>Uh oh! An error has occured.</div>;
        }
    };

    return (
    <animated.div style={transition}>
        {renderStep()}
        <BackButton step={step} handleBack={handleBack} />
    </animated.div>
  );
}
