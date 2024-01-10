import React from "react";
import { SwitchTransition, CSSTransition } from 'react-transition-group';
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";

import About from "./About"
import Design from "./Design"
import Header from "./Header"
import Home from "./Home"
import OtherLinks from "./Other";
import EditableSeqViz from "./EditableSeqViz";
import REST from "./REST"

import "./App.css"
import "./Animations.css"

function App() {
  const location = useLocation();

  return (
    <div className="flex-container">
      <Header />
      <div className="main-content">
        <SwitchTransition mode="out-in">
        <CSSTransition
          key={location.pathname}
          timeout={300} // Duration of your animation
          classNames="slide" // Prefix for the CSS transition classes
        >
          <Routes location={location}>
            <Route exact path="/" element={<Home />} />
            <Route path="/rest" element={<REST />} />
            <Route path="/about" element={<About />} />
            <Route path="/other" element={<OtherLinks />}/>
            <Route path="/design" element={<Design />} />
            <Route path="/seqviz" element={<EditableSeqViz />} />
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
