import React, { Suspense, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    Button, Card, Grid, Heading, useTheme
} from "@aws-amplify/ui-react";

import ErrorBoundary from "./Error";
import { fetchAuth, suspensePromiseWrapper, revcomp, downloadBinary, minEdit } from "./Utils";
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
    const jobData = jobDataResource.read();  // Blocks until data is ready
    const [dispData, setDispData] = useState(jobData);
    const [protoAnns, setProtoAnns] = useState([]);
    const [summary, setSummary] = useState({});
    const navigate = useNavigate();
    const ref = useRef(null);

    // FOR DEBUGGING
    useEffect(() => {
        let upperState = jobData
        upperState.uneditedData.seq = jobData.uneditedData.seq.toUpperCase();
        upperState.editedData.seq = jobData.editedData.seq.toUpperCase();
        const {minU, minE, preLen} = minEdit(upperState.uneditedData.seq, upperState.editedData.seq);
        window.printState = () => {
            console.log(JSON.stringify(JSON.stringify(upperState)));
        };
        window.printPridict = () => {
            const uSeq = upperState.uneditedData.seq;
            const preSeq = uSeq.slice(preLen - 100, preLen);
            const postSeq = uSeq.slice(preLen + minU.length, preLen + minU.length + 100);
            const u = minU.length === 0 ? "+" : minU;
            const e = minE.length === 0 ? "-" : minE;
            console.log(`${preSeq}(${u}/${e})${postSeq}`);
        };
        window.printDeepPrime = () => {
            const uSeq = upperState.uneditedData.seq;
            const eSeq = upperState.editedData.seq;
            console.log(uSeq.slice(preLen - 60, preLen + 61));
            console.log(eSeq.slice(preLen - 60, preLen + 61));
        };
        window.getStateObject = () => upperState;
    }, [jobData]);

    // Set protospacer annotations
    useEffect(() => {
        const sjMap = Object.fromEntries(jobData.subJobData
                  .map((sj, i) => [jobData.subJobIDs[i], sj]));
        const nameMap = Object.fromEntries(jobData.subJobData
                        .map((sj, i) => {
                            let name = sj.name.split("_");
                            name = name[name.length - 1];
                            const sID = jobData.subJobIDs[i];
                            return [name, sID];
                        }));
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
    }, [jobData, summary]);

    // Get summary
    useEffect(() => {
        fetchAuth("id_token", `https://api.optipri.me/summary/${jid}`)
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
        })
        .catch(err => {});  // Ignore errors
    }, [jid]);

    // Add highlights
    useEffect(() => editHighlights(ref, dispData, setDispData),
              [ref, dispData.uneditedData.seq, dispData.editedData.seq]);  // eslint-disable-line

    // Custom selection handler for protospacers
    const psHandler = (event) => {
        const nameMap = Object.fromEntries(jobData.subJobData
                        .map((sj, i) => {
                            let name = sj.name.split("_");
                            name = name[name.length - 1];
                            const sID = jobData.subJobIDs[i];
                            return [name, sID];
                        }));
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
                    <SeqVizWithCDS seqData={{ ...dispData.uneditedData, annotations: protoAnns }}
                                   selHandler={psHandler} />
                </div>
                <Heading children={`Edited sequence: ${jobData.editedData.name}`} />
                <SeqVizWithCDS seqData={dispData.editedData} />
            </Card>
            <Card columnStart="1" columnEnd="-1">
                <Button
                    style={{
                        width: "200px",
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
                        width: "200px",
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
                        width: "200px",
                        height: "30px",
                    }}
                    onClick={() => {
                        fetchAuth("ac_token", `https://storage.optipri.me/edit_mapping/${jid}`)
                        .then(downloadBinary)
                    }}
                >
                    Edit mapping
                </Button>
                <Button
                    style={{
                        width: "200px",
                        height: "30px",
                    }}
                    onClick={() => {
                        const state = {
                            projName: jobData.name,
                            organism: "",
                            cvID: "",
                            rsID: "",
                            assembly: "",
                            chrCoords: "",
                            taxId: "",
                            uneditedData: jobData.uneditedData,
                            editedData: jobData.editedData,
                            manual: true,
                            existingSubJobs: []  /* FIXME */
                        };
                        navigate("/design", { state })
                    }}
                >
                    Clone to new job
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
