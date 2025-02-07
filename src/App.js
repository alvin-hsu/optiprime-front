import React, { useState } from "react";
import { BrowserRouter as Router,
         Routes,
         Route,
         useLocation,
         useNavigate } from "react-router-dom";
import Cookies from "js-cookie";
import { decodeToken } from "react-jwt";
import GoogleButton from "react-google-button";
import MediaQuery from "react-responsive";
import { IoLogOutOutline } from "react-icons/io5";
import {Button, Image, View, Text} from "@aws-amplify/ui-react"
import "@aws-amplify/ui-react/styles.css";

import REST from "./REST";
import Home from "./Home";
import Jobs from "./Jobs";
import About from "./About";
import Design from "./Design";
import OtherLinks from "./Other";
import Project from "./Project";
import SeqVizTest from "./SeqVizTest";
import IDPResponse from "./IDPResponse";
import Scratch from "./Scratch";

import { fetchAuth, verifyRSASignature } from "./Utils";


// Is this the local development server?
const isDev = process.env.NODE_ENV === "development";
const redirectURL = isDev ? "http://localhost:3000" : "https://optipri.me";
const clientId = "55kpv1cuiekc2drftj2ftr71nu";  // Cognito

// Page that is shown for ProtectedRoutes if user is not logged in
const RequireLogin = () => {
    // DC TODO: Add content to this page
    return <View children="Login required"/>
};

// TOS page: Display terms of service and provide an accept button
const TermsOfService = () => {
    const acceptTOS = (_) => {
        fetchAuth("id_token", "https://api.optipri.me/accept_tos", { method: "POST" })
        .then(resp => {
            return resp.text();
        })
        .then(tos => {
            Cookies.set('tos', tos, { secure: true, sameSite: 'Strict' });
            window.location.reload();
        });
    };
    return (
        <div>
            <h2>Terms of Service</h2>
            <p>Please review and accept our Terms of Service to continue.</p>
            {/* Your actual TOS content can go here */}
            <button onClick={acceptTOS}>Accept Terms of Service</button>
        </div>
    );
};

// Component wrapper to ensure users are logged in before accessing children components
const ProtectedRoute = ({ children }) => {
    const publicKey = `
    -----BEGIN PUBLIC KEY-----
    MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEApGaxPHko6WhQSLl57wgT
    3IhTIjSxkDjPgs0+uGc/XNOJ8kb61HdAObycNn4l1w7oZ23ajhTVqsqoQxofwB8P
    r30IbpDF/24Y7/MWwwGLv3UCOT6WBYZNpSRoYvUwAst4jeI10AtOhf4obzaXTcj1
    /KxH8eIET3dXtY+XOnGehwBh5XPG0Ie8wezVlYwjqhHT0oHCKmnqH2MuQfZW+zEu
    EPeYhDN93hIC2wJ2OfpT82vVvSClpC4BIE0qbn8ZOg7ybvt2h9Vzom7Q1Z1QY3d2
    iiQouHhoLa/Phd1/53fvflcOzA20ZDDn9qJ0hzP416c8hJrXOGc0LiwUXuHkvN+V
    rr4IfuX2QL0+iwkOTOVSwU62QU9HDO+vXUZqA33eJT29FrkmeZx2jmRMuNSfHcFx
    LUmZsVzl16KVF5pcxG2qE21tg/VRB7qgdme3gg8VpXrVbvgRyoaiIOlXw6cl/Nah
    tFuFnCSAsfEV8ShZHy0oz4gc48sNyVpRHzN0ZAhi8bPgPE+L+BqCqc/p624WyBIx
    9AYEUr74AR6fbHfL2O0ESDatTvKI1J4hyBRySYldKDagCM/ejEk0gsdfmFGupKdc
    +8nhkhp3AlMCEMs3CxYUYue31YNbZrCbNwWlgnGk4CnXRJAQzAc6yOlEkCcSOD4/
    UCf362qroaxEgAISzmOuUasCAwEAAQ==
    -----END PUBLIC KEY-----
    `;

    const idToken = Cookies.get("id_token");
    if (!idToken) {
        return <RequireLogin />;
    }
    const idJwt = decodeToken(idToken);
    const username = idJwt["sub"];
    const tos = (typeof Cookies.get("tos") !== "undefined")
                ? Cookies.get("tos") : idJwt["tos"];
    if (!( (typeof username !== "undefined") &&
           (typeof tos !== "undefined") &&
           verifyRSASignature(publicKey, tos, username) )) {
        return <TermsOfService />;
    }
    return children;
};

const Header = () => {
    const [isNavVisible, setIsNavVisible] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    const BUTTONS = [{ link: "/", text: "home" },
                     { link: "/rest", text: "projects" },
                     { link: "/about", text: "about" },
                     { link: "/other", text: "other links" }];
    const idToken = Cookies.get("id_token");

    // User login and logout
    const initiateLogin = () => {
        const redirectUri = encodeURIComponent(redirectURL + "/idpresponse");
        // noinspection UnnecessaryLocalVariableJS
        const loginUrl = (`https://auth.optipri.me/oauth2/authorize?
                           response_type=token&
                           client_id=${clientId}&
                           redirect_uri=${redirectUri}&
                           state=${location.pathname}`
                          .replace(/\s+/g, ""));
        window.location.href = loginUrl;
    };

    const initiateLogout = () => {
        const logoutUri = encodeURIComponent(redirectURL);
        Cookies.remove("ac_token");
        Cookies.remove("id_token");
        Cookies.remove("tos");
        // noinspection UnnecessaryLocalVariableJS
        const logoutUrl = (`https://auth.optipri.me/logout?
                            client_id=${clientId}&
                            logout_uri=${logoutUri}`
                           .replace(/\s+/g, ""));
        window.location.href = logoutUrl;
    };

    const LogInOutButton = () => {
        if (!idToken) {
            return <GoogleButton onClick={initiateLogin} />;
        } else {
            const email = decodeToken(idToken)["email"];
            return (
                <View fontSize="16px" textAlign="right">
                    <Text children={`Logged in as ${email}`}/>
                    <Button onClick={initiateLogout}
                            fontWeight="normal"
                            fontSize="16px"
                            padding="1px 1px"
                            margin="1px 1px">
                        <View>
                            <IoLogOutOutline size="2em"/>
                        </View>
                    </Button> {/* DC TODO: Add "Logout" text to left of button and center nicely */}
                </View>
            )
        }
    }

    return (
        <View position="sticky" top="0" height="15vh" width="100%" textAlign="center"
              backgroundColor="white" padding="0"
              style={{ borderBottom: "1px solid gray", zIndex: 100 }}>
            <Image alt="OptiPrime" src="/op-logo-300ppi.png" objectFit="initial"
                   objectPosition="50% 50%" height="50%" maxHeight="100px" margin="0 0 10px 0" />
            <MediaQuery minWidth={1000}>
                <View position="absolute" top="10px" right="10px">
                    <LogInOutButton />
                </View>
            </MediaQuery>
            <MediaQuery maxWidth={999}>

            </MediaQuery>
            <View height="33%">
                {/* Dynamic navigation bar */}
                <MediaQuery minWidth={1000}>
                    {BUTTONS.map(({ link, text }) => (
                    <Button children={text}
                            onClick={() => navigate(link)}
                            height="100%" width="20%"
                            fontWeight="normal"
                            fontSize="24px"
                            padding="10px 20px"
                            margin="3px 3px"
                            border="none"
                            key={link} />
                    ))}
                </MediaQuery>
                <MediaQuery maxWidth={999}>
                    <Button onClick={() => { setIsNavVisible(!isNavVisible); }}
                            backgroundColor={isNavVisible ? "darkgray" : "lightgray"}
                            width="90%"
                            children={"☰"} />
                    <View width="90%" style={{display: isNavVisible ? "inline-block" : "none"}}>
                        {BUTTONS.map(({ link, text }) => (
                        <Button children={text}
                                onClick={() => navigate(link)}
                                height="100%" width="100%"
                                fontWeight="normal"
                                fontSize="16px"
                                padding="10px"
                                marign="0 0 5px 0"
                                border="none"
                                backgroundColor="white"
                                key={link} />
                        ))}
                    </View>
                </MediaQuery>
            </View>
        </View>
    );
};







const App = () => {
    const location = useLocation();

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <Header />
            <View display="flex" overflow="scroll"
                  style={{ justifyContent: "center", height: "85vh" }}>
                <Routes location={location}>
                    <Route exact path="/" element={<Home />} />
                    <Route path="/terms-of-service" element={<TermsOfService />} />
                    {/* Publically accessible routes */}
                    <Route path="/rest" element={<REST />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/other" element={<OtherLinks />}/>
                    {/* Protected routes */}
                    <Route path="/design" element={<ProtectedRoute><Design /></ProtectedRoute>} />
                    <Route path="/jobs" element={<ProtectedRoute><Jobs /></ProtectedRoute>} />
                    <Route path="/project" element={<ProtectedRoute><Project /></ProtectedRoute>} />
                    {/* Debugging/scratch pages */}
                    <Route path="/seqviz" element={<SeqVizTest />} />
                    <Route path="/idpresponse" element={<IDPResponse />} />
                    <Route path="/scratch" element={<Scratch />} />
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
