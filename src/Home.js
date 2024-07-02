import React from "react";
import { Button } from "@aws-amplify/ui-react";
import Cookies from "js-cookie";

import Login from "./Login";
import TOS from "./TOS";
import { verifyRSASignature } from "./Utils";

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

export default function Home() {
    const userName = Cookies.get('')
    const jwt = Cookies.get('jwt');
    const tos = Cookies.get('tos');
    return <Login />
    if (!jwt) {
        return <Login/>;
    } else if (verifyRSASignature(publicKey, tos, userName)) {
        return <TOS />;
    }
}
