import React from "react";
import { useNavigate } from "react-router-dom";
import "./Utils.css"

export default function Home() {
    let navigate = useNavigate();

    const goToDesign = () => {
        navigate("./design")
    };

    return (
        <div>
          <button onClick={goToDesign} style={{ fontSize: "24px", padding: "10px" }}>
              Start designing!
          </button>
        </div>
    );
}
