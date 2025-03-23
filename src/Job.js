import React, { Suspense, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
    Card, Grid, Heading, useTheme
} from "@aws-amplify/ui-react";

import ErrorBoundary from "./Error";
import { fetchAuth, suspensePromiseWrapper, revcomp } from "./Utils";
import { SeqVizWithCDS, editHighlights } from "./ModdedSeqViz"


let resource = {};

const fetchJobData = async (jobID) => {
    if (!jobID) { throw new Error("Job ID required"); }
    const resp = await fetchAuth("ac_token", `https://api.optipri.me/jobs/${jobID}`);
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`[${resp.status}] ${text}`);
    }
    const data = await resp.json();
    data.subJobData = JSON.parse(data.subJobData.S);
    data.editedData = JSON.parse(data.editedData.S);
    data.status = data.status.S;
    data.subJobIDs = JSON.parse(data.subJobIDs.S);
    data.subJobMap = JSON.parse(data.subJobMap.S);
    data.uneditedData = JSON.parse(data.uneditedData.S);
    data.name = data.name.S;
    return data;
};

// TODO: Figure out why this doesn't update
const useJobDataResource = (jobID) => {
    if (!(jobID in resource) || typeof resource[jobID] === "undefined") {
        resource[jobID] = suspensePromiseWrapper(fetchJobData(jobID));
    }
    return resource[jobID];
};

const JobComponent = () => {
    const { tokens } = useTheme();
    const { jid } = useParams();
    const jobDataResource = useJobDataResource(jid);
    const [jobData, setJobData] = useState(jobDataResource.read());  // Blocks until data is ready
    const ref = useRef(null);

    console.log(jobData);  // AH TODO: remove in production
    const protoAnns = jobData.subJobData
    .map((sj, i) => {
        let name = sj.name.split("_");
        name = name[name.length - 1];
        const sjID = jobData.subJobIDs[i];
        const jID = jobData.subJobMap[sjID];
        // DC TODO: set color based on jID status
        const color = "gray";
        const uFwd = jobData.uneditedData.seq;
        const uRev = revcomp(uFwd);
        let idx, start, end, direction;
        idx = uFwd.indexOf(sj.unedited);
        if (idx >= 0) {
            start = idx + 4;
            end = idx + 24;
            direction = 1;
        } else {
            const uLen = uFwd.length;
            idx = uRev.indexOf(sj.unedited);
            start = uLen - (idx + 24);
            end = uLen - (idx + 4);
            direction = -1;
        }
        return { name, color, start, end, direction };
    });

    // Add highlights
    useEffect(() => editHighlights(ref, jobData, setJobData),
              [ref, jobData.uneditedData.seq, jobData.editedData.seq]);  // eslint-disable-line

    return (
        <Grid
            rowGap="15px"
            columnGap={tokens.space.medium.value}
            padding="20px"
            width="95%"
            templateColumns="1fr 800px 1fr"
        >
            <Card columnStart="1" columnEnd="-1" padding="0px">
                <Heading level={2} children={jobData.name} />
            </Card>
            <Card columnStart="1" columnEnd="-1">
                <div ref={ref}>
                    <Heading children={`Unedited sequence: ${jobData.uneditedData.name}`} />
                    <SeqVizWithCDS seqData={{ ...jobData.uneditedData, annotations: protoAnns }}  />
                </div>
                <Heading children={`Edited sequence: ${jobData.editedData.name}`} />
                <SeqVizWithCDS seqData={jobData.editedData} />
            </Card>
        </Grid>
    );
};

const Job = () => {
    return (
        <ErrorBoundary>
            <Suspense fallback={<div>Loading data...</div>}>
                <JobComponent />
            </Suspense>
        </ErrorBoundary>
    );
};

export default Job;
