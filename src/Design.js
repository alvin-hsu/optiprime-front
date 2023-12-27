import React, { useState, useEffect } from "react";
import { useSpring, animated } from "react-spring";
import { rsIDtoHg38Coords, fetchSequenceFromCoords, coordsToRefSeq, isIntronOrExon} from "./Utils"
import { SeqViz } from "seqviz";


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


/* Step 3 - Fetch DNA sequence from rsID
 *
 * Output: 
 * - Unedited DNA sequence around the target edit site
 *  
 * The user has provided us with an rsID for an edit. 
 * {
 *   "rsID": "rs6511720",
 *   "coords": {
 *     "assembly": "hg38",
 *     "chrom": "chr19",
 *     "pos": "11091629",
 *     "gene": "LDLR",
 *     "alleles": "G/T",
 *     "mode": "install"
 *   }
 * } 
 * 
 * We have coordinates and need to fetch the corresponding exon. We'll add some buffer before 
 * and after so we can screen for usable PAMs, Silent edits, etc. 
 * 
 * We might also be editing within introns. If that's the case, we cannot introduce silent edits.
 * 
 * 
 * NOTE: 
 * ~~If the edit is right at the start or end of an exon, we might need to fetch the previous/next
 * exon as well since there might be usable PAMs after RNA splicing.~~ Dumb, we're operating at DNA not RNA level
 * 
 * 
 * Question: 
 * How much context is reasonable? -> +-100bp around the coords
 * Avoid ones with long poly-T sequences but ML probably handles that -> Yes it does
 * 
 * 
 * Testing rsIDs:
 * - rs993122941 -> exon (3' UTR), 1
 * - rs6511720   -> intron, 1
 * - rs782665893 -> exon (CDS), C>T (DNA) V>M (protein). Gene goes in - strand
 * - rs113993960 -> exon (CDS), TCTT>T (or delTCT or delCTT) (DNA), del F (protein). Gene goes in + strand
 */
function Step3({ data, handleStep, setData }) {
    const [sequence, setSequence] = useState('');
    const [refSeq, setRefSeq] = useState(null);
    const [position, setPosition] = useState('');
    const [annotations, setAnnotations] = useState([]);
    const [translations, setTranslations] = useState([]);

    let contextLen = 10

    useEffect(() => {
        // Fetch sequence
        fetchSequenceFromCoords(data.coords, contextLen)
            .then(seq => {
                console.log("Seq from coords:" + seq);
                setSequence(seq); 
            })
            .catch(error => {
                console.error("Error fetching seq:", error);
            });

        // Fetch reference and determine position
        coordsToRefSeq(data.coords)
            .then(refSeq => {
                console.log(refSeq);
                
                window.refSeq = refSeq; // for debugging
                
                setRefSeq(refSeq);
                const pos = isIntronOrExon(data.coords.pos, refSeq);
                console.log(pos);
                setPosition(pos);
            })
            .catch(error => {
                console.error("Error fetching refSeq:", error);
            });
    }, [data.coords, contextLen]); // Only rerun the effect if data.coords changes

    useEffect(() => {
        if (refSeq) {
            const newAnnotations = {
                name: data.rsID,
                start: contextLen,
                end: contextLen+1, // TODO: What if it's not a point mutation? (insertion/deletion)
                direction: refSeq.strand === "+" ? 1 : -1,
                color: "blue",
            };
            setAnnotations([newAnnotations]);
        } else {
            const newAnnotations = {
                name: data.rsID,
                start: contextLen, // highlight the relevant mutation 
                end: contextLen+1,
                direction: 1,   // Guessing +, might be wrong 
                color: "blue",
            };
            setAnnotations([newAnnotations]);
        }
    }, [refSeq, data.coords.pos, contextLen]);

    useEffect(() => {
        if(position[0] == "exon") {
            // We need to calculate the frame of our context based on the exon frame
            let exonStart = position[2]
            let exonFrame = position[3]
            let center = data.coords.pos

            // We need to find the distance between the exon start and 
            // the context start to calculate the contextFrame
            let exonToContext = (center-contextLen) - exonStart
            let contextFrame = (exonStart+exonToContext+exonFrame) % 3

            let contextFrameEnd = (contextLen*2) - (((contextLen*2) - contextFrame) % 3)
            // TODO: Handle if context starts before/ends after exon

            console.log(`EXON - exonStart:${exonStart}, exonFrame:${exonFrame}, exonToContext:${exonToContext}, center:${center}, contextFrame:${contextFrame}, contextFrameEnd:${contextFrameEnd}`)

            const newTranslations = {
                name: data.rsID,
                start: contextFrame, 
                end: contextFrameEnd,
                direction: 1, // FWD
            };

            setTranslations([newTranslations])
        }
    }, [position, data.coords.pos, contextLen]);

    return (
    <>
        <div style={{ width: '100%' }}>
            Step3<br/>
            Position: {position && `${position[0]}, ${position[1]}`}<br/>
            <div style={{ height: '500px', width: '100%', position: 'relative', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                <SeqViz
                    name="Custom Sequence"
                    seq={sequence}
                    viewer="linear"
                    annotations={annotations}
                    translations={translations}
                />
            </div>
        </div>
    </>
);
}

/* Step 4 - Prepare unedited sequence
 * 
 * Output: 
 * - Final sequence to be edited with N(50?)bp context.
 * 
 * We now have access to the unedited DNA sequence (either because the user directly provided it or 
 * we fetched it from the corresponding rsID). Since this isn't necessarily the exact sequence targeted,
 * we'll use benchling's SeqViz to display the original sequence +-50bp and let the user make changes to match the actual 
 * DNA they're dealing with. 
 * 
 * If exon -> Display AA as well.
 * 
 */ 
function Step4({data, handleStep, setData}) {
    console.log(data);
    return <div>Step4</div>
}

/* Step 5 - Prepare edited sequence
 * 
 * Output:
 * - Target edit
 * - Possible PAMs
 * - Possible silent edits
 * - (possible nickinging sgRNAs on opposite strand?)
 * - (possible PAMs for PE3B strategy if available?)
 * 
 * This is where we make the actual change. If we were provided with an rsID specifying a change to install,
 * we can prefil the desired change, otherwise we can just display the unedited sequence and let the
 * user make whatever changes they'd like.
 * 
 * Note:
 * It doesn't matter if the rsID specifies a change to install or not. It matters if the user would 
 * like use it as source or dest. (Always treat as install and allow easy toggle). 
 * 
 * Processing: 
 * This is where we get into some PE logic. We need a suitable PAM, within +~50 bases of our edit on either strand.
 * The model resposible for processing will figure out which one is best, but we need to fetch all suitable candidates.
 * In order to make editing more efficient, we'll also want to create a map of all possible silent edits we can make 
 * that would result in the same ammino acid, leaving the final protein unchanged. Note that you can't have silent edits
 * if you're not in an exon. 
 * 
 */ 
function Step5({data, handleStep, setData}) {
    console.log(data);
    return <div>Step5</div>
}


/* Step 6 - Talk to the model
 * 
 * Pass the information to the model for processing, fetch the result and tell the user what 
 * the best edits are.
 * 
 */
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

    // const [transition, api] = useSpring(() => ({
    //     from: { opacity: 0 },
    //     to: { opacity: 1 },
    // }));
    

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
        <animated.div style={{ ...transition, minHeight: '500px', width: '100%' }}>
            {renderStep()}
            <BackButton step={step} handleBack={handleBack} />
        </animated.div>
    );
}
