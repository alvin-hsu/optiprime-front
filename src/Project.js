import React, { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
    Card, Heading, Grid, useTheme, Divider, Alert
} from "@aws-amplify/ui-react";

import { fetchAuth, minEdit, revcomp } from "./Utils";
import { SeqVizWithCDS, UneditedSeqViz, EditedSeqViz } from "./ModdedSeqViz"


const SEARCH_DIST = 18;

const fetchProjectData = async (projectID) => {
    const url = new URL("https://api.optipri.me/projects");
    url.searchParams = new URLSearchParams({ id: projectID });
    return fetchAuth("id_token", url);
};

const Project = () => {
    const {tokens} = useTheme();
    const searchParams = useSearchParams()[0];
    const projectID = searchParams.get("id");
    // Protospacer search
    const [protos, setProtos] = useState([]);
    // HT-PAMDA data
    const [useVars, setUseVars] = useState(false);  // Using PAM variants?
    const [PAMDA, setPAMDA] = useState({});
    const [pamMap, setPamMap] = useState({});
    const [pamCutoff, setPamCutoff] = useState(-1.75);
    // Manage selected protospacer
    const [selected, setSelected] = useState("");
    const [usvData, setUsvData] = useState({});
    const [esvData, setEsvData] = useState({});
    // Misc. state
    const [info, setInfo] = useState("");  // Info text to display to user
    const [protoScoreCache, setProtoScoreCache] = useState(JSON.parse(localStorage.getItem("protoScores")) || {});  // Score cache
    const [protoMap, setProtoMap] = useState({});  // Protospacer map
    const [protoAnns, setProtoAnns] = useState([]);  // Protospacer annotations
    // Ref to unedited
    const ref = useRef(null);
    // Clear state whenever useVars or pamCutoff updates
    useEffect(() => {
        setSelected("");
        setUsvData({});
        setEsvData({});
    }, [useVars, pamCutoff]);
    // Handle clicking on selections
    const selHandler = (e) => {
        const PROTO_RE = /[+-]\d+/;
        const name = e.name.split(" ")[0];
        if (PROTO_RE.test(name) && (name in protoMap)) {
            setSelected(name);
            setUsvData({});
            setEsvData({});
        }
    };

    // FIXME: Delete and fetch on load
    const testProjectData = {
        projName: "test-project",
        uneditedData: {
            name: "CFTR (ref)",
            seq: "TGGGGAATTATTTGAGAAAGCAAAACAAAACAATAACAATAGAAAAACTTCTAATGGTGATGACAGCCTCTTCTTCAGTAATTTCTCACTTCTTGGTACTCTGTCCTGAAAGATATTAATTTCAAGATAGAAAGAGGACAGTTGTTGGCGGTTGCTGGATCCACTGGAGCAGGCAAGGTAGTTCTTTTGTTCTTCACTA",
            cdsList: [{"name": "CFTR Exon 10",
                       "start": 0, "end": 177,
                       "direction": "-", "frame": 2}]
        },
        editedData: {
            name: "NM_000492.4(CFTR):c.1315C>G (p.Pro439Ala)",
            seq: "TGGGGAATTATTTGAGAAAGCAAAACAAAACAATAACAATAGAAAAACTTCTAATGGTGATGACAGCCTCTTCTTCAGTAATTTCTCACTTCTTGGTACTGCTGTCCTGAAAGATATTAATTTCAAGATAGAAAGAGGACAGTTGTTGGCGGTTGCTGGATCCACTGGAGCAGGCAAGGTAGTTCTTTTGTTCTTCACTA",
            cdsList: [{"name": "CFTR Exon 10",
                       "start": 0, "end": 178,
                       "direction": "-", "frame": 2}]
        }
    };

    const [projectData, setProjectData] = useState(testProjectData);

    // For updating CDS data to entries  FIXME?
    const updateCDS = (cds, ps) => {
        // Protospacer info
        const psDir = ps.direction;
        const psStart = (psDir === "+") ? (ps.start20 - 4) : (ps.end20 + 4);
        // CDS info
        const cDir = cds.direction;
        const cStart = cds.start;
        const cEnd = cds.end;
        const cFrame = cds.frame;
        // New CDS info
        const newDir = (psDir === cDir) ? "+" : "-";
        let start, end, frame;
        if ((cDir === "+") && (psDir === "+")) {
            start = Math.max(0, cStart - psStart);
            end = cEnd - psStart;
            frame = (psStart <= cStart) ? cFrame : (cFrame + psStart - cStart) % 3;
        } else if ((cDir === "+") && (psDir === "-")) {
            start = Math.max(0, psStart - cEnd);
            end = psStart - cStart;
            frame = (cEnd - cStart) + cFrame;
        } else if ((cDir === "-") && (psDir === "+")) {
            start = Math.max(0, cStart - psStart);
            end = cEnd - psStart;
            frame = cFrame;
        } else {
            start = Math.max(0, psStart - cEnd);
            end = psStart - cStart;
            frame = (psStart >= cEnd) ? cFrame : (cFrame + cEnd - psStart) % 3;
        }
        return { name: ps.name, direction: newDir,
                 start, end, frame }
    };

    // Load HT-PAMDA data on first load in background
    useEffect(() => {
        const HT_PAMDA_URL = "/HT-PAMDA.json";
        fetch(HT_PAMDA_URL).then(r => r.json()).then(data => {
            setPAMDA(data);
            let pamMap = {};
            for (const [pamVar, pamdaMap] of Object.entries(data)) {
                for (const [pam, pamda] of Object.entries(pamdaMap)) {
                    if (pam in pamMap) {
                        pamMap[pam] = (pamMap[pam].pamda > pamda) ? pamMap[pam] : { pamVar, pamda };
                    } else {
                        pamMap[pam] = { pamVar, pamda };
                    }
                }
            }
            setPamMap(pamMap);
        });
    }, []);
    // Highlight edit
    useEffect(() => {
        const {minU, minE, preLen} = minEdit(projectData.uneditedData.seq, projectData.editedData.seq);
        let color;
        if (minU.length === 0) { color = "lime"; }
        else if (minE.length === 0) { color = "pink"; }
        else { color = "cyan"; }
        const uHighlight = { start: preLen, end: preLen + minU.length, color: color };
        const eHighlight = { start: preLen, end: preLen + minE.length, color: color };
        // Set unedited highlight
        const uHighlights = minU.length > 0 ? [uHighlight] : [];
        setProjectData(s => ({ ...s, uneditedData: { ...s.uneditedData, highlights: uHighlights } }));
        // Set edited highlight
        const eHighlights = minE.length > 0 ? [eHighlight] : [];
        setProjectData(s => ({ ...s, editedData: { ...s.editedData, highlights: eHighlights } }));
        // Add line where an insertion happens, since it will be hidden later
        if (ref.current && minU.length === 0) {
            const observer = new MutationObserver((_, observer) => {
                const svg = ref.current.getElementsByClassName("la-vz-seqblock")[0];
                if (typeof svg === "undefined") { return; }
                const text = svg.getElementsByClassName("la-vz-seq")[0];
                if (typeof text === "undefined") { return; }
                const tspan = text.childNodes[preLen]
                if (typeof tspan === "undefined") { return; }
                const x = parseFloat(tspan.getAttribute("x")) - 2;
                const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                rect.setAttribute("style", "fill: green;");
                rect.setAttribute("height", "42");
                rect.setAttribute("width", "2");
                rect.setAttribute("x", x.toString());
                rect.setAttribute("y", "-3");
                text.parentNode.appendChild(rect);
                observer.disconnect();
            });
            observer.observe(ref.current, {characterData: false,
                                           childList: true,
                                           subtree: true,
                                           attributes: false});
        }
    }, [projectData.uneditedData.seq, projectData.editedData.seq]);
    // Search for protospacers
    useEffect(() => {
        let PAM_RE;
        if (!useVars) {
            setInfo("");
            PAM_RE = /(?=[ACGT]{24}[ACGT]GG[ACGT])/g;
        } else if (Object.keys(PAMDA).length === 0) {
            setInfo("Loading HT-PAMDA data...");
            return;
        } else {
            setInfo("");
            const aboveCutoff = Object.entries(pamMap)
                                      .filter(x => (x[1].pamda > pamCutoff))
                                      .map(x => x[0]);
            const pamStr = aboveCutoff.join("|");
            PAM_RE = new RegExp(`(?=[ACGT]{24}(?:${pamStr}))`, "g");
        }
        let entries = [];
        const { uneditedData, editedData } = projectData;
        // FIND FORWARD PROTOSPACERS
        let {minU, preLen, postLen} = minEdit(uneditedData.seq, editedData.seq);
        let preHom = uneditedData.seq.substring(0, preLen);
        let postHom = uneditedData.seq.substring(uneditedData.seq.length - postLen);
        const uLen = minU.length;
        const fSearch = (preHom.substring(preLen - SEARCH_DIST - 21) +
                         minU.substring(0, Math.min(uLen, 7)) +
                         postHom.substring(0, Math.max(0, 7 - Math.min(uLen, 7))));
        const fIdxs = [...fSearch.matchAll(PAM_RE)].map(x => x.index);
        fIdxs.forEach(x => {
            const direction = "+";
            const idx = x + (preLen - SEARCH_DIST - 21);  // Index of match start in original str
            const start20 = idx + 4;
            const end20 = start20 + 20;
            const proto30 = uneditedData.seq.substring(idx, idx + 30);
            const unedited = uneditedData.seq.substring(start20 - 4);
            const edited = editedData.seq.substring(start20 - 4);
            const id = `${direction}${end20 - 3}`;
            const pam = uneditedData.seq.substring(idx + 24, idx + 28);
            const entry = { id, direction, start20, end20, proto30, unedited, edited, pam };
            entries = [ ...entries, entry ];
        });
        // FIND REVERSE PROTOSPACERS
        const uneditedRC = revcomp(uneditedData.seq);
        const editedRC = revcomp(editedData.seq);
        ( {minU, preLen, postLen} = minEdit(uneditedRC, editedRC) );
        preHom = uneditedRC.substring(0, preLen);
        postHom = uneditedRC.substring(uneditedRC.length - postLen);
        const rSearch = (preHom.substring(preLen - SEARCH_DIST - 21) +
                         minU.substring(0, Math.min(uLen, 7)) +
                         postHom.substring(0, Math.max(0, 7 - Math.min(uLen, 7))));
        const rIdxs = [...rSearch.matchAll(PAM_RE)].map(x => x.index);
        rIdxs.forEach(x => {
            const direction = "-";
            const rcIdx = x + (preLen - SEARCH_DIST - 21);  // Index of match start in rc str
            const rcStart20 = rcIdx + 4;
            const rcEnd20 = rcStart20 + 20;
            const proto30 = uneditedRC.substring(rcIdx, rcIdx + 30);
            const unedited = uneditedRC.substring(rcStart20 - 4);
            const edited = editedRC.substring(rcStart20 - 4)
            const start20 = uneditedData.seq.length - rcEnd20;
            const end20 = uneditedData.seq.length - rcStart20;
            const id = `${direction}${start20 - 3}`;
            const pam = uneditedRC.substring(rcIdx + 24, rcIdx + 28);
            const entry = { id, direction, start20, end20, proto30, unedited, edited, pam };
            entries = [ ...entries, entry ];
        });
        setProtos(entries);
    }, [useVars, PAMDA, pamMap, pamCutoff, projectData]);
    // Protospacer array updates
    useEffect(() => {
        // Locally cached Doench rs3 calls
        const getCachedScores = async (seqs) => {
            const isCached = seqs.map(seq => seq in protoScoreCache);
            const noncached = seqs.filter(seq => !(seq in protoScoreCache));
            const hasUpdate = (noncached.length > 0)
            let scores;
            if (hasUpdate) {
                setInfo("Evaluating protospacers with Doench Rule Set 3...");
                const URL = "https://api.optipri.me/utils/doench_rs3";
                const seqs = (noncached.map(seq => (seq.substring(0, 25) + "GG" + seq.substring(27)))
                                       .join(","));  // FIXME (NGG)
                const options = { method: "POST", body: JSON.stringify({ seqs }) };
                scores = await fetch(URL, options).then(resp => {
                    if (!resp.ok) {
                        setInfo("Error evaluating protospacers.");
                        throw new Error(JSON.stringify(resp.json()));
                    }
                    setInfo("");
                    return resp.json();
                }).then(data => {
                    const scoreData = Array.isArray(data) ? data : [data];
                    const update = Object.fromEntries(noncached.map((x, i) => [x, scoreData[i]]));
                    setProtoScoreCache(cache => ({ ...cache, ...update }));
                    return isCached.map((cached, i) => (cached ? protoScoreCache[seqs[i]] :
                                                                 update[seqs[i]]) );
                }).catch(e => {
                    console.error(e);
                });
            } else {
                scores = protoScoreCache;
            }
            return scores;
        };
        getCachedScores(protos.map(x => x.proto30))
        .then(scores => {
            if (protos.some(x => !(("score" in x) && (typeof x.score !== "undefined")))) {
                setProtos(protos.map(x => ({ ...x, score: scores[x.proto30] })));
            }
        });
        setProtoMap(Object.fromEntries(protos.map(x => [x.id, x])));
    }, [protos, protoScoreCache]);
    // Update localStorage version of protoScoreCache
    useEffect(() => {
        localStorage.setItem("protoScores", JSON.stringify(protoScoreCache));
    }, [protoScoreCache])
    // Update annotations
    useEffect(() => {
        const annotations = protos.map(x => {
            const name = ("score" in x) && (typeof x.score !== "undefined")
                         ? `${x.id} [PS = ${x.score.toFixed(4)}]` : x.id;
            const direction = x.direction === "+" ? 1 : -1;
            const pamInfo = x.pam in pamMap ? pamMap[x.pam] : { pamVar: "SpNGG" };
            let color;
            if (("score" in x) && (typeof x.score !== "undefined")) {
                color = (pamInfo.pamVar === "SpNGG") ? "lightblue" : "pink";
            } else {
                color = "gray";
            }
            return { name,
                     start: x.start20,
                     end: x.end20,
                     direction,
                     color }
        });
        setProtoAnns(annotations);
    }, [pamMap, protos]);
    // Display info for each protospacer
    useEffect(() => {
        if (selected in protoMap) {
            const { uneditedData, editedData } = projectData;
            const entry = protoMap[selected];
            const name = ("score" in entry) && (typeof entry.score !== "undefined")
                         ? `${entry.id} [PS = ${entry.score.toFixed(4)}]` : entry.id;
            const {minU, minE, preLen} = minEdit(entry.unedited, entry.edited);
            let color;
            if (minU.length === 0) { color = "lime"; }
            else if (minE.length === 0) { color = "pink"; }
            else { color = "cyan"; }
            const uHighlight = { start: preLen, end: preLen + minU.length, color: color };
            const eHighlight = { start: preLen, end: preLen + minE.length, color: color };
            const uData = { seqData: {
                                seq: entry.unedited,
                                cdsList: uneditedData.cdsList.map(x => updateCDS(x, entry))
                            },
                            name,
                            pamVar: pamMap[entry.pam].pamVar,
                            highlights: (minU.length === 0) ? [] : [uHighlight] };
            const eData = { seqData: {
                                seq: entry.edited,
                                cdsList: editedData.cdsList.map(x => updateCDS(x, entry))
                            },
                            highlights: (minE.length === 0) ? [] : [eHighlight] };
            setUsvData(uData);
            setEsvData(eData);
        }
    }, [protoMap, pamMap, selected, protos, projectData]);

    return (
        <Grid
            rowGap="15px"
            columnGap={tokens.space.medium.value}
            padding="20px"
            width="95%"
            templateColumns="1fr 800px 1fr"
        >
            <Card columnStart="1" columnEnd="-1">
                <div ref={ref}>
                    <Heading children={`${projectData.uneditedData.name}`} />
                    <SeqVizWithCDS seqData={{ ...projectData.uneditedData,
                                              annotations: protoAnns }}
                                   selHandler={selHandler} />
                </div>
                <Heading children={`${projectData.editedData.name}`} />
                <SeqVizWithCDS seqData={projectData.editedData} />
            </Card>
            <Card columnStart="1" columnEnd="-1">
            {Object.keys(usvData).length > 0 &&
            <>
                <Heading children={`${usvData.name} (unedited)`} />
                <UneditedSeqViz { ...usvData } />
                <Heading children={`${usvData.name} (edited)`} />
                <EditedSeqViz { ...esvData } />
            </>}
            </Card>
            <Divider columnStart="1" columnEnd="-1" orientation="horizontal" />
            <Card columnStart="1" columnEnd="-1" height="auto">
                {info &&
                <Alert isDismissible={false} hasIcon={true} variation="info">
                    {info}
                </Alert>}
            </Card>
        </Grid>
    );
};

export default Project;
