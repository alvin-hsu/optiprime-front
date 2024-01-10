import React, { useState } from "react";
import EditableSeqViz from "./EditableSeqViz";

export default function SeqVizTest() {
    const [ seq, setSeq ] = useState("ACGT");

    return (
        <div style={{ width: "100%" }}>
            <h1>SeqViz Playground</h1>
            <EditableSeqViz

            />
        </div>
    )
}
