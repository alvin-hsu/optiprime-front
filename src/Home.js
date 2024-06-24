import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@aws-amplify/ui-react";

export default function Home() {
    // TODO: LocalStorage to store previous predictions
    const navigate = useNavigate();
    return (
        <div>
          <Button onClick={() => navigate("./design")}>
              Start designing!
          </Button>
        </div>
    );
}
