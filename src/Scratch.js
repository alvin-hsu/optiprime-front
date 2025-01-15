import React, { useEffect, useRef, useState } from "react";
import Plot from "react-plotly.js";

const PAMSlider = ({ cutoff, setCutoff }) => {
    const [data, setData] = useState({});
    const [mouseShape, setMouseShape] = useState({});
    const [cutoffShape, setCutoffShape] = useState({});
    const ref = useRef(null);
    // Load HT-PAMDA data on first load in background
    useEffect(() => {
        const DATA_URL = "/PAM-scores.json";
        fetch(DATA_URL)
        .then(r => r.json())
        .then(data => {setData(data);});
    }, []);
    // Add a line where the mouse is
    const handleMouseMove = (event) => {
        const plot = ref.current && ref.current.querySelector(".js-plotly-plot");
        if (plot) {
            const { left } = event.target.getBoundingClientRect();
            const xRel = event.clientX - left;
            const dataX = plot._fullLayout.xaxis.p2d(xRel);
            const shape = {
                type: "line",
                x0: dataX, x1: dataX,
                y0: 0, y1: 1, yref: "paper",  // Paper coords => full height
                line: {
                    color: "gray",
                    width: 1
                }
            };
            setMouseShape(shape);
        }
    };
    const handleMouseLeave = () => {
        setMouseShape({});
    };
    // Add a line where the PAM cutoff is
    useEffect(() => {
        const plot = ref.current && ref.current.querySelector(".js-plotly-plot");
        if (plot && "PAMDA_scale" in data && "PAMDA_bias" in data) {
            const dataX = data["PAMDA_scale"] * (cutoff + data["PAMDA_bias"]);
            const shape = {
                type: "line",
                x0: dataX, x1: dataX,
                y0: 0, y1: 1, yref: "paper",  // Paper coords => full height
                line: {
                    color: "red",
                    width: 2
                }
            };
            setCutoffShape(shape);
        }
    }, [data, cutoff])
    const handleMouseDown = (event) => {
        const plot = ref.current && ref.current.querySelector(".js-plotly-plot");
        if (plot) {
            const { left } = event.target.getBoundingClientRect();
            const xRel = event.clientX - left;
            const dataX = plot._fullLayout.xaxis.p2d(xRel);
            setCutoff((dataX / data["PAMDA_scale"]) - data["PAMDA_bias"]);
        }
    };

    return (
        <div
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onMouseDown={handleMouseDown}
            ref={ref}
            style={{ width: "100%", height: "100%", backgroundColor: "red", textAlign: "center" }}
        >
            <Plot
                data={[
                    { x: data["x"],
                      y: data["y"],
                      type: "scatter"}
                ]}
                layout={{
                    width: 500,
                    height: 200,
                    shapes: "type" in mouseShape ? [cutoffShape, mouseShape] : [cutoffShape],
                    margin: { l: 40, r: 10, b: 35, t: 0, pad: 0 },
                    xaxis: { range: [-2, 2], autorange: false, title: "PAM score", zeroline: false },
                    yaxis: { range: [0, 65], autorange: false, title: "Number of 4-bp PAMs" },
                    dragmode: false
                }}
                config={{
                    displayModeBar: false,
                    scrollZoom: false,
                    doubleClick: false,
                    displaylogo: false
                }}
            />
        </div>
    );
}

const Scratch = () => {
    const [cutoff, setCutoff] = useState(-1.67);
    return (
        <div style={{ width: "500px", height: "200px" }}>
            <PAMSlider cutoff={cutoff} setCutoff={setCutoff} />
        </div>
    );
};

export default Scratch;
