import React, { useState, useEffect } from "react";
import { useSpring, animated } from "react-spring";
import {Alert, Autocomplete, Button, Divider, Input, SelectField, Text} from "@aws-amplify/ui-react";

import {
    rsIDtoHg38Coords,
    fetchSequenceFromCoords,
    coordsToRefSeq,
    getContextExonTranslations,
    fetchUCSCGenomes,
    minEdit,
    revcomp,
    updateCDS,
    parseHGVS
}
    from "./Utils";
import EditableSeqViz from "./EditableSeqViz";


const _CONTEXT_LEN = 50;
const MAX_EDIT_DIST = 15;
const PAM_RE = /[ACGT]GG[ACGT]/g  // FIXME? PAM variants

const Start = ({ handleStep }) => {
    return (
        <div>
            <Text>Is the genotype you want to edit from the human genome?</Text>
            <Button onClick={() => handleStep(0, 1)}>Yes</Button>
            <Button onClick={() => handleStep(0, 2)}>No</Button>
        </div>
    );
};

const Human = ({ handleStep, data, setData }) => {
    const [loadingText, setLoadingText] = useState("");
    // Direct gene variant data
    const [gene, setGene] = useState("gene" in data ? data.gene : "");
    const [geneCoords, setGeneCoords] = useState({});
    const [geneData, setGeneData] = useState({});
    const [hgvsVisible, setHgvsVisible] = useState("hgvs" in data);
    const [hgvs, setHgvs] = useState("hgvs" in data ? data.hgvs : "");
    // rsID entry
    const [rsID, setRsID] = useState("rsID" in data ? data.rsID : "");
    const [validRsID, setValidRsID] = useState("rsID" in data);
    // Genomic coordinates
    const initHasCoords = ("coords" in data);
    const [assembly, setAssembly] = useState(initHasCoords ? data.coords.assembly : "");
    const [coordInputVisible, setCoordInputVisible] = useState(initHasCoords);
    const [chrCoords, setChrCoords] = useState(initHasCoords ? data.coords.chrom + ":" + data.coords.pos : "");
    const [validCoords, setValidCoords] = useState(initHasCoords);
    // Support for gene variant entry
    useEffect(() => {
        const loadGenes = async () => {
            try {
                const response = await fetch("/geneLocs.json");
                if (!response.ok) {
                    setLoadingText("Unable to load gene locations!");
                }
                setGeneCoords(await response.json());
            } catch (error) {
                setLoadingText("Error while fetching gene locations: " + error.toString());
            }
        };
        loadGenes().then(() => {});
    }, []);
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if ((gene !== "") && (gene in geneCoords)) {
                setLoadingText("");
                const chrCoords = geneCoords[gene];
                const [chrom, pos] = chrCoords.split(":");
                const [start, end] = pos.split("-");
                coordsToRefSeq({ assembly: "hg38", chrom, start, end })
                    .catch(error => {
                        setLoadingText("Error fetching gene info for " + gene + ": " + error.toString());
                        setGeneData({});
                        setHgvsVisible(false);
                    })
                    .then(refSeq => {
                        setGeneData(refSeq);
                        setHgvsVisible(true);
                    });
            } else {
                setLoadingText("Could not find gene: " + gene);
                setGeneData({});
                setHgvsVisible(false);
            }
        }, 100);
        return () => clearTimeout(timeoutId);
    }, [gene, geneCoords]);
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (hgvs === "") { return; }
            const result = parseHGVS(geneData, hgvs);
            console.log(result);
        }, 200);
        return () => clearTimeout(timeoutId);
    }, [geneData, hgvs]);
    // Support for rsID entry
    const handleRsIDChange = (event) => {
        const newRsId = event.target.value.replace(/\D/g, "");
        if (newRsId) {
            setValidRsID(true);
        }
        setRsID("rs" + newRsId);
    };
    const handleRsIDSubmit = () => {
        setData(prevData => ({ ...prevData,
                               rsID: rsID }));
        setLoadingText("Querying dbSNP...");
        rsIDtoHg38Coords(rsID).then(entry => {
            const coords = { assembly: "hg38",
                             chrom: "chr" + entry[1],
                             pos: entry[2] };
            const gene = entry[3];
            const alleles = entry[4];
            setData(prevData => ({ ...prevData,
                                   coords, gene, alleles }));
            return { coords, gene, alleles };
        }).then(async x => {
            const { coords } = x;
            setLoadingText("Fetching reference sequence...")
            const seq = await fetchSequenceFromCoords(coords, _CONTEXT_LEN);
            return { ...x, seq };
        }).then(x => {
            const { seq, alleles } = x;
            const [minU, minE] = alleles.split("/");
            const uLen = minU.length;
            const eSeq = seq.substring(0, _CONTEXT_LEN) + minE + seq.substring(_CONTEXT_LEN + uLen);
            setData(prevData => ({ ...prevData,
                                   unedited: { seq,
                                               cdsList: [],
                                               annotations: [],
                                               translations: [] },
                                   edited: { seq: eSeq,
                                              cdsList: [],
                                              annotations: [],
                                              translations: [] } }));
            return x;
        }).catch(error => {
            setLoadingText("Error fetching genomic sequence: " + error.toString());
            setValidRsID(false);
        }).then(async x => {
            const { coords } = x;
            const refSeq = await coordsToRefSeq(coords);
            return { ...x, refSeq };
        }).catch(error => {
            console.log("Error fetching RefSeq data: " + error.toString());
            handleStep(1, 4);
        }).then(x => {
            const { alleles, coords, refSeq } = x;
            const [minU, minE] = alleles.split("/");
            const uLen = minU.length;
            const eLen = minE.length;
            const uCdsList = getContextExonTranslations(refSeq, coords.pos, _CONTEXT_LEN);
            const eCdsList = uCdsList.map(cds => updateCDS(cds,
                                                           { start: _CONTEXT_LEN,
                                                             end: _CONTEXT_LEN + uLen },
                                                           eLen - uLen))
                                     .filter(cds => !!cds);
            setData(prevData => ({ ...prevData,
                                   unedited: { ...prevData.unedited, cdsList: uCdsList },
                                   edited: { ...prevData.edited, cdsList: eCdsList } }));
        }).then(() => {
            handleStep(1, 4);
        });
    };
    // Support for genome coordinates
    useEffect(() => {
        if (!("unedited" in data)) {
            setData(prevData => ({ ...prevData,
                                   unedited: { seq: "",
                                               cdsList: [],
                                               annotations: [],
                                               translations: [] } }));
        }
    }, [data]);  // eslint-disable-line
    const handleAssemblyChange = (event) => {
        setAssembly(event.target.value);
        setCoordInputVisible(!(event.target.value === ""));
    };
    const handleChrCoordsChange = (event) => {
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
    const handleChrCoordsSubmit = () => {
        const [chrom, pos] = chrCoords.split(":");
        const coords = { assembly, chrom, pos }
        setData(prevData => ({ ...prevData, coords }));
        setLoadingText("Fetching reference sequence...");
        fetchSequenceFromCoords(coords, _CONTEXT_LEN).then(seq => {
            setData(prevData => ({ ...prevData, unedited: { ...prevData.unedited, seq }}));
        }).catch(error => {
            setLoadingText("Error fetching genomic sequence: " + error.toString());
            setValidCoords(false);
        });
        coordsToRefSeq(coords).then(refSeq => {
            const cdsList = getContextExonTranslations(refSeq, coords.pos, _CONTEXT_LEN);
            setData(prevData => ({ ...prevData, unedited: { ...prevData.unedited, cdsList }}));
        });
        handleStep(1, 3);
    };
    const dropdownOptions = [
        { value: "hg18", label: "hg18 (NCBI36)" },
        { value: "hg19", label: "hg19 (GRCh37)" },
        { value: "hg38", label: "hg38 (GRCh38)" },
        { value: "hs1",  label: "hs1 (T2T-CHM13v2.0)" }
    ];

    return (
        <>
            <div style={{ width: "100%" }}>{loadingText}</div>
            <div>
                <Text width="100%">Gene variant:</Text>
                <Input
                    placeholder="Gene (e.g., CFTR)"
                    onChange={event => setGene(event.target.value)}
                    width="250px"
                    display="inline-block"
                />
                {hgvsVisible &&
                <Input
                    placeholder="HGVS c.name (e.g., c.1521_1523del)"
                    onchange={event => setHgvs(event.target.value)}
                    width="300px"
                    display="inline-block"
                />
                }
            </div>
            <div style={{ width: "100%" }}>
                <Text width="100%">dbSNP rsID:</Text>
                <Input
                    placeholder="rsID (e.g., rs113993960)"
                    onChange={handleRsIDChange}
                    width="250px"
                />
                {validRsID &&
                <Button onClick={handleRsIDSubmit}>Submit</Button>}
            </div>
            <div style={{ width: "100%" }}>
                <Text width="100%">Genomic coordinates:</Text>
                <SelectField
                    label=""
                    labelHidden
                    value={assembly}
                    onChange={handleAssemblyChange}
                    placeholder="Genome assembly"
                    width="250px"
                    display="inline-block"
                >
                {dropdownOptions.map(option => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
                </SelectField>
                {coordInputVisible &&
                <Input
                    placeholder="Coordinate (e.g., chr7:117559592)"
                    width="300px"
                    onChange={handleChrCoordsChange}
                    display="inline-block"
                />}
                {validCoords &&
                <Button
                    onClick={handleChrCoordsSubmit}
                >Submit</Button>}
            </div>
            <Divider size="small" margin="20px 0 20px 0" />
            <Button>Enter DNA sequences manually</Button>
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
            let organisms = [];
            for (const [taxId, taxIdData] of Object.entries(byTaxId)) {
                organisms = [...organisms,
                             {id: taxId,
                              label: taxIdData.name + ` [${taxIdData.scientificName}, taxID: ${taxId}]`}];
            }
            setOrganisms(organisms);
        }).finally(() => {
            setLoadingText("");
        }).catch(error => {
            setLoadingText(error.toString());
        });
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
    const handleSubmit = () => {
        setData(prevData => ({ ...prevData, unedited: uneditedData }));
        handleStep(3, 4);
    };

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
const Edited = ({handleStep, data, setData}) => {
    const [uneditedData, setUneditedData] = useState(data.unedited);
    const [editedData, setEditedData] = useState("edited" in data ? data.edited : data.unedited);
    const [warningMsg, setWarningMsg] = useState("");

    const handleSubmit = () => {
        setData(prevData => ({ ...prevData, unedited: uneditedData, edited: editedData }));
        handleStep(4, 5);
    };

    // HIGHLIGHT CHANGE
    useEffect(() => {
        const {minU, minE, preLen} = minEdit(uneditedData.seq, editedData.seq);
        let color = "black";
        setWarningMsg("");
        if (minU.length === 0 && minE.length === 0) { setWarningMsg("No edit specified!"); }
        else if (minU.length === 0) { color = "lime"; }
        else if (minE.length === 0) { color = "pink"; }
        else { color = "cyan"; }
        const uHighlight = { start: preLen, end: preLen + minU.length, color: color };
        const eHighlight = { start: preLen, end: preLen + minE.length, color: color };
        if (minU.length > 0) { setUneditedData(u => ({ ...u, highlights: [uHighlight] })); }
        else { setUneditedData(u => ({ ...u, highlights: [] })); }
        if (minE.length > 0) { setEditedData(e => ({ ...e, highlights: [eHighlight] })); }
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

const Protospacers = ({handleStep, data, setData}) => {
    const [loadingText, setLoadingText] = useState("");
    const [uneditedData, setUneditedData] = useState(data.unedited);
    const [editedData, setEditedData] = useState(data.edited);
    const [protos, setProtos] = useState([]);

    useEffect(() => {
        const {minU, preLen, postLen} = minEdit(uneditedData.seq, editedData.seq);
        const preHom = uneditedData.seq.substring(0, preLen);
        const postHom = uneditedData.seq.substring(uneditedData.seq.length - postLen);
        const uLen = minU.length;
        let entries = [];
        // FIND FORWARD PROTOSPACERS
        const fSearch = (preHom.substring(preLen - MAX_EDIT_DIST) +
                         minU.substring(0, Math.min(uLen, 7)) +
                         postHom.substring(0, Math.max(0, 7 - Math.min(uLen, 7))));
        const fIdxs = [...fSearch.matchAll(PAM_RE)].map(x => x.index);
        fIdxs.forEach(x => {
            const direction = "+";
            const end20 = preLen - MAX_EDIT_DIST + x;
            const start20 = end20 - 20;
            const proto30 = uneditedData.seq.substring(start20 - 4, end20 + 6)
            const unedited = uneditedData.seq.substring(end20 - 3);
            const edited = editedData.seq.substring(end20 - 3);
            const entry = { direction, start20, end20, proto30, unedited, edited };
            entries = [ ...entries, entry ];
        });
        // FIND REVERSE PROTOSPACERS
        const uneditedRC = revcomp(uneditedData.seq);
        const editedRC = revcomp(editedData.seq);
        const rSearch = (revcomp(postHom).substring(postLen - MAX_EDIT_DIST) +
                         revcomp(minU).substring(0, Math.min(uLen, 7)) +
                         revcomp(preHom).substring(0, Math.max(0, 7 - Math.min(uLen, 7))));
        const rIdxs = [...rSearch.matchAll(PAM_RE)].map(x => x.index);
        rIdxs.forEach(x => {
            const direction = "-";
            const rcEnd20 = postLen - MAX_EDIT_DIST + x;
            const rcStart20 = rcEnd20 - 20;
            const start20 = uneditedData.seq.length - rcEnd20;
            const end20 = uneditedData.seq.length - rcStart20;
            const proto30 = uneditedRC.substring(rcStart20 - 4, rcEnd20 + 6);
            const unedited = uneditedRC.substring(rcEnd20 - 3);
            const edited = editedRC.substring(rcEnd20 - 3);
            const entry = { direction, start20, end20, proto30, unedited, edited };
            entries = [ ...entries, entry ];
        });
        setProtos(entries);
    }, [uneditedData.seq, editedData.seq]);
    useEffect(() => {
        const unchecked = protos.filter(entry => !("rs3" in entry));
        if (unchecked.length > 0) {
            setLoadingText("Evaluating protospacers with Doench Rule Set 3...");
            const checked = protos.filter(entry => "rs3" in entry);
            const query = protos.map(entry => entry.proto30).join(",");  // TODO? Non-NGG set PAM
            const url = "https://api.optipri.me/utils/doench-rs3?seqs=" + query;
            fetch(url).then(resp => {
                if (!resp.ok) {
                    setLoadingText("Error evaluating protospacers.");
                }
                return resp.json();
            }).then(data => {
                const update = unchecked.map((e, i) => ({ ...e, rs3: data[i] }));
                setProtos(checked.concat(update));
                setLoadingText("");
            });
        }
    }, [protos]);
    useEffect(() => {
        const annotations = protos.map(x => {
            const id = x.direction === "+" ? "+" + (x.end20 - 3).toString() :
                                             "-" + (x.start20 + 3).toString();
            const name = "rs3" in x ? id + " (RS3 = " + x.rs3.toFixed(4) + ")" : id;
            const direction = x.direction === "+" ? 1 : -1;
            const color = "rs3" in x ? "lightblue" : "gray";
            return { name,
                     start: x.start20,
                     end: x.end20,
                     direction,
                     color }
        });
        setUneditedData({ ...uneditedData, annotations });
    }, [protos]);

    return (
        <>
            <div style={{ width: "100%" }}>{loadingText}</div>
            <div style={{ width: "100%" }}>
                <h1>Protospacers:</h1>
                <EditableSeqViz
                    isEditable={false}
                    seqData={uneditedData}
                />
            </div>
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
        { label: "Start",        component: Start },        // 0 -> (1, 2)
        { label: "Human",        component: Human },        // 1 -> (3, 4)
        { label: "Organism",     component: Organism },     // 2 -> 3
        { label: "Unedited",     component: Unedited },     // 3 -> 4
        { label: "Edited",       component: Edited },       // 4 -> 5
        { label: "Protospacers", component: Protospacers }  // 5 -> 6
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
