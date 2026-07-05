import React, { useEffect, useState } from "react";
import { BrowserRouter as Router,
         Routes,
         Route,
         useLocation,
         useNavigate } from "react-router-dom";
import Cookies from "js-cookie";
import { decodeToken } from "react-jwt";
import GoogleButton from "react-google-button";
import MediaQuery from "react-responsive";
import { IoLogOutOutline, IoSync } from "react-icons/io5";
import {Button, Card, Flex, Grid, Heading, Image, View, Text, useTheme} from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { ErrorBoundary } from "react-error-boundary";
import ReactMarkdown from "react-markdown";

import About from "./About";
import API from "./API";
import Design from "./Design";
import ErrorFallback from "./Error";
import Home from "./Home";
import IDPResponse from "./IDPResponse";
import Job from "./Job"
import Jobs from "./Jobs";
import OtherLinks from "./Other";
import REST from "./REST";
import SeqVizTest from "./SeqVizTest";
import Scratch from "./Scratch";
import TOS from "./TOS";

import { fetchAuth, verifyRSASignature } from "./Utils";


// Is this the local development server?
const isDev = process.env.NODE_ENV === "development";
const redirectURL = isDev ? window.location.origin : "https://optipri.me";
const clientId = "55kpv1cuiekc2drftj2ftr71nu";  // Cognito

// Page that is shown for ProtectedRoutes if user is not logged in
const RequireLogin = () => {
    return (
        <Flex
            direction="column"
            alignItems="center"
            justifyContent="center"
            style={{height: '100%', textAlign: 'center'}}
        >
            <Heading level={1}>Login Required</Heading>
            <Image
                src="/locked.png"
                alt="A pegRNA with bad spacer-PBS complementarity."
                width="300px"
                height="auto"
                style={{marginBottom: '1rem'}}
            />
        </Flex>
    );
};

// TOS page: Display terms of service and provide an accept button
const PromptTOS = () => {
    const {tokens} = useTheme();

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
        <View>
            <Grid
                rowGap="15px"
                columnGap={tokens.space.medium.value}
                padding="20px"
                width="100%"
                templateColumns="1fr 850px 1fr"
                templateRows="repeat(auto-fill, minmax(min-content, 10px))"
                height="100%"
            >
                <Card column="2">
                    <Text style={{fontWeight: "bold"}}>
                        Before proceeding, please accept the Terms of Service.
                        An up-to-date version of these Terms can be found <a href="/terms-of-service">here</a> at any time.
                    </Text>
                </Card>
                <Card column="2" style={{overflowX: "auto", height: "60vh"}}>
                    <TOS />
                </Card>
                <Card column="2">
                    <button onClick={acceptTOS}>Accept Terms of Service</button>
                </Card>
            </Grid>
        </View>
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
        return <PromptTOS />;
    }
    return children;
};

const Header = ({ navigate, location, userData, updateTokens }) => {
    const BUTTONS = [{ link: "/design", text: "design" },
                     { link: "/jobs", text: "my jobs" },
                     { link: "/about", text: "about" },
                     { link: "/other", text: "other links" }];
    const [isNavVisible, setIsNavVisible] = useState(false);

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
        if (!("sub" in userData)) {
            return <GoogleButton onClick={initiateLogin} />;
        } else {
            const email = userData["email"];
            const tokenLimit = "tokensRemaining" in userData ? userData["tokensRemaining"] : userData["tokenLimit"];
            return (
                <View fontSize="16px" textAlign="right">
                    <Text children={`Logged in as ${email}`}/>
                    <Text children={`Tokens remaining: ${tokenLimit}`}/>
                    <Button onClick={updateTokens}
                            fontWeight="normal"
                            fontSize="16px"
                            padding="1px 10px 1px"
                            margin="1px 1px">
                        Refresh token count
                        <View>
                            <IoSync size="2em" />
                        </View>
                    </Button>
                    <Button onClick={initiateLogout}
                            fontWeight="normal"
                            fontSize="16px"
                            padding="1px 10px 1px"
                            margin="1px 1px">
                        Logout
                        <View>
                            <IoLogOutOutline size="2em"/>
                        </View>
                    </Button>
                </View>
            )
        }
    };

    const loggedInText = `Thank you for logging in. To start designing your job,
    please click the 'design' tab!`;

    return (
        <View position="sticky" top="0" height="auto" minHeight="10vh" width="100%"
              textAlign="center" backgroundColor="white" padding="0"
              style={{ borderBottom: "1px solid gray", zIndex: 100, flexShrink: 0 }}>
            <MediaQuery minWidth={1000}>
                <View position="absolute" top="0px" left="10px" width="525px" textAlign="left"
                      style={{ fontSize: '0.9em' }}>
                    {"sub" in userData ? <ReactMarkdown children={loggedInText} /> : <></>}
                </View>
            </MediaQuery>
            <MediaQuery maxWidth={999}>
                {/* TODO? Mobile controls */}
            </MediaQuery>
            <Image alt="OptiPrime" src="/op-logo-300ppi.png" objectFit="contain"
                   objectPosition="50% 50%" height="auto" maxHeight="72px" margin="8px 0 10px 0"
                   onClick={() => navigate("/")}
            />
            <MediaQuery minWidth={1000}>
                <View position="absolute" top="10px" right="10px">
                    <LogInOutButton />
                </View>
            </MediaQuery>
            <MediaQuery maxWidth={999}>
                {/* TODO? Mobile controls */}
            </MediaQuery>
            <View>
                {/* Dynamic navigation bar */}
                <MediaQuery minWidth={1000}>
                    <View display="flex" flexWrap="wrap" justifyContent="center" alignItems="center"
                          gap="6px" padding="6px 50px">
                        {BUTTONS.map(({ link, text }) => (
                        <Button children={text}
                                onClick={() => navigate(link)}
                                height="auto" width="20%"
                                fontWeight="normal"
                                fontSize="20px"
                                padding="0 20px 0"
                                margin="3px 3px"
                                border="none"
                                key={link} />
                        ))}
                    </View>
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
    const navigate = useNavigate();
    const location = useLocation();
    const [userData, setUserData] = useState({});
    const updateUserData = () => {
        const idToken = Cookies.get("id_token");
        const data = idToken ? decodeToken(idToken) : {};
        setUserData(data);
        return data;
    };
    const updateTokens = () => {
        fetchAuth("ac_token", "https://api.optipri.me/token_usage")
        .then(resp => {
            if (!resp.ok) {
                throw new Error("Failed to get token usage")
            }
            return resp.json()
        })
        .then(data => {
            const totalUsage = data.usage.reduce((a, x) => a + x, 0);
            setUserData(oldData => ({
                ...oldData,
                "tokensRemaining": "tokenLimit" in oldData
                                   ? oldData["tokenLimit"] - totalUsage
                                   : 100 - totalUsage
            }));
        })
        .catch(_ => {});
    };
    useEffect(() => {
        const idToken = updateUserData();
        if (idToken) {
            updateTokens();
        }
    }, []);

    // When the id_token cookie expires, the browser deletes it but React still
    // holds the decoded userData. Schedule a re-read at exp so the UI flips
    // back to the logged-out state.
    useEffect(() => {
        if (!("exp" in userData)) return;
        const msLeft = userData.exp * 1000 - Date.now();
        if (msLeft <= 0) {
            setUserData({});
            return;
        }
        const handle = setTimeout(() => setUserData({}), msLeft);
        return () => clearTimeout(handle);
    }, [userData.exp]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
            <Header navigate={navigate} location={location} userData={userData} updateTokens={updateTokens} />
            <View display="flex"
                  style={{ justifyContent: "center", flexGrow: 1, minHeight: 0, overflow: "auto",
                           paddingTop: "10px" }}>
              <View width="100%"
                    style={{ display: "flex", justifyContent: "center", paddingBottom: "50px" }}>
                <Routes location={location}>
                    <Route exact path="/" element={<Home />} />
                    <Route path="/terms-of-service" element={<View width="80%"><TOS /></View>} />
                    {/* Publically accessible routes */}
                    <Route path="/rest" element={<REST />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/api" element={<API />} />
                    <Route path="/other" element={<OtherLinks />}/>
                    <Route path="/idpresponse" element={<IDPResponse updateUserData={updateUserData}/>} />
                    {/* Protected routes */}
                    <Route path="/design" element={<ProtectedRoute><Design updateTokens={updateTokens} /></ProtectedRoute>} />
                    <Route path="/jobs" element={<ProtectedRoute><Jobs /></ProtectedRoute>} />
                    <Route path="/jobs/:jid" element={<ProtectedRoute><Job /></ProtectedRoute>} />
                    {/* Debugging/scratch pages */}
                    <Route path="/seqviz" element={<SeqVizTest />} />
                    <Route path="/scratch" element={<Scratch />} />
                    <Route path="/"></Route>
                </Routes>
              </View>
            </View>
        </div>
    );
};

const AppWrapper = () => {
    return (
        <Router>
            <ErrorBoundary FallbackComponent={ErrorFallback}>
                <App />
            </ErrorBoundary>
        </Router>
    );
};

export default AppWrapper;
