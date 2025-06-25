import React, { Suspense, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    Button, Card, Flex, Grid, Heading, TextField, useTheme, Text
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

/**
 * Select k diverse pegRNAs via MDS‐inspired maximin sampling
 * using Hamming distance with transition/transversion penalties
 * plus Shannon‐entropy penalty.
 *
 * @param {Array<{id: string, sequence: string}>} seqs
 * @param {number} k  number of pegRNAs to select
 * @param {Object} options
 * @param {number} options.transitionPenalty  penalty for purine↔purine or pyrimidine↔pyrimidine mismatches
 * @param {number} options.transversionPenalty  penalty for purine↔pyrimidine mismatches
 * @param {number} options.entropyWeight     weight on Shannon‐entropy difference
 * @returns {string[]}  IDs of the k most diverse pegRNAs
 */
function selectDiversePegRNAs(seqs, k, options = {}) {
  const {
    transitionPenalty = 0.5,
    transversionPenalty = 1.0,
    entropyWeight = 0.1
  } = options;

  const n = seqs.length;
  if (k > n) throw new Error("k must be ≤ number of sequences");

  // 1) Compute Shannon entropy for each sequence
  const entropies = seqs.map(({ sequence }) => {
    const counts = {};
    for (const c of sequence) {
      counts[c] = (counts[c] || 0) + 1;
    }
    const L = sequence.length;
    let ent = 0;
    for (const c in counts) {
      const p = counts[c] / L;
      ent -= p * Math.log2(p);
    }
    return ent;
  });

  // 2) Build custom distance matrix D[i][j]
  const purines = new Set(["A", "G"]);
  const pyrimidines = new Set(["C", "T"]);
  const D = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s1 = seqs[i].sequence;
      const s2 = seqs[j].sequence;
      const L = Math.max(s1.length, s2.length);
      let wsum = 0;
      for (let pos = 0; pos < Math.min(s1.length, s2.length); pos++) {
        const a = s1[pos], b = s2[pos];
        if (a === b) continue;
        if (
          (purines.has(a) && purines.has(b)) ||
          (pyrimidines.has(a) && pyrimidines.has(b))
        ) {
          wsum += transitionPenalty;
        } else {
          wsum += transversionPenalty;
        }
      }
      const dSeq = wsum / L;
      const dEnt = entropyWeight * Math.abs(entropies[i] - entropies[j]);
      const d = dSeq + dEnt;
      D[i][j] = D[j][i] = d;
    }
  }

  // 3) Maximin (farthest‐point) sampling
  const chosen = [Math.floor(Math.random() * n)];
  while (chosen.length < k) {
    let bestIdx = -1, bestDist = -Infinity;
    for (let i = 0; i < n; i++) {
      if (chosen.includes(i)) continue;
      // min distance to any already‐chosen point
      const minDist = Math.min(...chosen.map(j => D[i][j]));
      if (minDist > bestDist) {
        bestDist = minDist;
        bestIdx = i;
      }
    }
    chosen.push(bestIdx);
  }

  // Return the IDs of selected pegRNAs
  return chosen.map(i => seqs[i].id);
}

const JobComponent = () => {
    const { tokens } = useTheme();
    const { jid } = useParams();
    const jobDataResource = useJobDataResource(jid);
    const jobData = jobDataResource.read();  // Blocks until data is ready
    const [dispData, setDispData] = useState(jobData);
    const [protoAnns, setProtoAnns] = useState([]);
    const [summary, setSummary] = useState({});
    const [diverseCount, setDiverseCount] = useState(5);
    const [diverseResults, setDiverseResults] = useState([]);
    const [optiPrimeResults, setOptiPrimeResults] = useState([]);
    const [showDebug, setShowDebug] = useState(false);
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
        console.log("Fetching summary for job:", jid);
        fetchAuth("id_token", `https://api.optipri.me/summary/${jid}`)
        .then(resp => {
            console.log("Summary API response status:", resp.status);
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
            }
            return resp.json();
        })
        .then(data => {
            console.log("Raw summary data:", data);
            
            if (!data || Object.keys(data).length === 0) {
                throw new Error("No summary data received from API. The job may not have OptiPrime scores available yet.");
            }
            
            // Try different data structures
            let summaryData = {};
            
            // Check if data has the expected structure
            if (data && typeof data === 'object') {
                const keys = Object.keys(data);
                console.log("Data keys:", keys);
                
                // Try to find OptiPrime scores in different possible structures
                for (const key of keys) {
                    const entry = data[key];
                    console.log(`Processing key ${key}:`, entry);
                    
                    if (entry && typeof entry === 'object') {
                        // Check for OptiPrime_score field
                        if (entry.OptiPrime_score && typeof entry.OptiPrime_score === 'object') {
                            const scores = Object.keys(entry.OptiPrime_score)
                                .map(k => [k, entry.OptiPrime_score[k]])
                                .toSorted((a, b) => b[1] - a[1]);
                            summaryData[key] = scores;
                        }
                        // Check if entry itself is a score object
                        else if (typeof entry === 'object' && !Array.isArray(entry)) {
                            const scores = Object.keys(entry)
                                .map(k => [k, entry[k]])
                                .toSorted((a, b) => b[1] - a[1]);
                            summaryData[key] = scores;
                        }
                    }
                }
            }
            
            if (Object.keys(summaryData).length === 0) {
                throw new Error("Summary data received but no valid OptiPrime scores found. The data structure may be unexpected.");
            }
            
            console.log("Processed summary data:", summaryData);
            setSummary(summaryData);
            
            // Auto-generate comparison if we have data
            if (Object.keys(summaryData).length > 0 && jobData.subJobData && jobData.subJobData.length > 0) {
                console.log("Auto-generating comparison...");
                setTimeout(() => generatePegRNAComparison(), 100);
            }
        })
        .catch(error => {
            console.error("Error fetching summary:", error);
            setSummary({});
            // Show error message to user
            alert(`Failed to load OptiPrime scores: ${error.message}`);
        });
    }, [jid, jobData.subJobData, jobData.subJobIDs]);

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
        const name = event.name.split(" ")[0];
        if ((event.type === "ANNOTATION") && (name in nameMap)) {
            const sID = nameMap[name];
            if (sID in summary) {
                console.log(summary[sID]);
            }
        }
    }

    // Generate diverse pegRNAs and OptiPrime top results
    const generatePegRNAComparison = () => {
        if (!jobData.subJobData || jobData.subJobData.length === 0) {
            console.log("No subJobData available");
            return;
        }

        // Check if summary data is available
        if (!summary || Object.keys(summary).length === 0) {
            alert("No OptiPrime scores available. Please ensure the job has completed and scores are available.");
            return;
        }

        console.log("SubJobData length:", jobData.subJobData.length);

        // Prepare sequences for diverse selection
        const seqs = jobData.subJobData.map((sj, index) => ({
            id: jobData.subJobIDs[index],
            sequence: sj.unedited || ""
        })).filter(seq => seq.sequence.length > 0);

        if (seqs.length === 0) {
            console.log("No valid sequences found");
            return;
        }

        try {
            // Get diverse pegRNAs (no scores)
            const diverseIds = selectDiversePegRNAs(seqs, Math.min(diverseCount, seqs.length));
            const diversePegRNAs = diverseIds.map(id => {
                const index = jobData.subJobIDs.indexOf(id);
                const sj = jobData.subJobData[index];
                const name = sj.name.split("_").pop();
                return {
                    id,
                    name,
                    sequence: sj.unedited
                };
            });
            setDiverseResults(diversePegRNAs);

            // Generate OptiPrime results - requires real summary data
            console.log("Generating OptiPrime results...");
            
            const optiPrimeTop = Object.keys(summary)
                .filter(id => {
                    const index = jobData.subJobIDs.indexOf(id);
                    return index !== -1 && jobData.subJobData[index] && summary[id] && summary[id].length > 0;
                })
                .map(id => {
                    const index = jobData.subJobIDs.indexOf(id);
                    const sj = jobData.subJobData[index];
                    const name = sj.name.split("_").pop();
                    const score = summary[id][0][1];
                    return {
                        id,
                        name,
                        sequence: sj.unedited,
                        score: score.toFixed(3)
                    };
                })
                .sort((a, b) => parseFloat(b.score) - parseFloat(a.score))
                .slice(0, diverseCount);

            console.log("OptiPrime top results:", optiPrimeTop);
            console.log("OptiPrime results length:", optiPrimeTop.length);
            setOptiPrimeResults(optiPrimeTop);
        } catch (error) {
            console.error("Error generating pegRNA comparison:", error);
            alert(`Error generating comparison: ${error.message}`);
        }
    };

    return (
        <Grid
            rowGap="15px"
            columnGap={tokens.space.medium.value}
            padding="20px"
            width="95%"
            templateColumns="1fr 1000px 1fr"
            style={{ height: "auto" }}
        >
            <Card columnStart="1" columnEnd="-1" padding="0px" height="100px">
                <Heading level={2} children={jobData.name} />
                <Text color="gray">Job Status: {jobData.status}</Text>
                <Text color="gray">Job ID: {jid}</Text>
            </Card>
            <Card column="2" style={{
                justifyContent: "center",
                alignContent: "center",
                display: "flex",
                height: "80px"
            }}>
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
            
            {/* PegRNA Comparison Section */}
            <Card columnStart="1" columnEnd="-1" padding="20px">
                <Heading level={3} children="pegRNA selection" />
                <Flex gap="20px" alignItems="center" marginBottom="20px">
                    <Text>Number of pegRNAs to compare:</Text>
                    <TextField
                        type="number"
                        value={diverseCount}
                        onChange={e => setDiverseCount(parseInt(e.target.value) || 5)}
                        min={1}
                        max={jobData.subJobData?.length || 100}
                        style={{ width: "100px" }}
                    />
                    <Button onClick={generatePegRNAComparison}>
                        Generate Comparison
                    </Button>
                    <Button 
                        onClick={() => {
                            console.log("=== DEBUG DATA STRUCTURES ===");
                            console.log("Summary object:", JSON.stringify(summary, null, 2));
                            console.log("SubJobData array:", JSON.stringify(jobData.subJobData, null, 2));
                            console.log("SubJobIDs array:", JSON.stringify(jobData.subJobIDs, null, 2));
                            console.log("Summary keys:", Object.keys(summary));
                            console.log("SubJobIDs length:", jobData.subJobIDs.length);
                            
                            // Check for matching IDs
                            const summaryKeys = Object.keys(summary);
                            const matchingIds = summaryKeys.filter(id => jobData.subJobIDs.includes(id));
                            console.log("Matching IDs:", matchingIds);
                            console.log("Matching count:", matchingIds.length);
                            
                            // Show all summary entries
                            console.log("=== ALL SUMMARY ENTRIES ===");
                            summaryKeys.forEach(key => {
                                console.log(`Summary entry for ${key}:`, JSON.stringify(summary[key], null, 2));
                            });
                            
                            // Show all subJobData entries
                            console.log("=== ALL SUBJOB DATA ENTRIES ===");
                            jobData.subJobData.forEach((sj, index) => {
                                console.log(`SubJobData[${index}] (ID: ${jobData.subJobIDs[index]}):`, JSON.stringify(sj, null, 2));
                            });
                            
                            if (matchingIds.length > 0) {
                                const firstMatch = matchingIds[0];
                                const index = jobData.subJobIDs.indexOf(firstMatch);
                                console.log("=== FIRST MATCHING ENTRY ===");
                                console.log("First matching ID:", firstMatch);
                                console.log("Index in subJobIDs:", index);
                                console.log("SubJobData at index:", JSON.stringify(jobData.subJobData[index], null, 2));
                                console.log("Summary data for ID:", JSON.stringify(summary[firstMatch], null, 2));
                            } else {
                                console.log("=== NO MATCHING IDS FOUND ===");
                                console.log("This is why OptiPrime results aren't showing!");
                            }
                        }}
                    >
                        Debug Data
                    </Button>
                    <Button 
                        onClick={() => setShowDebug(!showDebug)}
                    >
                        {showDebug ? "Hide Debug" : "Show Debug"}
                    </Button>
                    <Button 
                        onClick={() => {
                            console.log("Manual refresh of summary data");
                            fetchAuth("id_token", `https://api.optipri.me/summary/${jid}`)
                                .then(resp => resp.json())
                                .then(data => {
                                    console.log("Manual refresh - raw data:", data);
                                    const summaryData = Object.fromEntries(
                                        Object.keys(data || {})
                                        .map(k => {
                                            const subData = data[k]["OptiPrime_score"];
                                            return [k, Object.keys(subData || {})
                                                .map(k => [k, subData[k]])
                                                .toSorted((a, b) => b[1] - a[1])];
                                        })
                                    );
                                    setSummary(summaryData);
                                    console.log("Manual refresh - processed data:", summaryData);
                                })
                                .catch(error => console.error("Manual refresh error:", error));
                        }}
                    >
                        Refresh Summary
                    </Button>
                    {Object.keys(summary).length === 0 && (
                        <Text color="orange">Loading OptiPrime scores... (Job ID: {jid})</Text>
                    )}
                    {Object.keys(summary).length > 0 && (
                        <Text color="green">✓ OptiPrime scores loaded ({Object.keys(summary).length} pegRNAs)</Text>
                    )}
                    {optiPrimeResults.length > 0 && Object.keys(summary).length === 0 && (
                        <Text color="blue">⚠ Using generated scores (no API data available)</Text>
                    )}
                </Flex>
                
                {(diverseResults.length > 0 || optiPrimeResults.length > 0) && (
                    <Grid templateColumns="1fr 1fr" gap="20px">
                        {/* Diverse PegRNAs */}
                        <Card padding="15px">
                            <Heading level={4} children="Diverse pegRNAs" />
                            <Text fontSize="14px" color="gray" marginBottom="10px">
                                Most diverse selection based on sequence similarity, Shannon entropy, and transition/transversion penalty
                            </Text>
                            {diverseResults.length > 0 ? (
                                diverseResults.map((pegRNA, index) => (
                                    <Card key={pegRNA.id} padding="10px" marginBottom="10px" backgroundColor="#f8f9fa">
                                        <Flex justifyContent="space-between" alignItems="center">
                                            <Text fontWeight="bold">{pegRNA.name}</Text>
                                        </Flex>
                                        <Text fontSize="12px" fontFamily="monospace" marginTop="5px">
                                            {pegRNA.sequence}
                                        </Text>
                                    </Card>
                                ))
                            ) : (
                                <Text color="gray">No diverse results generated yet</Text>
                            )}
                        </Card>
                        
                        {/* OptiPrime Top Results */}
                        <Card padding="15px">
                            <Heading level={4} children="OptiPrime Top Results" />
                            <Text fontSize="14px" color="gray" marginBottom="10px">
                                Highest scoring pegRNAs by OptiPrime algorithm
                            </Text>
                            {optiPrimeResults.length > 0 ? (
                                optiPrimeResults.map((pegRNA, index) => (
                                    <Card key={pegRNA.id} padding="10px" marginBottom="10px" backgroundColor="#f8f9fa">
                                        <Flex justifyContent="space-between" alignItems="center">
                                            <Text fontWeight="bold">{pegRNA.name}</Text>
                                            <Text color="green">Score: {pegRNA.score}</Text>
                                        </Flex>
                                        <Text fontSize="12px" fontFamily="monospace" marginTop="5px">
                                            {pegRNA.sequence}
                                        </Text>
                                    </Card>
                                ))
                            ) : (
                                <Text color="gray">No OptiPrime results generated yet</Text>
                            )}
                        </Card>
                    </Grid>
                )}
                
                {diverseResults.length === 0 && optiPrimeResults.length === 0 && Object.keys(summary).length > 0 && (
                    <Text color="gray" textAlign="center" marginTop="20px">
                        Click "Generate Comparison" to see the results
                    </Text>
                )}
                
                {/* Debug Display Section */}
                {showDebug && (
                    <Card padding="20px" marginTop="20px" backgroundColor="#f5f5f5">
                        <Heading level={4} children="Debug Information" />
                        <Grid templateColumns="1fr 1fr" gap="20px">
                            <Card padding="15px">
                                <Heading level={5} children="Summary Data" />
                                <Text fontSize="12px" fontFamily="monospace" whiteSpace="pre-wrap">
                                    {JSON.stringify(summary, null, 2)}
                                </Text>
                            </Card>
                            <Card padding="15px">
                                <Heading level={5} children="SubJobIDs" />
                                <Text fontSize="12px" fontFamily="monospace" whiteSpace="pre-wrap">
                                    {JSON.stringify(jobData.subJobIDs, null, 2)}
                                </Text>
                            </Card>
                        </Grid>
                        <Card padding="15px" marginTop="15px">
                            <Heading level={5} children="SubJobData (First 3 entries)" />
                            <Text fontSize="12px" fontFamily="monospace" whiteSpace="pre-wrap">
                                {JSON.stringify(jobData.subJobData.slice(0, 3), null, 2)}
                            </Text>
                        </Card>
                        <Card padding="15px" marginTop="15px">
                            <Heading level={5} children="Matching Analysis" />
                            <Text>
                                Summary keys: {Object.keys(summary).length}
                            </Text>
                            <Text>
                                SubJobIDs: {jobData.subJobIDs.length}
                            </Text>
                            <Text>
                                Matching IDs: {Object.keys(summary).filter(id => jobData.subJobIDs.includes(id)).length}
                            </Text>
                            <Text>
                                Matching IDs: {Object.keys(summary).filter(id => jobData.subJobIDs.includes(id)).join(', ')}
                            </Text>
                        </Card>
                    </Card>
                )}
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
            <Flex justifyContent="space-between">
            </Flex>
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
