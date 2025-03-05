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
    cvIDtoHg38Coords,
    fetchAuth
} from "./Utils";
import ClinvarAutocomplete from "./ClinvarAutocomplete";
import { EditableSeqViz } from "./ModdedSeqViz";
import {useNavigate} from "react-router-dom";

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
        if (!/^[a-zA-Z0-9\-_]+$/.test(projName)) {
            setState(s => ({ ...s, projName: "" }));
            pushError("name", "Name can only contain alphanumeric characters, hyphens, and underscores.");
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
                           width="80%"/>
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
            const { minU, minE, eName } = alleles;
            pushInfo("human", "Fetching reference sequence...");
            const seq = await fetchSequenceFromCoords(coords, _CONTEXT_LEN);
            const uLen = minU.length;
            const eSeq = seq.substring(0, _CONTEXT_LEN) + minE + seq.substring(_CONTEXT_LEN + uLen);
            setState(s => ({ ...s,
                             uneditedData: { ...s.uneditedData,
                                             name: `${x.gene} (ref)`,
                                             seq: seq },
                             editedData: { ...s.editedData,
                                           name: eName,
                                           seq: eSeq } }));
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
        })
        .catch(error => {
            popInfo("human");
            pushError("human", error.toString());
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
            <ClinvarAutocomplete setCvData={setCvData} submitCvID={submitCvID} />
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
                       width="80%"/>
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
                       width="80%"/>
            <Button onClick={copyUnedited}>Copy from unedited sequence</Button>
            <Button onClick={switchSeqs}>{'\u21d5'}</Button>
            <EditableSeqViz isEditable={true}
                            seqData={state.editedData}
                            setSeqData={setEditedData} />
        </Card>
    );
};

const Design = () => {
    const {tokens} = useTheme();
    const initialValues = {
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
        manual: false
    };
    const [state, setState] = useState(initialValues);
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
    const pushInfo = (key, value) => {
        _pushObject(setInfoMsgs, key, value);
    };
    const pushError = (key, value) => {
        _pushObject(setErrorMsgs, key, value);
    };
    const popInfo = (key) => {
        _popObject(setInfoMsgs, key);
    };
    const popError = (key) => {
        _popObject(setErrorMsgs, key);
    };
    // Props to pass to child components
    const props = {state, setState, pushInfo, pushError, popInfo, popError};
    // Navigate
    const navigate = useNavigate();

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
        const minState = {
            projName: state.projName,
            uneditedData: {
                name: state.uneditedData.name,
                seq: state.uneditedData.seq,
                cdsList: state.uneditedData.cdsList
            },
            editedData: {
                name: state.editedData.name,
                seq: state.editedData.seq,
                cdsList: state.editedData.cdsList
            }
        };
        fetchAuth("ac_token", "https://api.optipri.me/projects", {
            method: "PUT",
            body: JSON.stringify(minState)
        })
        .then(resp => {
            if (resp.ok || resp.status === 304) {
                return resp.json();
            } else {
                throw new Error(`Bad response: ${resp.text()}`)
            }
        })
        .then(data => {
            navigate(`/project?id=${data["projectID"]}`);
        })
        .catch(e => {
            pushError("resp", e.toString());
            console.log(e);
        });
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
