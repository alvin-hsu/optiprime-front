import React, { useState, useEffect } from "react";
import { useSpring, animated } from "react-spring";
import {
    Alert,
    Autocomplete,
    Button,
    Divider,
    Heading,
    Input,
    SelectField,
    SliderField,
    SwitchField,
    Text
} from "@aws-amplify/ui-react";

import {
    rsIDtoHg38Coords,
    fetchSequenceFromCoords,
    coordsToRefSeq,
    getContextExonTranslations,
    fetchUCSCGenomes,
    minEdit,
    revcomp,
    updateCDS,
}
    from "./Utils";
import EditableSeqViz from "./EditableSeqViz";
import EditedSeqViz from "./EditedSeqViz";
import UneditedSeqViz from "./UneditedSeqViz";


const _CONTEXT_LEN = 75;
const MAX_EDIT_DIST = 18;
const PROTO_RE = /[+-]\d+/;

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
    const [rsID, setRsID] = useState("rsID" in data ? data.rsID : "rs113993960");
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
            return;
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
            const alleles = entry[4].replaceAll(" ", "").split(",")[0];
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
            handleStep(1, 3);
        }).catch(error => {
            console.log(error);
            setLoadingText("Error fetching genomic sequence: " + error.toString());
            setValidCoords(false);
        });
        coordsToRefSeq(coords).then(refSeq => {
            const cdsList = getContextExonTranslations(refSeq, coords.pos, _CONTEXT_LEN);
            setData(prevData => ({ ...prevData, unedited: { ...prevData.unedited, cdsList }}));
        });
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
                    defaultValue="rs113993960"
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
            <Button onClick={() => { handleStep(1, 3); }}>Enter DNA sequences manually</Button>
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
        handleStep(2, 3);
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
            <Button onClick={() => {handleStep(2, 3);}}>Enter DNA manually</Button>
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
    // Unpack constants
    const uneditedData = data.unedited;
    const editedData = data.edited;
    // HT-PAMDA data
    const [PAMDA, setPAMDA] = useState({});
    const [pamMap, setPamMap] = useState({});
    const [pamCutoff, setPamCutoff] = useState(-1.75);
    // Misc. state
    const [loadingText, setLoadingText] = useState("");
    const [useVars, setUseVars] = useState(false);  // Using PAM variants
    const [rs3Cache, setRs3Cache] = useState({});
    const [origAnns, setOrigAnns] = useState([]);
    const [currAnns, setCurrAnns] = useState([]);
    // Protospacers
    const [protos, setProtos] = useState([]);
    const [protoMap, setProtoMap] = useState({});
    // Manage selected protospacer
    const [selected, setSelected] = useState("");
    const [usvData, setUsvData] = useState({});
    const [esvData, setEsvData] = useState({});

    // Load HT-PAMDA data on first load in background
    useEffect(() => {
        const HT_PAMDA_URL = "/HT-PAMDA.json";
        fetch(HT_PAMDA_URL).then(r => r.json()).then(data => {
            setPAMDA(data);
            let pamMap = {};
            for (const [pamVar, pamdaMap] of Object.entries(data)) {
                for (const [pam, pamda] of Object.entries(pamdaMap)) {
                    if (pam in pamMap) {
                        pamMap[pam] = (pamMap[pam].pamda > pamda) ? pamMap[pam] : { pamVar, pamda };
                    } else {
                        pamMap[pam] = { pamVar, pamda };
                    }
                }
            }
            setPamMap(pamMap);
        });
    }, []);
    // Set origAnns (originalAnnotations) on first load
    useEffect(() => {
        const uneditedAnns = "annotations" in uneditedData ? uneditedData.annotations : [];
        setOrigAnns(uneditedAnns);
    }, [uneditedData]);
    // Search for protospacers
    useEffect(() => {
        let PAM_RE;
        if (!useVars) {
            setLoadingText("");
            PAM_RE = /(?=[ACGT]{24}[ACGT]GG[ACGT])/g;
        } else if (Object.keys(PAMDA).length === 0) {
            setLoadingText("Loading HT-PAMDA data...");
            return;
        } else {
            setLoadingText("");
            const aboveCutoff = Object.entries(pamMap)
                                      .filter(x => (x[1].pamda > pamCutoff))
                                      .map(x => x[0]);
            const pamStr = aboveCutoff.join("|");
            PAM_RE = new RegExp(`(?=[ACGT]{24}(?:${pamStr}))`, "g");
        }
        let entries = [];
        // FIND FORWARD PROTOSPACERS
        let {minU, preLen, postLen} = minEdit(uneditedData.seq, editedData.seq);
        let preHom = uneditedData.seq.substring(0, preLen);
        let postHom = uneditedData.seq.substring(uneditedData.seq.length - postLen);
        const uLen = minU.length;
        const fSearch = (preHom.substring(preLen - MAX_EDIT_DIST - 21) +
                         minU.substring(0, Math.min(uLen, 7)) +
                         postHom.substring(0, Math.max(0, 7 - Math.min(uLen, 7))));
        const fIdxs = [...fSearch.matchAll(PAM_RE)].map(x => x.index);
        fIdxs.forEach(x => {
            const direction = "+";
            const idx = x + (preLen - MAX_EDIT_DIST - 21);  // Index of match start in original str
            const start20 = idx + 4;
            const end20 = start20 + 20;
            const proto30 = uneditedData.seq.substring(idx, idx + 30);
            const unedited = uneditedData.seq.substring(start20 - 4);
            const edited = editedData.seq.substring(start20 - 4);
            const id = `${direction}${end20 - 3}`;
            const pam = uneditedData.seq.substring(idx + 24, idx + 28);
            const entry = { id, direction, start20, end20, proto30, unedited, edited, pam };
            entries = [ ...entries, entry ];
        });
        // FIND REVERSE PROTOSPACERS
        const uneditedRC = revcomp(uneditedData.seq);
        const editedRC = revcomp(editedData.seq);
        ( {minU, preLen, postLen} = minEdit(uneditedRC, editedRC) );
        preHom = uneditedRC.substring(0, preLen);
        postHom = uneditedRC.substring(uneditedRC.length - postLen);
        const rSearch = (preHom.substring(preLen - MAX_EDIT_DIST - 21) +
                         minU.substring(0, Math.min(uLen, 7)) +
                         postHom.substring(0, Math.max(0, 7 - Math.min(uLen, 7))));
        const rIdxs = [...rSearch.matchAll(PAM_RE)].map(x => x.index);
        rIdxs.forEach(x => {
            const direction = "-";
            const rcIdx = x + (preLen - MAX_EDIT_DIST - 21);  // Index of match start in rc str
            const rcStart20 = rcIdx + 4;
            const rcEnd20 = rcStart20 + 20;
            const proto30 = uneditedRC.substring(rcIdx, rcIdx + 30);
            const unedited = uneditedRC.substring(rcStart20 - 4);
            const edited = editedRC.substring(rcStart20 - 4)
            const start20 = uneditedData.seq.length - rcEnd20;
            const end20 = uneditedData.seq.length - rcStart20;
            const id = `${direction}${start20 - 3}`;
            const pam = uneditedRC.substring(rcIdx + 24, rcIdx + 28);
            const entry = { id, direction, start20, end20, proto30, unedited, edited, pam };
            entries = [ ...entries, entry ];
        });
        setProtos(entries);
    }, [useVars, PAMDA, pamMap, pamCutoff, uneditedData.seq, editedData.seq]);
    // Protospacer array updates
    useEffect(() => {
        // Locally cached Doench rs3 calls
        const cachedRs3 = async (seqs) => {
            const isCached = seqs.map(seq => seq in rs3Cache);
            const noncached = seqs.filter(seq => !(seq in rs3Cache));
            const hasUpdate = (noncached.length > 0)
            let rs3s;
            if (hasUpdate) {
                setLoadingText("Evaluating protospacers with Doench Rule Set 3...");
                const URL = "https://api.optipri.me/utils/doench_rs3";
                const seqs = (noncached.map(seq => (seq.substring(0, 25) + "GG" + seq.substring(27)))
                                       .join(","));
                const options = { method: "POST", body: JSON.stringify({ seqs }) };
                rs3s = await fetch(URL, options).then(resp => {
                    if (!resp.ok) {
                        setLoadingText("Error evaluating protospacers.");
                        throw new Error(JSON.stringify(resp.json()));
                    }
                    setLoadingText("");
                    return resp.json();
                }).then(data => {
                    const rs3Data = Array.isArray(data) ? data : [data];
                    const update = Object.fromEntries(noncached.map((x, i) => [x, rs3Data[i]]));
                    setRs3Cache(cache => ({ ...cache, ...update }));
                    return isCached.map((cached, i) => (cached ? rs3Cache[seqs[i]] :
                                                                 update[seqs[i]]) );
                }).catch(e => {
                    console.log(e);
                });
            } else {
                rs3s = rs3Cache;
            }
            return rs3s;
        };
        cachedRs3(protos.map(x => x.proto30)).then(rs3s => {
            if (protos.some(x => !(("rs3" in x) && (typeof x.rs3 !== "undefined")))) {
                setProtos(protos.map(x => ({ ...x, rs3: rs3s[x.proto30] })));
                setProtoMap(Object.fromEntries(protos.map(x => [x.id, { ...x, rs3: rs3s[x.proto30] }])));
            }
        });
    }, [protos, rs3Cache]);
    // Update annotations
    useEffect(() => {
        const newAnnotations = protos.map(x => {
            const name = ((("rs3" in x) && (typeof x.rs3 !== "undefined")) ?
                          x.id + " (RS3 = " + x.rs3.toFixed(4) + ")" :
                          x.id);
            const direction = x.direction === "+" ? 1 : -1;
            const pamInfo = pamMap[x.pam];
            let color;
            if (("rs3" in x) && (typeof x.rs3 !== "undefined")) {
                color = (pamInfo.pamVar === "SpNGG") ? "lightblue" : "pink";
            } else {
                color = "gray";
            }
            return { name,
                     start: x.start20,
                     end: x.end20,
                     direction,
                     color }
        });
        const annotations = [ ...origAnns, ...newAnnotations ]
        setCurrAnns(annotations);
    }, [origAnns, pamMap, protos]);
    // For updating CDS data to entries
    const updateCDS = (cds, ps) => {
        // Protospacer info
        const psDir = ps.direction;
        const psStart = (psDir === "+") ? (ps.start20 - 4) : (ps.end20 + 4);
        // CDS info
        const cDir = cds.direction;
        const cStart = cds.start;
        const cEnd = cds.end;
        const cFrame = cds.frame;
        // New CDS info
        const newDir = (psDir === cDir) ? "+" : "-";
        let start, end, frame;
        if ((cDir === "+") && (psDir === "+")) {
            start = Math.max(0, cStart - psStart);
            end = cEnd - psStart;
            frame = (psStart <= cStart) ? cFrame : (cFrame + psStart - cStart) % 3;
        } else if ((cDir === "+") && (psDir === "-")) {
            start = Math.max(0, psStart - cEnd);
            end = psStart - cStart;
            frame = cFrame;
        } else if ((cDir === "-") && (psDir === "+")) {
            start = Math.max(0, cStart - psStart);
            end = cEnd - psStart;
            frame = cFrame;
        } else {
            start = Math.max(0, psStart - cEnd);
            end = psStart - cStart;
            frame = (psStart >= cEnd) ? cFrame : (cFrame + cEnd - psStart) % 3;
        }
        return { name: ps.name, direction: newDir,
                 start, end, frame }
    };
    // Clear state whenever useVars or pamCutoff updates
    useEffect(() => {
        setSelected("");
        setUsvData({});
        setEsvData({});
    }, [useVars, pamCutoff]);
    // Handle clicking on selections
    const selHandler = (e) => {
        const name = e.name.split(" ")[0];
        if (PROTO_RE.test(name) && (name in protoMap)) {
            setSelected(name);
            setUsvData({});
            setEsvData({});
        }
    };
    useEffect(() => {
        if (selected in protoMap) {
            const entry = protoMap[selected];
            const name = "rs3" in entry ? entry.id + " (RS3 = " + entry.rs3.toFixed(4) + ")" : entry.id;
            const {minU, minE, preLen} = minEdit(entry.unedited, entry.edited);
            let color;
            if (minU.length === 0) { color = "lime"; }
            else if (minE.length === 0) { color = "pink"; }
            else { color = "cyan"; }
            const uHighlight = { start: preLen, end: preLen + minU.length, color: color };
            const eHighlight = { start: preLen, end: preLen + minE.length, color: color };
            const uData = { seqData: {
                                seq: entry.unedited,
                                cdsList: uneditedData.cdsList.map(x => updateCDS(x, entry))
                            },
                            name,
                            pamVar: pamMap[entry.pam].pamVar,
                            highlights: (minU.length === 0) ? [] : [uHighlight] };
            const eData = { seqData: {
                                seq: entry.edited,
                                cdsList: editedData.cdsList.map(x => updateCDS(x, entry))
                            },
                            highlights: (minE.length === 0) ? [] : [eHighlight] };
            setUsvData(uData);
            setEsvData(eData);
        }
    }, [protoMap, pamMap, selected, protos, editedData.cdsList, uneditedData.cdsList]);

    return (
        <>
            <div style={{ width: "100%" }}>
                <h1>Protospacers:</h1>
                <EditableSeqViz
                    isEditable={false}
                    seqData={{ ...uneditedData,
                               annotations: currAnns }}
                    selHandler={selHandler}
                />
                <div style={{ width: "100%" }}>{loadingText}</div>
                <div style={{
                    width: "100%"
                }}>
                    <div style={{
                        width: "11%",
                        display: "inline-flex",
                        verticalAlign: "middle"
                    }}>
                        <SwitchField
                            label="Use PAM variants"
                            labelPosition="start"
                            onChange={(e) => { setUseVars(e.target.checked); }}
                        />
                    </div>
                    {useVars &&
                    <div style={{
                        width: "30%",
                        display: "inline-flex",
                        verticalAlign: "middle"
                    }}>
                        <SliderField
                            label="PAM flexibility"
                            min={1.5} max={2.5} step={0.25} defaultValue={1.75}
                            value={-pamCutoff} onChange={(x => { setPamCutoff(-x); })}
                            labelHidden={true} isValueHidden={true} width="100%"
                        />
                    </div>
                    }
                </div>
                {selected &&
                <div>
                    <Heading level={6}>Unedited:</Heading>
                    <UneditedSeqViz
                        { ...usvData }
                    />
                    <Heading level={6}>Edited:</Heading>
                    <EditedSeqViz
                        { ...esvData }
                    />
                </div>
                }
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
