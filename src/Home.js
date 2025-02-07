import React from "react";
import { View, Button } from "@aws-amplify/ui-react";

const Home = () => {
    return (
        <View
            style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gridTemplateRows: "1fr 1fr",
                height: "100%",
                width: "100%",
                boxSizing: "border-box",
                margin: 0,
                padding: 0,
                minHeight: 0
            }}
        >
            <Button
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                }}
                margin="0"
                onClick={() => console.log("Quadrant 1 clicked")}
            >
                Quadrant 1
            </Button>
            <Button
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                }}
                margin="0"
                onClick={() => console.log("Quadrant 2 clicked")}
            >
                Quadrant 2
            </Button>
            <Button
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                }}
                margin="0"
                onClick={() => console.log("Quadrant 3 clicked")}
            >
                Quadrant 3
            </Button>
            <Button
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                }}
                margin="0"
                onClick={() => console.log("Quadrant 4 clicked")}
            >
                Quadrant 4
            </Button>
        </View>
    );
};
export default Home;
