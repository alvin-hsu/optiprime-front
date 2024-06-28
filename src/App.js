import React from "react";
import { SwitchTransition, CSSTransition } from "react-transition-group";
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import "@aws-amplify/ui-react/styles.css";

import TOS from "./TOS";
import REST from "./REST";
import Home from "./Home";
import Jobs from "./Jobs";
import About from "./About";
import Header from "./Header";
import Design from "./Design";
import OtherLinks from "./Other";
import SeqVizTest from "./SeqVizTest";
import IDPResponse from "./IDPResponse";

import "./Animations.css"

function App() {
    const location = useLocation();

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <Header />
            <div style={{ display: "flex", justifyContent: "center", flexGrow: 1 }}>
                <SwitchTransition mode="out-in">
                    <CSSTransition
                        key={location.pathname}
                        timeout={50} // Duration of your animation
                        classNames="slide" // Prefix for the CSS transition classes
                    >
                        <Routes location={location}>
                            <Route exact path="/" element={<Home />} />
                            <Route path="/rest" element={<REST />} />
                            <Route path="/about" element={<About />} />
                            <Route path="/other" element={<OtherLinks />}/>
                            <Route path="/design" element={<Design />} />
                            <Route path="/jobs" element={<Jobs />} />
                            <Route path="/seqviz" element={<SeqVizTest />} />
                            <Route path="/idpresponse" element={<IDPResponse />} />
                            <Route path="/terms-of-service" element={<TOS />} />
                        </Routes>
                    </CSSTransition>
                </SwitchTransition>
            </div>
        </div>
    );
}

export default function AppWrapper() {
  return (
    <Router>
      <App />
    </Router>
  );
}
