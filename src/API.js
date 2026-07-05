import React, { useState } from "react";
import Cookies from "js-cookie";
import { decodeToken } from "react-jwt";
import { Button, Card, Flex, Heading, Text, View } from "@aws-amplify/ui-react";

const API_BASE = "https://api.optipri.me";
const STORAGE_BASE = "https://storage.optipri.me";

const TokenPanel = () => {
    const [revealed, setRevealed] = useState(false);
    const [copied, setCopied] = useState(false);
    const token = Cookies.get("ac_token");

    if (!token) {
        return (
            <Card variation="outlined">
                <Heading level={4}>Your API token</Heading>
                <Text>Log in to view your API token.</Text>
            </Card>
        );
    }

    const decoded = decodeToken(token);
    const expSec = decoded && decoded.exp;
    const expStr = expSec ? new Date(expSec * 1000).toISOString() : "unknown";

    const copy = () => {
        navigator.clipboard.writeText(token).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    return (
        <Card variation="outlined">
            <Heading level={4}>Your API token</Heading>
            <Text fontSize="0.9em">
                This is your personal OptiPrime access token. Send it in the
                <code> Authorization </code> header (raw, no <code>Bearer</code> prefix).
                Expires <code>{expStr}</code>.
            </Text>
            {!revealed ? (
                <Flex marginTop="0.5em">
                    <Button onClick={() => setRevealed(true)}>Reveal API token</Button>
                </Flex>
            ) : (
                <>
                    <View marginTop="0.5em" padding="0.5em" backgroundColor="#f4f4f4"
                          fontFamily="monospace" fontSize="0.85em"
                          style={{ wordBreak: "break-all" }}>
                        {token}
                    </View>
                    <Flex marginTop="0.5em">
                        <Button onClick={copy}>{copied ? "Copied!" : "Copy"}</Button>
                        <Button onClick={() => setRevealed(false)}>Hide</Button>
                    </Flex>
                </>
            )}
        </Card>
    );
};

const Code = ({ children }) => (
    <View as="pre" padding="0.75em" backgroundColor="#f4f4f4" fontSize="0.85em"
          style={{ overflowX: "auto", whiteSpace: "pre", borderRadius: "4px" }}>
        <code>{children}</code>
    </View>
);

const Endpoint = ({ method, url, children }) => (
    <Card variation="outlined" marginTop="1em">
        <Heading level={4}>
            <code>{method}</code> <code>{url}</code>
        </Heading>
        {children}
    </Card>
);

const API = () => {
    const hgvsBody = JSON.stringify(
        { input: "NM_000546.6:c.215C>G", assembly: "hg38" });
    const protosBody = JSON.stringify(
        { uSeq: "ACGT...75nt...ACGT", eSeq: "ACGT...75nt...ACGT", cdsList: [] });
    const submitBodyExample = `{
  "name": "my_job",
  "uneditedData": { "name": "GENE (WT)", "seq": "ACGT...", "cdsList": [] },
  "editedData":   { "name": "GENE:c.215C>G", "seq": "ACGT...", "cdsList": [] },
  "subJobs": [
    {
      "name": "my_job_SpNGG1",
      "unedited": "...",
      "edit_segments": [["ACGT..."], ...],
      "settings": { "cas9_pam": "SpNGG" }
    }
  ],
  "settings": { "cell_type": "HeLa" }
}`;

    return (
        <View width="80%" paddingBottom="10em">
            <View marginTop="1em">
                <TokenPanel />
            </View>

            <Heading level={3} marginTop="1.5em">
                <code>api.optipri.me</code>
            </Heading>

            <Endpoint method="POST" url="/utils/genomic/hgvs" auth="none">
                <Text fontSize="0.9em">
                    Resolve an HGVS <code>c.</code> notation to hg38 (or hg19)
                    genomic coordinates, ref/alt alleles, and the resolved transcript.
                </Text>
                <Code>{`curl -X POST ${API_BASE}/utils/genomic/hgvs \\
  -H "Authorization: $OPTIPRIME_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${hgvsBody}'`}</Code>
            </Endpoint>

            <Endpoint method="POST" url="/utils/protospacers" auth="none">
                <Text fontSize="0.9em">
                    Search for SpNGG (and other PAM-variant) protospacers around
                    an edit. Both <code>uSeq</code> and <code>eSeq</code> are the
                    full sequence windows; <code>cdsList</code> may be empty if
                    you don't want synonymous codon alternatives in the output.
                </Text>
                <Code>{`curl -X POST ${API_BASE}/utils/protospacers \\
  -H "Authorization: $OPTIPRIME_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${protosBody}'`}</Code>
            </Endpoint>

            <Endpoint method="PUT" url="/jobs" auth="token">
                <Text fontSize="0.9em">
                    Submit a pegRNA design job. The payload mirrors what the
                    web UI submits; build one protospacer entry per <code>subJobs</code> item.
                </Text>
                <Code>{`curl -X PUT ${API_BASE}/jobs \\
  -H "Authorization: $OPTIPRIME_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${submitBodyExample}'`}</Code>
            </Endpoint>

            <Endpoint method="GET" url="/jobs" auth="token">
                <Text fontSize="0.9em">List all jobs for the authenticated user.</Text>
                <Code>{`curl ${API_BASE}/jobs \\
  -H "Authorization: $OPTIPRIME_TOKEN"`}</Code>
            </Endpoint>

            <Endpoint method="GET" url="/jobs/{jobID}" auth="token">
                <Text fontSize="0.9em">
                    Fetch a single job, including its current <code>status</code>
                    {" "}(<code>SUBMITTED</code>, <code>RUNNING</code>, <code>FINISHED</code>).
                </Text>
                <Code>{`curl ${API_BASE}/jobs/$JOB_ID \\
  -H "Authorization: $OPTIPRIME_TOKEN"`}</Code>
            </Endpoint>

            <Heading level={3} marginTop="1.5em">
                <code>storage.optipri.me</code>
            </Heading>

            <Endpoint method="GET" url="/top1/{jobID}" auth="token">
                <Text fontSize="0.9em">
                    Download the top-ranked OptiPrime edits for a finished job.
                    The response body is base64-encoded gzip wrapping a single TSV
                    file (sorted by <code>OptiPrime_score</code>, descending).
                </Text>
                <Code>{`curl ${STORAGE_BASE}/top1/$JOB_ID \\
  -H "Authorization: $OPTIPRIME_TOKEN"`}</Code>
            </Endpoint>

            <Endpoint method="GET" url="/full_outputs/{jobID}" auth="token">
                <Text fontSize="0.9em">
                    Download the full output archive for a finished job. The
                    response body is base64-encoded; decoding yields a zip
                    containing every output file (ranked edits, per-protospacer
                    breakdowns, plots, settings).
                </Text>
                <Code>{`curl ${STORAGE_BASE}/full_outputs/$JOB_ID \\
  -H "Authorization: $OPTIPRIME_TOKEN" \\
  | base64 -d > $JOB_ID.zip`}</Code>
            </Endpoint>

        </View>
    );
};

export default API;
