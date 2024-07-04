import React from "react";
import { Button } from "@aws-amplify/ui-react";
import Cookies from "js-cookie"

const Logout = () => {
    const initiateLogout = () => {
        const clientId = "55kpv1cuiekc2drftj2ftr71nu";
        const redirectUri = encodeURIComponent("https://optipri.me/idpresponse");
        // noinspection UnnecessaryLocalVariableJS
        const logoutUrl = (`https://auth.optipri.me/logout?
                            client_id=${clientId}&
                            redirect_uri=${redirectUri}&
                            response_type=token`
                           .replace(/\s+/g, ''));
        Cookies.remove("ac_token");
        Cookies.remove("id_token");
        Cookies.remove("tos");
        window.location.href = logoutUrl;
    };
    return (<><Button onClick={initiateLogout} label="Logout">Logout</Button></>);
};

export default Logout;
