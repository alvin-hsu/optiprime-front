import React, { useEffect, useState } from "react";
import { EditableSeqViz } from "./ModdedSeqViz";

export default function SeqVizTest() {
    const [ seqData, setSeqData ] = useState({
            name: "", seq: "", selection: {clockwise: true, start: 0, end: 0},
            cdsList: [], annotations: [], translations: [], highlights: []
    });

    useEffect(() => {
        console.log(seqData);
    }, [seqData]);

    return (
        <div style={{ height: "100%", width: "100%" }}>
            <h1>SeqViz Playground</h1>
            <EditableSeqViz isEditable={true} seqData={seqData} setSeqData={setSeqData} />
        </div>
    )
}
