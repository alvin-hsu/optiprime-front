import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import MediaQuery from "react-responsive";
import { Button, Image, View } from "@aws-amplify/ui-react";

const NavBar = () => {
    const [isNavVisible, setIsNavVisible] = useState(false);
    const navigate = useNavigate();
    const BUTTONS = [{ link: "/", text: "home" },
                     { link: "/rest", text: "REST API" },
                     { link: "/about", text: "about" },
                     { link: "/other", text: "other links" }];
    return (
        <View height="33%">
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
    )
}

export default function Header() {
    return (
        <View position="sticky" top="0" height="15vh" width="100%" textAlign="center"
              backgroundColor="white" padding="0"
              style={{ borderBottom: "1px solid gray", zIndex: 100 }}>
            <Image alt="OptiPrime" src="/op-logo-300ppi.png" objectFit="initial"
                   objectPosition="50% 50%" height="50%" maxHeight="100px" margin="0 0 10px 0" />
            <NavBar />
        </View>
    )
}
