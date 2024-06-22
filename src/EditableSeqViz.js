import React, { useEffect, useState } from "react";
import { SeqViz } from "seqviz";
import { Button, SwitchField, Text } from "@aws-amplify/ui-react";

import { makeCDSAandTs, updateCDS, randomId } from "./Utils";


const MAX_UNDO_STACK = 64;

export default function EditableSeqViz({ isEditable, seqData, setSeqData, selHandler }) {
    const [editEnabled, setEditEnabled] = useState(seqData.seq === "");
    const [selection, setSelection] = useState(seqData.seq === ""
                                               ? {clockwise: true, start: 0, end: 0}
                                               : {clockwise: true, start: NaN, end: NaN});
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
    // CDS => ANNOTATIONS/TRANSLATIONS
    const [annotations, setAnnotations] = useState(seqData.annotations);
    const [translations, setTranslations] = useState(seqData.translations);
    // Div ID for finding in the DOM
    const divId = `sv${randomId(10)}`;
    // Height of inner div containing seqviz component
    const [updated, setUpdated] = useState(false);
    const [height, setHeight] = useState(102);

    // MANAGE SEQUENCE EDITING FUNCTIONALITY
    useEffect(() => {
        if (!editEnabled) { return; }
        const sequence = seqData.seq;
        const setSequence = (newSeq) => {
            setSeqData(prevSeqData => ({ ...prevSeqData, seq: newSeq }));
        };
        const updateCDSList = (selection, delta) => {
            setSeqData(prevSeqData => ({
                ...prevSeqData,
                cdsList: prevSeqData.cdsList
                                     .map(cds => updateCDS(cds, selection, delta))
                                     .filter(cds => !!cds)
            }));
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
                setSeqData(prevSeqData => ({ ...prevSeqData, cdsList: item.oldCDSList }));
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
            let hasSelection = selection.start !== null;
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
            if (hasSelection) {
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
        return () => {
            window.removeEventListener("keypress", keypressHandler);
            window.removeEventListener("keydown", keydownHandler);
            window.removeEventListener("paste", pasteHandler);
        };
    }, [editEnabled, seqData.seq, seqData.cdsList, selection, isIns, isDel, undoStack]);  // eslint-disable-line

    // IF NOT EDITABLE, DISABLE SELECTION
    const selectionHandler = (userSelection) => {
        if (!editEnabled) {
            setSelection({ clockwise: true, start: NaN, end: NaN });
        } else {
            setSelection(userSelection);
        }
        if (typeof selHandler !== 'undefined') {
            selHandler(userSelection);
        }
    };

    // TOGGLE EDITING
    const toggleEditing = () => {
        setEditEnabled(oldState => {
            if (!oldState) {
                setSelection(seqData.seq === ""
                             ? { clockwise: true, start: 0, end: 0 }
                             : { clockwise: true, start: NaN, end: NaN });
            } else {
                setSelection({ clockwise: true, start: NaN, end: NaN });
            }
            return isEditable && !oldState
        });
    };

    // MANAGE CDS'S
    useEffect(() => {
        // Check if selection is a range
        if (!editEnabled || !selection.start || selection.start === selection.end) {
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
    }, [editEnabled, seqData.cdsList, selection]);
    const handleAddCDS = () => {
        const selStart = Math.min(selection.start, selection.end);
        const selEnd = Math.max(selection.start, selection.end);
        const newCDS = { name: "CDS",
                         start: selStart,
                         end: selEnd,
                         direction: (selection.clockwise ? "+" : "-"),
                         frame: 0 };
        setSeqData((prevSeqData) => ({ ...prevSeqData,
                                       cdsList: [...prevSeqData.cdsList, newCDS]}));
    };
    const handleDelCDS = () => {
        if (currCDS === undefined) { return; }
        setSeqData((prevSeqData) => {
            let cdsList = prevSeqData.cdsList;
            cdsList.splice(currCDS, 1);
            return { ...prevSeqData,
                     cdsList: cdsList };
        });
    };
    const handleShiftLeft = () => {
        if (currCDS === undefined || seqData.cdsList[currCDS] === undefined) { return; }
        const offset = seqData.cdsList[currCDS].direction === "+" ? 1 : 2
        setSeqData((prevSeqData) => {
            let cdsList = prevSeqData.cdsList;
            cdsList[currCDS].frame = (cdsList[currCDS].frame + offset) % 3;
            return { ...prevSeqData,
                     cdsList: cdsList }
        });
    };
    const handleFlip = () => {
        if (currCDS === undefined || seqData.cdsList[currCDS] === undefined) { return; }
        setSeqData((prevSeqData) => {
            let cdsList = prevSeqData.cdsList;
            cdsList[currCDS].direction = cdsList[currCDS].direction === "+" ? "-" : "+";
            return { ...prevSeqData,
                     cdsList: cdsList }
        });
    };
    const handleShiftRight = () => {
        if (currCDS === undefined || seqData.cdsList[currCDS] === undefined) { return; }
        const offset = seqData.cdsList[currCDS].direction === "+" ? 2 : 1
        setSeqData((prevSeqData) => {
                    let cdsList = prevSeqData.cdsList;
                    cdsList[currCDS].frame = (cdsList[currCDS].frame + offset) % 3;
                    return { ...prevSeqData,
                             cdsList: cdsList }
        });
    };

    // TURN CDS => ANNOTATIONS/TRANSLATIONS
    useEffect(() => {
        const cdsAandTs = seqData.cdsList.map(cds => makeCDSAandTs(cds));
        const cdsAnnotations = cdsAandTs.map(cds => cds.annotation);
        const cdsTranslations = cdsAandTs.map(cds => cds.translation);
        setAnnotations([...seqData.annotations, ...cdsAnnotations]);
        setTranslations([...seqData.translations, ...cdsTranslations]);
    }, [seqData]);

    // Set height based on # of annotation rows
    useEffect(() => {
        const timer = setTimeout(() => { setUpdated(true); }, 1);
        return () => clearTimeout(timer);
    }, [annotations]);
    useEffect(() => {
        if (updated) {
            const div = document.querySelector(`#${divId}`).querySelector(".la-vz-seqblock");
            if (div !== null) {
                const aRows = div.querySelectorAll(".la-vz-linear-annotation-row").length;
                setHeight(102 + 16 * aRows);
            }
        }
    }, [updated, divId]);

    return (
        <div style={{ height: "100%", verticalAlign: "top" }} id={divId}>
            <div style={{ height: `${height}px`, width: "100%", display: "block" }}>
                {seqData.seq !== "" &&  // Because SeqViz refuses to update when seq is ""
                <SeqViz
                    { ...seqData }
                    viewer="linear"
                    selection={selection}
                    annotations={annotations}
                    translations={translations}
                    onSelection={selectionHandler}
                    showIndex={false}
                />}
            </div>
            {isEditable &&
            <div>
                <SwitchField
                    label="Allow editing"
                    isChecked={editEnabled}
                    onChange={toggleEditing}
                />
            </div>}
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
}
