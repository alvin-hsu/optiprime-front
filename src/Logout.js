import React from "react";
import Button from "@aws-amplify/ui-react";
import Cookies from "js-cookie"

const Logout = () => {
    const initiateLogout = () => {
        const redirectUri = encodeURIComponent('https://optipri.me');
        // noinspection UnnecessaryLocalVariableJS
        const logoutUrl = (`https://auth.optipri.me/logout?
                            redirect_uri=${redirectUri}`
                           .replace(/s+/g, ''));
        Cookies.remove("jwt");
        window.location.href = logoutUrl;
    };
    return <Button onClick={initiateLogout} label="Logout" />;
};

export default Logout;
