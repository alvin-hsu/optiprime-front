import React, { useEffect, useState, useRef } from "react";
import { SeqViz } from "seqviz";
import { Button, Text } from "@aws-amplify/ui-react";

import {makeCDSAandTs, updateCDS, minEdit} from "./Utils";

const SeqVizWithCDS = ({ seqData, selHandler }) => {
    // Height of div containing SeqViz component
    const [height, setHeight] = useState(102);
    const [width, setWidth] = useState(10);
    // SeqViz state
    const origAnnotations = seqData.annotations;
    const [annotations, setAnnotations] = useState(origAnnotations);
    const origTranslations = seqData.translations;
    const [translations, setTranslations] = useState(origTranslations);
    const selection = seqData.selection ?? { clockwise: true, start: null, end: null };
    // Force re-render when sequence changes
    const [forceKey, setForceKey] = useState("");
    useEffect(() => setForceKey(`len-${seqData.seq.length}`), [seqData.seq.length]);
    // Reference
    const ref = useRef(null);
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
        if (ref.current !== null) {
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
                ref.current.scrollLeft = (ref.current.scrollWidth - ref.current.clientWidth) / 2;
                observer.disconnect();
            });
            observer.observe(ref.current, {characterData: false,
                                           childList: true,
                                           subtree: true,
                                           attributes: false});
        }
    }, [seqData]);

    return (
        <div ref={ref} style={{ overflowX: "scroll", overflowY: "hidden", overscrollBehavior: "contain" }}>
            <div style={
                seqData.seq === ""
                ? { height: `${height + 10}px`, width: "100%", border: "3px solid black",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    textAlign: "center", fontWeight: "bold" }
                : { height: `${height + 10}px`, width: `${width + 10}px`, display: "block" }
            }>
                {seqData.seq === ""
                ? "Click here to insert your sequence"
                : <SeqViz
                    seq={seqData.seq}
                    name={seqData.name}
                    circular={false}
                    key={forceKey}
                    viewer="linear"
                    annotations={annotations}
                    translations={translations}
                    highlights={seqData.highlights ?? []}
                    selection={selection}
                    onSelection={selHandler}
                    showIndex={false}
                />}
            </div>
        </div>
    );
};

const EditableSeqViz = ({ seqData, setSeqData, selHandler, allowIupac }) => {
    // Constants
    const MAX_UNDO_STACK = 64;
    allowIupac = typeof allowIupac === "undefined" ? false : allowIupac;
    const BASES = allowIupac ? "ACGTN" : "ACGT";
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
        setSeqData(prevSeqData => {
            const nextList = typeof newCdsList === "function"
                           ? newCdsList(prevSeqData.cdsList)
                           : newCdsList;
            return { ...prevSeqData, cdsList: [ ...nextList ] };
        });
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
                setUndoStack(prevUndoStack => prevUndoStack.slice(0, -1));
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
            let isBase = BASES.includes(keyUpper);
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
                    const newIdx = Math.max(0, selStart - 1)
                    setSelection({ ...selection, start: newIdx, end: newIdx });
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
            let processedText;
            if (allowIupac) {
                processedText = clipboardText.toUpperCase().replace(/[^ACGTN]+/g, "");
            } else {
                processedText = clipboardText.toUpperCase().replace(/[^ACGT]+/g, "");
            }

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
                            sequence.substring(selEnd));
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
        if (currCDS === null || currCDS === undefined) { return; }
        setCdsList(prev => prev.filter((_, i) => i !== currCDS));
    };
    const handleShiftLeft = () => {
        if (currCDS === null || currCDS === undefined || seqData.cdsList[currCDS] === undefined) { return; }
        setCdsList(prev => {
            const cds = prev[currCDS];
            if (!cds) return prev;
            const offset = cds.direction === "+" ? 2 : 1;
            const next = prev.slice();
            next[currCDS] = { ...cds, frame: (cds.frame + offset) % 3 };
            return next;
        });
    };
    const handleFlip = () => {
        if (currCDS === null || currCDS === undefined || seqData.cdsList[currCDS] === undefined) { return; }
        setCdsList(prev => {
            const cds = prev[currCDS];
            if (!cds) return prev;
            const next = prev.slice();
            next[currCDS] = {
                ...cds,
                direction: cds.direction === "+" ? "-" : "+",
                frame: (3 - cds.frame) % 3
            };
            return next;
        });
    };
    const handleShiftRight = () => {
        if (currCDS === null || currCDS === undefined || seqData.cdsList[currCDS] === undefined) { return; }
        setCdsList(prev => {
            const cds = prev[currCDS];
            if (!cds) return prev;
            const offset = cds.direction === "+" ? 1 : 2;
            const next = prev.slice();
            next[currCDS] = { ...cds, frame: (cds.frame + offset) % 3 };
            return next;
        });
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

const editHighlights = (ref, state, setState) => {
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

    // Walk seqblock rows to find the tspan at `offset`, handling line-wrapping.
    const findTspan = (scroller, offset) => {
        let remaining = offset;
        for (const block of scroller.getElementsByClassName("la-vz-seqblock")) {
            const text = block.getElementsByClassName("la-vz-seq")[0];
            if (!text) continue;
            if (remaining < text.childNodes.length) {
                return { text, tspan: text.childNodes[remaining] };
            }
            remaining -= text.childNodes.length;
        }
        return null;
    };

    // Add insertion or deletion line. scrollerIndex 0 = unedited viewer, 1 = edited viewer.
    // Uses la-vz-linear-scroller to isolate each viewer's seqblocks so wrapping is handled
    // correctly regardless of how many rows each viewer renders.
    // Does not disconnect after injecting so the rect survives SeqViz re-renders; instead
    // checks for an existing data-indel rect before appending to avoid duplicates.
    const observers = [];
    const addIndelLine = (scrollerIndex, offset, color) => {
        const observer = new MutationObserver(() => {
            if (!ref.current) return;
            const scrollers = ref.current.getElementsByClassName("la-vz-linear-scroller");
            const scroller = scrollers[scrollerIndex];
            if (!scroller) return;
            const result = findTspan(scroller, offset);
            if (!result) return;
            const { text, tspan } = result;
            const container = text.parentNode;
            if (container.querySelector("rect[data-indel]")) return;
            const x = parseFloat(tspan.getAttribute("x")) - 2;
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("data-indel", "true");
            rect.setAttribute("style", `fill: ${color};`);
            rect.setAttribute("height", "42");
            rect.setAttribute("width", "2");
            rect.setAttribute("x", x.toString());
            rect.setAttribute("y", "-3");
            container.appendChild(rect);
        });
        observers.push(observer);
        observer.observe(ref.current, {
            characterData: false,
            childList: true,
            subtree: true,
            attributes: false
        });
    };
    // Add line where an insertion happens
    if (ref.current && minU.length === 0) {
        addIndelLine(0, preLen, "green");
    }
    // Add line where a deletion happens
    if (ref.current && minE.length === 0) {
        addIndelLine(1, preLen, "red");
    }

    return () => observers.forEach(o => o.disconnect());
};

export { SeqVizWithCDS, EditableSeqViz, editHighlights };
