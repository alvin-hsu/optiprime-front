import React, { useEffect, useState } from "react";
import { SeqViz } from "seqviz";
import { makeCDSAandTs } from "./Utils";

export default function UneditedSeqViz({ seqData, name, pamVar, highlights }) {
    const [ annotations, setAnnotations ] = useState([]);
    const [ translations, setTranslations ] = useState([]);
    const [ updated, setUpdated ] = useState(false);

    useEffect(() => {
        if (typeof name === "undefined") { return; }
        let color;
        if (name.includes("RS3")) {
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
        const timer = setTimeout(() => { setUpdated(true); }, 100);
        return () => clearTimeout(timer);
    }, [name]);
    useEffect(() => {
        if (updated && (typeof pamVar !== "undefined")) {
            const div = document.querySelector("#unedited-sv");
            if (div !== null) {
                const annotations = (Array.from(div.querySelectorAll(".la-vz-annotation"))
                                                   .map(x => x.parentElement));
                const annLabels = annotations.map(x => {
                    const label = x.childNodes[0].innerHTML;
                    const id = x.id;
                    return [label, id];
                });
                const isPam = annLabels.filter(x => (x[0] === "[PAM]"));
                if (isPam.length !== 0) {
                    const pamObj = document.getElementById(isPam[0][1]);
                    const pamName = (pamVar === "SpRY" || pamVar === "SpG") ? pamVar : pamVar.substring(2);
                    pamObj.childNodes[2].innerHTML = pamName;
                }
            }
            setUpdated(false);
        }
    }, [updated, pamVar]);

    return (
        <div style={{ height: "96px", width: "100%", display: "block" }} id="unedited-sv">
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
}
