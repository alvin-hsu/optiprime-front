import React, { Suspense, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
    Button, Card, Grid, Heading, useTheme
} from "@aws-amplify/ui-react";

import ErrorBoundary from "./Error";
import { fetchAuth, suspensePromiseWrapper, revcomp, downloadBinary } from "./Utils";
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
    const [protoAnns, setProtoAnns] = useState([]);
    const [summary, setSummary] = useState({});
    const ref = useRef(null);

    const sjMap = Object.fromEntries(jobData.subJobData
                  .map((sj, i) => [jobData.subJobIDs[i], sj]));
    const nameMap = Object.fromEntries(jobData.subJobData
                   .map((sj, i) => {
                       let name = sj.name.split("_");
                       name = name[name.length - 1];
                       const sID = jobData.subJobIDs[i];
                       return [name, sID];
                   }));


    // Set protospacer annotations
    useEffect(() => {
        setProtoAnns(
            Object.keys(nameMap)
            .map(name => {
                const sID = nameMap[name];
                let color;
                if (sID in summary) {
                    color = (name.slice(0, 5) === "SpNGG") ? "lightblue" : "pink";
                    const bestScore = summary[sID][0][1];
                    name = `${name} [OP ${bestScore.toFixed(3)}]`
                } else {
                    color = "gray";
                }
                const sj = sjMap[sID];
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
            })
        );
    }, [nameMap, sjMap, summary, jobData.uneditedData.seq]);

    // Get summary
    useEffect(() => {
        fetchAuth("id_token", "https://api.optipri.me/summary/c132b9ee35")
        .then(resp => {
            if (!resp.ok) {
                throw new Error(resp.statusCode);
            }
            return resp.json();
        })
        .then(data => {
            setSummary(Object.fromEntries(
                           Object.keys(data)
                           .map(k => {
                               const subData = data[k]["OptiPrime_score"];
                               return [k, Object.keys(subData)
                                          .map(k => [k, subData[k]])
                                          .toSorted((a, b) => b[1] - a[1])];

                           })
                       ));
        });
    }, [jid]);

    // Add highlights
    useEffect(() => editHighlights(ref, jobData, setJobData),
              [ref, jobData.uneditedData.seq, jobData.editedData.seq]);  // eslint-disable-line

    // Custom selection handler for protospacers
    const psHandler = (event) => {
        if ((event.type === "ANNOTATION") && (event.name in nameMap)) {
            const sID = nameMap[event.name];
            if (sID in summary) {
                console.log(summary[sID]);
            }
        }
    }

    return (
        <Grid
            rowGap="15px"
            columnGap={tokens.space.medium.value}
            padding="20px"
            width="95%"
            templateColumns="1fr 800px 1fr"
        >
            <Card columnStart="1" columnEnd="-1" padding="0px" height="100px">
                <Heading level={2} children={jobData.name} />
            </Card>
            <Card columnStart="1" columnEnd="-1">
                <div ref={ref}>
                    <Heading children={`Unedited sequence: ${jobData.uneditedData.name}`} />
                    <SeqVizWithCDS seqData={{ ...jobData.uneditedData, annotations: protoAnns }}
                                   selHandler={psHandler} />
                </div>
                <Heading children={`Edited sequence: ${jobData.editedData.name}`} />
                <SeqVizWithCDS seqData={jobData.editedData} />
            </Card>
            <Card>
                <Button
                    style={{
                        width: "150px",
                        height: "30px",
                    }}
                    onClick={() => {
                        fetchAuth("ac_token", `https://storage.optipri.me/top1/${jid}`)
                        .then(downloadBinary)
                    }}
                >
                    Download top1
                </Button>
                <Button
                    style={{
                        width: "150px",
                        height: "30px",
                    }}
                    onClick={() => {
                        fetchAuth("ac_token", `https://storage.optipri.me/full_outputs/${jid}`)
                        .then(downloadBinary)
                    }}
                >
                    Download full
                </Button>
                <Button
                    style={{
                        width: "150px",
                        height: "30px",
                    }}
                    onClick={() => {
                        fetchAuth("ac_token", `https://storage.optipri.me/edit_mapping/${jid}`)
                        .then(downloadBinary)
                    }}
                >
                    Edit mapping
                </Button>
            </Card>
        </Grid>
    );
};

const Job = () => {
    return (
        <ErrorBoundary>
            <Suspense fallback={<div>Loading data...</div>}>  {/* DC TODO: style fallback */}
                <JobComponent />
            </Suspense>
        </ErrorBoundary>
    );
};

export default Job;
