import React, { useState } from "react";
import MediaQuery from "react-responsive"

import "./Header.css";

function NavButton({ link, text }) {
    function handleClick() {
        window.location.href = link
    }
    return (<button onClick={handleClick}>{text}</button>)
}

function NavBar() {
    const [isNavVisible, setIsNavVisible] = useState(false);
    const toggleNav = () => {
        console.log('clicked!');
        setIsNavVisible(!isNavVisible);
    };
    return (
        <div className="menu-bar">
            <MediaQuery minWidth={1000}>
                <div className="nav-computer">
                    <NavButton link="/" text="home" />
                    <NavButton link="/rest" text="REST API" />
                    <NavButton link="/about" text="about" />
                    <NavButton link="/other" text="other links" />
                </div>
            </MediaQuery>
            <MediaQuery maxWidth={999}>
                <button className="menu-toggle"
                        onClick={toggleNav}
                        style={{backgroundColor: isNavVisible ? "darkgray" : "lightgray"}}
                >☰</button>
                <div className="nav-mobile"
                     style={{display: isNavVisible ? "inline-block" : "none"}}>
                    <NavButton link="/" text="home" />
                    <NavButton link="/rest" text="REST API" />
                    <NavButton link="/about" text="about" />
                    <NavButton link="/other" text="other links" />
                </div>
            </MediaQuery>
        </div>
    )
}

export default function Header() {
    return (
        <div className="Header">
            <div id="logo">
                <img src="/op-logo-300ppi.png" alt="OptiPrime"/>
            </div>
            <NavBar />
        </div>
    )
}
