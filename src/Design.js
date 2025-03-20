import React, {useEffect, useRef, useState} from "react";
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
    fetchAuth, revcomp
} from "./Utils";
import ClinvarAutocomplete from "./ClinvarAutocomplete";
import {EditableSeqViz, EditedSeqViz, SeqVizWithCDS, UneditedSeqViz} from "./ModdedSeqViz";
import { useNavigate } from "react-router-dom";
import {codonTableForward, codonTableReverse} from "./Codons";

const _CONTEXT_LEN = 110;
const _SEARCH_DIST = 18;

const addIndelLine = (ref, svg_fn, offset, color) => {
    const observer = new MutationObserver((_, observer) => {
        const svg = svg_fn(ref);
        if (typeof svg === "undefined") { return; }
        const text = svg.getElementsByClassName("la-vz-seq")[0];
        if (typeof text === "undefined") { return; }
        const tspan = text.childNodes[offset];
        if (typeof tspan === "undefined") { return; }
        const x = parseFloat(tspan.getAttribute("x")) - 2;
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("style", `fill: ${color};`);
        rect.setAttribute("height", "42");
        rect.setAttribute("width", "2");
        rect.setAttribute("x", x.toString());
        rect.setAttribute("y", "-3");
        text.parentNode.appendChild(rect);
        observer.disconnect();
    });
    observer.observe(ref.current, {
        characterData: false,
        childList: true,
        subtree: true,
        attributes: false
    });
};

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
                            setSeqData={setEditedData} />
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
    useEffect(() => {
        const {minU, minE, preLen} = minEdit(state.uneditedData.seq, state.editedData.seq);
        // Add line where an insertion happens
        if (ref.current && minU.length === 0) {
            addIndelLine(
                ref,
                ref => ref.current.getElementsByClassName("la-vz-seqblock")[0],
                preLen,
                "green"
            );
        }
        // Add line where a deletion happens
        if (ref.current && minE.length === 0) {
            addIndelLine(
                ref,
                ref => ref.current.getElementsByClassName("la-vz-seqblock")[1],
                preLen,
                "red"
            );
        }
    }, [state.uneditedData.seq, state.editedData.seq]);

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

const moveToFront = (a, x) => {
    const idx = a.indexOf(x);
    if (idx === -1) {
        throw new Error("Bad idx")
    }
    return [x, ...a.toSpliced(idx, 1)];
}

const splitDNAbyCDS = (dna, cdsList) => {
    // Sort CDS segments by start coordinate
    cdsList.sort((a, b) => a.start - b.start);
    let result = [];
    let lastIndex = 0;
    for (const cds of cdsList) {
        const start = cds.direction === "+" ? cds.start : cds.end;
        const end = cds.direction === "+" ? cds.end : cds.start;
        // Append non-CDS sequence (as one continuous block) from the end of the previous segment to the start of the CDS.
        if (start > lastIndex) {
            result = [...result, [dna.slice(lastIndex, start)]];
        }
        let segment = dna.slice(start, end);
        // For minus-strand CDS, reverse-complement the sequence.
        if (cds.direction === '-') {
            segment = revcomp(segment);
        }
        // Apply the frame:
        // The first `frame` bases (if any) remain unsplit.
        // The rest is split into groups of three (codons).
        const frame = cds.frame || 0;
        const prefix = segment.slice(0, frame);
        const remainder = segment.slice(frame);
        // Use a regex to match groups of 1-3 characters.
        let codons = remainder.match(/.{1,3}/g) || [];
        codons = (prefix ? [prefix, ...codons] : codons);
        codons = codons.map(x => x.length === 3 ? moveToFront(codonTableReverse[codonTableForward[x]], x) : [x]);
        if (cds.direction === "-") {
            codons = codons.map(x => x.map(revcomp)).toReversed();
        }
        result = [...result, ...codons];
        lastIndex = end;
    }
    // Append any trailing non-CDS sequence.
    if (lastIndex < dna.length) {
        result = [...result, [dna.slice(lastIndex)]];
    }
    return result;
}

const findProtosDirection = (uSeq, eSeq, direction, pamdaData) => {
    const pamStr = Object.keys(pamdaData).join("|");
    const PAM_RE = new RegExp(`(?=[ACGT]{24}(?:${pamStr}))`, "g");
    const {minU, preLen, postLen} = minEdit(uSeq, eSeq);
    const uDelta = uSeq.length > eSeq.length ? uSeq.length - eSeq.length : 0;
    const eDelta = eSeq.length > uSeq.length ? eSeq.length - uSeq.length : 0;
    const preHom = uSeq.substring(0, preLen);
    const postHom = uSeq.substring(uSeq.length - postLen);
    const uLen = minU.length;
    const search = (preHom.substring(preLen - _SEARCH_DIST - 21) +
        minU.substring(0, Math.min(uLen, 7)) +
        postHom.substring(0, Math.max(0, 7 - Math.min(uLen, 7))));
    const idxs = [...search.matchAll(PAM_RE)].map(x => x.index);
    return idxs.map(x => {
        const idx = x + (preLen - _SEARCH_DIST - 21);  // Index of match start
        const nickDist = preHom.length - (idx + 21) + 1;
        const start20 = idx + 4;
        const end20 = start20 + 20;
        const proto30 = uSeq.substring(idx, idx + 30);
        const unedited = uSeq.substring(start20 - 4, start20 + 71 + uDelta);
        const edited =   eSeq.substring(start20 - 4, start20 + 71 + eDelta);
        const offset = edited.length - minEdit(unedited, edited).postLen;
        const pam = uSeq.substring(idx + 24, idx + 28);
        const [pamVar, pamScore] = pamdaData[pam]
        return { direction, start20, end20, proto30, unedited, edited,
                 offset, pam, pamVar, pamScore, nickDist };
    });
};

const scaleProtoScore = (score, pamda) => {
    const PAMDA_BIAS = -1.45;
    const SLOPE = 1;
    const h = Math.min(PAMDA_BIAS, pamda);
    const tenTerm = Math.pow(10, PAMDA_BIAS - h);
    const expTerm = 1 + Math.pow(10, -SLOPE * score);
    const rawScaled = -Math.log10(tenTerm * expTerm - 1) / SLOPE;
    return Math.max(-5, rawScaled);
};

const sliceSegments = (segments, start, end) => {
    let oldTotal = 0, total = 0;
    let retval = [];
    segments.forEach(segment => {
        const segLen = segment[0].length;
        // oldTotal: # of characters before current, total: # of characters after current
        oldTotal = total;
        total += segLen;
        if (total <= start || oldTotal >= end) {}
        else if (oldTotal < start) {
            retval = [...retval, [segment[0].slice(start - oldTotal)]];
        } else if (total < end) {
            retval = [...retval, segment];
        } else {
            retval = [...retval, [segment[0].slice(0, end - oldTotal)]];
        }
    });
    return retval;
};

const reduceSegments = (segments, offset) => {
    let oldTotal = 0, total = 0;
    let retval = [];
    let segment0 = [];
    let tail = [];
    segments.forEach(segment => {
        const segLen = segment[0].length;
        oldTotal = total;
        total += segLen;
        if (total < 21) {
            segment0 = [...segment0, segment[0]];
        } else if (oldTotal < 21) {
            const prefix = segment[0].slice(0, 21 - oldTotal);
            segment0 = [...segment0, prefix].join("");
            const trimmed = segment.filter(x => x.slice(0, 21 - oldTotal) === prefix)
                                   .map(x => x.slice(21 - oldTotal));
            retval = total === 21 ? [[segment0]] : [[segment0], trimmed];
        } else if (oldTotal < offset || retval.length < 5) {
            retval = [...retval, segment];
        } else {
            tail = [...tail, segment[0]];
        }
    });
    tail = tail.join("");
    retval = [...retval, [tail]];
    return retval;
};

const PreviewPage = ({ state }) => {
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
    const [clicked, setClicked] = useState("");
    // HT-PAMDA data for PAM variants
    const [useVars, setUseVars] = useState(false);  // Using PAM variants?
    const [pamdaData, setPamdaData] = useState({});
    // Misc. state
    const [info, setInfo] = useState("");  // Info text to display to user
    const [protoAnns, setProtoAnns] = useState([]);  // Protospacer annotations
    // Ref to unedited
    const ref = useRef(null);

    // FIRST LOAD TASKS
    // Load HT-PAMDA data in background
    useEffect(() => {
        fetch("/HT-PAMDA.json")
            .then(r => r.json())
            .then(j => setPamdaData(j));
    }, []);
    // Add indel line
    useEffect(() => {
        const {minU, minE, preLen} = minEdit(uSeq, eSeq);
        // Add line where an insertion happens
        if (ref.current && minU.length === 0) {
            addIndelLine(
                ref,
                ref => ref.current.getElementsByClassName("la-vz-seqblock")[0],
                preLen,
                "green"
            );
        }
        // Add line where a deletion happens
        if (ref.current && minE.length === 0) {
            addIndelLine(
                ref,
                ref => ref.current.getElementsByClassName("la-vz-seqblock")[1],
                preLen,
                "red"
            );
        }
    }, [uSeq, eSeq]);
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
            start: eSeq.length - c.start,
            end: eSeq.length - c.end,
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
    // Update protoMap whenever objects in protos update
    useEffect(() => {
        setSelected(prevSelected => (
            Object.fromEntries(protos.map(p => [p.id, prevSelected[p.id] ?? false]))
        ));
    }, [protos]);
    // Update annotations when protos updates or when useVars is toggled
    useEffect(() => {
        const annotations = protos
            .filter(x => x.pamVar === "SpNGG" || useVars)  // TODO? Cutoffs
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

    const selHandler = (e) => {
        const PROTO_RE = /Sp\w{3,4}\d+/;
        const name = e.name.split(" ")[0];
        if (PROTO_RE.test(name)) {
            setClicked(name);
        }
    };
    useEffect(() => {
        const PROTO_RE = /Sp\w{3,4}\d+/;
        if (PROTO_RE.test(clicked)) {
            setSelected(prevSelected => ({ ...prevSelected,
                                           [clicked] : !prevSelected[clicked] }));
            setClicked("");
        }
    }, [clicked])

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
                               edit_segments: x.segments
                           }))
        };
        console.log(minState);
        fetchAuth("ac_token", "https://api.optipri.me/jobs", {
            method: "PUT",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(minState)
        })
        .then(resp => {
            return [resp.status, resp.text()];
        })
        .then(st => {
            const [status, text] = st;
            if (status === 200 || status === 304) {
                return JSON.parse(text);
            } else {
                throw new Error(text);
            }
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
            templateColumns="1fr 800px 1fr"
        >
            <Card columnStart="1" columnEnd="-1" padding="0px">
                <Heading level={2} children={state.projName} />
            </Card>
            <Card columnStart="1" columnEnd="-1" ref={ref}>
                <Heading children={`${state.uneditedData.name}`} />
                <SeqVizWithCDS seqData={{ ...state.uneditedData,
                                          annotations: protoAnns }}
                                          selHandler={selHandler} />
                <Heading children={`${state.editedData.name}`} />
                <SeqVizWithCDS seqData={state.editedData} />
                <SwitchField
                    label="Use PAM variants"
                    labelPosition="start"
                    onChange={(e) => { setUseVars(e.target.checked); }}
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
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {protos.filter(x => selected[x.id])
                               .map(x => (
                                   <TableRow>
                                       <TableCell>{x.id}</TableCell>
                                       <TableCell>{x.proto30.slice(4, 24)}</TableCell>
                                       <TableCell>{x.score}</TableCell>
                                       <TableCell>{x.segments.reduce((acc, val) => acc * val.length, 1)}</TableCell>
                                   </TableRow>
                               ))}
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
                        children="Submit"
                        type="submit"
                        variation="primary"
                        onClick={onSubmit}
                    ></Button>
                </Flex>
            </Flex>
        </Grid>
    );
};

const Design = () => {
    const [view, setView] = useState("design");  // "design" or "preview"
    const initialState = {
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

    // HIGHLIGHT EDIT
    useEffect(() => {
        if (state.uneditedData.seq === "" || state.editedData.seq === "") { return; }
        const {minU, minE, preLen} = minEdit(state.uneditedData.seq, state.editedData.seq);
        let color;
        if (minU.length === 0) { color = "lime"; }
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

    return (
        <div>
            {view === "design" && (
                <DesignPage state={state} setState={setState} onNext={() => setView("preview")} />
            )}
            {view === "preview" && (
                <PreviewPage state={state} setState={setState} onBack={() => setView("design")} />
            )}
        </div>
    )
};

export default Design;
