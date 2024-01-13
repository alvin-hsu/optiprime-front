import React, { useState, useEffect } from "react";
import { useSpring, animated } from "react-spring";
import {Alert, Autocomplete, Button, Input, SelectField, Text} from "@aws-amplify/ui-react";

import {
    rsIDtoHg38Coords,
    fetchSequenceFromCoords,
    coordsToRefSeq,
    getContextExonTranslations,
    fetchUCSCGenomes, minEdit
}
    from "./Utils";
import EditableSeqViz from "./EditableSeqViz";


const _CONTEXT_LEN = 50;

const Start = ({ handleStep, data, setData }) => {
    return (
        <div>
            <Text>Is the genotype you want to edit from the human genome?</Text>
            <Button onClick={() => handleStep(0, 1)}>Yes</Button>
            <Button onClick={() => handleStep(0, 3)}>No</Button>
        </div>
    );
};

const RsID = ({ handleStep, data, setData }) => {
    const [rsID, setRsID] = useState("rsID" in data ? data.rsID : "");
    const [loadingText, setLoadingText] = useState("");
    const handleInputChange = (event) => {
        const newRsId = event.target.value.replace(/\D/g, "")
        setRsID("rs" + newRsId);
    };
    const handleSubmit = () => {
        setData(prevData => ({ ...prevData,
                               rsID: rsID }));
        setLoadingText("Querying dbSNP...");
        rsIDtoHg38Coords(rsID).then(entry => {
            setData(prevData => ({ ...prevData,
                                   coords: { assembly: "hg38",
                                             chrom: "chr" + entry[1],
                                             pos: entry[2] },
                                   gene: entry[3],
                                   alleles: entry[4] }));
        }).finally(() => {
            handleStep(1, 4);
        }).catch(error => {
            console.error(error);  // TODO: Better error message
        });
    };
    return (
        <div>
            <Text>Do you have an rsID for the mutation you're interested in?</Text>
            <Input
                value={rsID}
                onChange={handleInputChange}
                placeholder="rs#####"
                style={{ width: "200px" }}
            />
            <Button onClick={handleSubmit}>Submit</Button>
            <Button onClick={() => handleStep(1, 2)}>No</Button>
            <div>{loadingText}</div>
        </div>
    );
};

const HGCoords = ({ handleStep, data, setData }) => {
    const initHasCoords = ("coords" in data);
    const [assembly, setAssembly] = useState(initHasCoords ? data.coords.assembly : "");
    const [inputVisible, setInputVisible] = useState(initHasCoords);
    const [chrCoords, setChrCoords] = useState(initHasCoords ? data.coords.chrom + ":" + data.coords.pos : "");
    const [validCoords, setValidCoords] = useState(initHasCoords);

    const handleDropdownChange = (event) => {
        setAssembly(event.target.value);
        setInputVisible(!(event.target.value === ""));
    };
    const handleInputChange = (event) => {
        let newChrCoords = event.target.value.toUpperCase();
        newChrCoords = newChrCoords.replace(/[^0-9XY:]/g, "");
        const isValid = /(?:\d|1\d|2[0-2]|[XY]):\d+/.test(newChrCoords);
        if (isValid) {
            setValidCoords(true);
            setChrCoords("chr" + newChrCoords);
        } else {
            setValidCoords(false);
            setChrCoords(event.target.value);
        }
    };
    const handleSubmit = () => {
        const [chrom, pos] = chrCoords.split(":");
        setData(prevData => ({ ...prevData,
                               coords: { assembly: assembly,
                                         chrom: chrom,
                                         pos: pos },
                               gene: null,
                               alleles: null }));
        handleStep(2, 4);
    };
    const dropdownOptions = [
        { value: "hg18", label: "hg18 (NCBI36)" },
        { value: "hg19", label: "hg19 (GRCh37)" },
        { value: "hg38", label: "hg38 (GRCh38)" },
        { value: "hs1",  label: "hs1 (T2T-CHM13v2.0)" }
    ];

    return (
        <>
            <div>
                <SelectField
                    label="Do you have genomic coordinates for the allele you want to edit?"
                    value={assembly}
                    onChange={handleDropdownChange}
                    placeholder="Genome assembly"
                    style={{ width: "300px" }}
                >
                    {dropdownOptions.map(option => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </SelectField>
            </div>
            <div>
                {inputVisible &&
                <Input
                    value={chrCoords}
                    onChange={handleInputChange}
                    placeholder="chr:pos"
                    style={{ width: "200px"}}
                />}
            </div>
            <div>
                {validCoords &&
                <Button
                    onClick={handleSubmit}
                    disabled={!validCoords}
                >Submit</Button>}
            </div>
            <br />
            <Button onClick={() => handleStep(2, 4)}>Enter DNA manually</Button>
        </>
    );
};

const Organism = ({ handleStep, data, setData }) => {
    const initHasCoords = ("coords" in data);
    const [loadingText, setLoadingText] = useState("Loading UCSC genomes...");
    const [byTaxId, setByTaxId] = useState({});
    const [organisms, setOrganisms] = useState([]);
    const [selectedTaxId, setSelectedTaxId] = useState("taxId" in data ? data.taxId : "");
    const [assembly, setAssembly] = useState(initHasCoords ? data.coords.assembly : "");
    const [chrCoords, setChrCoords] = useState(initHasCoords ? data.coords.chrom + ":" + data.coords.pos : "");
    const [validCoords, setValidCoords] = useState(initHasCoords);

    // FETCH ALL UCSC GENOMES AT FIRST LOAD
    useEffect(() => {
        fetchUCSCGenomes().then(byTaxId => {
            setByTaxId(byTaxId);
            let organisms = []
            for (const [taxId, taxIdData] of Object.entries(byTaxId)) {
                organisms = [...organisms,
                             {id: taxId,
                              label: taxIdData.name + ` [${taxIdData.scientificName}, taxID: ${taxId}]`}]
            }
            setOrganisms(organisms);
        }).then(() => {setLoadingText("");});
    }, []);

    const handleInputChange = (event) => {
        let newChrCoords = event.target.value.toUpperCase();
        newChrCoords = newChrCoords.replace(/[^0-9XY:]/g, "");
        const isValid = /[0-9A-z]+:\d+/.test(newChrCoords);
        if (isValid) {
            setValidCoords(true);
            setChrCoords("chr" + newChrCoords);
        } else {
            setValidCoords(false);
            setChrCoords(event.target.value);
        }
    };

    const handleSubmit = () => {
        const [chrom, pos] = chrCoords.split(":");
        setData(prevData => ({ ...prevData,
                               taxId: selectedTaxId,
                               coords: { assembly: assembly,
                                         chrom: chrom,
                                         pos: pos },
                               gene: null,
                               alleles: null }));
        handleStep(3, 4);
    };

    return (
        <>
            {!loadingText &&
            <div style={{ width: "500px", padding: "10px", display: "inline-block" }}>
                <Text>Select an organism:</Text>
                <Autocomplete
                    label="organism"
                    options={organisms}
                    placeholder="Organism"
                    onSelect={option => {setSelectedTaxId(option.id);}}
                />
            </div>}
            {selectedTaxId &&
            <div style={{ width: "500px", padding: "10px", display: "inline-block" }}>
                <Text>Select a genome assembly:</Text>
                <Autocomplete
                    label="genome"
                    options={byTaxId[selectedTaxId].genomes.map(x => ({label: x}))}
                    onSelect={option => {setAssembly(option.label);}}
                />
            </div>}
            {assembly && (
            <Input
                value={chrCoords}
                onChange={handleInputChange}
                placeholder="chr:pos"
                style={{ width: "200px" }}
            /> )}
            <div>{loadingText}</div>
            {validCoords &&
            <Button onClick={handleSubmit}>Submit</Button>}
            <Text>Want to enter your genomic DNA sequence directly?</Text>
            <Button onClick={() => {handleStep(3, 4);}}>Enter DNA manually</Button>
        </>
    );
};

/* Step 3 - Fetch DNA sequence from coords and let user edit it if their context is different.
 *          If coords are not provided, let user enter their own input.
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
const Unedited = ({ handleStep, data, setData }) => {
    const [uneditedData, setUneditedData] = useState("unedited" in data ? data.unedited :
                                                     { seq: "",
                                                       cdsList: [],
                                                       annotations: [],
                                                       translations: [] });
    const [loadingText, setLoadingText] = useState("");
    const [txDirection, setTxDirection] = useState("+");

    // GET SEQUENCE WITH CONTEXT AND TRANSLATION
    useEffect(() => {
        if (!data.coords) { return; }
        setLoadingText("Querying UCSC genome browser API...");
        // Fetch sequence
        fetchSequenceFromCoords(data.coords, _CONTEXT_LEN)
            .then(seq => {
                console.log("Seq from coords:" + seq);
                setUneditedData(u => ({ ...u, seq: seq }));
                setLoadingText("");
            })
            .catch(error => {
                console.error("Error fetching seq:", error);  // FIXME: Add a better error
            });
        // Fetch reference and determine position
        coordsToRefSeq(data.coords)
            .then(refSeq => {
                console.log(refSeq);
                setTxDirection(refSeq["strand"]);
                const contextExons = getContextExonTranslations(refSeq,
                                                                data.coords.pos,
                                                                _CONTEXT_LEN);
                setUneditedData(u => ({ ...u, cdsList: contextExons }));
            })
            .catch(error => {
                console.error("Error fetching refSeq:", error);  // FIXME: Add a better error
            });
    }, [data.coords]); // Only rerun the effect if data.coords changes

    // // HIGHLIGHT MUTATION IF GIVEN AS RSID
    // useEffect(() => {
    //     if (!data.alleles) { return; }
    //     const uneditedLen = data.alleles.split("/")[0].length;
    //     const newAnnotation = {
    //         name: data.rsID,
    //         start: _CONTEXT_LEN,
    //         end: _CONTEXT_LEN + uneditedLen,
    //         direction: txDirection === "+" ? 1 : -1,
    //         color: "blue",
    //     };
    //     setUneditedData(u => ({ ...u, annotations: [newAnnotation] }));
    // }, [data.rsID, data.alleles, txDirection]);

    const handleSubmit = () => {
        console.log("updating unedited data...");
        setData(prevData => ({ ...prevData, unedited: uneditedData }));
        handleStep(4, 5)
    }

    return (
        <>
            <div style={{ width: "100%" }}>
                <h1>Unedited sequence:</h1>
                <EditableSeqViz
                    isEditable={true}
                    seqData={uneditedData}
                    setSeqData={setUneditedData}
                />
            </div>
            {loadingText &&
            <Text>{loadingText}</Text>}
            {uneditedData.seq &&
            <Button onClick={handleSubmit}>Save Changes</Button>
            }
        </>
    );
};

/* Step 4 - Prepare edited sequence
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
const Edited = ({data, handleStep, setData}) => {
    // TODO: Switch unedited/edited
    const [uneditedData, setUneditedData] = useState(data.unedited);
    const [editedData, setEditedData] = useState(data.unedited);
    const [warningMsg, setWarningMsg] = useState("")

    const handleSubmit = () => {
        console.log("updating edited data...");
        setData(prevData => ({ ...prevData, unedited: uneditedData, edited: editedData }));
        handleStep(5, 5);  // FIXME: Add step 6
    }
    // IF RSID WAS GIVEN, AUTOMATICALLY POPULATE ALLELES
    useEffect(() => {
        if (!data.alleles) { return; }
        const [minU, minE] = data.alleles.split("/");
        const uLen = minU.length;
        const uSeq = uneditedData.seq;
        const eSeq = uSeq.substring(0, _CONTEXT_LEN) + minE + uSeq.substring(_CONTEXT_LEN + uLen);
        setEditedData(e => ({ ...e, seq: eSeq }));
    }, []);  // eslint-disable-line

    // HIGHLIGHT CHANGE
    useEffect(() => {
        const {min_u, min_e, pre_len} = minEdit(uneditedData.seq, editedData.seq);
        let color = "black";
        setWarningMsg("");
        if (min_u.length === 0 && min_e.length === 0) { setWarningMsg("No edit specified!"); }
        else if (min_u.length === 0) { color = "lime"; }
        else if (min_e.length === 0) { color = "pink"; }
        else { color = "cyan"; }
        const uHighlight = { start: pre_len, end: pre_len + min_u.length, color: color };
        const eHighlight = { start: pre_len, end: pre_len + min_e.length, color: color };
        if (min_u.length > 0) { setUneditedData(u => ({ ...u, highlights: [uHighlight] })); }
        else { setUneditedData(u => ({ ...u, highlights: [] })); }
        if (min_e.length > 0) { setEditedData(e => ({ ...e, highlights: [eHighlight] })); }
        else { setEditedData(e => ({ ...e, highlights: [] })); }
    }, [uneditedData.seq, editedData.seq]);

    // BUTTON TO SWITCH BETWEEN UNEDITED/EDITED
    const switchSeqs = () => {
        setUneditedData(editedData);
        setEditedData(uneditedData);
    };

    return (
        <>
            <div style={{ width: "100%" }}>
                <h1>Unedited sequence:</h1>
                <EditableSeqViz
                    isEditable={false}
                    seqData={uneditedData}
                    setSeqData={setUneditedData}
                />
            </div>
            <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
                <Button onClick={switchSeqs}>{'\u21d5'}</Button>
            </div>
            <div style={{ width: "100%" }}>
                <h1>Edited sequence:</h1>
                <EditableSeqViz
                    isEditable={true}
                    seqData={editedData}
                    setSeqData={setEditedData}
                />
            </div>
            {warningMsg &&
            <Alert isDismissible={false} hasIcon={true} variation="error">{warningMsg}</Alert>}
            <br />
            {!warningMsg &&
            <Button onClick={handleSubmit}>Save Changes</Button>}
        </>
    );
};


export default function Design() {
    const [step, setStep] = useState(0);
    const [stack, setStack] = useState([]);
    const [data, setData] = useState({});

    const [transition, api] = useSpring(() => ({
        from: { transform: "translate3d(200%,0,0)" },
        to: { transform: "translate3d(0,0,0)" },
    }));

    const STEPS = [
        { label: "Start",    component: Start },        // 0 -> (1, 3)
        { label: "RsID",     component: RsID },         // 1 -> (2, 4)
        { label: "Coords",   component: HGCoords },     // 2 -> 4
        { label: "Organism", component: Organism },     // 3 -> 4
        { label: "Unedited", component: Unedited },     // 4 -> 5
        { label: "Edited",   component: Edited }        // 5 -> 6
    ];

    const handleStep = (currStep, nextStep) => {
        setStep(nextStep);
        setStack(oldStack => [...oldStack, currStep]);
        api.start({
            from: { transform: "translate3d(200%,0,0)" },
            to: { transform: "translate3d(0,0,0)" }
        });
    };
    const handleBack = () => {
        setStep(stack[stack.length - 1]);
        setStack(oldStack => oldStack.slice(0, oldStack.length - 1));
        api.start({
            from: { transform: "translate3d(-200%,0,0)" },
            to: { transform: "translate3d(0,0,0)" }
        });
    };

    const VisibleComponent = STEPS[step].component;

    return (
        <animated.div style={{ ...transition, minHeight: '500px', width: '100%' }}>
            <VisibleComponent handleStep={handleStep} data={data} setData={setData} />
            {step > 0 &&
            <Button onClick={handleBack}>Back</Button>}
        </animated.div>
    );
}
