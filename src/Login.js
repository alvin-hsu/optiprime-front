import React from 'react';
import GoogleButton from "react-google-button";

const Login = () => {
    const initiateLogin = () => {
        const clientId = '55kpv1cuiekc2drftj2ftr71nu';
        const redirectUri = encodeURIComponent('https://optipri.me/idpresponse');
        // noinspection UnnecessaryLocalVariableJS
        const loginUrl = `https://auth.optipri.me/oauth2/authorize?response_type=token&client_id=${clientId}&redirect_uri=${redirectUri}`;
        window.location.href = loginUrl;
    };
    return <GoogleButton onClick={initiateLogin} />;
};

export default Login;
