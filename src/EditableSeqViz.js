import React, { useEffect, useState } from "react";
import { SeqViz } from "seqviz";


const MAX_UNDO_STACK = 64;

export default function EditableSeqViz() {


    const [sequence, setSequence] = useState("ACGT");
    const [selection, setSelection] = useState({clockwise: true, start: NaN, end: NaN});
    const [showWarn, setShowWarn] = useState(false);
    const [pasteData, setPasteData] = useState("");
    const [undoStack, setUndoStack] = useState([]);
    const [isIns, setIsIns] = useState(false);
    const [isDel, setIsDel] = useState(false);

    const selectionHandler = (userSelection) => { setSelection(userSelection); };

    useEffect(() => {
        // Managing the undoStack
        const pushUndoStack = () => {
            console.log(undoStack);
            setUndoStack((prevUndoStack) => {
                if (prevUndoStack.length === MAX_UNDO_STACK) {
                    prevUndoStack = prevUndoStack.slice(1)
                }
                return [...prevUndoStack, {oldSequence: sequence, oldSelection: selection}]
            });
        };
        const popUndoStack = () => {
            console.log(undoStack);
            if (undoStack.length > 0) {
                const item = undoStack[undoStack.length - 1];
                setUndoStack(prevUndoStack => prevUndoStack.slice(0, undoStack.length - 1));
                setSequence(item.oldSequence);
                setSelection(item.oldSelection);
            }
            setIsIns(false);
            setIsDel(false);
        };
        // Actually handling editing events
        const keypressHandler = (event) => {
            let hasSelection = selection.start !== null;
            let keyUpper = event.key.toUpperCase();
            let isBase = "ACGT".includes(keyUpper);
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
                    setSequence((sequence) => sequence.substring(0, selStart) +
                                              keyUpper +
                                              sequence.substring(selStart));
                    setSelection({ ...selection,
                                 start: selStart + 1,
                                 end: selEnd + 1 });
                } else {
                    setSequence((sequence) => sequence.substring(0, selStart) +
                                              keyUpper +
                                              sequence.substring(selEnd));
                    setSelection({ ...selection,
                                   start: selStart + 1,
                                   end: selStart + 1 });
                }
            }
        };
        const keydownHandler = (event) => {
            let hasSelection = selection.start !== null;
            let isBackspace = event.key === "Backspace";
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
                    setSequence((sequence) => sequence.substring(0, selStart - 1) +
                                              sequence.substring(selStart));
                    setSelection({ ...selection,
                                   start: selStart - 1,
                                   end: selStart - 1 });
                } else {
                    setSequence((sequence) => sequence.substring(0, selStart) +
                                              sequence.substring(selEnd));
                    setSelection({ ...selection,
                                   start: selStart,
                                   end: selStart });
                }
            } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
                console.log("ctrl + Z")
                setIsIns(false);
                setIsDel(false);
                popUndoStack();
            }
        };
        const pasteHandler = (event) => {
            console.log(event)
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
                if (selLen === 0) {
                    setSequence((sequence) => sequence.substring(0, selStart) +
                                              processedText +
                                              sequence.substring(selStart));
                    setSelection({ ...selection,
                                 start: selStart,
                                 end: selStart + processedText.length });
                } else {
                    setSequence((sequence) => sequence.substring(0, selStart) +
                                              processedText +
                                              sequence.substring(selEnd));
                    setSelection({ ...selection,
                                   start: selStart,
                                   end: selStart + processedText.length });
                }
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
    }, [sequence, selection, isIns, isDel, undoStack]);

    let props = { name: "Test", viewer: "linear", seq: sequence };

    return (
        <div style={{ height: '500px', width: '100%', position: 'relative',
                      display: 'block', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {showWarn && <div className="warn-paste" style={{ width: '100%', display: 'block' }}>
                <p>Paste data contained non-ACGT characters! Please check: {pasteData}</p>
            </div>}
            <SeqViz
                { ...props }
                sequence={sequence}
                selection={selection}
                onSelection={selectionHandler}
            />
        </div>
    )
}
