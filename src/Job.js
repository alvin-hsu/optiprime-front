import React, { Suspense, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    Button, Card, Flex, Grid, Heading, useTheme, Text
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

/**
 * Select k diverse pegRNAs with OptiPrime score bias
 * @param {Array<{id: string, sequence: string}>} seqs - sequence data
 * @param {Array} allCandidates - all candidate sequences with scores
 * @param {number} k - number of pegRNAs to select
 * @param {number} bias - bias level (0 = pure diversity, 1 = pure score)
 * @param {string} method - bias method
 * @returns {string[]} IDs of selected pegRNAs
 */
function selectDiversePegRNAsWithBias(seqs, allCandidates, k, bias, method) {
    const n = seqs.length;
    if (k > n) throw new Error("k must be ≤ number of sequences");

    // Create a map of id to score for quick lookup
    const scoreMap = new Map();
    allCandidates.forEach(candidate => {
        scoreMap.set(candidate.id, candidate.score);
    });

    // Normalize scores to 0-1 range
    const scores = Array.from(scoreMap.values());
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const scoreRange = maxScore - minScore;
    
    const normalizedScores = new Map();
    scoreMap.forEach((score, id) => {
        normalizedScores.set(id, scoreRange > 0 ? (score - minScore) / scoreRange : 0.5);
    });

    if (method === 'weighted') {
        return selectDiversePegRNAsWeighted(seqs, normalizedScores, k, bias);
    } else if (method === 'filtered') {
        return selectDiversePegRNAsFiltered(seqs, normalizedScores, k, bias);
    } else if (method === 'hybrid') {
        return selectDiversePegRNAsHybrid(seqs, normalizedScores, k, bias);
    } else if (method === 'ranked') {
        return selectDiversePegRNAsRanked(seqs, normalizedScores, k, bias);
    } else {
        return selectDiversePegRNAs(seqs, k); // Fallback to original
    }
}

/**
 * Weighted distance method - combines sequence diversity and score in distance calculation
 */
function selectDiversePegRNAsWeighted(seqs, normalizedScores, k, bias) {
    const n = seqs.length;
    
    // Compute Shannon entropy for each sequence
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

    // Build weighted distance matrix
    const purines = new Set(["A", "G"]);
    const pyrimidines = new Set(["C", "T"]);
    const D = Array.from({ length: n }, () => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const s1 = seqs[i].sequence;
            const s2 = seqs[j].sequence;
            const L = Math.max(s1.length, s2.length);
            
            // Sequence distance
            let wsum = 0;
            for (let pos = 0; pos < Math.min(s1.length, s2.length); pos++) {
                const a = s1[pos], b = s2[pos];
                if (a === b) continue;
                if ((purines.has(a) && purines.has(b)) || (pyrimidines.has(a) && pyrimidines.has(b))) {
                    wsum += 0.5; // transition penalty
                } else {
                    wsum += 1.0; // transversion penalty
                }
            }
            const dSeq = wsum / L;
            const dEnt = 0.1 * Math.abs(entropies[i] - entropies[j]);
            
            // Score distance
            const score1 = normalizedScores.get(seqs[i].id) || 0.5;
            const score2 = normalizedScores.get(seqs[j].id) || 0.5;
            const dScore = Math.abs(score1 - score2);
            
            // Combine distances with bias
            const d = (1 - bias) * (dSeq + dEnt) + bias * dScore;
            D[i][j] = D[j][i] = d;
        }
    }

    // Maximin sampling
    const chosen = [Math.floor(Math.random() * n)];
    while (chosen.length < k) {
        let bestIdx = -1, bestDist = -Infinity;
        for (let i = 0; i < n; i++) {
            if (chosen.includes(i)) continue;
            const minDist = Math.min(...chosen.map(j => D[i][j]));
            if (minDist > bestDist) {
                bestDist = minDist;
                bestIdx = i;
            }
        }
        chosen.push(bestIdx);
    }

    return chosen.map(i => seqs[i].id);
}

/**
 * Score filtering method - filters by score threshold, then selects diverse
 */
function selectDiversePegRNAsFiltered(seqs, normalizedScores, k, bias) {
    // Sort by score and take top percentage based on bias
    const sortedByScore = seqs
        .map((seq, index) => ({ ...seq, index, score: normalizedScores.get(seq.id) || 0.5 }))
        .sort((a, b) => b.score - a.score);
    
    const filterThreshold = Math.floor(sortedByScore.length * (1 - bias));
    const filteredSeqs = sortedByScore.slice(0, Math.max(filterThreshold, k));
    
    // Apply original diverse selection on filtered set
    return selectDiversePegRNAs(filteredSeqs, Math.min(k, filteredSeqs.length));
}

/**
 * Hybrid selection method - alternates between diversity and score selection
 */
function selectDiversePegRNAsHybrid(seqs, normalizedScores, k, bias) {
    const n = seqs.length;
    const chosen = [];
    
    // Sort by score for score-based selection
    const sortedByScore = seqs
        .map((seq, index) => ({ ...seq, index, score: normalizedScores.get(seq.id) || 0.5 }))
        .sort((a, b) => b.score - a.score);
    
    // Calculate how many to select by each method
    const diversityCount = Math.floor(k * (1 - bias));
    const scoreCount = k - diversityCount;
    
    // Select by score first
    for (let i = 0; i < scoreCount && i < sortedByScore.length; i++) {
        chosen.push(sortedByScore[i].id);
    }
    
    // Select diverse from remaining
    const remainingSeqs = seqs.filter(seq => !chosen.includes(seq.id));
    if (remainingSeqs.length > 0) {
        // eslint-disable-next-line no-undef
        const diverseIds = selectDiversePegRNAs(remainingSeqs, Math.min(diversityCount, remainingSeqs.length));
        chosen.push(...diverseIds);
    }
    
    return chosen.slice(0, k);
}

/**
 * Ranked diversity method - ranks by score, then selects diverse from top N
 */
function selectDiversePegRNAsRanked(seqs, normalizedScores, k, bias) {
    // Sort by score
    const sortedByScore = seqs
        .map((seq, index) => ({ ...seq, index, score: normalizedScores.get(seq.id) || 0.5 }))
        .sort((a, b) => b.score - a.score);
    
    // Take top N based on bias (higher bias = smaller top N)
    const topN = Math.max(k, Math.floor(sortedByScore.length * (1 - bias)));
    const topSeqs = sortedByScore.slice(0, topN);
    
    // Select diverse from top N
    return selectDiversePegRNAs(topSeqs, Math.min(k, topSeqs.length));
}

// Decoding functions for pegRNA sequences
const MAP_RE = /[A-Z][a-z]*/;

// Helper function to extract spacer name from subJobData
const getSpacerName = (subJobData, subJobIDs, subJobID) => {
    const index = subJobIDs.indexOf(subJobID);
    if (index === -1 || !subJobData[index]) return '';
    
    const sj = subJobData[index];
    const nameParts = sj.name.split('_');
    return nameParts[nameParts.length - 1]; // Get the last part after the last underscore
};

// Function to decode a pegRNA name to its full sequence using edit segments
const decodePegRNAName = (pegRNAName, editSegments) => {
    try {
        // Extract the encoded part (before the first underscore)
        const encodedPart = pegRNAName.split('_')[0];
        console.log(`Decoding pegRNA name: ${pegRNAName}, encoded part: ${encodedPart}`);
        
        // Build the full sequence by processing each edit segment
        let fullSequence = '';
        let encodedIndex = 0;
        
        for (const segment of editSegments) {
            if (segment.length === 1) {
                // Fixed segment - just add it
                fullSequence += segment[0];
            } else {
                // Variable segment - need to decode which option to use
                if (encodedIndex < encodedPart.length) {
                    // Get the next character from the encoded part
                    const encodedChar = encodedPart[encodedIndex];
                    
                    // Find the index of this character in the alphabet (A=0, B=1, etc.)
                    const optionIndex = encodedChar.charCodeAt(0) - 65; // 'A' = 65 in ASCII
                    
                    // Use the corresponding option from the segment
                    if (optionIndex >= 0 && optionIndex < segment.length) {
                        fullSequence += segment[optionIndex];
                    } else {
                        // Fallback to first option if index is out of range
                        fullSequence += segment[0];
                    }
                    
                    encodedIndex++;
                } else {
                    // Fallback to first option if we run out of encoded characters
                    fullSequence += segment[0];
                }
            }
        }
        
        console.log(`Decoded sequence: ${fullSequence}`);
        return fullSequence;
    } catch (error) {
        console.error(`Error decoding pegRNA name ${pegRNAName}:`, error);
        return null;
    }
};

// Function to generate all possible sequences from edit segments
const generateAllSequences = (editSegments) => {
    const generateCombos = (lst) => {
        if (lst.length === 0) {
            return ['PE'];
        } else if (lst.length === 1) {
            return lst[0];
        } else {
            const result = [];
            for (const x0 of lst[0]) {
                for (const x1 of generateCombos(lst.slice(1))) {
                    result.push(x0 + x1);
                }
            }
            return result;
        }
    };
    
    return generateCombos(editSegments);
};

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
    const [allCandidateSequences, setAllCandidateSequences] = useState([]);
    const [hasGeneratedComparison, setHasGeneratedComparison] = useState(false);
    const [showAdvancedControls, setShowAdvancedControls] = useState(false);
    const [diversityBias, setDiversityBias] = useState(0.5); // 0 = pure diversity, 1 = pure score
    const [biasMethod, setBiasMethod] = useState('ranked'); // 'weighted', 'filtered', 'hybrid', 'ranked'
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
            
            // Handle different types of errors gracefully
            if (error.message && error.message.includes('HTTP 502')) {
                console.log("OptiPrime scores not available yet (server temporarily unavailable). This is normal for jobs that are still processing.");
                // Don't show alert for 502 errors - they're usually temporary
            } else if (error.message && error.message.includes('HTTP 404')) {
                console.log("OptiPrime scores not found for this job. The job may not have completed processing yet.");
                // Don't show alert for 404 errors - they're expected for incomplete jobs
            } else {
                // Only show alert for unexpected errors
                console.warn("Unexpected error loading OptiPrime scores:", error.message);
            }
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
            console.log("No OptiPrime scores available. Please ensure the job has completed and scores are available.");
            return;
        }

        console.log("SubJobData length:", jobData.subJobData.length);

        try {
            // Generate all candidate pegRNA sequences from summary data
            console.log("Generating all candidate sequences for diverse selection...");
            
            const allCandidateSequences = Object.keys(summary)
                .filter(id => {
                    const index = jobData.subJobIDs.indexOf(id);
                    return index !== -1 && jobData.subJobData[index] && summary[id] && summary[id].length > 0;
                })
                .flatMap(id => {
                    const index = jobData.subJobIDs.indexOf(id);
                    const sj = jobData.subJobData[index];
                    const editSegments = sj.edit_segments;
                    
                    // Decode all pegRNAs for this subJob
                    return summary[id].map(([pegRNAName, score]) => {
                        const fullSequence = decodePegRNAName(pegRNAName, editSegments);
                        const spacerName = getSpacerName(jobData.subJobData, jobData.subJobIDs, id);
                        const displayName = spacerName ? `${spacerName}_${pegRNAName}` : pegRNAName;
                        return {
                            id: `${id}_${pegRNAName}`,
                            name: displayName,
                            sequence: fullSequence || sj.unedited, // Fallback to unedited if decoding fails
                            score: score
                        };
                    });
                })
                .filter(candidate => candidate.sequence && candidate.sequence.length > 0);

            console.log(`Generated ${allCandidateSequences.length} candidate sequences for diverse selection`);

            // Prepare sequences for diverse selection (all decoded candidates)
            const seqs = allCandidateSequences.map(candidate => ({
                id: candidate.id,
                sequence: candidate.sequence
            }));

            if (seqs.length === 0) {
                console.log("No valid candidate sequences found");
                return;
            }

            // Get diverse pegRNAs from all candidates
            // eslint-disable-next-line no-undef
            const diverseIds = selectDiversePegRNAsWithBias(seqs, allCandidateSequences, Math.min(diverseCount, seqs.length), diversityBias, biasMethod);
            const diversePegRNAs = diverseIds.map(id => {
                const candidate = allCandidateSequences.find(c => c.id === id);
                return {
                    id: candidate.id,
                    name: candidate.name,
                    sequence: candidate.sequence
                };
            });
            setDiverseResults(diversePegRNAs);

            // Generate OptiPrime results with decoded sequences
            console.log("Generating OptiPrime results...");
            
            const optiPrimeTop = Object.keys(summary)
                .filter(id => {
                    const index = jobData.subJobIDs.indexOf(id);
                    return index !== -1 && jobData.subJobData[index] && summary[id] && summary[id].length > 0;
                })
                .flatMap(id => {
                    const index = jobData.subJobIDs.indexOf(id);
                    const sj = jobData.subJobData[index];
                    const editSegments = sj.edit_segments;
                    
                    console.log(`Processing subJob ${id} (index ${index}):`, sj.name);
                    console.log(`Edit segments:`, editSegments);
                    
                    // Process each pegRNA in the summary for this subJob
                    return summary[id].map(([pegRNAName, score]) => {
                        console.log(`Processing pegRNA: ${pegRNAName} with score: ${score}`);
                        
                        // Decode the full sequence from the pegRNA name
                        const fullSequence = decodePegRNAName(pegRNAName, editSegments);
                        const spacerName = getSpacerName(jobData.subJobData, jobData.subJobIDs, id);
                        const displayName = spacerName ? `${spacerName}_${pegRNAName}` : pegRNAName;
                        
                        return {
                            id: `${id}_${pegRNAName}`,
                            name: displayName,
                            sequence: fullSequence || sj.unedited, // Fallback to unedited if decoding fails
                            score: score.toFixed(3)
                        };
                    });
                })
                .sort((a, b) => parseFloat(b.score) - parseFloat(a.score))
                .slice(0, diverseCount);

            console.log("OptiPrime top results:", optiPrimeTop);
            console.log("OptiPrime results length:", optiPrimeTop.length);
            setOptiPrimeResults(optiPrimeTop);
            setAllCandidateSequences(allCandidateSequences);
            setHasGeneratedComparison(true);
        } catch (error) {
            console.error("Error generating pegRNA comparison:", error);
            console.warn("Failed to generate comparison. Please check the console for details.");
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
                    <input
                        type="number"
                        value={diverseCount}
                        onChange={e => {
                            const value = parseInt(e.target.value);
                            if (!isNaN(value) && value >= 1) {
                                setDiverseCount(value);
                            }
                        }}
                        onBlur={e => {
                            const value = parseInt(e.target.value);
                            if (isNaN(value) || value < 1) {
                                setDiverseCount(5);
                            }
                        }}
                        min={1}
                        step={1}
                        style={{ 
                            width: "100px", 
                            padding: "8px", 
                            borderRadius: "4px", 
                            border: "1px solid #ccc",
                            fontSize: "14px"
                        }}
                    />
                    <Button onClick={generatePegRNAComparison}>
                        Generate Comparison
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
                        <Text color="green">✓ OptiPrime scores loaded ({Object.keys(summary).length} spacers)</Text>
                    )}
                    {optiPrimeResults.length > 0 && Object.keys(summary).length === 0 && (
                        <Text color="blue">⚠ Using generated scores (no API data available)</Text>
                    )}
                </Flex>
                
                {/* Advanced Controls Checkbox - Only show after first generation */}
                {hasGeneratedComparison && (
                    <Card padding="15px" marginBottom="20px" backgroundColor="#f8f9fa">
                        <Flex alignItems="center" gap="10px">
                            <input
                                type="checkbox"
                                id="advancedControls"
                                checked={showAdvancedControls}
                                onChange={e => setShowAdvancedControls(e.target.checked)}
                                style={{ width: "16px", height: "16px" }}
                            />
                            <Text as="label" htmlFor="advancedControls" fontWeight="bold">
                                Advanced Controls
                            </Text>
                        </Flex>
                    </Card>
                )}
                
                {/* Diversity Bias Controls - Only show after first generation and when advanced controls are enabled */}
                {hasGeneratedComparison && showAdvancedControls && (
                    <Card padding="15px" marginBottom="20px" backgroundColor="#f8f9fa">
                        <Heading level={4} children="Diversity Bias Controls" />
                        <Grid templateColumns="1fr 1fr" gap="20px">
                            <Flex direction="column" gap="10px">
                                <Text>Diversity vs Score Bias: {diversityBias.toFixed(2)}</Text>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={diversityBias}
                                    onChange={e => setDiversityBias(parseFloat(e.target.value))}
                                    style={{ width: "100%" }}
                                />
                                <Flex justifyContent="space-between">
                                    <Text fontSize="12px">Pure Diversity</Text>
                                    <Text fontSize="12px">Pure Score</Text>
                                </Flex>
                            </Flex>
                            <Flex direction="column" gap="10px">
                                <Text>Bias Method:</Text>
                                <select
                                    value={biasMethod}
                                    onChange={e => setBiasMethod(e.target.value)}
                                    style={{ padding: "5px", borderRadius: "4px" }}
                                >
                                    <option value="weighted">Weighted Distance</option>
                                    <option value="filtered">Score Filtering</option>
                                    <option value="hybrid">Hybrid Selection</option>
                                    <option value="ranked">Ranked Diversity</option>
                                </select>
                                <Text fontSize="12px" color="gray">
                                    {biasMethod === 'weighted' && "Combines diversity and score in distance calculation"}
                                    {biasMethod === 'filtered' && "Filters by score threshold, then selects diverse"}
                                    {biasMethod === 'hybrid' && "Alternates between diversity and score selection"}
                                    {biasMethod === 'ranked' && "Ranks by score, then selects diverse from top N"}
                                </Text>
                            </Flex>
                        </Grid>
                    </Card>
                )}
                
                {(diverseResults.length > 0 || optiPrimeResults.length > 0) && (
                    <>
                        {/* Statistics Section - Above the columns */}
                        <Grid templateColumns="1fr 1fr" gap="20px" marginBottom="20px">
                            {/* Diverse PegRNAs Statistics */}
                            <Card padding="15px" backgroundColor="#e3f2fd">
                                <Heading level={4} children="Diverse PegRNAs Statistics" />
                                {(() => {
                                    const scores = diverseResults.map(pegRNA => {
                                        // eslint-disable-next-line no-undef
                                        const candidate = allCandidateSequences.find(c => c.id === pegRNA.id);
                                        return candidate ? candidate.score : null;
                                    }).filter(score => score !== null);
                                    
                                    if (scores.length === 0) {
                                        return <Text color="gray">No scores available</Text>;
                                    }
                                    
                                    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
                                    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
                                    const stdDev = Math.sqrt(variance);
                                    
                                    return (
                                        <Flex direction="column" gap="5px">
                                            <Text>Mean OptiPrime Score: <span style={{ fontWeight: 'bold' }}>{mean.toFixed(3)}</span></Text>
                                            <Text>Standard Deviation: <span style={{ fontWeight: 'bold' }}>{stdDev.toFixed(3)}</span></Text>
                                            <Text>Score Range: <span style={{ fontWeight: 'bold' }}>{Math.min(...scores).toFixed(3)} - {Math.max(...scores).toFixed(3)}</span></Text>
                                            <Text>Total PegRNAs: <span style={{ fontWeight: 'bold' }}>{diverseResults.length}</span></Text>
                                        </Flex>
                                    );
                                })()}
                            </Card>
                            
                            {/* OptiPrime Results Statistics */}
                            <Card padding="15px" backgroundColor="#e8f5e8">
                                <Heading level={4} children="OptiPrime Results Statistics" />
                                {(() => {
                                    const scores = optiPrimeResults.map(pegRNA => parseFloat(pegRNA.score));
                                    
                                    if (scores.length === 0) {
                                        return <Text color="gray">No scores available</Text>;
                                    }
                                    
                                    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
                                    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
                                    const stdDev = Math.sqrt(variance);
                                    
                                    return (
                                        <Flex direction="column" gap="5px">
                                            <Text>Mean OptiPrime Score: <span style={{ fontWeight: 'bold' }}>{mean.toFixed(3)}</span></Text>
                                            <Text>Standard Deviation: <span style={{ fontWeight: 'bold' }}>{stdDev.toFixed(3)}</span></Text>
                                            <Text>Score Range: <span style={{ fontWeight: 'bold' }}>{Math.min(...scores).toFixed(3)} - {Math.max(...scores).toFixed(3)}</span></Text>
                                            <Text>Total PegRNAs: <span style={{ fontWeight: 'bold' }}>{optiPrimeResults.length}</span></Text>
                                        </Flex>
                                    );
                                })()}
                            </Card>
                        </Grid>
                        
                        {/* PegRNA Results Columns with Scrolling */}
                        <Grid templateColumns="1fr 1fr" gap="20px">
                            {/* Diverse PegRNAs */}
                            <Card padding="15px">
                                <Heading level={4} children="Diverse pegRNAs" />
                                <Text fontSize="14px" color="gray" marginBottom="10px">
                                    Most diverse selection based on sequence similarity, Shannon entropy, and transition/transversion penalty. Biased by OptiPrime score.
                                </Text>
                                {diverseResults.length > 0 ? (
                                    <div style={{ 
                                        maxHeight: "600px", 
                                        overflowY: "auto",
                                        paddingRight: "10px"
                                    }}>
                                        {diverseResults.map((pegRNA, index) => {
                                            // Find the corresponding candidate to get the score
                                            // eslint-disable-next-line no-undef
                                            const candidate = allCandidateSequences.find(c => c.id === pegRNA.id);
                                            const score = candidate ? candidate.score.toFixed(3) : "N/A";
                                            
                                            return (
                                                <Card key={pegRNA.id} padding="10px" marginBottom="10px" backgroundColor="#f8f9fa">
                                                    <Flex justifyContent="space-between" alignItems="center">
                                                        <Text fontWeight="bold">{pegRNA.name}</Text>
                                                        <Text color="blue">Score: {score}</Text>
                                                    </Flex>
                                                    <Text fontSize="12px" fontFamily="monospace" marginTop="5px">
                                                        {pegRNA.sequence}
                                                    </Text>
                                                </Card>
                                            );
                                        })}
                                    </div>
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
                                    <div style={{ 
                                        maxHeight: "600px", 
                                        overflowY: "auto",
                                        paddingRight: "10px"
                                    }}>
                                        {optiPrimeResults.map((pegRNA, index) => (
                                            <Card key={pegRNA.id} padding="10px" marginBottom="10px" backgroundColor="#f8f9fa">
                                                <Flex justifyContent="space-between" alignItems="center">
                                                    <Text fontWeight="bold">{pegRNA.name}</Text>
                                                    <Text color="green">Score: {pegRNA.score}</Text>
                                                </Flex>
                                                <Text fontSize="12px" fontFamily="monospace" marginTop="5px">
                                                    {pegRNA.sequence}
                                                </Text>
                                            </Card>
                                        ))}
                                    </div>
                                ) : (
                                    <Text color="gray">No OptiPrime results generated yet</Text>
                                )}
                            </Card>
                        </Grid>
                    </>
                )}
                
                {/* Show message to press Generate Comparison button before first generation */}
                {!hasGeneratedComparison && Object.keys(summary).length > 0 && (
                    <Text color="gray" textAlign="center" marginTop="20px">
                        Click "Generate Comparison" to see the results
                    </Text>
                )}
                
                {/* Show message if no results after generation */}
                {hasGeneratedComparison && diverseResults.length === 0 && optiPrimeResults.length === 0 && Object.keys(summary).length > 0 && (
                    <Text color="gray" textAlign="center" marginTop="20px">
                        No results generated. Please check the console for details.
                    </Text>
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