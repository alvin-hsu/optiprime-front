import React, { useState } from "react";
import { Card, Flex, Heading, Image, Text, View } from "@aws-amplify/ui-react";

const CATEGORIES = [
    {
        name: "Liu Lab",
        links: [
            { name: "Liu lab website", url: "https://liugroup.us",
              desc: "The Liu group at the Broad Institute and Harvard." },
            { name: "Protocols paper",
              url: "https://drive.google.com/file/d/1eJnqpipJuSpw7fiWFxEuUC20jH5URJve/view",
              desc: "Our Nature Protocols paper — start here if you're new to prime editing." },
            { name: "Addgene plasmids", url: "https://www.addgene.org/David_Liu/",
              desc: "All Liu lab prime editing plasmids on Addgene." },
        ],
    },
    {
        name: "Prime editing",
        links: [
            { name: "PRIDICT", url: "https://pridict.it",
              desc: "Predict prime editing efficiencies (Schwank lab)." },
            { name: "DeepPrime", url: "https://deepcrispr.info/DeepPrime/",
              desc: "Predict prime editing efficiencies (Kim lab)." },
        ],
    },
    {
        name: "Base editing",
        links: [
            { name: "BE-Hive", url: "https://crisprbehive.design",
              desc: "Predict base editing outcomes (cytidine/adenine deaminase)." },
            { name: "DeepBE", url: "http://deepcrispr.info/DeepBE/",
              desc: "Predict base editing outcomes (Kim lab)." },
        ],
    },
    {
        name: "Cas9 nuclease",
        horizontal: true,
        links: [
            { name: "inDelphi", url: "https://crisprindelphi.design",
              desc: "Predict indel outcomes from Cas9 cleavage." },
            { name: "Lindel", url: "https://lindel.gs.washington.edu/Lindel/",
              desc: "Predict indel outcomes from Cas9 cleavage (Shendure lab)." },
            { name: "FORECasT", url: "https://partslab.sanger.ac.uk/FORECasT",
              desc: "Predict mutational profiles from Cas9 cleavage (Sanger)." },
            { name: "CRISPOR", url: "http://crispor.tefor.net",
              desc: "Guide design with off-target and outcome predictions." },
            { name: "CHOPCHOP", url: "https://chopchop.cbu.uib.no/",
              desc: "Guide design with Doench on-target efficiency scoring." },
        ],
    },
];

const LinkCard = ({ name, url, desc, imgUrl }) => {
    const [hover, setHover] = useState(false);
    return (
        <a href={url} target="_blank" rel="noopener noreferrer"
           style={{ textDecoration: "none", color: "inherit", flex: "0 0 auto" }}>
            <Card variation="outlined" width="280px"
                  onMouseEnter={() => setHover(true)}
                  onMouseLeave={() => setHover(false)}
                  backgroundColor={hover ? "#e8f0fe" : "white"}
                  style={{ transition: "background-color 0.15s ease",
                           cursor: "pointer" }}>
                {imgUrl && (
                    <Image alt={name} src={imgUrl} width="100%" height="120px"
                           objectFit="contain" marginBottom="0.5em" />
                )}
                <Heading level={4}>{name}</Heading>
                <Text fontSize="0.9em">{desc}</Text>
            </Card>
        </a>
    );
};

const Other = () => (
    <View width="80%" paddingBottom="10em">
        {CATEGORIES.map(({ name, links, horizontal }) => (
            <View key={name} marginTop="1.5em">
                <Heading level={3}>{name}</Heading>
                {horizontal ? (
                    <View marginTop="0.5em" style={{ overflowX: "auto" }}>
                        <Flex direction="row" wrap="nowrap" gap="1em"
                              paddingBottom="0.5em">
                            {links.map((l) => <LinkCard key={l.url} {...l} />)}
                        </Flex>
                    </View>
                ) : (
                    <Flex direction="row" wrap="wrap" gap="1em" marginTop="0.5em">
                        {links.map((l) => <LinkCard key={l.url} {...l} />)}
                    </Flex>
                )}
            </View>
        ))}
    </View>
);

export default Other;
