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
const IDPResponse = ({ updateUserData }) => {
    const navigate = useNavigate();

    useEffect(() => {
        const hash = window.location.hash.substring(1);
        if (!hash) { return; }  // Tokens were already processed

        const params = new URLSearchParams(hash);
        const idToken = params.get("id_token");
        const acToken = params.get("access_token");
        const redirectUrl = params.get("state") || "/";

        // Remove the hash from the URL
        window.history.replaceState(null, "", window.location.pathname + window.location.search);

        if (!(idToken && acToken)) {
            console.log("id_token or access_token not found in the URL");
            navigate("/", { replace: true });
            throw new Error("Not permitted - OptiPrime is currently restricted to broadinstitute.org emails.")
        }
        console.log("Got id_token", idToken);
        console.log("Got access_token", acToken);
        // Parse out useful fields from JWT
        const idJwt = decodeToken(idToken);
        const expTime = new Date(1000 * idJwt["exp"]);
        const tos = idJwt["tos"];
        Cookies.set("ac_token", acToken, { secure: true,
                                           sameSite: "Strict",
                                           expires: expTime });
        Cookies.set("id_token", idToken, { secure: true,
                                           sameSite: "Strict",
                                           expires: expTime });
        if (typeof tos !== "undefined") {
            Cookies.set("tos", tos, { secure: true,
                                      sameSite: "Strict",
                                      expires: expTime });
        }
        navigate(redirectUrl, { replace: true });
        updateUserData();
    }, [navigate, updateUserData]);

    return <div>Loading...</div>;
};

export default IDPResponse;
