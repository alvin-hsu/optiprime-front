import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@aws-amplify/ui-react";

export default function Home() {
    // TODO: LocalStorage to store previous predictions
    let navigate = useNavigate();

    const goToDesign = () => {
        navigate("./design")
    };

    return (
        <div>
          <Button onClick={goToDesign}>
              Start designing!
          </Button>
        </div>
    );
}
