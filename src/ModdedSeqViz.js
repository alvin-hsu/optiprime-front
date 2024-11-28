import React, { useEffect, useState, useRef } from "react";
import { SeqViz } from "seqviz";
import { Button, Text } from "@aws-amplify/ui-react";

import { makeCDSAandTs, updateCDS, revcomp } from "./Utils";
import { codonTableForward, codonTableReverse, aminoAcidColors, darkAminoAcidColors } from "./Codons";

const SeqVizWithCDS = ({ seqData, selHandler }) => {
    // Height of div containing SeqViz component
    const [height, setHeight] = useState(102);
    const [width, setWidth] = useState(10);
    // SeqViz state
    const origAnnotations = seqData.annotations;
    const [annotations, setAnnotations] = useState(origAnnotations);
    const origTranslations = seqData.translations;
    const [translations, setTranslations] = useState(origTranslations);
    const [selection, setSelection] = useState("selection" in seqData
                                               ? seqData.selection
                                               : {clockwise: true, start: NaN, end: NaN});
    // Reference
    const ref = useRef(null);
    // SELECTION HANDLER
    const selectionHandler = (userSelection) => {
        setSelection(userSelection);
        if (typeof selHandler !== 'undefined') {
            selHandler(userSelection);
        }
    };
    // TURN CDS => ANNOTATIONS/TRANSLATIONS
    useEffect(() => {
        const cdsAandTs = seqData.cdsList.map(cds => makeCDSAandTs(cds));
        const cdsAnnotations = cdsAandTs.map(cds => cds.annotation);
        const cdsTranslations = cdsAandTs.map(cds => cds.translation);
        setAnnotations((typeof origAnnotations !== "undefined")
                        ? [...origAnnotations, ...cdsAnnotations]
                        : cdsAnnotations);
        setTranslations((typeof origTranslations !== "undefined")
                        ? [...origTranslations, ...cdsTranslations]
                        : cdsTranslations);
    }, [seqData.cdsList, origAnnotations, origTranslations]);
    // Set width/height
    useEffect(() => {
        setWidth(Math.max(22, 10.7 + 10.7 * seqData.seq.length));
        if (ref.current) {
            const observer = new MutationObserver((_, observer) => {
                const seqblocks = ref.current.getElementsByClassName("la-vz-seqblock");
                if (seqblocks.length > 0) {
                    const div = seqblocks[0];
                    const aRows = div.getElementsByClassName("la-vz-linear-annotation-row").length;
                    setHeight(80 + 18 * aRows);
                }
                const scrollers = ref.current.getElementsByClassName("la-vz-linear-scroller");
                if (scrollers.length > 0) {
                    const div = scrollers[0];
                    div.style["overflow"] = "hidden";
                    div.style["position"] = "absolute";
                    div.scrollTop = 0;
                }
                // noinspection JSUnresolvedReference
                ref.current.scrollLeft = ref.current.scrollLeftMax / 2;
                observer.disconnect();
            });
            observer.observe(ref.current, {characterData: false,
                                           childList: true,
                                           subtree: true,
                                           attributes: false});
        }
    }, [seqData]);

    return (
        <div ref={ref} style={{ overflowX: "scroll", overflowY: "hidden" }}>
            <div style={{ height: `${height}px`, width: `${width}px`, display: "block" }}>
                {seqData.seq !== "" &&
                <SeqViz
                    { ...seqData }
                    viewer="linear"
                    annotations={annotations}
                    translations={translations}
                    selection={selection}
                    onSelection={selectionHandler}
                    showIndex={false}
                />}
            </div>
        </div>
    );
};

const EditableSeqViz = ({ seqData, setSeqData, selHandler }) => {
    // Constants
    const MAX_UNDO_STACK = 64;
    // State
    const [editEnabled, setEditEnabled] = useState(false);
    // PASTE FUNCTIONALITY
    const [pasteData, setPasteData] = useState("");
    const [showWarn, setShowWarn] = useState(false);
    // UNDO STACK FUNCTIONALITY
    const [undoStack, setUndoStack] = useState([]);
    const [isIns, setIsIns] = useState(false);
    const [isDel, setIsDel] = useState(false);
    // CDS FUNCTIONALITY
    const [showAddCDS, setShowAddCDS] = useState(false);
    const [showCDSCtrls, setShowCDSCtrls] = useState(false);
    const [currCDS, setCurrCDS] = useState(null);
    // Ref for handling clicks and div height
    const ref = useRef(null);

    // WRAPPERS FOR setSeqData
    const setSequence = (newSeq) => {
        setSeqData(prevSeqData => ({ ...prevSeqData, seq: newSeq }));
    };
    const setSelection = (newSelection) => {
        setSeqData(prevSeqData => ({ ...prevSeqData, selection: newSelection }));
    };
    const setCdsList = (newCdsList) => {
        setSeqData(prevSeqData => ({ ...prevSeqData, cdsList: [ ...newCdsList ] }));
    };
    // SELECTION HANDLER
    const selectionHandler = (userSelection) => {
        setSelection(userSelection);
        if (typeof selHandler !== 'undefined') {
            selHandler(userSelection);
        }
    }

    // MANAGE SEQUENCE EDITING FUNCTIONALITY
    const clickIn = () => {
        setEditEnabled(true);
    };
    const clickOut = (e) => {
        if (ref.current && !ref.current.contains(e.target)) {
            setEditEnabled(false);
            setSelection({ clockwise: true, start: 0, end: 0 });
        }
    };
    useEffect(() => {
        if (!editEnabled) { return; }
        const sequence = seqData.seq;
        const selection = seqData.selection;
        const updateCDSList = (selection, delta) => {
            setCdsList(seqData.cdsList.map(cds => updateCDS(cds, selection, delta))
                                      .filter(cds => !!cds));
        };
        // Managing the undoStack
        const pushUndoStack = () => {
            setUndoStack((prevUndoStack) => {
                if (prevUndoStack.length === MAX_UNDO_STACK) {
                    prevUndoStack = prevUndoStack.slice(1)
                }
                return [...prevUndoStack, { oldSequence: sequence,
                                            oldSelection: selection,
                                            oldCDSList: seqData.cdsList }]
            });
        };
        const popUndoStack = () => {
            if (undoStack.length > 0) {
                const item = undoStack[undoStack.length - 1];
                setUndoStack(prevUndoStack => prevUndoStack.slice(0, undoStack.length - 1));
                setSequence(item.oldSequence);
                setSelection(item.oldSelection);
                setCdsList(item.oldCDSList)
            }
            setIsIns(false);
            setIsDel(false);
        };
        // Actually handling editing events
        const keypressHandler = (event) => {
            let hasSelection = !isNaN(selection.start);
            let keyUpper = event.key.toUpperCase();
            let isBase = "ACGT".includes(keyUpper);
            setShowWarn(false);
            if (hasSelection && isBase) {
                if (!isIns) {  // Set undo stack
                    pushUndoStack();
                    setIsIns(true);
                    setIsDel(false);
                }
                let selStart = Math.min(selection.start, selection.end);
                let selEnd = Math.max(selection.start, selection.end);
                let selLen = selEnd - selStart;
                if (selLen === 0) {
                    setSequence(sequence.substring(0, selStart) +
                                keyUpper +
                                sequence.substring(selStart));
                    setSelection({ ...selection,
                                 start: selStart + 1,
                                 end: selEnd + 1 });
                    updateCDSList(selection, 1);
                } else {
                    setSequence(sequence.substring(0, selStart) +
                                keyUpper +
                                sequence.substring(selEnd));
                    setSelection({ ...selection,
                                   start: selStart + 1,
                                   end: selStart + 1 });
                    updateCDSList(selection, selStart - selEnd + 1);
                }
            }
        };
        const keydownHandler = (event) => {
            let hasSelection = selection.start !== null;
            let isBackspace = event.key === "Backspace";
            setShowWarn(false);
            if (hasSelection && isBackspace) {
                if (!isDel) {
                    setIsIns(false);
                    setIsDel(true);
                    pushUndoStack();
                }
                let selStart = Math.min(selection.start, selection.end);
                let selEnd = Math.max(selection.start, selection.end);
                let selLen = selEnd - selStart;
                if (selLen === 0) {
                    setSequence(sequence.substring(0, selStart - 1) +
                                sequence.substring(selStart));
                    setSelection({ ...selection,
                                   start: selStart - 1,
                                   end: selStart - 1 });
                    updateCDSList({ ...selection, start: selStart - 1}, -1);
                } else {
                    setSequence(sequence.substring(0, selStart) +
                                sequence.substring(selEnd));
                    setSelection({ ...selection,
                                   start: selStart,
                                   end: selStart });
                    updateCDSList(selection, selStart - selEnd);
                }
            } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
                setIsIns(false);
                setIsDel(false);
                popUndoStack();
            }
        };
        const pasteHandler = (event) => {
            const selection = seqData.selection;
            let clipboardText = event.clipboardData.getData('Text');
            clipboardText = clipboardText.replace(/\s+/g, "")
            let processedText = clipboardText.toUpperCase().replace(/[^ACGT]+/g, "")
            if (clipboardText !== processedText) {
                setShowWarn(true);
                setPasteData(clipboardText);
            } else {
                setShowWarn(false);
                setPasteData("");
            }
            if (selection.start !== null) {
                setIsIns(false);
                setIsDel(false);
                pushUndoStack();
                let selStart = Math.min(selection.start, selection.end);
                let selEnd = Math.max(selection.start, selection.end);
                let selLen = selEnd - selStart;
                setSequence(sequence.substring(0, selStart) +
                            processedText +
                            sequence.substring(selStart));
                setSelection({ ...selection,
                             start: selStart,
                             end: selStart + processedText.length });
                updateCDSList(selection, processedText.length - selLen);
            }
        };
        // Put in handlers
        window.addEventListener("keypress", keypressHandler);
        window.addEventListener("keydown", keydownHandler);
        window.addEventListener("paste", pasteHandler);
        window.addEventListener("mousedown", clickOut);
        return () => {
            window.removeEventListener("keypress", keypressHandler);
            window.removeEventListener("keydown", keydownHandler);
            window.removeEventListener("paste", pasteHandler);
            window.removeEventListener("mousedown", clickOut);
        };
    }, [editEnabled, seqData.seq, seqData.cdsList, seqData.selection, isIns, isDel, undoStack]);  // eslint-disable-line

    // MANAGE CDS'S
    useEffect(() => {
        const selection = seqData.selection;
        // Check if selection is a range
        if (!editEnabled || isNaN(selection.start) || selection.start === selection.end) {
            setShowAddCDS(false);
            setShowCDSCtrls(false);
            return;
        }
        // Check if selection overlaps with any other CDS
        const selStart = Math.min(selection.start, selection.end);
        const selEnd = Math.max(selection.start, selection.end);
        let hasOverlap = seqData.cdsList.some(cds => (selStart <= cds.end &&
                                                      selEnd >= cds.start ))  // The Ilias trick
        const selToCDS = new Map(seqData.cdsList.map((cds, i) => [String([cds.start, cds.end]), i]));
        const selIndex = selToCDS.get(String([selStart, selEnd]));
        if (selIndex !== undefined) {
            setShowAddCDS(false);
            setShowCDSCtrls(true);
            setCurrCDS(selIndex);
        } else if (!hasOverlap) {
            setShowAddCDS(true);
            setShowCDSCtrls(false);
            setCurrCDS(null);
        } else {
            setShowAddCDS(false);
            setShowCDSCtrls(false);
            setCurrCDS(null);
        }
    }, [editEnabled, seqData.cdsList, seqData.selection]);
    const handleAddCDS = () => {
        const selection = seqData.selection;
        const selStart = Math.min(selection.start, selection.end);
        const selEnd = Math.max(selection.start, selection.end);
        const newCDS = { name: "CDS",
                         start: selStart,
                         end: selEnd,
                         direction: (selection.clockwise ? "+" : "-"),
                         frame: 0 };
        setCdsList([...seqData.cdsList, newCDS]);
    };
    const handleDelCDS = () => {
        if (currCDS === undefined) { return; }
        let cdsList = seqData.cdsList;
        cdsList.splice(currCDS, 1);
        setCdsList(cdsList);
    };
    const handleShiftLeft = () => {
        if (currCDS === undefined || seqData.cdsList[currCDS] === undefined) { return; }
        const cdsList = seqData.cdsList;
        const cdsData = cdsList[currCDS];
        const offset = cdsData.direction === "+" ? 2 : 1;
        cdsList[currCDS] = { ...cdsData, frame: (cdsData.frame + offset) % 3 };
        setCdsList(cdsList);
    };
    const handleFlip = () => {
        if (currCDS === undefined || seqData.cdsList[currCDS] === undefined) { return; }
        const cdsList = seqData.cdsList;
        const cdsData = cdsList[currCDS];
        cdsList[currCDS] = { ...cdsData, direction: cdsData.direction === "+" ? "-" : "+" };
        setCdsList(cdsList);
    };
    const handleShiftRight = () => {
        if (currCDS === undefined || seqData.cdsList[currCDS] === undefined) { return; }
        const cdsList = seqData.cdsList;
        const cdsData = cdsList[currCDS];
        const offset = cdsData.direction === "+" ? 1 : 2;
        cdsList[currCDS] = { ...cdsData, frame: (cdsData.frame + offset) % 3 };
        setCdsList(cdsList);
    };

    return (
        <div ref={ref} onClick={clickIn} style={{ height: "100%", verticalAlign: "top" }}>
            <SeqVizWithCDS
                seqData={seqData}
                selHandler={selectionHandler}
            />
            { showWarn &&
            <div className="warn-paste" style={{ width: "100%", display: "block" }}>
                <Text>Paste data contained non-ACGT characters! Please check: {pasteData}</Text>
            </div> }
            { showAddCDS &&
            <div>
                <Button onClick={handleAddCDS}>Add CDS</Button>
            </div> }
            { showCDSCtrls &&
            <div>
                <Button onClick={handleShiftLeft}>←</Button>
                <Button onClick={handleFlip}>
                    {seqData.cdsList[currCDS] && seqData.cdsList[currCDS].direction === "+"
                     ? '\u21a9' : '\u21aa'}
                </Button>
                <Button onClick={handleShiftRight}>→</Button>
                <br />
                <Button onClick={handleDelCDS}>Delete CDS</Button>
            </div>}
            {seqData.seq === "" && editEnabled &&
            <Text>
                (start typing...)
            </Text>}
        </div>
    );
};

const UneditedSeqViz = ({ seqData, name, pamVar, highlights }) => {
    const [ annotations, setAnnotations ] = useState([]);
    const [ translations, setTranslations ] = useState([]);
    const ref = useRef(null);
    // Make annotations for protospacer
    useEffect(() => {
        if (typeof name === "undefined") { return; }
        let color;
        if (name.includes("PS")) {
            color = (pamVar === "SpNGG") ? "lightblue" : "pink";
        } else {
            color = "gray";
        }
        if (typeof name !== "undefined") {
            const protoAnn = {
                name: name,
                start: 4,
                end: 24,
                direction: 1,
                color: color
            };
            const pamAnn = {
                name: "[PAM]",
                start: 24,
                end: (pamVar === "SpNGG") ? 27 : 28,
                direction: 1,
                color: color
            };
            if (("cdsList" in seqData) && (seqData.cdsList.length > 0)) {
                const cdsAandTs = seqData.cdsList.map(cds => makeCDSAandTs(cds));
                const cdsTranslations = cdsAandTs.map(cds => cds.translation);
                setTranslations(cdsTranslations);
            }
            setAnnotations([protoAnn, pamAnn]);
        }
    }, [seqData, name, pamVar]);
    // Update PAM annotation to say the PAM variant
    useEffect(() => {
        if (ref.current && (typeof pamVar !== "undefined")) {
            const observer = new MutationObserver((_, observer) => {
                const anns = (Array.from(ref.current.getElementsByClassName("la-vz-annotation"))
                              .map(x => x.parentElement)
                              .map(x => {
                                  // noinspection JSUnresolvedReference
                                  const label = x.childNodes[0].innerHTML;
                                  const id = x.id;
                                  return [label, id];
                              }));
                const pamAnn = anns.filter(x => (x[0] === "[PAM]"))[0];
                if (typeof pamAnn === "undefined") { return; }
                const pamObj = document.getElementById(pamAnn[1]);
                // noinspection JSUnresolvedReference
                pamObj.childNodes[2].innerHTML = (pamVar === "SpRY" || pamVar === "SpG")
                                                 ? pamVar : pamVar.substring(2);
                observer.disconnect();
            });
            observer.observe(ref.current, {characterData: false,
                                           childList: true,
                                           subtree: true,
                                           attributes: false});
        }
    }, [pamVar]);

    return (
        <div ref={ref} style={{ height: "113px", width: "100%", display: "block", overflowY: "hidden" }}>
            <SeqViz
                { ...seqData }
                viewer="linear"
                annotations={annotations}
                translations={translations}
                highlights={highlights}
                showComplement={false}
                showIndex={false}
                selection={{ start: NaN, end: NaN, clockwise: true }}
                onSelection={() => {}}
            />
        </div>
    );
};

const editSegments = (seq, cds) => {
    const MAX_DIST = 18;
    const { start, end, frame, direction } = cds;
    const subSeq = seq.substring(start, end);
    // The way I use the word "frame" in my python code
    const pyFrame = (direction === "+") ? (3 - frame) % 3
                                        : (frame + subSeq.length) % 3;
    const slices = (Array.from({ length: Math.ceil((subSeq.length - pyFrame) / 3) },
                               (_, i) => [pyFrame + 3 * i, pyFrame + 3 * i + 3])
                         .filter(x => ((x[1] + start > 21) && (x[0] + start < 21 + MAX_DIST))));
    const fullCodons = slices.map(x => subSeq.substring(x[0], x[1]));
    const translation = fullCodons.map(x => (direction === "+") ? codonTableForward[x]
                                                                : codonTableForward[revcomp(x)]);
    let validRevTrans = translation.map((aa, i) => {
        const codon = fullCodons[i];
        let revTrans = codonTableReverse[aa].map(x => (direction === "+") ? x : revcomp(x));
        const index = revTrans.indexOf(codon);
        revTrans = [codon, ...revTrans.slice(0, index), ...revTrans.slice(index + 1)]
        const [sStart, sEnd] = slices[i].map(x => x + start);
        if (sStart < 21) {
            const cLen = 21 - sStart;  // Constant len
            revTrans = revTrans.filter(x => (codon.substring(0, cLen) === x.substring(0, cLen)));
            revTrans = revTrans.map(x => x.substring(cLen));
        }
        if (sEnd > 21 + MAX_DIST) {
            const cLen = sEnd - (21 + MAX_DIST);  // Constant len
            revTrans = revTrans.filter(x => (codon.substring(3 - cLen, 3) === x.substring(3 - cLen, 3)));
            revTrans = revTrans.map(x => x.substring(0, 3 - cLen));
        }
        return revTrans;
    });
    // Remove segments with only one option from end
    while ((validRevTrans.length > 0) && (validRevTrans[validRevTrans.length - 1].length === 1)) {
        validRevTrans = validRevTrans.slice(0, validRevTrans.length - 1);
    }
    // Valid segments
    let segObjects = [{ segments: [seq],
                        selected: [true],
                        start: 0,
                        end: seq.length,
                        name: "full-sequence" }];
    if (validRevTrans.length > 0) {
        const firstStart = Math.max(21, slices[0][0]);
        const lastEnd = Math.min(21 + MAX_DIST, slices[validRevTrans.length - 1][1]);
        const vrtObjects = validRevTrans.map((x, i) => {
            const start = Math.max(21, slices[i][0]);
            const end = Math.min(21 + MAX_DIST, slices[i][1]);
            return { segments: x,
                     selected: x.map(_ => true),
                     start,
                     end,
                     name: `${translation[i]}#${start}-${end}`
            };
        });
        segObjects = [{ segments: [seq.substring(0, firstStart)],
                        selected: [true],
                        start: 0,
                        end: firstStart,
                        name: "pre-seq" },
                      ...vrtObjects,
                      { segments: [seq.substring(lastEnd)],
                        selected: [true],
                        start: lastEnd,
                        end: seq.length,
                        name: "post-seq" }];
    }
    return segObjects;
};

const CODON_RE = /[ACDEFGHIKLMNPQRSTVWY*]#\d+-\d+/;
const MENU_RE = /MENU\[(\d+)]/;

const EditedSeqViz = ({ seqData, highlights }) => {
    // Annotation management
    const [origAnns, setOrigAnns] = useState([]);
    const [currAnns, setCurrAnns] = useState([]);
    const [translations, setTranslations] = useState([]);
    // Segment objects for managing actual state
    const [segObjs, setSegObjs] = useState([]);
    const [menuName, setMenuName] = useState("");
    // Ref
    const ref = useRef(null);

    // Initialization
    useEffect(() => {
        if (typeof seqData === "undefined") { return; }
        let anns = "annotations" in seqData ? seqData.annotations : [];
        const uneditable = { name: "", start: 0, end: 21, direction: 0, color: "gray" };
        anns = [ ...anns, uneditable ];
        if (("cdsList" in seqData) && (seqData.cdsList.length > 0)) {
            const cdsAandTs = seqData.cdsList.map(cds => makeCDSAandTs(cds));
            const cdsTranslations = cdsAandTs.map(cds => cds.translation);
            setTranslations(cdsTranslations);
            const seqSegObjs = editSegments(seqData.seq, seqData.cdsList[0]);
            const silentAnns = (seqSegObjs.filter(x => CODON_RE.test(x.name))
                                          .map(x => {
                                              return { name: x.name,
                                                       start: x.start,
                                                       end: x.end,
                                                       direction: 0,
                                                       color: aminoAcidColors[x.name.charAt(0)] }
                                          }));
            anns = [...anns, ...silentAnns];
            setSegObjs(seqSegObjs);
        }
        setOrigAnns(anns);
        setCurrAnns(anns);
    }, [seqData]);
    // Update components of DOM dynamically since SeqViz is unnecessarily restrictive
    useEffect(() => {
        if (ref.current) {
            const observer = new MutationObserver((_, observer) => {
                const annObjs = Array.from(ref.current.getElementsByClassName("la-vz-annotation"))
                                .map(x => x.parentElement);
                // noinspection JSUnresolvedReference
                const annLabels = annObjs.map(x => ([x.childNodes[0].innerHTML, x.id]));
                const mainAnnMap = Object.fromEntries(annLabels.filter(x => CODON_RE.test(x[0])));
                const menuAnnMap = Object.fromEntries(annLabels.filter(x => MENU_RE.test(x[0])));
                // Update labels with # of selected silent edits
                segObjs.map(segObj => {
                    if (segObj.name in mainAnnMap) {
                        const count = segObj.selected.filter(Boolean).length;
                        const annId = mainAnnMap[segObj.name];
                        const obj = document.getElementById(annId);
                        if (obj !== null) { obj.childNodes[2].innerHTML = `${count}`; }
                    }
                    return null;
                });
                // Set annotation labels if a menu is open
                const segObjMap = Object.fromEntries(segObjs.map(x => [x.name, x]));
                if (menuName in segObjMap) {
                    const segObj = segObjMap[menuName];
                    segObj.segments.map((x, i) => {
                        const name = `MENU[${i}]`;
                        if (name in menuAnnMap) {
                            const obj = document.getElementById(menuAnnMap[name]);
                            if (obj !== null) {
                                obj.childNodes[2].innerHTML = x;
                                obj.onmousedown = (() => {
                                    setSegObjs(prevSegObjs => {
                                        const oldMap = Object.fromEntries(prevSegObjs.map(x => [x.name, x]));
                                        const segObj = oldMap[menuName];
                                        const menuIdx = parseInt(MENU_RE.exec(name)[1]);
                                        let selected = segObj.selected;
                                        selected[menuIdx] = !selected[menuIdx];
                                        // Don't update if selection would be invalid
                                        if (selected.filter(Boolean).length === 0) {
                                            return prevSegObjs;
                                        } else {
                                            const segObjIdx = prevSegObjs.indexOf(segObj);
                                            const newSegObj = { ...segObj, selected };
                                            const newSegObjs = [ ...prevSegObjs.slice(0, segObjIdx),
                                                                 newSegObj,
                                                                 ...prevSegObjs.slice(segObjIdx + 1) ];
                                            return newSegObjs.slice(0, prevSegObjs.length);
                                        }
                                    });
                                });
                            }
                        }
                        return null;
                    })
                }
                observer.disconnect();
            });
            observer.observe(ref.current, {characterData: false,
                                           childList: true,
                                           subtree: true,
                                           attributes: false});
        }
    }, [currAnns, segObjs, menuName]);
    // Set annotations when a menu is open
    useEffect(() => {
        const segObjMap = Object.fromEntries(segObjs.map(x => [x.name, x]));
        if (menuName === "") {
            setCurrAnns(origAnns);
        } else {
            const segObj = segObjMap[menuName];
            const { segments, selected, start, end, name } = segObj;
            const menuAnns = segments.map((x, i) => {
                const aa = name.charAt(0);
                const color = selected[i] ? aminoAcidColors[aa] : darkAminoAcidColors[aa];
                return { name: `MENU[${i}]`,
                         start,
                         end,
                         direction: 0,
                         color};
            });
            setCurrAnns([...origAnns, ...menuAnns]);
        }
    }, [menuName, segObjs, origAnns]);
    // Expand "menu" when clicked
    const onSelection = (e) => {
        if ((e.type === "ANNOTATION") && (CODON_RE.test(e.name))) {
            if (menuName === e.name) {
                setMenuName("");
            } else {
                setMenuName(e.name);
            }
        }
    };

    return (
        <div ref={ref} style={{ height: "100%", verticalAlign: "top" }}>
            <div style={{ height: "208px", width: "100%", display: "block" }}>
                <SeqViz
                    { ...seqData }
                    annotations={currAnns}
                    translations={translations}
                    highlights={highlights}
                    viewer="linear"
                    showComplement={false}
                    showIndex={false}
                    selection={{ start: NaN, end: NaN, clockwise: true }}
                    onSelection={onSelection}
                />
            </div>
        </div>
    );
}

export { SeqVizWithCDS, EditableSeqViz, UneditedSeqViz, EditedSeqViz };
