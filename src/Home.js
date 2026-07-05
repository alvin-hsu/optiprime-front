import React from "react";
import { Link } from "react-router-dom";
import {Grid, Card, Image, useTheme, View, Text} from "@aws-amplify/ui-react";

const Home = () => {
    const { tokens } = useTheme();
    return (
        <Grid
            templateColumns="1fr 1fr 1fr 1fr"
            templateRows="1fr 1fr"
            templateAreas={[
              ["a", "x", "x", "b"],
              ["c", "x", "x", "d"],
            ]}
            gap={tokens.space.small}
            width="100%"
            margin="5px"
        >
            <Card rowStart={1} rowEnd={-1} column={1}
                  borderRadius="20px" borderWidth="1px" borderColor="black">
                <View
                    as="a" href="https://drive.google.com/file/d/1eJnqpipJuSpw7fiWFxEuUC20jH5URJve/view"
                    position="relative" width="100%" height="100%"
                    textDecoration="none" color="inherit" cursor="pointer" display="block"
                >
                    <Image
                        alt="Nature protocols paper"
                        src="/protocols.png"
                        position="absolute" top="0" left="0" width="100%" height="100%"
                        objectFit="cover" style={{ filter: "blur(3px)" }}
                    />
                    <View
                        position="absolute" top="0" left="0" width="100%" height="100%"
                        display="flex" alignItems="center" justifyContent="center"
                        backgroundColor="rgba(256, 256, 256, 0.5)"
                    >
                        <Text color="black" fontSize="24px" fontWeight="bold" textAlign="center"
                              children="Confused about where to start? Read our prime editing protocols paper here."
                        />
                    </View>
                </View>
            </Card>
            <Card row={1} columnStart={2} columnEnd={-2}
                  borderRadius="20px" borderWidth="1px" borderColor="black">
                <View
                    as={Link} to="/design"
                    position="relative" width="100%" height="100%"
                    textDecoration="none" color="inherit" cursor="pointer" display="block"
                >
                    <Image
                        alt="Design page"
                        src="/design.png"
                        position="absolute" top="0" left="0" width="100%" height="100%"
                        objectFit="cover" style={{ filter: "blur(2px)" }}
                    />
                    <View
                        position="absolute" top="0" left="0" width="100%" height="100%"
                        display="flex" alignItems="center" justifyContent="center"
                        backgroundColor="rgba(256, 256, 256, 0.5)"
                    >
                        <Text color="black" fontSize="24px" fontWeight="bold" textAlign="center"
                              children="Design a prime edit!"
                        />
                    </View>
                </View>
            </Card>
            <Card row={2} columnStart={2} columnEnd={-2}
                  borderRadius="20px" borderWidth="1px" borderColor="black">
                <View
                    as={Link} to="/jobs"
                    position="relative" width="100%" height="100%"
                    textDecoration="none" color="inherit" cursor="pointer" display="block"
                >
                    <Image
                        alt="Jobs page"
                        src="/jobs.png"
                        position="absolute" top="0" left="0" width="100%" height="100%"
                        objectFit="cover" style={{ filter: "blur(5px)" }}
                    />
                    <View
                        position="absolute" top="0" left="0" width="100%" height="100%"
                        display="flex" alignItems="center" justifyContent="center"
                        backgroundColor="rgba(256, 256, 256, 0.5)"
                    >
                        <Text color="black" fontSize="24px" fontWeight="bold" textAlign="center"
                              children="View your submitted jobs"
                        />
                    </View>
                </View>
            </Card>
            <Card rowStart={1} rowEnd={-1} column={4}
                  borderRadius="20px" borderWidth="1px" borderColor="black">
                <View
                    as="a" href="https://www.addgene.org/David_Liu/"
                    position="relative" width="100%" height="100%"
                    textDecoration="none" color="inherit" cursor="pointer" display="block"
                >
                    <Image
                        alt="Jobs page"
                        src="/addgene.png"
                        position="absolute" top="0" left="0" width="100%" height="100%"
                        objectFit="cover" style={{ filter: "blur(2px)" }}
                    />
                    <View
                        position="absolute" top="0" left="0" width="100%" height="100%"
                        display="flex" alignItems="center" justifyContent="center"
                        backgroundColor="rgba(256, 256, 256, 0.5)"
                    >
                        <Text color="black" fontSize="24px" fontWeight="bold" textAlign="center"
                              children="Need plasmids? Here are all of our prime editing plasmids on Addgene."
                        />
                    </View>
                </View>
            </Card>
        </Grid>
    );
};
export default Home;
