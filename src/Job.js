import React, { Suspense, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    Button, Card, Flex, Grid, Heading, useTheme, Text, Tabs, SelectField, SwitchField
} from "@aws-amplify/ui-react";

import { fetchAuth, suspensePromiseWrapper, revcomp, downloadBinary, minEdit, computeAlleleSpecificity } from "./Utils";
import { SeqVizWithCDS, editHighlights } from "./ModdedSeqViz"
import { ReactComponent as SubmittedSVG } from "./submitted.svg"
import { ReactComponent as RunningSVG } from "./running.svg"
import { ReactComponent as FinishedSVG } from "./finished.svg"


const Submitted = ({ numFrames = 10, delay = 100, pauseFrames = 10 }) => {
    const [state, setState] = useState({ prevFrame: 2, frame: 1, pause: 0, isAdd: true });
    const [firstLoad, setFirstLoad] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        const interval = setInterval(() => {
            setState(prevState => {
                const { frame, isAdd, pause } = prevState;
                if ((frame === 1) && (pause > 0)) {
                    return { prevFrame: frame, frame, pause: pause - 1, isAdd }
                } else if (frame === 1) {
                    return { prevFrame: frame, frame: frame + 1, pause: pauseFrames, isAdd: true };
                } else if (frame < numFrames) {
                    const newFrame = isAdd ? frame + 1 : frame - 1;
                    return { prevFrame: frame, frame: newFrame, pause, isAdd }
                } else {
                    return { prevFrame: frame, frame: frame - 1, pause, isAdd: false };
                }
            })
        }, delay);
        return () => clearInterval(interval);
    }, [numFrames, delay, pauseFrames]);
    useEffect(() => {
        const svg = ref.current;
        if (svg) {
            if (!firstLoad) {
                for (let i = 1; i <= numFrames; i += 1) {
                    const layer = svg.querySelector(`#Layer_${i}`);
                    if (layer) layer.style.display = "none";
                }
                setFirstLoad(true);
                return;
            }
            const prevLayer = svg.querySelector(`#Layer_${state.prevFrame}`);
            if (prevLayer) prevLayer.style.display = "none";
            const currLayer = svg.querySelector(`#Layer_${state.frame}`);
            if (currLayer) currLayer.style.display = "block";
        }
    }, [numFrames, state.prevFrame, state.frame, firstLoad])
    return <SubmittedSVG style={{ height: "150px" }} ref={ref} />
}

const Running = ({ numFrames = 10, delay = 75 }) => {
    const [frame, setFrame] = useState(1);
    const [firstLoad, setFirstLoad] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        const interval = setInterval(() => {
            setFrame(prevFrame => {
                if (prevFrame === numFrames) {
                    return 1;
                } else {
                    return prevFrame + 1;
                }
            })
        }, delay);
        return () => clearInterval(interval);
    }, [numFrames, delay]);
    useEffect(() => {
        const svg = ref.current;
        if (svg) {
            if (!firstLoad) {
                for (let i = 1; i <= numFrames; i += 1) {
                    const layer = svg.querySelector(`#Layer_${i}`);
                    if (layer) layer.style.display = "none";
                }
                setFirstLoad(true);
                return;
            }
            const prevFrame = frame === 1 ? numFrames : frame - 1;
            const prevLayer = svg.querySelector(`#Layer_${prevFrame}`);
            if (prevLayer) prevLayer.style.display = "none";
            const currLayer = svg.querySelector(`#Layer_${frame}`);
            if (currLayer) currLayer.style.display = "block";
        }
    }, [numFrames, frame, firstLoad])
    return <RunningSVG style={{ height: "150px" }} ref={ref} />
}

const Finished = () => <FinishedSVG style={{ height: "150px" }} />;

const Status = ({ status }) => {
    switch (status) {
        case "SUBMITTED":
            return <Submitted />
        case "RUNNING":
            return <Running />
        case "FINISHED":
            return <Finished />
        default:
            return status
    }
}

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


// Helper function to extract spacer name from subJobData
const getSpacerName = (subJobData, subJobIDs, subJobID) => {
    const index = subJobIDs.indexOf(subJobID);
    if (index === -1 || !subJobData[index]) return '';

    const sj = subJobData[index];
    const nameParts = sj.name.split('_');
    return nameParts[nameParts.length - 1]; // Get the last part after the last underscore
};

// Construction adapter/scaffold/motif constants.
// Sources: Doman et al. Nat Protoc 17, 2431–2468 (2022), Table 2.
// Backbone: pU6-tevopreq1-GG-acceptor — https://www.addgene.org/174038/
// F+E (Chen et al. 2013) scaffold variant. Part 1 overhang flips T→A at the
// 3' end (GTTTT → GTTTA) and Part 2 oligos encode the F+E scaffold middle.
// Part 3 (GTGC/CGCG) is unchanged.
const GG_PART1_TOP_5    = "CACC";
const GG_PART1_TOP_3    = "GTTTA";
const GG_PART1_BOT_5    = "CTCTTAAAC";
const GG_PART2_TOP_EPEG = "/5Phos/AGAGCTATGCTGGAAACAGCATAGCAAGTTTAAATAAGGCTAGTCCGTTATCAACTTGAAAAAGTGGCACCGAGTCG";
const GG_PART2_BOT_EPEG = "/5Phos/GCACCGACTCGGTGCCACTTTTTCAAGTTGATAACGGACTAGCCTTATTTAAACTTGCTATGCTGTTTCCAGCATAG";
const GG_PART3_TOP_5    = "GTGC";
const GG_PART3_BOT_5    = "CGCG";

const GIBSON_HA_5 = "CTTGGCTTTATATATCTTGTGGAAAGGACGAAACACC";
const GIBSON_HA_3 = "TTTTTTTAAGCTTGGGCCGCTCGAGGTACCTCTCTACATATGACATGTGAGCAAAAGGCCAGCAAAAGGCCAGGAACCGTAAAAAGGCCGCGTTGCTGGCGTTTTTCCATAGGCTCCGCCCCCCTGACGAGCATCACAAAAATCGACGCTCAAGTC";
const GIBSON_FWD_PRIMER = "CAAAAATCGACGCTCAAGTC";
const GIBSON_REV_PRIMER = "ACAAGATATATAAAGCCAAGAAATCGAAATACTTTCAAG";

// F+E ("flip + extension") SpCas9 sgRNA scaffold (Chen et al. 2013, Cell 155:1479).
const SCAFFOLD = "GTTTAAGAGCTATGCTGGAAACAGCATAGCAAGTTTAAATAAGGCTAGTCCGTTATCAACTTGAAAAAGTGGCACCGAGTCGGTGC";
const TEVOPREQ1 = "CGCGGTTCTATCTAGTTACGCGTTAAACCAACTAGAA";

// Format full epegRNA as IDT-style modified RNA: 2'-OMe ('m') on first/last 3 nt;
// phosphorothioate ('*') on first/last 3 phosphodiester bonds. Appends UUU to the
// 3' end so the terminal residues are always mU*mU*mU.
const formatSyntheticEpegRNA = (spacer, rtt, pbs) => {
    const dna = (spacer + SCAFFOLD + rtt + pbs + TEVOPREQ1 + "TTT").toUpperCase();
    const rna = dna.replaceAll("T", "U");
    if (rna.length < 6) return rna;
    const head = `m${rna[0]}*m${rna[1]}*m${rna[2]}*`;
    const mid = rna.slice(3, rna.length - 3);
    const tail = `*m${rna[rna.length - 3]}*m${rna[rna.length - 2]}*m${rna[rna.length - 1]}`;
    return head + mid + tail;
};

// Build all three construction representations for a single pegRNA.
const buildConstructions = ({ spacer, rtt, pbs }) => {
    const ext = (rtt + pbs + TEVOPREQ1).toUpperCase();
    const spc = spacer.toUpperCase();
    const ggPart1Top = GG_PART1_TOP_5 + spc + GG_PART1_TOP_3;
    const ggPart1Bot = GG_PART1_BOT_5 + revcomp(spc);
    const ggPart3Top = GG_PART3_TOP_5 + ext;
    const ggPart3Bot = GG_PART3_BOT_5 + revcomp(ext);
    const gibsonFragment = GIBSON_HA_5 + spc + SCAFFOLD + (rtt + pbs).toUpperCase() + TEVOPREQ1 + GIBSON_HA_3;
    const synthetic = formatSyntheticEpegRNA(spc, rtt.toUpperCase(), pbs.toUpperCase());
    return { ggPart1Top, ggPart1Bot, ggPart3Top, ggPart3Bot, gibsonFragment, synthetic };
};

// Decode a pegRNA name to its edited target-DNA context using edit segments.
// Returns the assembled string (slice covers the protospacer region [+ flanks]).
const decodePegRNAName = (pegRNAName, editSegments) => {
    try {
        const encodedPart = pegRNAName.split('_')[0];
        let fullSequence = '';
        let encodedIndex = 0;
        for (const segment of editSegments) {
            if (segment.length === 1) {
                fullSequence += segment[0];
            } else if (encodedIndex < encodedPart.length) {
                const optionIndex = encodedPart.charCodeAt(encodedIndex) - 65;
                fullSequence += (optionIndex >= 0 && optionIndex < segment.length)
                    ? segment[optionIndex]
                    : segment[0];
                encodedIndex++;
            } else {
                fullSequence += segment[0];
            }
        }
        return fullSequence;
    } catch (error) {
        console.error(`Error decoding pegRNA name ${pegRNAName}:`, error);
        return null;
    }
};

// Parse RTT and PBS lengths from pegRNA names like "CD_R42_P13".
const parseRttPbsLens = (pegRNAName) => {
    let rttLen = 0, pbsLen = 0;
    for (const part of pegRNAName.split('_')) {
        const r = /^R(\d+)$/.exec(part);
        if (r) rttLen = parseInt(r[1], 10);
        const p = /^P(\d+)$/.exec(part);
        if (p) pbsLen = parseInt(p[1], 10);
    }
    return { rttLen, pbsLen };
};

// Derive spacer/RTT/PBS from the edited target-DNA context.
// Slice convention (Design.js: sliceSegments(segments, start20 - 4, start20 + 71)):
//   indices 0..3   = 4 nt upstream of protospacer
//   indices 4..23  = 20 nt protospacer (= spacer source)
//   index 21       = Cas9 nick site (3 nt upstream of PAM)
//   indices 24..   = PAM + downstream
// Spacer follows U6 convention: prepend lowercase g if the protospacer's first
// base isn't G (per Doman et al. Nat Protoc 2022, Table 2 "N20-21").
const deriveComponents = (editContext, rttLen, pbsLen) => {
    const ctx = (editContext || '').toUpperCase();
    const NICK = 21;
    if (ctx.length < 24) return { spacer: '', rtt: '', pbs: '' };
    const proto = ctx.slice(4, 24);
    const spacer = proto[0] === 'G' ? proto : 'g' + proto;
    const pbs = revcomp(ctx.slice(Math.max(0, NICK - pbsLen), NICK));
    const rtt = revcomp(ctx.slice(NICK, NICK + rttLen));
    return { spacer, rtt, pbs };
};

// Spreadsheet-style sequence table with arbitrary rectangle (row × column)
// selection and TSV copy. Click + drag selects a rectangle; shift+click extends
// the focus corner; clicking a header cell selects the full column. Cmd/Ctrl+C
// copies the selection as TSV.
const SequenceTable = ({ columns, rows }) => {
    const [anchor, setAnchor] = useState(null); // { r, c } | null
    const [focus, setFocus] = useState(null);
    const draggingRef = useRef(false);

    useEffect(() => {
        const onUp = () => { draggingRef.current = false; };
        window.addEventListener("mouseup", onUp);
        return () => window.removeEventListener("mouseup", onUp);
    }, []);

    const bounds = () => {
        if (!anchor || !focus) return null;
        return {
            r0: Math.min(anchor.r, focus.r), r1: Math.max(anchor.r, focus.r),
            c0: Math.min(anchor.c, focus.c), c1: Math.max(anchor.c, focus.c)
        };
    };
    const selected = (r, c) => {
        const b = bounds();
        return b && r >= b.r0 && r <= b.r1 && c >= b.c0 && c <= b.c1;
    };

    const startCell = (r, c, e) => {
        if (e.shiftKey && anchor) {
            setFocus({ r, c });
        } else {
            setAnchor({ r, c });
            setFocus({ r, c });
        }
        draggingRef.current = true;
    };
    const dragCell = (r, c) => {
        if (draggingRef.current) setFocus({ r, c });
    };

    // Click a header → select entire column
    const onHeaderMouseDown = (c, e) => {
        if (rows.length === 0) return;
        if (e.shiftKey && anchor) {
            setFocus({ r: rows.length - 1, c });
        } else {
            setAnchor({ r: 0, c });
            setFocus({ r: rows.length - 1, c });
        }
        draggingRef.current = false;
    };

    const onCopy = (e) => {
        const b = bounds();
        if (!b) return;
        const lines = [];
        for (let r = b.r0; r <= b.r1; r++) {
            const parts = [];
            for (let c = b.c0; c <= b.c1; c++) {
                parts.push(rows[r]?.[columns[c].key] ?? "");
            }
            lines.push(parts.join("\t"));
        }
        e.clipboardData.setData("text/plain", lines.join("\n"));
        e.preventDefault();
    };

    return (
        <div tabIndex={0} onCopy={onCopy} style={{
            outline: "none",
            overflowX: "auto",
            overflowY: "auto",
            maxHeight: "600px",
            border: "1px solid #e0e0e0",
            borderRadius: "4px"
        }}>
            <table style={{
                borderCollapse: "collapse",
                width: "100%",
                fontFamily: "monospace",
                fontSize: "12px",
                userSelect: "none"
            }}>
                <thead>
                    <tr>
                        {columns.map((col, c) => (
                            <th key={col.key}
                                onMouseDown={(e) => onHeaderMouseDown(c, e)}
                                style={{
                                    textAlign: "left",
                                    borderBottom: "1px solid #ccc",
                                    padding: "6px 10px",
                                    background: "#f0f0f0",
                                    fontFamily: "sans-serif",
                                    position: "sticky",
                                    top: 0,
                                    cursor: "pointer"
                                }}>
                                {col.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, r) => (
                        <tr key={r} style={{ background: r % 2 ? "#fafafa" : "white" }}>
                            {columns.map((col, c) => (
                                <td key={col.key}
                                    onMouseDown={(e) => startCell(r, c, e)}
                                    onMouseEnter={() => dragCell(r, c)}
                                    style={{
                                        padding: "6px 10px",
                                        borderBottom: "1px solid #eee",
                                        whiteSpace: "nowrap",
                                        verticalAlign: "top",
                                        background: selected(r, c) ? "#cfe2ff" : "transparent",
                                        cursor: "cell"
                                    }}>
                                    {row[col.key]}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            <Text fontSize="12px" color="gray" marginTop="6px">
                Click + drag to select any rectangle of cells. Click a header to select
                its column. Shift+click extends. Cmd/Ctrl+C copies as TSV.
            </Text>
        </div>
    );
};

// Three construction-method tabs (GG, Gibson, synthetic) for `results`.
// Each row of the per-pegRNA table is derived from buildConstructions().
const ConstructionTabs = ({ results }) => {
    const rows = results.map(r => ({
        name: r.name,
        score: r.score,
        ...buildConstructions({ spacer: r.spacer || '', rtt: r.rtt || '', pbs: r.pbs || '' })
    }));

    const ggColumns = [
        { key: "name",       label: "Name" },
        { key: "score",      label: "OptiPrime score" },
        { key: "ggPart1Top", label: "Part 1 top (spacer)" },
        { key: "ggPart1Bot", label: "Part 1 bottom" },
        { key: "ggPart3Top", label: "Part 3 top (3' extension)" },
        { key: "ggPart3Bot", label: "Part 3 bottom" }
    ];
    const gibsonColumns = [
        { key: "name",           label: "Name" },
        { key: "score",          label: "OptiPrime score" },
        { key: "gibsonFragment", label: "Gene fragment (dsDNA)" },
        { key: "gibsonLength",   label: "Length" }
    ];
    const gibsonRows = rows.map(r => ({ ...r, gibsonLength: r.gibsonFragment.length }));

    const syntheticColumns = [
        { key: "name",             label: "Name" },
        { key: "score",            label: "OptiPrime score" },
        { key: "synthetic",        label: "Full epegRNA (modified RNA)" },
        { key: "syntheticLength",  label: "Length" }
    ];
    const syntheticRows = rows.map(r => ({
        ...r,
        syntheticLength: r.synthetic.replace(/[*m]/g, "").length
    }));

    return (
        <Card padding="15px">
            <Heading level={4} children="Orderable construction sequences" />
            <Text fontSize="13px" color="gray" marginBottom="10px">
                Sequences below are derived from the result set above using the standard
                protocol from Doman et al., <i>Nat Protoc</i> 17, 2431–2468 (2022).
            </Text>
            <Tabs.Container defaultValue="gg">
                <Tabs.List>
                    <Tabs.Item value="gg">GG epegRNA</Tabs.Item>
                    <Tabs.Item value="gibson">Gibson epegRNA</Tabs.Item>
                    <Tabs.Item value="synthetic">Synthetic pegRNA</Tabs.Item>
                </Tabs.List>

                <Tabs.Panel value="gg">
                    <Flex direction="column" gap="10px" padding="10px 0">
                        <Text fontSize="13px">
                            Order Part 1 and Part 3 oligo pairs unmodified; order Part 2
                            oligos 5'-phosphorylated (Part 2 is fixed for the standard SpCas9
                            scaffold and shared across all epegRNAs). Anneal each pair, then
                            Golden Gate assemble (BsaI-HFv2 + T4 ligase) into the{" "}
                            <a href="https://www.addgene.org/174038/" target="_blank" rel="noreferrer">
                                pU6-tevopreq1-GG-acceptor backbone
                            </a>.
                        </Text>
                        <Card padding="10px" backgroundColor="#f8f9fa">
                            <Text fontWeight="bold" marginBottom="6px">
                                Shared Part 2 oligos (epegRNA scaffold; same for every row)
                            </Text>
                            <Text fontSize="12px" fontFamily="monospace">Top: {GG_PART2_TOP_EPEG}</Text>
                            <Text fontSize="12px" fontFamily="monospace">Bottom: {GG_PART2_BOT_EPEG}</Text>
                        </Card>
                        <SequenceTable columns={ggColumns} rows={rows} />
                    </Flex>
                </Tabs.Panel>

                <Tabs.Panel value="gibson">
                    <Flex direction="column" gap="10px" padding="10px 0">
                        <Text fontSize="13px">
                            Order each gene fragment below as a dsDNA piece (e.g., IDT gBlock,
                            Twist gene fragment — NOT a ssDNA oligo). PCR-amplify the{" "}
                            <a href="https://www.addgene.org/174038/" target="_blank" rel="noreferrer">
                                pU6-tevopreq1-GG-acceptor backbone
                            </a>{" "}
                            with the isothermal assembly primers, DpnI-treat, then assemble
                            (e.g., NEBuilder HiFi).
                        </Text>
                        <Card padding="10px" backgroundColor="#f8f9fa">
                            <Text fontWeight="bold" marginBottom="6px">Backbone amplification primers</Text>
                            <Text fontSize="12px" fontFamily="monospace">Forward: {GIBSON_FWD_PRIMER}</Text>
                            <Text fontSize="12px" fontFamily="monospace">Reverse: {GIBSON_REV_PRIMER}</Text>
                        </Card>
                        <SequenceTable columns={gibsonColumns} rows={gibsonRows} />
                    </Flex>
                </Tabs.Panel>

                <Tabs.Panel value="synthetic">
                    <Flex direction="column" gap="10px" padding="10px 0">
                        <Text fontSize="13px">
                            Order each full sequence below as a chemically modified synthetic
                            RNA (Agilent, IDT, or similar). Modifications: 2'-O-methyl (<code>m</code>)
                            on first/last 3 nt; phosphorothioate (<code>*</code>) on first/last 3
                            phosphodiester bonds. A 3'-<code>UUU</code> tail is appended so the
                            terminal residues are <code>mU*mU*mU</code>. Sequences are
                            order-ready (RNA letters). Use ~90 pmol per epegRNA per sample;
                            resuspend in TE to 100–300 µM.
                        </Text>
                        <SequenceTable columns={syntheticColumns} rows={syntheticRows} />
                    </Flex>
                </Tabs.Panel>
            </Tabs.Container>
        </Card>
    );
};

const JobComponent = () => {
    const { tokens } = useTheme();
    const { jid } = useParams();
    const jobDataResource = useJobDataResource(jid);
    const jobData = jobDataResource.read();  // Blocks until data is ready
    const [dispData, setDispData] = useState(jobData);
    const [protoAnns, setProtoAnns] = useState([]);
    const [summary, setSummary] = useState({});
    const [allCandidateSequences, setAllCandidateSequences] = useState([]);
    const [selectionMode, setSelectionMode] = useState('all'); // 'all' | 'optiprime' | 'diverse'
    const [pickCount, setPickCount] = useState(8);
    // Allele specificity state
    const [hetPositions, setHetPositions] = useState(new Map());
    const [hetMode, setHetMode] = useState(false);
    const [popoverState, setPopoverState] = useState(null); // { seqIdx, x, y }
    const [pamdaData, setPamdaData] = useState(null);
    const [spacerCoords, setSpacerCoords] = useState([]); // [{ name, start, end, direction }]
    const lastMousePos = useRef({ x: 0, y: 0 });
    const navigate = useNavigate();
    const ref = useRef(null);
    const timerRef = useRef(null);

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

    // Load HT-PAMDA data for allele specificity PAM scoring
    useEffect(() => {
        fetch("/HT-PAMDA.json").then(r => r.json()).then(setPamdaData);
    }, []);

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
        const anns = [];
        const coords = [];
        Object.keys(nameMap).forEach(name => {
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
            anns.push({ name, color, start, end, direction });
            coords.push({ sID, start, end, direction });
        });
        setProtoAnns(anns);
        setSpacerCoords(coords);
    }, [jobData, summary]);

    useEffect(() => {
        const fetchAndPoll = async () => {
            const data = await fetchJobData(jid);
            setDispData(prev => ({
                ...data,
                uneditedData: { ...data.uneditedData, highlights: prev.uneditedData.highlights },
                editedData:   { ...data.editedData,   highlights: prev.editedData.highlights }
            }));
            if (data.status !== "FINISHED") {
                timerRef.current = setTimeout(fetchAndPoll, 3000);
            }
        };
        fetchAndPoll().then(() => {});
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        }
    }, [jid]);

    // Add highlights
    useEffect(() => editHighlights(ref, dispData, setDispData),
              [ref, dispData.uneditedData.seq, dispData.editedData.seq]);  // eslint-disable-line

    // Custom selection handler for protospacers
    const psHandler = (event) => {
        // Het-marking mode: single-base click toggles het position
        if (hetMode && event.type !== "ANNOTATION" && event.start != null && event.end != null) {
            const len = event.end - event.start;
            if (len >= 0 && len <= 1) {
                const seqIdx = event.start;
                if (hetPositions.has(seqIdx)) {
                    setHetPositions(prev => { const m = new Map(prev); m.delete(seqIdx); return m; });
                    setPopoverState(null);
                } else {
                    setPopoverState({ seqIdx, x: lastMousePos.current.x, y: lastMousePos.current.y });
                }
                return;
            }
        }
        const nameMap = Object.fromEntries(jobData.subJobData
                        .map((sj, i) => {
                            let name = sj.name.split("_");
                            name = name[name.length - 1];
                            const sID = jobData.subJobIDs[i];
                            return [name, sID];
                        }));
        const name = (event.name || "").split(" ")[0];
        if ((event.type === "ANNOTATION") && (name in nameMap)) {
            const sID = nameMap[name];
            if (sID in summary) {
                console.debug(summary[sID]);
            }
        }
    }

    const selectAltBase = (base) => {
        if (!popoverState) return;
        setHetPositions(prev => {
            const m = new Map(prev);
            m.set(popoverState.seqIdx, base);
            return m;
        });
        setPopoverState(null);
    };

    // Dismiss popover on outside click
    useEffect(() => {
        if (!popoverState) return;
        const dismiss = (e) => {
            if (e.target.closest('.het-popover')) return;
            setPopoverState(null);
        };
        const timer = setTimeout(() => document.addEventListener('mousedown', dismiss), 0);
        return () => { clearTimeout(timer); document.removeEventListener('mousedown', dismiss); };
    }, [popoverState]);

    // Build het highlights for SeqViz
    const hetHighlights = Array.from(hetPositions.keys()).map(idx => ({
        start: idx, end: idx + 1, color: "#ffcc00"
    }));

    // Get summary
    useEffect(() => {
        console.debug("Fetching summary for job:", jid);
        fetchAuth("id_token", `https://api.optipri.me/summary/${jid}`)
        .then(resp => {
            console.debug("Summary API response status:", resp.status);
            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
            }
            return resp.json();
        })
        .then(data => {
            console.debug("Raw summary data:", data);

            if (!data || Object.keys(data).length === 0) {
                throw new Error("No summary data received from API. The job may not have OptiPrime scores available yet.");
            }

            // Try different data structures
            let summaryData = {};

            // Check if data has the expected structure
            if (data && typeof data === 'object') {
                const keys = Object.keys(data);
                console.debug("Data keys:", keys);

                // Try to find OptiPrime scores in different possible structures
                for (const key of keys) {
                    const entry = data[key];
                    console.debug(`Processing key ${key}:`, entry);

                    if (entry && typeof entry === 'object') {
                        // Check for OptiPrime_score field
                        if (entry.OptiPrime_score && typeof entry.OptiPrime_score === 'object') {
                            summaryData[key] = Object.keys(entry.OptiPrime_score)
                                .map(k => [k, entry.OptiPrime_score[k]])
                                .toSorted((a, b) => b[1] - a[1]);
                        }
                        // Check if entry itself is a score object
                        else if (typeof entry === 'object' && !Array.isArray(entry)) {
                            summaryData[key] = Object.keys(entry)
                                .map(k => [k, entry[k]])
                                .toSorted((a, b) => b[1] - a[1]);
                        }
                    }
                }
            }

            if (Object.keys(summaryData).length === 0) {
                throw new Error("Summary data received but no valid OptiPrime scores found. The data structure may be unexpected.");
            }

            console.debug("Processed summary data:", summaryData);
            setSummary(summaryData);
        })
        .catch(error => {
            console.error("Error fetching summary:", error);
            setSummary({});

            // Handle different types of errors gracefully
            if (error.message && error.message.includes('HTTP 502')) {
                console.debug("OptiPrime scores not available yet (server temporarily unavailable). This is normal for jobs that are still processing.");
                // Don't show alert for 502 errors - they're usually temporary
            } else if (error.message && error.message.includes('HTTP 404')) {
                console.debug("OptiPrime scores not found for this job. The job may not have completed processing yet.");
                // Don't show alert for 404 errors - they're expected for incomplete jobs
            } else {
                // Only show alert for unexpected errors
                console.warn("Unexpected error loading OptiPrime scores:", error.message);
            }
        });
    }, [jid, jobData.subJobData, jobData.subJobIDs]);  // eslint-disable-line

    // Auto-populate results once summary lands and subJobData is ready.
    // Lives in an effect so it sees the freshly-set `summary` state, not stale closures.
    useEffect(() => {
        if (Object.keys(summary).length > 0
            && jobData.subJobData && jobData.subJobData.length > 0
            && allCandidateSequences.length === 0) {
            generatePegRNAComparison();
        }
    }, [summary]);  // eslint-disable-line

    // Generate diverse pegRNAs and OptiPrime top results
    const generatePegRNAComparison = () => {
        if (!jobData.subJobData || jobData.subJobData.length === 0) {
            console.debug("No subJobData available");
            return;
        }

        // Check if summary data is available
        if (!summary || Object.keys(summary).length === 0) {
            console.debug("No OptiPrime scores available. Please ensure the job has completed and scores are available.");
            return;
        }

        console.debug("SubJobData length:", jobData.subJobData.length);

        try {
            const candidates = Object.keys(summary)
                .filter(id => {
                    const index = jobData.subJobIDs.indexOf(id);
                    return index !== -1 && jobData.subJobData[index] && summary[id] && summary[id].length > 0;
                })
                .flatMap(id => {
                    const index = jobData.subJobIDs.indexOf(id);
                    const sj = jobData.subJobData[index];
                    const editSegments = sj.edit_segments;
                    return summary[id].map(([pegRNAName, score]) => {
                        const editContext = decodePegRNAName(pegRNAName, editSegments) || sj.unedited;
                        const { rttLen, pbsLen } = parseRttPbsLens(pegRNAName);
                        const components = deriveComponents(editContext, rttLen, pbsLen);
                        const spacerName = getSpacerName(jobData.subJobData, jobData.subJobIDs, id);
                        const displayName = spacerName ? `${spacerName}_${pegRNAName}` : pegRNAName;
                        return {
                            id: `${id}_${pegRNAName}`,
                            sID: id,
                            name: displayName,
                            sequence: editContext,
                            ...components,
                            score,
                            pbsLen
                        };
                    });
                })
                .filter(c => c.sequence && c.sequence.length > 0);

            console.debug(`Generated ${candidates.length} candidate pegRNAs`);
            setAllCandidateSequences(candidates);
        } catch (error) {
            console.error("Error generating pegRNAs:", error);
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
            <Card columnStart="1" columnEnd="3" padding="0px" height="150px">
                <Heading level={2} children={dispData.name} />
                <Text color="gray">Job Status: {dispData.status}</Text>
                <Text color="gray">Job ID: {jid}</Text>
            </Card>
            <Card column="3" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }} padding="0px" height="150px">
                <Status status={dispData.status} /><br />
                <Text color="gray">Job Status: {dispData.status}</Text>
            </Card>

            <Card columnStart="1" columnEnd="-1">
                <div ref={ref} style={{ position: "relative" }}
                     onMouseDown={(e) => { lastMousePos.current = { x: e.clientX, y: e.clientY }; }}>
                    <Flex justifyContent="space-between" alignItems="center" marginBottom="5px">
                        <Heading children={`Unedited sequence: ${jobData.uneditedData.name}`} />
                        <Flex alignItems="center" gap="10px">
                            {hetPositions.size > 0 && (
                                <Text fontSize="13px" color="gray">
                                    {hetPositions.size} het position{hetPositions.size !== 1 ? 's' : ''} marked
                                </Text>
                            )}
                            {hetPositions.size > 0 && (
                                <Button size="small" variation="link"
                                        onClick={() => { setHetPositions(new Map()); setPopoverState(null); }}>
                                    Clear all
                                </Button>
                            )}
                            <SwitchField
                                label="Mark het positions"
                                labelPosition="start"
                                isChecked={hetMode}
                                onChange={(e) => { setHetMode(e.target.checked); setPopoverState(null); }}
                                size="small"
                            />
                        </Flex>
                    </Flex>
                    {hetMode && <Text fontSize="12px" color="gray" marginBottom="5px">
                        Click a base to mark it as heterozygous. Click again to remove.
                    </Text>}
                    <SeqVizWithCDS seqData={{
                        ...dispData.uneditedData,
                        annotations: protoAnns,
                        highlights: [...(dispData.uneditedData.highlights || []), ...hetHighlights]
                    }} selHandler={psHandler} />
                    {popoverState && (() => {
                        const refBase = (jobData.uneditedData.seq[popoverState.seqIdx] || '').toUpperCase();
                        const altBases = ['A', 'C', 'G', 'T'].filter(b => b !== refBase);
                        return (
                            <div className="het-popover" style={{
                                position: "fixed", left: popoverState.x, top: popoverState.y - 40,
                                zIndex: 1000, background: "white", border: "1px solid #ccc",
                                borderRadius: "6px", padding: "6px 8px", boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                                display: "flex", gap: "4px", alignItems: "center"
                            }}>
                                <Text fontSize="12px" fontWeight="bold" marginRight="4px">Alt:</Text>
                                {altBases.map(b => (
                                    <Button key={b} size="small" onClick={() => selectAltBase(b)}
                                            style={{ minWidth: "32px", fontFamily: "monospace", fontWeight: "bold" }}>
                                        {b}
                                    </Button>
                                ))}
                                <Button size="small" variation="link" onClick={() => setPopoverState(null)}>✕</Button>
                            </div>
                        );
                    })()}
                </div>
                <Heading children={`Edited sequence: ${jobData.editedData.name}`} />
                <SeqVizWithCDS seqData={dispData.editedData} />
            </Card>
            <Card columnStart="1" columnEnd="-1" padding="20px">
                <Heading level={3} children="Orderable pegRNAs" />
                {dispData.status !== "FINISHED" ? (
                    <Text color="gray" marginTop="10px">
                        Job is {dispData.status.toLowerCase()}. Results will appear here when it finishes.
                    </Text>
                ) : Object.keys(summary).length === 0 ? (
                    <Text color="orange" marginTop="10px">Loading OptiPrime scores…</Text>
                ) : allCandidateSequences.length === 0 ? (
                    <Text color="gray" marginTop="10px">No pegRNAs available.</Text>
                ) : (() => {
                    const sorted = [...allCandidateSequences].sort((a, b) => b.score - a.score);
                    let picked = sorted;
                    if (selectionMode === 'optiprime') {
                        picked = sorted.slice(0, Math.min(pickCount, sorted.length));
                    } else if (selectionMode === 'diverse') {
                        const k = Math.min(pickCount, sorted.length);
                        const seqs = sorted.map(c => ({ id: c.id, sequence: c.sequence }));
                        const ids = selectDiversePegRNAsWithBias(seqs, sorted, k, 0.5, 'ranked');
                        const byId = new Map(sorted.map(c => [c.id, c]));
                        picked = ids.map(id => byId.get(id)).filter(Boolean);
                    }
                    const rows = picked.map(c => ({ ...c, score: Number(c.score).toFixed(3) }));
                    return (
                        <>
                            <Flex alignItems="end" gap="20px" marginBottom="15px" marginTop="10px">
                                <SelectField
                                    label="Selection"
                                    value={selectionMode}
                                    onChange={(e) => setSelectionMode(e.target.value)}
                                    width="240px"
                                >
                                    <option value="all">All pegRNAs ({sorted.length})</option>
                                    <option value="optiprime">OptiPrime top N</option>
                                    <option value="diverse">Diverse N</option>
                                </SelectField>
                                {selectionMode !== 'all' && (
                                    <Flex direction="column" gap="4px">
                                        <Text fontSize="14px">N</Text>
                                        <input
                                            type="number"
                                            value={pickCount}
                                            min={1}
                                            step={1}
                                            onChange={(e) => {
                                                const v = parseInt(e.target.value, 10);
                                                if (!Number.isNaN(v) && v >= 1) setPickCount(v);
                                            }}
                                            style={{
                                                width: "100px",
                                                padding: "8px",
                                                borderRadius: "4px",
                                                border: "1px solid #ccc",
                                                fontSize: "14px"
                                            }}
                                        />
                                    </Flex>
                                )}
                            </Flex>
                            {hetPositions.size > 0 && spacerCoords.length > 0 && pamdaData && (() => {
                                const specResults = rows.map(r => {
                                    const coord = spacerCoords.find(sc => r.id.startsWith(sc.sID));
                                    if (!coord) return { name: r.name, alleleSpec: null };
                                    const spec = computeAlleleSpecificity(
                                        hetPositions, coord.start, coord.end, coord.direction,
                                        r.pbsLen, jobData.uneditedData.seq, pamdaData
                                    );
                                    return { name: r.name, alleleSpec: spec };
                                });
                                const labelColor = { PAM: "darkgreen", High: "green", Moderate: "#b8860b", Low: "red", None: "gray" };
                                return (
                                    <Card padding="15px" marginBottom="15px" backgroundColor="#fafafa">
                                        <Heading level={5}>Allele Specificity</Heading>
                                        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "13px", marginTop: "8px" }}>
                                            <thead>
                                                <tr style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>
                                                    <th style={{ padding: "4px 10px" }}>Name</th>
                                                    <th style={{ padding: "4px 10px" }}>Specificity</th>
                                                    <th style={{ padding: "4px 10px" }}>Score</th>
                                                    <th style={{ padding: "4px 10px" }}>Details</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {specResults.map((sr, i) => {
                                                    const s = sr.alleleSpec;
                                                    if (!s) return (
                                                        <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                                                            <td style={{ padding: "4px 10px", fontFamily: "monospace" }}>{sr.name}</td>
                                                            <td colSpan={3} style={{ padding: "4px 10px", color: "gray" }}>—</td>
                                                        </tr>
                                                    );
                                                    let details = s.hits.map(h => {
                                                        if (h.region === 'pam') return `PAM: ${h.refPam}→${h.altPam} (Δ${h.pamdaDelta.toFixed(2)})`;
                                                        if (h.region === 'spacer') return `spacer pos ${h.spacerPos}`;
                                                        return `PBS`;
                                                    }).join(', ');
                                                    return (
                                                        <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                                                            <td style={{ padding: "4px 10px", fontFamily: "monospace" }}>{sr.name}</td>
                                                            <td style={{ padding: "4px 10px", color: labelColor[s.label] || "gray", fontWeight: s.label === "PAM" ? "bold" : "normal" }}>{s.label}</td>
                                                            <td style={{ padding: "4px 10px" }}>{s.score.toFixed(2)}</td>
                                                            <td style={{ padding: "4px 10px", fontSize: "12px", color: "#555" }}>{details || "—"}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        <Text fontSize="11px" color="gray" marginTop="8px">
                                            Rough selectivity estimate based on overlap of marked het positions with spacer/PBS/PAM.
                                            Spacer weights from Kim et al. Cell 2023; PAM discrimination from HT-PAMDA scores.
                                        </Text>
                                    </Card>
                                );
                            })()}
                            <ConstructionTabs results={rows} />
                        </>
                    );
                })()}
            </Card>
            <Card columnStart="2" style={{
                justifyContent: "center",
                alignContent: "center",
                display: "flex",
                height: "100px"
            }}>
                <Flex gap="10px" alignItems="center" marginBottom="20px" width="100%">
                    <Button style={{ width: "250px", height: "70px", textAlign: "center" }}
                            onClick={() => {
                                fetchAuth("ac_token", `https://storage.optipri.me/top1/${jid}`)
                                .then(downloadBinary)
                            }}
                            children="Download top RTT+PBS for each edit combination" />
                    <Button style={{ width: "250px", height: "70px", textAlign: "center" }}
                            onClick={() => {
                                fetchAuth("ac_token", `https://storage.optipri.me/full_outputs/${jid}`)
                                .then(downloadBinary)
                            }}
                            children="Download full OptiPrime outputs" />
                    <Button style={{ width: "250px", height: "70px", textAlign: "center" }}
                            onClick={() => {
                                fetchAuth("ac_token", `https://storage.optipri.me/edit_mapping/${jid}`)
                                .then(downloadBinary)
                            }}
                            children="Download name to edit sequence mapping" />
                    <Button style={{ width: "250px", height: "70px", textAlign: "center" }}
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
                            children="Design a new job with the same edit" />
                </Flex>
            </Card>
            <Flex justifyContent="space-between" />
        </Grid>
    );
};

const Job = () => {
    return (
        <Suspense fallback={<div>Loading data...</div>}>
            <JobComponent />
        </Suspense>
    );
};

export default Job;
