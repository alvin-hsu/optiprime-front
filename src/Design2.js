import React, { useEffect, useState } from "react";
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
    cvIDtoHg38Coords
} from "./Utils";
import ClinvarAutocomplete from "./ClinvarAutocomplete";
import EditableSeqViz from "./EditableSeqViz";

const _CONTEXT_LEN = 75;

const Name = ({ state, setState }) => {
    // Local state
    const [projName, setProjName] = useState(state.projName);
    // Update global state
    const updateGlobal = () => {
        setState(s => ({ ...s, projName }));
    };
    return (
        <Card column="2" height="114px">
            <Heading children="Enter a name for your edit:" />
            <Flex margin="5px">
                <TextField label={"name"} labelHidden={true}
                           value={projName}
                           onChange={e => setProjName(e.target.value)}
                           width="80%"/>
                <Button children="Submit" onClick={updateGlobal} />
            </Flex>
        </Card>
    );
};

const IsHuman = ({ state, setState }) => {
    // Local state
    const [organism, setOrganism] = useState(state.organism);
    // Update global state
    useEffect(() => {
        setState(s => ({ ...s, organism }));
    }, [organism]);  // eslint-disable-line
    return (
        <Card column="2" height="114px">
            <Heading children="Is the genotype you want to edit from a human?" />
            <Grid templateColumns="100px 100px" gap="1rem" padding="10px">
                <ToggleButton children="Human"
                              onClick={() => setOrganism("human")}
                              isPressed={organism === "human"}
                              display="flex"
                              column="1" />
                <ToggleButton children="Other"
                              onClick={() => setOrganism("other")}
                              isPressed={organism === "other"}
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
    const [gene, setGene] = useState(state.gene);
    // rsID entry
    const [rsID, setRsID] = useState(state.rsID);
    // Genomic coordinates
    const [assembly, setAssembly] = useState(state.assembly);
    const [chrCoords, setChrCoords] = useState(state.chrCoords);
    const [validChrCoords, setValidChrCoords] = useState(false);
    // Manual entry
    const [manual, setManual] = useState(state.manual);
    // Constants
    const ASSEMBLIES = [{ value: "hg18", label: "hg18 (NCBI36)" },
                        { value: "hg19", label: "hg19 (GRCh37)" },
                        { value: "hg38", label: "hg38 (GRCh38)" },
                        { value: "hs1",  label: "hs1 (T2T-CHM13v2.0)" }];
    // Set global state
    useEffect(() => {
        setState(s => ({ ...s, gene, cvID, rsID, assembly, chrCoords, manual }));
    }, [gene, cvID, rsID, assembly, chrCoords, manual]);  // eslint-disable-line
    // Check if chrCoords format is valid
    useEffect(() => {
        setValidChrCoords(/chr(?:\d|1\d|2[0-2]|[XY]):\d+/.test(chrCoords));
    }, [chrCoords]);

    const submitCvID = (cvID) => {
        pushInfo("human", "Querying ClinVar...");
        cvIDtoHg38Coords(cvID)
        .then(async x => {
            const { coords } = x;
            pushInfo("human", "Fetching reference sequence...");
            const seq = await fetchSequenceFromCoords(coords, _CONTEXT_LEN);
            return { ...x, seq };
        })
        .then(x => {
            const { seq, alleles } = x;
            const { minU, minE, eName } = alleles;
            const uLen = minU.length;
            const eSeq = seq.substring(0, _CONTEXT_LEN) + minE + seq.substring(_CONTEXT_LEN + uLen);
            setState(s => ({ ...s,
                             uneditedData: { ...s.uneditedData,
                                             name: `${gene} (ref)`,
                                             seq: seq },
                             editedData: { ...s.editedData,
                                           name: eName,
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
        .catch(error => {
            pushInfo("human", "Error fetching RefSeq data: " + error.toString());
        })
        .then(x => {
            popInfo("human");
            const { alleles, coords, refSeq } = x;
            const { minU, minE } = alleles;
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
            console.log(x);
        });
    };

    // Update fields upon receiving Clinvar data
    useEffect(() => {
        if (!("list" in cvData) || !(cvData.used_list)) { return; }
        const result = cvData.list.filter(x => x[0] === cvData.final_val)[0];
        setAssembly("hg19");
        setCvID(result[0]);
        setGene(result[1]);
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
            setGene(entry[3]);
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
        .catch(error => {
            pushInfo("human", "Error fetching RefSeq data: " + error.toString());
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
        });
    };
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


    return (
        <Card column="2">
            <Heading children="Search ClinVar for gene variants:" />
            <ClinvarAutocomplete setCvData={setCvData} submitCvID={submitCvID} />
            <Divider label="or" margin="10px" />
            <Heading children="Search dbSNP by rsID:" />
            <Flex justifyContent="flex-start" alignItems="baseline" padding="5px">
                <TextField placeholder="rsID (e.g., rs113993960)"
                           value={rsID}
                           onChange={e => setRsID("rs" + e.target.value.replace(/\D/g, ""))}
                           onKeyDown={e => {if (e.key === "Enter") {submitRsID();}}}
                           height="100%"
                           labelHidden={true} />
                <Button children="rsID search"
                        onClick={_ => {submitRsID();}}
                        disabled={!/rs\d+/.test(rsID)}
                        height="42px" />
            </Flex>
            <Divider label="or" margin="10px" />
            <Heading children="Enter genomic coordinates:" />
            <Flex justifyContent="flex-start" alignItems="baseline" padding="5px">
                <SelectField value={assembly}
                             onChange={e => setAssembly(e.target.value)}
                             placeholder="Genome assembly"
                             labelHidden={true}
                             width="250px">
                    {ASSEMBLIES.map(option => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                    ))}
                </SelectField>
                <TextField placeholder="Coordinates (e.g., chr7:117559592)"
                           value={chrCoords}
                           onChange={e => setChrCoords("chr" + e.target.value.toUpperCase().replace(/[^0-9XY:]/g, ""))}
                           labelHidden={true}
                           width="300px" />
                <Button children="Get sequence" disabled={!validChrCoords} onClick={submitCoords} />
            </Flex>
            <Divider label="or" margin="10px" />
            <ToggleButton margin="10px"
                          isPressed={manual}
                          onClick={() => setManual(true)}
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
    const [manual, setManual] = useState(state.manual);
    // Set global state
    useEffect(() => {
        setState(s => ({ ...s, taxId, assembly, chrCoords, manual }));
    }, [taxId, assembly, chrCoords, manual]);  // eslint-disable-line
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
        setValidChrCoords(/chr[\d\w]+:\d+/.test(chrCoords));
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
                <TextField placeholder="Coordinates (e.g., chr7:117559592)"
                           value={chrCoords}
                           onChange={e => setChrCoords("chr" + e.target.value.toUpperCase().replace(/[^0-9XY:]/g, ""))}
                           labelHidden={true}
                           width="300px" />
                <Button children="Get sequence" disabled={!validChrCoords} onClick={submitCoords} />
            </Flex>
            </>}
            </>}
            <Divider label="or" margin="10px" />
            <ToggleButton margin="10px"
                          isPressed={manual}
                          onClick={() => setManual(true)}
                          children="Enter sequences manually" />
        </Card>
    );
};

const Unedited = ({ state, setState }) => {
    const setUneditedData = (update) => {
        if (typeof update === "function") {
            setState(s => ({ ...s, uneditedData: update(s.uneditedData) }));
        } else {
            setState(s => ({ ...s, uneditedData: update }));
        }
    };
    const label = state.uneditedData.name !== "" ? state.uneditedData.name : "";
    return (
        <Card columnStart="1" columnEnd="-1">
            <Heading children={`Unedited sequence: ${label}`} />
            <EditableSeqViz isEditable={true}
                            seqData={state.uneditedData}
                            setSeqData={setUneditedData} />
        </Card>
    );
};

const Edited = ({ state, setState }) => {
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
    const label = state.editedData.name !== "" ? state.editedData.name : "";
    return (
        <Card columnStart="1" columnEnd="-1">
            <Heading children={`Edited sequence: ${label}`} />
            <Button onClick={copyUnedited}>Copy from unedited sequence</Button>
            <Button onClick={switchSeqs}>{'\u21d5'}</Button>
            <EditableSeqViz isEditable={true}
                            seqData={state.editedData}
                            setSeqData={setEditedData} />
        </Card>
    );
};

const Design = () => {
    const { tokens } = useTheme();
    const initialValues = {
        projName: "",
        organism: "",
        gene: "",
        cvID: "",
        rsID: "",
        assembly: "",
        chrCoords: "",
        taxId: "",
        uneditedData: { name: "", seq: "", cdsList: [],
                        annotations: [], translations: [], highlights: [] },
        editedData: { name: "", seq: "", cdsList: [],
                      annotations: [], translations: [], highlights: [] },
        manual: false
    };
    const [state, setState] = useState(initialValues);
    // Messages to display
    const [tempText, setTempText] = useState("");
    const [infoMsgs, setInfoMsgs] = useState({});
    const [errorMsgs, setErrorMsgs] = useState({});
    const _pushObject = (setFunction, key, value) => {
        setFunction(prevState => ({ ...prevState, [`${key}`]: value }));
    };
    const _popObject = (setFunction, key) => {
        setFunction(prevState => {
            let newState = { ...prevState };
            if (key in newState) {
                delete newState[key];
            }
            return newState;
        });
    };
    const pushInfo = (key, value) => { _pushObject(setInfoMsgs, key, value); };
    const pushError = (key, value) => { _pushObject(setErrorMsgs, key, value); };
    const popInfo = (key) => { _popObject(setInfoMsgs, key); };
    const popError = (key) => { _popObject(setErrorMsgs, key); };
    // Props to pass to child components
    const props = { state, setState, pushInfo, pushError, popInfo, popError };

    // FOR DEBUGGING
    useEffect(() => {
        let upperState = state
        upperState.uneditedData.seq = state.uneditedData.seq.toUpperCase();
        upperState.editedData.seq = state.editedData.seq.toUpperCase();
        window.printState = () => {
            console.log(JSON.stringify(JSON.stringify(upperState)));
        }
    }, [state]);

    // HIGHLIGHT EDIT
    useEffect(() => {
        if (state.uneditedData.seq === "" || state.editedData.seq === "") { return; }
        const {minU, minE, preLen} = minEdit(state.uneditedData.seq, state.editedData.seq);
        let color = "black";
        popError("no-edit");
        if (minU.length === 0 && minE.length === 0) { pushError("no-edit", "No edit specified!"); }
        else if (minU.length === 0) { color = "lime"; }
        else if (minE.length === 0) { color = "pink"; }
        else { color = "cyan"; }
        const uHighlight = { start: preLen, end: preLen + minU.length, color: color };
        const eHighlight = { start: preLen, end: preLen + minE.length, color: color };
        // Set unedited highlight
        const uHighlights = minU.length > 0 ? [uHighlight] : [];
        setState(s => ({ ...s, uneditedData: { ...s.uneditedData, highlights: uHighlights } }));
        // Set edited highlight
        const eHighlights = minE.length > 0 ? [eHighlight] : [];
        setState(s => ({ ...s, editedData: { ...s.editedData, highlights: eHighlights } }));
    }, [state.uneditedData.seq, state.editedData.seq]);  // eslint-disable-line

    const handleSubmit = (_) => {
        setTempText(JSON.stringify(JSON.stringify(state)));
        // fetchAuth("ac_token", "https://api.optipri.me/projects", {
        //     method: "PUT",
        //     body: JSON.stringify(state)
        // })
    };

    return (
        <Grid
            rowGap="15px"
            columnGap={tokens.space.medium.value}
            padding="20px"
            width="95%"
            templateColumns="1fr 800px 1fr"
        >
            <Name {...props} />
            {state.projName && <>
            <Divider columnStart="1" columnEnd="-1" orientation="horizontal" />
            <IsHuman {...props} />
            </>}
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
            <Card columnStart="1" columnEnd="-1" height="1fr" />
            <Divider columnStart="1" columnEnd="-1" orientation="horizontal" />
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
            {(state.uneditedData.seq !== "" && state.editedData.seq !== "") && <>
            <p>{tempText}</p>
            <Divider columnStart="1" columnEnd="-1" orientation="horizontal" />
            <Flex justifyContent="space-between">
                <Flex gap={tokens.space.medium.value}>
                    <Button
                        children="Submit"
                        type="submit"
                        variation="primary"
                        isDisabled={Object.keys(errorMsgs).length !== 0}
                        onClick={handleSubmit}
                    ></Button>
                </Flex>
            </Flex>
            </>}
        </Grid>
    );
};

export default Design;
