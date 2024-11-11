import React from "react";
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import { View } from "@aws-amplify/ui-react"
import "@aws-amplify/ui-react/styles.css";

import TOS from "./TOS";
import REST from "./REST";
import Home from "./Home";
import Jobs from "./Jobs";
import About from "./About";
import Header from "./Header";
import Design from "./Design";
import OtherLinks from "./Other";
import Project from "./Project";
import SeqVizTest from "./SeqVizTest";
import IDPResponse from "./IDPResponse";

const App = () => {
    const location = useLocation();

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <Header />
            <View display="flex" overflow="scroll"
                  style={{ justifyContent: "center", height: "85vh" }}>
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
                    <Route path="/project" element={<Project />}></Route>
                </Routes>
            </View>
        </div>
    );
};

const AppWrapper = () => {
    return (
        <Router>
            <App />
        </Router>
    );
};

export default AppWrapper;
