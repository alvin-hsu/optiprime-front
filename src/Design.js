import React, {useEffect, useRef, useState} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
    Alert,
    Autocomplete,
    Button,
    Card,
    Divider,
    Flex,
    Grid,
    Heading,
    SelectField,
    SwitchField,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    ToggleButton,
    useTheme,
} from "@aws-amplify/ui-react";

import {
    coordsToRefSeq,
    fetchSequenceFromCoords,
    fetchUCSCGenomes,
    getContextExonTranslations,
    minEdit,
    rsIDtoHg38Coords,
    updateCDS,
    cvIDtoHg38Coords,
    fetchAuth,
    revcomp,
    sliceSegments,
    reduceSegments,
    splitDNAbyCDS,
    findProtosDirection,
    scaleProtoScore
} from "./Utils";
import ClinvarAutocomplete from "./ClinvarAutocomplete";
import { EditableSeqViz, SeqVizWithCDS, editHighlights } from "./ModdedSeqViz";
import { codonTableForward, aminoAcidColors, darkAminoAcidColors } from "./Codons";

const _CONTEXT_LEN = 110;

const Name = ({ state, setState, pushError, popError }) => {
    // Local state
    const [projName, setProjName] = useState(state.projName);
    // Update global state
    const updateGlobal = () => {
        if (projName.length >= 40) {
            pushError("name", "Name must be under 40 characters long.");
            return;
        }
        popError("name");
        setState(s => ({ ...s, projName }));
    };
    return (
        <Card column="2" height="114px">
            <Heading children="Enter a name for your edit:" />
            <Flex margin="5px">
                <TextField label={"name"} labelHidden={true}
                           value={projName}
                           onChange={e => setProjName(e.target.value)}
                           width="100%"/>
                <Button children="Submit"
                        onClick={updateGlobal}
                        disabled={(projName.length === 0) || (projName === state.projName)} />
            </Flex>
        </Card>
    );
};

const IsHuman = ({ state, setState }) => {
    const setOrganism = (organism) => {
        setState(s => ({ ...s, organism, manual: false }))
    }
    return (
        <Card column="2" height="114px">
            <Heading children="Is the genotype you want to edit from a human?" />
            <Grid templateColumns="100px 100px" gap="1rem" padding="10px">
                <ToggleButton children="Human"
                              onClick={() => setOrganism("human")}
                              isPressed={state.organism === "human"}
                              display="flex"
                              column="1" />
                <ToggleButton children="Other"
                              onClick={() => setOrganism("other")}
                              isPressed={state.organism === "other"}
                              display="flex"
                              column="2" />
            </Grid>
        </Card>
    );
};

const Human = ({ state, setState, pushInfo, popInfo, pushError, popError }) => {
    // Clinvar
    const [cvData, setCvData] = useState({});
    const [cvID, setCvID] = useState(state.cvID);
    // rsID entry
    const [rsID, setRsID] = useState(state.rsID);
    // Genomic coordinates
    const [assembly, setAssembly] = useState(state.assembly);
    const [chrCoords, setChrCoords] = useState(state.chrCoords);
    const [validChrCoords, setValidChrCoords] = useState(false);
    // Constants
    const ASSEMBLIES = [{ value: "hg18", label: "hg18 (NCBI36)" },
                        { value: "hg19", label: "hg19 (GRCh37)" },
                        { value: "hg38", label: "hg38 (GRCh38)" },
                        { value: "hs1",  label: "hs1 (T2T-CHM13v2.0)" }];
    // Set global state
    useEffect(() => {
        setState(s => ({ ...s, cvID, rsID, assembly, chrCoords }));
    }, [cvID, rsID, assembly, chrCoords]);  // eslint-disable-line
    // Check if chrCoords format is valid
    useEffect(() => {
        setValidChrCoords(/chr(?:\d|1\d|2[0-2]|[XY]):\d+/.test(chrCoords));
    }, [chrCoords]);

    const submitCvID = (cvID) => {
        pushInfo("human", "Querying ClinVar...");
        cvIDtoHg38Coords(cvID)
        .then(async x => {
            const { coords, alleles } = x;
            const { ref, mut, vName } = alleles;
            pushInfo("human", "Fetching reference sequence...");
            const seq = await fetchSequenceFromCoords(coords, _CONTEXT_LEN);
            const rLen = ref.length;
            const mSeq = seq.substring(0, _CONTEXT_LEN) + mut + seq.substring(_CONTEXT_LEN + rLen);
            setState(s => ({ ...s,
                             uneditedData: { ...s.uneditedData,
                                             name: `${x.gene} (ref)`,
                                             seq: seq },
                             editedData: { ...s.editedData,
                                           name: vName,
                                           seq: mSeq } }));
            return { ...x, seq };
        })
        .then(async x => {
            const { coords } = x;
            pushInfo("human", "Fetching CDS annotations from RefSeq...")
            const refSeq = await coordsToRefSeq(coords);
            return { ...x, refSeq };
        })
        .then(x => {
            popInfo("human");
            popError("human");
            const { alleles, coords, refSeq } = x;
            const { ref, mut } = alleles;
            const uLen = mut.length;
            const eLen = ref.length;
            const uCdsList = getContextExonTranslations(refSeq, coords.pos, _CONTEXT_LEN);
            const eCdsList = uCdsList.map(cds => updateCDS(cds,
                                                           { start: _CONTEXT_LEN,
                                                             end: _CONTEXT_LEN + uLen },
                                                           eLen - uLen))
                                     .filter(cds => !!cds);

            setState(s => ({ ...s,
                             uneditedData: { ...s.uneditedData,
                                             cdsList: uCdsList },
                             editedData: { ...s.editedData,
                                           cdsList: eCdsList } }));
        })
        .then(() => {
            setState(s => ({ ...s, uneditedData: s.editedData, editedData: s.uneditedData }));
        })
        .catch(error => {
            popInfo("human");
            pushInfo("human", error.toString());
        });
    };

    // Update fields upon receiving Clinvar data
    useEffect(() => {
        if (!("list" in cvData) || !(cvData.used_list)) { return; }
        const result = cvData.list.filter(x => x[0] === cvData.final_val)[0];
        setAssembly("hg19");
        setCvID(result[0]);
        const [start, end] = result[3].split("^").map(x => parseInt(x));
        const pos = Math.floor((start + end) / 2);
        setChrCoords(`chr${result[2]}:${pos}`);
        if (result[6] !== "") {
            setRsID(result[6]);
        }
    }, [cvData]);

    const submitRsID = () => {
        pushInfo("human", "Querying dbSNP...");
        rsIDtoHg38Coords(rsID)
        .then(entry => {
            popInfo("human");
            setAssembly("hg38");
            setChrCoords(`chr${entry[1]}:${entry[2]}`);
            const coords = { assembly: "hg38",
                             chrom: "chr" + entry[1],
                             pos: entry[2] };
            const gene = entry[3];
            const alleles = entry[4].replaceAll(" ", "").split(",")[0];
            return { coords, gene, alleles };
        })
        .catch(error => {
            popInfo("human");
            pushError("human", "Error fetching dbSNP ID: " + error.toString());
        })
        .then(async x => {
            const { coords } = x;
            pushInfo("human", "Fetching reference sequence...")
            const seq = await fetchSequenceFromCoords(coords, _CONTEXT_LEN);
            return { ...x, seq };
        })
        .then(x => {
            const { gene, seq, alleles } = x;
            const [minU, minE] = alleles.split("/");
            const uLen = minU.length;
            const eSeq = seq.substring(0, _CONTEXT_LEN) + minE + seq.substring(_CONTEXT_LEN + uLen);
            setState(s => ({ ...s,
                             uneditedData: { ...s.uneditedData,
                                             name: `${gene} (ref)`,
                                             seq: seq },
                             editedData: { ...s.editedData,
                                           name: `${gene} (${rsID})`,
                                           seq: eSeq } }));
            return x;
        })
        .catch(error => {
            popInfo("human");
            pushError("human", "Error fetching genomic sequence: " + error.toString());
        })
        .then(async x => {
            const { coords } = x;
            pushInfo("human", "Fetching CDS annotations from RefSeq...")
            const refSeq = await coordsToRefSeq(coords);
            return { ...x, refSeq };
        })
        .then(x => {
            popInfo("human");
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

            setState(s => ({ ...s,
                             uneditedData: { ...s.uneditedData,
                                             cdsList: uCdsList },
                             editedData: { ...s.editedData,
                                           cdsList: eCdsList } }));
        })
        .catch(error => {
            pushInfo("human", "Error fetching RefSeq data: " + error.toString());
        });
    };
    const submitCoords = (_) => {
        const [chrom, pos] = chrCoords.split(":");
        const coords = { assembly, chrom, pos };
        pushInfo("human", "Fetching reference sequence...");
        fetchSequenceFromCoords(coords, _CONTEXT_LEN)
        .then(seq => {
            setState(prevState => ({ ...prevState,
                                     uneditedData: { ...prevState.uneditedData,
                                                     name: `Ref (${assembly})`, seq },
                                     editedData: { ...prevState.editedData,
                                                   name: `Ref (${assembly})`, seq } }));
        })
        .catch(error => {
            pushError("human", error.toString());
        })
        .finally(() => {
           popInfo("human");
        });
        coordsToRefSeq(coords)
        .then(refSeq => {
            const cdsList = getContextExonTranslations(refSeq, coords.pos, _CONTEXT_LEN);
            setState(prevState => ({ ...prevState,
                                     uneditedData: { ...prevState.uneditedData, cdsList },
                                     editedData: { ...prevState.editedData, cdsList } }));
        });
    };
    const useManual = (_) => {
        popError("human");
        setState(s => ({ ...s, organism: "", manual: true }));
    };

    return (
        <Card column="2">
            <Heading children="Search ClinVar for gene variants:" />
            <Flex justifyContent="flex-start" alignItems="baseline" padding="5px">
                <ClinvarAutocomplete setCvData={setCvData} submitCvID={submitCvID} />
                <Button children="ClinVar serach"
                        onClick={_ => {submitCvID(cvData.item_code);}}
                        disabled={!/\d+/.test(cvData.item_code)}
                        height="42px" />
            </Flex>
            <Divider label="or" margin="10px" />
            <Heading children="Search dbSNP by rsID:" />
            <Flex justifyContent="flex-start" alignItems="baseline" padding="5px">
                <TextField label="rsID" labelHidden={true}
                           placeholder="rsID (e.g., rs113993960)"
                           value={rsID}
                           onChange={e => setRsID("rs" + e.target.value.replace(/\D/g, ""))}
                           onKeyDown={e => {if (e.key === "Enter") {submitRsID();}}}
                           height="100%" />
                <Button children="rsID search"
                        onClick={_ => {submitRsID();}}
                        disabled={!/rs\d+/.test(rsID)}
                        height="42px" />
            </Flex>
            <Divider label="or" margin="10px" />
            <Heading children="Enter genomic coordinates:" />
            <Flex justifyContent="flex-start" alignItems="baseline" padding="5px">
                <SelectField label="assembly" labelHidden={true}
                             value={assembly}
                             onChange={e => setAssembly(e.target.value)}
                             placeholder="Genome assembly"
                             width="250px">
                    {ASSEMBLIES.map(option => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                    ))}
                </SelectField>
                <TextField label="chrcoords" labelHidden={true}
                           placeholder="Coordinates (e.g., chr7:117559592)"
                           value={chrCoords}
                           onChange={e => setChrCoords("chr" + e.target.value.toUpperCase().replace(/[^0-9XY:]/g, ""))}
                           width="300px" />
                <Button children="Get sequence" disabled={!validChrCoords} onClick={submitCoords} />
            </Flex>
            <Divider label="or" margin="10px" />
            <Button margin="10px"
                    onClick={useManual}
                    children="Enter sequences manually" />
        </Card>
    );
};

const Organism = ({ state, setState, pushInfo, popInfo, pushError, popError }) => {
    const [ucscFetched, setUcscFetched] = useState(false);
    const [byTaxId, setByTaxId] = useState({});
    const [organisms, setOrganisms] = useState([]);
    // Global state
    const [taxId, setTaxId] = useState(state.taxId);
    const [assembly, setAssembly] = useState(state.assembly);
    const [chrCoords, setChrCoords] = useState(state.chrCoords);
    const [validChrCoords, setValidChrCoords] = useState(false);
    // Set global state
    useEffect(() => {
        setState(s => ({ ...s, taxId, assembly, chrCoords }));
    }, [taxId, assembly, chrCoords]);  // eslint-disable-line
    // On load, check if UCSC genomes are downloaded and if not, fetch them
    useEffect(() => {
        // Check localStorage
        let byTaxId = localStorage.getItem("ucscByTaxId");
        let organisms = localStorage.getItem("ucscOrganisms");
        if (byTaxId && organisms) {
            setUcscFetched(true);
            setByTaxId(JSON.parse(byTaxId));
            setOrganisms(JSON.parse(organisms));
        } else {
            pushInfo("organism", "Downloading UCSC genomes...");
            fetchUCSCGenomes()
            .then(byTaxId => {
                localStorage.setItem("ucscByTaxId", JSON.stringify(byTaxId));
                setByTaxId(byTaxId);
                let organisms = [];
                for (const [taxId, taxIdData] of Object.entries(byTaxId)) {
                    organisms = [...organisms,
                                 {id: taxId,
                                  label: taxIdData.name + ` [${taxIdData.scientificName}, taxID: ${taxId}]`}];
                }
                localStorage.setItem("ucscOrganisms", JSON.stringify(organisms));
                setOrganisms(organisms);
            })
            .then(() => {
                setUcscFetched(true);
                popInfo("organism");
            })
            .catch(error => {
                pushError("organism", error.toString());
            });
        }
    }, []);  // eslint-disable-line
    // Check if chrCoords format is valid
    useEffect(() => {
        setValidChrCoords(/chr\w+:\d+/.test(chrCoords));
    }, [chrCoords]);

    const submitCoords = (_) => {
        const [chrom, pos] = chrCoords.split(":");
        const coords = { assembly, chrom, pos };
        pushInfo("organism", "Fetching reference sequence...");
        fetchSequenceFromCoords(coords, _CONTEXT_LEN)
        .then(seq => {
            setState(prevState => ({ ...prevState,
                                     uneditedData: { ...prevState.uneditedData,
                                                     name: `Ref (${assembly})`, seq } }));
        })
        .catch(error => {
            pushError("organism", error.toString());
        })
        .finally(() => {
           popInfo("organism");
        });
        coordsToRefSeq(coords)
        .then(refSeq => {
            const cdsList = getContextExonTranslations(refSeq, coords.pos, _CONTEXT_LEN);
            setState(prevState => ({ ...prevState,
                                     uneditedData: { ...prevState.uneditedData, cdsList }}));
        });
    };

    const useManual = (_) => {
        popError("human");
        setState(s => ({ ...s, organism: "", manual: true }));
    };

    return (
        <Card column="2">
            {ucscFetched && <>
            <Heading children="Select an organism:" />
            <Autocomplete label="Organism:"
                          options={organisms}
                          placeholder="Organism"
                          labelHidden={true}
                          margin="10px"
                          onSelect={option => setTaxId(option.id)} />
            {taxId && <>
            <Heading children="Select genome assembly:" />
            <Flex justifyContent="flex-start" alignItems="baseline" padding="5px">
                <Autocomplete label="Genome:"
                          options={byTaxId[taxId].genomes.map(x => ({id: x, label: x}))}
                          onSelect={option => setAssembly(option.id)}
                          width="250px" />
                <TextField label="chrcoords" labelHidden={true}
                           placeholder="Coordinates (e.g., chr7:117559592)"
                           value={chrCoords}
                           onChange={e => setChrCoords("chr" + e.target.value.toUpperCase().replace(/[^0-9XY:]/g, ""))}
                           width="300px" />
                <Button children="Get sequence" disabled={!validChrCoords} onClick={submitCoords} />
            </Flex>
            </>}
            </>}
            <Divider label="or" margin="10px" />
            <Button margin="10px"
                    onClick={useManual}
                    children="Enter sequences manually" />
        </Card>
    );
};

const Unedited = ({ state, setState, pushError, popError }) => {
    const setLabel = (label) => {
        if (label.length > 200) {
            pushError("unedited", "Name cannot exceed 200 characters.");
            return;
        }
        popError("unedited");
        setState(s => ({ ...s, uneditedData: { ...s.uneditedData, name: label } }));
    };
    const setUneditedData = (update) => {
        if (typeof update === "function") {
            setState(s => ({ ...s, uneditedData: update(s.uneditedData) }));
        } else {
            setState(s => ({ ...s, uneditedData: update }));
        }
    };
    return (
        <Card columnStart="1" columnEnd="-1">
            <Heading children={"Unedited sequence:"} />
            <TextField label={"name"} labelHidden={true}
                       placeholder={"Sequence name (optional)"}
                       value={state.uneditedData.name}
                       onChange={e => setLabel(e.target.value)}
                       width="100%"/>
            <EditableSeqViz isEditable={true}
                            seqData={state.uneditedData}
                            setSeqData={setUneditedData} />
        </Card>
    );
};

const Edited = ({ state, setState, pushError, popError }) => {
    const setLabel = (label) => {
        if (label.length > 200) {
            pushError("edited", "Name cannot exceed 200 characters.");
            return;
        }
        popError("edited");
        setState(s => ({ ...s, editedData: { ...s.editedData, name: label } }));
    };
    const setEditedData = (update) => {
        if (typeof update === "function") {
            setState(s => ({ ...s, editedData: update(s.editedData) }));
        } else {
            setState(s => ({ ...s, editedData: update }));
        }
    };
    // BUTTON TO SWITCH BETWEEN UNEDITED/EDITED
    const copyUnedited = () => {
        setState(s => ({ ...s, editedData: s.uneditedData }));
    };
    const switchSeqs = () => {
        setState(s => ({ ...s, uneditedData: s.editedData, editedData: s.uneditedData }));
    };
    return (
        <Card columnStart="1" columnEnd="-1">
            <Heading children={"Edited sequence:"} />
            <TextField label={"name"} labelHidden={true}
                       placeholder={"Sequence name (optional)"}
                       value={state.editedData.name}
                       onChange={e => setLabel(e.target.value)}
                       width="100%"/>
            <Button onClick={copyUnedited}>Copy from unedited sequence</Button>
            <Button onClick={switchSeqs}>{'\u21d5'}</Button>
            <EditableSeqViz isEditable={true}
                            seqData={state.editedData}
                            setSeqData={setEditedData}
                            allowIupac={true} />
        </Card>
    );
};

const DesignPage = ({ state, setState, onNext }) => {
    const {tokens} = useTheme();
    // Messages to display
    const [infoMsgs, setInfoMsgs] = useState({});
    const [errorMsgs, setErrorMsgs] = useState({});
    const _pushObject = (setFunction, key, value) => {
        setFunction(prevState => ({...prevState, [`${key}`]: value}));
    };
    const _popObject = (setFunction, key) => {
        setFunction(prevState => {
            let newState = {...prevState};
            if (key in newState) {
                delete newState[key];
            }
            return newState;
        });
    };
    const pushInfo = (key, value) => _pushObject(setInfoMsgs, key, value);
    const pushError = (key, value) => _pushObject(setErrorMsgs, key, value);
    const popInfo = (key) => _popObject(setInfoMsgs, key);
    const popError = (key) => _popObject(setErrorMsgs, key);
    // Props to pass to child components
    const props = {state, setState, pushInfo, pushError, popInfo, popError};

    const ref = useRef(null);

    // Assert that an edit is being made
    useEffect(() => {
        if (state.uneditedData.seq === "" || state.editedData.seq === "") { return; }
        const {minU, minE} = minEdit(state.uneditedData.seq, state.editedData.seq);
        popError("is-edit")
        if (minU.length === 0 && minE.length === 0) { pushError("is-edit", "No edit specified"); }
    }, [state.uneditedData.seq, state.editedData.seq]);  // eslint-disable-line

    // Add indel line
    useEffect(() => editHighlights(ref, state, setState),
              [ref, state.uneditedData.seq, state.editedData.seq]);  // eslint-disable-line

    return (
        <Grid
            rowGap="15px"
            columnGap={tokens.space.medium.value}
            padding="20px"
            width="100%"
            templateColumns="1fr 800px 1fr"
            templateRows="repeat(auto-fill, minmax(min-content, 10px))"
            minHeight="80%"
            ref={ref}
        >
            <Name {...props} />
            {state.projName && !("name" in errorMsgs) && <>
            <Divider columnStart="1" columnEnd="-1" orientation="horizontal" />
            <IsHuman {...props} />
            {state.organism === "human" && <>
            <Divider columnStart="1" columnEnd="-1" orientation="horizontal" />
            <Human {...props} />
            </>}
            {state.organism === "other" && <>
            <Divider columnStart="1" columnEnd="-1" orientation="horizontal" />
            <Organism {...props} />
            </>}
            {(state.uneditedData.seq !== "" || state.manual) && <>
            <Divider columnStart="1" columnEnd="-1" orientation="horizontal" />
            <Unedited {...props} />
            </>}
            {(state.uneditedData.seq !== "" || state.manual) && <>
            <Divider columnStart="1" columnEnd="-1" orientation="horizontal" />
            <Edited {...props} />
            </>}
            <Divider columnStart="1" columnEnd="-1" orientation="horizontal" />
            </>}
            <Card columnStart="1" columnEnd="-1">
             {Object.entries(infoMsgs).map(([key, msg]) => (
                <Alert key={key} isDismissible={false} hasIcon={true} variation="info">
                    {msg}
                </Alert>
            ))}
            {Object.entries(errorMsgs).map(([key, msg]) => (
                <Alert key={key} isDismissible={false} hasIcon={true} variation="error">
                    {msg}
                </Alert>
            ))}
            </Card>
            {(state.uneditedData.seq !== "" && state.editedData.seq !== "") && <>
            <Divider columnStart="1" columnEnd="-1" orientation="horizontal" />
            <Flex justifyContent="space-between">
                <Flex gap={tokens.space.medium.value}>
                    <Button
                        children="Next"
                        type="submit"
                        variation="primary"
                        isDisabled={Object.keys(errorMsgs).length !== 0}
                        onClick={onNext}
                    ></Button>
                </Flex>
            </Flex>
            </>}
        </Grid>
    );
};

const PreviewPage = ({ state, setState, onBack, updateTokens }) => {
    const {tokens} = useTheme();
    const navigate = useNavigate();
    // Extract state
    const { uneditedData, editedData } = state
    const uSeq = uneditedData.seq;
    const eSeq = editedData.seq;
    const uSeqR = revcomp(uSeq);
    const eSeqR = revcomp(eSeq);
    // Protospacer search and selection
    const [protos, setProtos] = useState([]);
    const [selected, setSelected] = useState({});
    const [cProto, setCProto] = useState("");  // Clicked protospacer
    const [segInfo, setSegInfo] = useState({});
    const [cSeg, setCSeg] = useState("");  // Clicked segment
    const [dispSeg, setDispSeg] = useState("");
    // HT-PAMDA data for PAM variants
    const [useVars, setUseVars] = useState(false);  // Using PAM variants?
    const [pamdaData, setPamdaData] = useState({});
    // Misc. state
    const [info, setInfo] = useState("");  // Info text to display to user
    const [useSilents, setUseSilents] = useState(true);
    const [protoAnns, setProtoAnns] = useState([]);  // Protospacer annotations
    const [segAnns, setSegAnns] = useState([]);  // Edited segment annotations
    // Ref to unedited
    const ref = useRef(null);

    // FIRST LOAD TASKS
    // Load HT-PAMDA data in background
    useEffect(() => {
        fetch("/HT-PAMDA.json")
            .then(r => r.json())
            .then(j => setPamdaData(j));
    }, []);
    // Add highlights
    useEffect(() => editHighlights(ref, state, setState),
              [ref, state.uneditedData.seq, state.editedData.seq]);  // eslint-disable-line
    // Find all protospacers and assign scores
    useEffect(() => {
        if (Object.keys(pamdaData).length === 0) {
            setInfo("Loading HT-PAMDA data...");
            return;
        }
        setInfo("");
        // Chunk up sequence into codon segments
        const segmentsF = splitDNAbyCDS(eSeq, editedData.cdsList);
        const revCDSList = editedData.cdsList.map(c => ({
            direction: c.direction === "+" ? "-" : "+",
            start: eSeq.length - c.end,
            end: eSeq.length - c.start,
            frame: c.frame
        }));
        const segmentsR = splitDNAbyCDS(eSeqR, revCDSList);
        const eDelta = eSeq.length > uSeq.length ? eSeq.length - uSeq.length : 0;
        const fEntries = findProtosDirection(uSeq, eSeq, "+", pamdaData)
                         .map(x => ({ ...x,
                                      segments: reduceSegments(
                                                    sliceSegments(segmentsF,
                                                                  x.start20 - 4,
                                                                  x.start20 + 71 + eDelta),
                                                    x.offset) }));
        const rEntries = findProtosDirection(uSeqR, eSeqR, "-", pamdaData)
                         .map(x => ({ ...x,
                                      segments: reduceSegments(
                                                    sliceSegments(segmentsR,
                                                                  x.start20 - 4,
                                                                  x.start20 + 71 + eDelta),
                                                    x.offset) }))
                         .map(x => ({ ...x,
                                      start20: uSeq.length - x.end20,
                                      end20: uSeq.length - x.start20 }));
        const entries = [ ...fEntries, ...rEntries ];
        const pamVars = entries
                        .map(x => x.pamVar)
                        .filter((v, i, a) => a.indexOf(v) === i);  // Gets unique PAMs used
        const protoPams = pamVars
                          .map(x => entries
                                    .filter(v => v.pamVar === x)
                                    .toSorted((a, b) => a.nickDist - b.nickDist)
                                    .map((e, i) => ({ ...e, id: `${e.pamVar}${i + 1}` })))
                          .flatMap(x => x);
        setProtos(protoPams);
        // Get Doench score
        const scoreCache = JSON.parse(localStorage.getItem("protoScores")) || {};
        const proto30s = protoPams.map(x => x.proto30);
        if (protoPams.filter(x => x.pamVar === "SpNGG").length === 0) {
            setUseVars(true);
        }
        const nonCached = proto30s.filter(x => !(x in scoreCache));
        if (nonCached.length > 0) {
            setInfo("Evaluating protospacers with Doench Rule Set 3...");
            const seqs = nonCached
                         .map(x => x.substring(0, 25) + "GG" + x.substring(27, 30))
                         .join(",");
            fetchAuth("ac_token", "https://api.optipri.me/utils/doench_rs3",
                      { method: "POST", body: JSON.stringify({ seqs }) })
            .then(resp => {
                if (!resp.ok) {
                    setInfo("Error evaluating protospacers.");
                    throw new Error(JSON.stringify(resp.json()));
                }
                setInfo("");
                return resp.json();
            })
            .then(data => {
                const scoreData = Array.isArray(data) ? data : [data];
                const cacheUpdate = Object.fromEntries(nonCached.map((x, i) => [x, scoreData[i]]));
                localStorage.setItem("protoScores", JSON.stringify({ ...scoreCache,
                                                                     ...cacheUpdate }));
                setProtos(oldProtos => oldProtos.map(x => x.proto30 in cacheUpdate
                    ? { ...x,
                        score: scaleProtoScore(cacheUpdate[x.proto30],
                            x.pamScore) }
                    : x ));
            })
            .catch(e => console.error(e));
        }
        setProtos(oldProtos => oldProtos.map(x => x.proto30 in scoreCache
                                                  ? { ...x,
                                                      score: scaleProtoScore(scoreCache[x.proto30],
                                                                             x.pamScore) }
                                                  : x ));
    }, [pamdaData, uSeq, eSeq, uSeqR, eSeqR, editedData.cdsList]);

    // PROTOSPACER SELECTION HANDLING
    useEffect(() => {
        setSelected(prevSelected => (
            Object.fromEntries(protos.map(p => [p.id, prevSelected[p.id] ?? false]))
        ));
        setSegInfo(Object.fromEntries(protos.map(p =>
                       [p.id, {
                           direction: p.direction,
                           start: p.direction === "+" ? p.start20 - 4 : p.end20 + 4,
                           segments: p.segments,
                           segSel: p.segments.map(() => true)
                       }]
        )));
    }, [protos]);
    useEffect(() => {
        setSegInfo(prevSegInfo => Object.fromEntries(
            Object.entries(prevSegInfo)
            .map(k_v => ([k_v[0], {
                ...k_v[1],
                segSel: k_v[1].segSel.map(() => useSilents)
            }]))
        ));
    }, [useSilents]);
    // Update annotations when protos updates or when useVars is toggled
    useEffect(() => {
        const annotations = protos
            .filter(x => x.pamVar === "SpNGG" || (useVars && x.score > -1))
            .map(x => {
                const name = ("score" in x) && (typeof x.score !== "undefined")
                             ? `${x.id} [PScore ${x.score.toFixed(2)}]`
                             : x.id;
                const direction = x.direction === "+" ? 1 : -1;
                let color;
                if (("score" in x) && (typeof x.score !== "undefined")) {
                    color = (x.pamVar === "SpNGG") ? "lightblue" : "pink";
                } else {
                    color = "gray";
                }
                return { name,
                         start: x.start20,
                         end: x.end20,
                         direction,
                         color }
            });
        setProtoAnns(annotations);
    }, [protos, useVars]);

    const PROTO_RE = /Sp\w+\d+/;
    const protoHandler = (e) => {
        const name = e.name.split(" ")[0];
        if (PROTO_RE.test(name)) {
            setCProto(name);
            if (!selected[name]) {
                setDispSeg(name);
            } else {
                setDispSeg("");
            }
        }
    };
    useEffect(() => {
        if (PROTO_RE.test(cProto)) {
            setSelected(prevSelected => ({ ...prevSelected,
                                           [cProto] : !prevSelected[cProto] }));
            setCProto("");
        }
    }, [cProto]);  // eslint-disable-line

    const SEG_RE = /(Sp\w+\d+)_([ACDEFGHIKLMNPQRSTVWY*])(\d+)/;
    const segHandler = (e) => {
        if (SEG_RE.test(e.name)) {
            setCSeg(e.name);
        }
    };
    useEffect(() => {
        const match = SEG_RE.exec(cSeg);
        if (match !== null) {
            const protoId = match[1];
            const idx = parseInt(match[3]);
            setSegInfo(prevSegInfo => ({
                ...prevSegInfo,
                [protoId]: {
                    ...prevSegInfo[protoId],
                    segSel: [...prevSegInfo[protoId].segSel.slice(0, idx),
                             !prevSegInfo[protoId].segSel[idx],
                             ...prevSegInfo[protoId].segSel.slice(idx + 1)]
                }
            }));
            setCSeg("");
        }
    }, [cSeg]);  //eslint-disable-line

    useEffect(() => {
        if (dispSeg !== "") {
            const protoInfo = segInfo[dispSeg];
            const { start, direction, segments, segSel } = protoInfo;
            const eDir = editedData.cdsList.length > 0 ? editedData.cdsList[0].direction : "+";
            let anns = [];
            let idx = start;
            for (const [i, seg] of segments.entries()) {
                const sLen = seg[0].length;
                const annStart = direction === "+" ? idx : idx - sLen;
                const annEnd = direction === "+" ? idx + sLen : idx;
                idx = direction === "+" ? idx + sLen : idx - sLen;
                if (sLen > 3) continue;
                let codon;
                if (sLen === 1) {
                    const prevSeg0 = segments[i - 1][0];
                    codon = prevSeg0.slice(prevSeg0.length - 2) + seg[0];
                } else if (sLen === 2) {
                    const prevSeg0 = segments[i - 1][0];
                    codon = prevSeg0.slice(prevSeg0.length - 1) + seg[0];
                } else {
                    codon = seg[0];
                }
                codon = direction === eDir ? codon : revcomp(codon);
                const aa = codonTableForward[codon];
                const color = segSel[i] ? aminoAcidColors[aa] : darkAminoAcidColors[aa];
                anns = [...anns, {
                    name: `${dispSeg}_${aa}${i}`,
                    start: annStart,
                    end: annEnd,
                    direction: 0,
                    color: color
                }]
            }
            setSegAnns(anns);
        } else {
            setSegAnns([]);
        }
    }, [dispSeg, segInfo, editedData.cdsList]);

    const onSubmit = (_) => {
        const minState = {
            name: state.projName,
            uneditedData: { name: uneditedData.name,
                            seq: uSeq,
                            cdsList: uneditedData.cdsList },
            editedData: { name: editedData.name,
                          seq: eSeq,
                          cdsList: editedData.cdsList },
            subJobs: protos.filter(x => selected[x.id])
                           .map(x => ({
                               name: `${state.projName}_${x.id}`,
                               unedited: x.unedited,
                               edit_segments: x.segments.map((s, i) => segInfo[x.id].segSel[i] ? s : [s[0]])
                           }))
        };
        fetchAuth("ac_token", "https://api.optipri.me/jobs", {
            method: "PUT",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(minState)
        })
        .then(resp => {
            if (resp.ok) {
                return resp.json();
            } else {
                throw new Error(resp.body());
            }
        })
        .then(body => {
            updateTokens();
            navigate(`/jobs/${body.jobID}`);
        })
        .catch(e => {
            setInfo(e.toString());
            console.log(e);
        });
    };

    return (
        <Grid
            rowGap="15px"
            columnGap={tokens.space.medium.value}
            padding="20px"
            width="100%"
            templateColumns="1fr 1000px 1fr"
        >
            <Card columnStart="1" columnEnd="-1" padding="0px">
                <Heading level={2} children={state.projName} />
            </Card>
            <Card columnStart="1" columnEnd="-1" ref={ref}>
                <Heading children={`${state.uneditedData.name}`} />
                <SeqVizWithCDS seqData={{ ...state.uneditedData,
                                          annotations: protoAnns }}
                               selHandler={protoHandler} />
                <Heading children={`${state.editedData.name}`} />
                <SeqVizWithCDS seqData={{ ...state.editedData,
                                          annotations: segAnns }}
                               selHandler={segHandler} />
                <SwitchField
                    label="Use PAM variants"
                    labelPosition="start"
                    isChecked={useVars}
                    onChange={(e) => { setUseVars(e.target.checked); }}
                />
                <SwitchField
                    label="Use silent edits"
                    labelPosition="start"
                    isChecked={useSilents}
                    onChange={(e) => { setUseSilents(e.target.checked); }}
                />
            </Card>
            <Card column="2">
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell as="th">Name</TableCell>
                            <TableCell as="th">Protospacer</TableCell>
                            <TableCell as="th">Adj. RS3 score</TableCell>
                            <TableCell as="th">Num. edit combos</TableCell>
                            <TableCell as="th">Tokens required</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {protos
                         .filter(x => selected[x.id])
                         .map(x => {
                             const numCombos = x.segments
                                               .map((seg, i) => segInfo[x.id].segSel[i]
                                                                ? seg.length
                                                                : 1)
                                               .reduce((acc, x) => acc * x, 1);
                             let tokenCost = 1;
                             let combosRem = numCombos === 1 ? 0 : numCombos;
                             tokenCost = tokenCost + Math.ceil(Math.min(combosRem, 256) / 64);
                             combosRem = combosRem - Math.min(combosRem, 256);
                             tokenCost = tokenCost + Math.ceil(combosRem / 256);
                             return (
                                 <TableRow>
                                     <TableCell>{x.id}</TableCell>
                                     <TableCell>{x.proto30.slice(4, 24)}</TableCell>
                                     <TableCell>{x.score}</TableCell>
                                     <TableCell>{numCombos}</TableCell>
                                     <TableCell>{tokenCost}</TableCell>
                                 </TableRow>)
                             }
                         )}
                    </TableBody>
                </Table>
            </Card>
            <Divider columnStart="1" columnEnd="-1" orientation="horizontal" />
            <Card columnStart="1" columnEnd="-1" height="auto">
                {info &&
                <Alert isDismissible={false} hasIcon={true} variation="info">
                    {info}
                </Alert>}
            </Card>
            <Flex justifyContent="space-between">
                <Flex gap={tokens.space.medium.value}>
                    <Button
                        children="Back"
                        type="submit"
                        variation="primary"
                        onClick={onBack}
                    />
                    <Button
                        children="Submit"
                        type="submit"
                        variation="primary"
                        onClick={onSubmit}
                        disabled={protos.filter(x => selected[x.id]).length === 0}
                    />
                </Flex>
            </Flex>
        </Grid>
    );
};

const Design = ({ updateTokens }) => {
    const location = useLocation();
    const [view, setView] = useState("design");  // "design" or "preview"
    const initialState = location.state || {
        projName: "",
        organism: "",
        cvID: "",
        rsID: "",
        assembly: "",
        chrCoords: "",
        taxId: "",
        uneditedData: {
            name: "", seq: "", selection: {clockwise: true, start: 0, end: 0},
            cdsList: [], annotations: [], translations: [], highlights: []
        },
        editedData: {
            name: "", seq: "", selection: {clockwise: true, start: 0, end: 0},
            cdsList: [], annotations: [], translations: [], highlights: []
        },
        manual: false,
        existingSubJobs: []
    };
    const [state, setState] = useState(initialState);

    // FOR DEBUGGING
    useEffect(() => {
        let upperState = state
        upperState.uneditedData.seq = state.uneditedData.seq.toUpperCase();
        upperState.editedData.seq = state.editedData.seq.toUpperCase();
        const {minU, minE, preLen} = minEdit(upperState.uneditedData.seq, upperState.editedData.seq);
        window.printState = () => {
            console.log(JSON.stringify(JSON.stringify(upperState)));
        };
        window.printPridict = () => {
            const uSeq = upperState.uneditedData.seq;
            const preSeq = uSeq.slice(preLen - 100, preLen);
            const postSeq = uSeq.slice(preLen + minU.length, preLen + minU.length + 100);
            const u = minU.length === 0 ? "+" : minU;
            const e = minE.length === 0 ? "-" : minE;
            console.log(`${preSeq}(${u}/${e})${postSeq}`);
        };
        window.printDeepPrime = () => {
            const uSeq = upperState.uneditedData.seq;
            const eSeq = upperState.editedData.seq;
            console.log(uSeq.slice(preLen - 60, preLen + 61));
            console.log(eSeq.slice(preLen - 60, preLen + 61));
        };
        window.getStateObject = () => upperState;
    }, [state]);

    return (
        <div>
            {view === "design" && (
                <DesignPage state={state} setState={setState} onNext={() => setView("preview")} />
            )}
            {view === "preview" && (
                <PreviewPage
                    state={state}
                    setState={setState}
                    updateTokens={updateTokens}
                    onBack={() => setView("design")} />
            )}
        </div>
    )
};

export default Design;
