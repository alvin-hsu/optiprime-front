import React, { useState } from "react";
import EditableSeqViz from "./EditableSeqViz";

export default function SeqVizTest() {
    const [ seqData, setSeqData ] = useState({ seq: "",
                                               cdsList: [],
                                               annotations: [],
                                               translations: [] });

    return (
        <div style={{ height: "100%", width: "100%" }}>
            <h1>SeqViz Playground</h1>
            <EditableSeqViz isEditable={true} seqData={seqData} setSeqData={setSeqData} />
        </div>
    )
}
