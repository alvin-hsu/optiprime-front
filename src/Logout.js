import React from "react";
import { Button } from "@aws-amplify/ui-react";
import Cookies from "js-cookie"

const Logout = () => {
    const initiateLogout = () => {
        const clientId = '55kpv1cuiekc2drftj2ftr71nu';
        const logoutUri = encodeURIComponent('https://optipri.me');
        // noinspection UnnecessaryLocalVariableJS
        const logoutUrl = (`https://auth.optipri.me/logout?
                            client_id=${clientId}&
                            logout_uri=${logoutUri}`
                           .replace(/s+/g, ''));
        Cookies.remove("jwt");
        window.location.href = logoutUrl;
    };
    return <Button onClick={initiateLogout} label="Logout" />;
};

export default Logout;
