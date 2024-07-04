import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Cookies from "js-cookie";
import { decodeToken } from "react-jwt";

/*
 * Handles google OAuth2 response - stores the access token in a cookie and redirects to page in 'state' parameter
 * 
 * AWS was configured to redirect users to this page after successful login:
 * https://optipri.me/idpresponse#access_token=XXX&id_token=XXX&token_type=Bearer&expires_in=XXX
 * 
 * Future requests can be authenticated by setting the 'X-Optiprime-Auth' header. 
 * 
 * Configurable at: 
 * OptiPrimeAPI -> Authorizers -> Optiprime-authorizer -> Token Source
 * 
 */
const IDPResponse = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const idToken = params.get("id_token");
        const idJwt = decodeToken(idToken);
        const acToken = params.get("access_token");
        const acJwt = decodeToken(acToken);
        const redirectUrl = params.get("state");
        if (!(idToken && acToken)) {
            console.log("id_token or access_token not found in the URL");
            if (redirectUrl) {
                navigate(redirectUrl);
            } else {
                navigate("/");
            }
            return;
        }
        console.log("Got id_token", idToken);
        console.log("Got access_token", acToken);
        // Parse out useful fields from JWT
        const expTime = new Date(1000 * acJwt["exp"]);
        const tos = idJwt["tos"];
        Cookies.set("ac_token", acToken, { secure: true,
                                           sameSite: "Strict",
                                           expires: expTime });
        Cookies.set("id_token", idToken, { secure: true,
                                           sameSite: "Strict",
                                           expires: expTime });
        if (tos !== null) {
            Cookies.set("tos", tos, { secure: true,
                                      sameSite: "Strict",
                                      expires: expTime });
        }
        if (redirectUrl) {
            navigate(redirectUrl);
        } else {
            navigate("/");
        }
    }, [navigate]);

    return <div>Loading...</div>;
};

export default IDPResponse;
