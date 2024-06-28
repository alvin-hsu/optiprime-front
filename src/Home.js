import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@aws-amplify/ui-react";
import Cookies from "js-cookie";

export default function Home() {
    const navigate = useNavigate();

    useEffect(() => {
        const jwt = Cookies.get('jwt');
        if (!jwt) {
            navigate('/terms-of-service');
        }
    }, [navigate]);

    return (
        <div>
          <Button onClick={() => navigate("./design")}>
              Start designing!
          </Button>
        </div>
    );
}
