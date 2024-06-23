import React, { useEffect, useState, useLayoutEffect } from "react";
import { SeqViz } from "seqviz";

import { makeCDSAandTs, revcomp } from "./Utils";
import { codonTableForward, codonTableReverse, aminoAcidColors, darkAminoAcidColors } from "./Codons";

const CODON_RE = /[ACDEFGHIKLMNPQRSTVWY*]#\d+-\d+/
const MENU_RE = /MENU\[(\d+)]/
const MAX_DIST = 18;

const editSegments = (seq, cds) => {
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

export default function EditedSeqViz({ seqData, highlights }) {
    // Annotation management
    const [origAnns, setOrigAnns] = useState([]);
    const [currAnns, setCurrAnns] = useState([]);
    const [mainAnnMap, setMainAnnMap] = useState({});  // Maps annotation name => DOM ID
    const [translations, setTranslations] = useState([]);
    // Segment objects for managing actual state
    const [segObjs, setSegObjs] = useState([]);
    const [segObjMap, setSegObjMap] = useState({});
    // Dropdown menu
    const [menuName, setMenuName] = useState("");
    const [menuAnnMap, setMenuAnnMap] = useState({});
    // For tracking if DOM updates are pending
    const [updated, setUpdated] = useState(false);

    // Initialization
    useEffect(() => {
        if (typeof seqData === "undefined") {
            return;
        }
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
            setSegObjMap(Object.fromEntries(seqSegObjs.map(x => [x.name, x])));
        }
        setOrigAnns(anns);
        setCurrAnns(anns);
    }, [seqData]);
    // Map silent edit annotations to IDs
    useEffect(() => { setUpdated(true); }, [currAnns]);  // Forces wait until DOM re-renders
    useLayoutEffect(() => {
        if (updated) {
            const annotations = (Array.from(document.querySelectorAll(".la-vz-annotation"))
                                                    .map(x => x.parentElement));
            const annLabels = annotations.map(x => {
                const label = x.childNodes[0].innerHTML;
                const id = x.id;
                return [label, id];
            });
            setMainAnnMap(Object.fromEntries(annLabels.filter(x => CODON_RE.test(x[0]))));
            setMenuAnnMap(Object.fromEntries(annLabels.filter(x => MENU_RE.test(x[0]))));
            setUpdated(false);
        }
    }, [updated]);
    // Update numbers with # of selected silent edits
    useEffect(() => {
        segObjs.map(segObj => {
            if (segObj.name in mainAnnMap) {
                const count = segObj.selected.filter(Boolean).length;
                const annId = mainAnnMap[segObj.name];
                const obj = document.getElementById(annId);
                if (obj !== null) {
                    obj.childNodes[2].innerHTML = `${count}`;
                }
            }
            return null;
        });
    }, [mainAnnMap, segObjs]);
    // Set annotations when a menu is open
    useEffect(() => {
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
    }, [menuName, segObjs, segObjMap, origAnns]);
    useEffect(() => {
        if (menuName in segObjMap) {
            const segObj = segObjMap[menuName];
            segObj.segments.map((x, i) => {
                const name = `MENU[${i}]`;
                if (name in menuAnnMap) {
                    const annId = menuAnnMap[name];
                    const obj = document.getElementById(annId);
                    if (obj !== null) {
                        obj.childNodes[2].innerHTML = x;
                        obj.onmousedown = (() => {
                            const segObj = segObjMap[menuName];
                            const segObjIdx = segObjs.indexOf(segObj);
                            const menuIdx = parseInt(MENU_RE.exec(name)[1]);
                            let selected = segObj.selected;
                            selected[menuIdx] = !selected[menuIdx];
                            if (selected.filter(Boolean).length > 0) {
                                const newSegObj = { ...segObj, selected };
                                const newSegObjs = [ ...segObjs.slice(0, segObjIdx),
                                                     newSegObj,
                                                     ...segObjs.slice(segObjIdx + 1) ];
                                setSegObjs(newSegObjs.slice(0, segObjs.length));
                            }
                        });
                    }
                }
                return null;
            });
        }
    }, [menuName, menuAnnMap, segObjMap, segObjs]);
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
        <div style={{ height: "100%", verticalAlign: "top" }}>
            <div style={{ height: "195px", width: "100%", display: "block" }}>
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
