import React, { useEffect, useState } from "react";
import { SeqViz } from "seqviz";
import {makeCDSAandTs} from "./Utils";
import {aminoAcidColors} from "./Codons";

export default function UneditedSeqViz({ seqData, name }) {
    const [ annotations, setAnnotations ] = useState([]);
    const [ translations, setTranslations ] = useState([]);

    useEffect(() => {
        if (typeof name !== "undefined") {
            const protoAnn = {
                name: name,
                start: 4,
                end: 24,
                direction: 1,
                color: name.includes("RS3") ? "lightblue" : "gray"
            };
            const pamAnn = {
                name: "NGG",  // FIXME
                start: 24,
                end: 27,  // FIXME
                direction: 1,
                color: name.includes("RS3") ? "lightblue" : "gray"
            };
            if (("cdsList" in seqData) && (seqData.cdsList.length > 0)) {
                const cdsAandTs = seqData.cdsList.map(cds => makeCDSAandTs(cds));
                const cdsTranslations = cdsAandTs.map(cds => cds.translation);
                setTranslations(cdsTranslations);
            }
            setAnnotations([protoAnn, pamAnn]);
        }
    }, [seqData, name]);
    return (
        <div style={{ height: "100%", verticalAlign: "top" }}>
            <div style={{ height: "70px", width: "100%", display: "block", marginBottom: "25px" }}>
                <SeqViz
                    { ...seqData }
                    viewer="linear"
                    annotations={annotations}
                    translations={translations}
                    showComplement={false}
                    showIndex={false}
                    selection={{ start: NaN, end: NaN, clockwise: true }}
                    onSelection={() => {}}
                />
            </div>
        </div>
    );
}
