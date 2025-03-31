import { Buffer } from "buffer";
import { KJUR } from "jsrsasign";
import Cookies from "js-cookie";
import { codonTableForward, codonTableReverse } from "./Codons";

// ****************************** GENOMIC INFO APIs ****************************** 
/* Scraping various web APIs. Each function returns a Promise for the desired return type. */
export const rsIDtoHg38Coords = (rsID) => {
    return fetch("https://clinicaltables.nlm.nih.gov/api/snps/v3/search?" +
                new URLSearchParams({terms: rsID,
                                     df: "rsNum,38.chr,38.pos,38.gene,38.alleles"}))
           .then(resp => {
               if (!resp.ok) {
                   throw new Error("Failed to query dbSNP");
               }
               return resp.json();
           })
           .then(data => {
               let trueIdx = undefined;
               for (let i = 0; i < data[1].length; i++) {
                   if (data[1][i] === rsID) {
                       trueIdx = i;
                       break;
                   }
               }
               if (typeof trueIdx === "undefined") {
                   throw new Error("Could not find rsID in dbSNP. Please enter genomic " +
                                   "coordinates instead.");
               }
               return data[3][trueIdx];
           });
};

export const cvIDtoHg38Coords = (cvID) => {
    const ASM_MAP = { "NCBI36": "hg18",
                      "GRCh37": "hg19",
                      "GRCh38": "hg38",
                      "T2T-CHM13v2.0": "hs1" }
    return fetch("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?" +
                 new URLSearchParams({ db: "clinvar",
                                       id: cvID,
                                       retmode: "json" }).toString())
           .then(resp => {
               if (!resp.ok) {
                   throw new Error("Failed to query ClinVar");
               }
               return resp.json();
           })
           .then(data => {
               if (!("result" in data) || !(cvID in data["result"])) {
                   throw new Error(`Invalid Clinvar ID: ${cvID}`);
               }
               const varData = data["result"][cvID]["variation_set"][0];
               const spdi = varData["canonical_spdi"];
               const [start, unedited, edited] = spdi.split(":").slice(1);
               const coord = varData["variation_loc"].filter(x => (x["status"] === "current"))[0];
               const { chr, assembly_name } = coord;
               return { coords: { assembly: ASM_MAP[assembly_name],
                                  chrom: "chr" + chr,
                                  pos: start },
                        alleles: { eName: varData["variation_name"],
                                   minU: unedited,
                                   minE: edited },
                        gene: data["result"][cvID]["gene_sort"] };
           });
};

export const fetchUCSCGenomes = () => {
    return fetch("https://api.genome.ucsc.edu/list/ucscGenomes")
           .then(resp => {
               if (!resp.ok) {
                   throw new Error("Failed to fetch list of UCSC genomes. Please enter the " +
                                   "sequence you want to edit manually.");
               }
               return resp.json();
           })
           .then(data => {
               let byTaxId = {};
               for (const [genomeName, genomeData] of Object.entries(data["ucscGenomes"])) {
                   const taxId = genomeData["taxId"];
                   if (!(taxId in byTaxId)) {
                       byTaxId[taxId] = { name: genomeData["organism"],
                                          scientificName: genomeData["scientificName"],
                                          genomes: []};
                   }
                   byTaxId[taxId].genomes = [...byTaxId[taxId].genomes, genomeName];
               }
               return byTaxId;
           });
};

export const coordsToRefSeq = (coords) => {
    let query;
    if (("start" in coords) && ("end" in coords)) {
        const { assembly, chrom, start, end } = coords;
        query = { track: "ccdsGene", genome: assembly, chrom, start, end };
    } else {
        const { assembly, chrom, pos } = coords;
        const start = parseInt(pos);
        const end = parseInt(pos) + 1;
        query = { track: "ccdsGene", genome: assembly, chrom, start, end }
    }
    const url = new URL("https://api.genome.ucsc.edu/getData/track");
    url.search = new URLSearchParams(query).toString().replace(/&/g, ';');

    return fetch(url).then(resp => {
               if (!resp.ok) {
                   throw new Error(`Failed to get RefSeq annotations from UCSC: ${resp.status} ${resp.statusText}`);
               }
               return resp.json();
           }).then(data => {
               return data["ccdsGene"][0];
           });
};

export const fetchSequenceFromCoords = (coords, contextLen) => {
    const { assembly, chrom, pos } = coords;
    const startPos = parseInt(pos) - contextLen;
    const endPos = parseInt(pos) + contextLen;

    const url = new URL(`https://api.genome.ucsc.edu/getData/sequence`);
    url.search = new URLSearchParams({
        genome: assembly,
        chrom: chrom,
        start: startPos,
        end: endPos
    }).toString().replace(/&/g, ';'); /* ??? we don't like HTTP spec apparently
                                       * https://www.w3.org/Protocols/rfc2616/rfc2616-sec3.html
                                       */
    return fetch(url)
           .then(resp => {
               if (!resp.ok) {
                   throw new Error("Failed to fetch sequence from UCSC Genome Browser. Please " +
                                   "enter the sequence you want to edit manually.");
               }
               return resp.json();
           })
           .then(data =>  data["dna"]);
};

// ****************************** COMPUTATION ******************************
/* 
 * Figure out the starts and ends of Exons in a specific context window
 * using ncbiRefSeq objects from https://api.genome.ucsc.edu/getData/track
 * Schema: https://genome.ucsc.edu/cgi-bin/hgTables?db=hg38&hgta_group=genes&hgta_track=refSeqComposite&hgta_table=refGene&hgta_doSchema=describe+table+schema
 * 
 */
export const getContextExonTranslations = (geneData, target, contextLen) => {
    if (typeof geneData === "undefined") {
        return [];
    }

    const contextStart = Number(target) - Number(contextLen);
    const contextEnd = Number(target) + Number(contextLen);

    const exonStarts = geneData["exonStarts"]
                       .split(',')
                       .map(Number)
                       .filter(n => (!isNaN(n) & (n !== 0)));
    const exonEnds = geneData["exonEnds"]
                     .split(',')
                     .map(Number)
                     .filter(n => (!isNaN(n) & (n !== 0)));
    const exonFrames = geneData["exonFrames"].split(',').map(Number).filter(n => !isNaN(n));

    // Makes the math way easier down the line
    if (geneData["strand"] === "+") {
        exonStarts[0] = geneData["cdsStart"];
        exonEnds[exonEnds.length - 1] = geneData["cdsEnd"];
        exonFrames[0] = 0;
    } else {
        exonStarts[0] = geneData["cdsStart"];
        exonEnds[exonEnds.length - 1] = geneData["cdsEnd"];
        exonFrames[exonFrames.length - 1] = 0;
    }
    let contextExons = [];
    for (let i = 0; i < exonStarts.length; i++) {
        // Check handles all four cases:
        // - Start before end after
        // - Start before end within
        // - Start within end after
        // - Start within end within
        if (exonStarts[i] <= contextEnd && exonEnds[i] >= contextStart) {
            const exonNumber = geneData["strand"] === '+' ? i + 1 : exonStarts.length - i;
            // Clip to start/end in case of partial overlap
            const startOffset = Math.max(0, exonStarts[i] - contextStart);
            const endOffset = Math.min(exonEnds[i], contextEnd) - contextStart;
            // If the exon starts outside the context we gotta adjust the frame
            let adjustedFrame = exonFrames[i];
            if (exonStarts[i] < contextStart && geneData["strand"] === '+') {
                const distanceFromContextStart = contextStart - exonStarts[i];
                adjustedFrame = (exonFrames[i] + distanceFromContextStart) % 3;
            }
            if (exonEnds[i] > contextEnd && geneData["strand"] === '-') {
                const distanceFromContextStart = exonEnds[i] - contextEnd;
                adjustedFrame = (exonFrames[i] + distanceFromContextStart) % 3;
            }
            contextExons.push({
                name: `${geneData["name2"]} Exon ${exonNumber}`,
                start: startOffset,
                end: endOffset,
                direction: geneData["strand"],
                frame: adjustedFrame
            });
        }
    }
    // NCBI output is different from what is intuitive to work with >.>
    contextExons = contextExons.map(cds => ({ ...cds,
                                              start: cds.start,
                                              end: cds.end,
                                              frame: (3 - cds.frame) % 3 }));
    return contextExons;
};

/*
 * Make *A*nnotations and *T*ranslation props for a given CDS, as annotated from
 * getContextExonTranslations. Notably, start, end, and frame are taken directly from the output.
 */
export const makeCDSAandTs = ({ name, start, end, direction, frame }) => {
    const atStart = Math.min(start, end);
    const atEnd = Math.max(start, end);
    const length = atEnd - atStart;
    const tDelta = direction === "+" ? frame : (length - frame) % 3;
    // The annotation itself is easy
    const annotation = {
        name: name,
        start: atStart,
        end: atEnd,
        direction: direction === "+" ? 1 : -1,
        color: "orange"
    };
    const translation = {
        start: atStart + tDelta,
        end: atEnd,
        direction: direction === "+" ? 1 : -1
    };
    return {
        annotation: annotation,
        translation: translation
    };
};

/*
 * Find indices for minimal unedited/edited sequences.
 */
export const minEdit = (unedited, edited) => {
    let i, j;
    for (i = 0; i < unedited.length && i < edited.length; i++) {
        if (unedited[i] !== edited[i]) { break; }
    }
    unedited = unedited.slice(i);
    edited = edited.slice(i);
    for (j = 0; j < unedited.length && j < edited.length; j++) {
        if (unedited[unedited.length - 1 - j] !== edited[edited.length - 1 - j]) { break; }
    }
    if (j) {
        unedited = unedited.slice(0, -j);
        edited = edited.slice(0, -j);
    }
    return { minU: unedited, minE: edited, preLen: i, postLen: j };
};

/*
 * Update CDS objects based on a selection and the change in length.
 */
export const updateCDS = (cds, selection, delta) => {
    if (selection.start <= cds.start) {
        if (selection.end < cds.start) {
            return { ...cds,
                     start: cds.start + delta,
                     end: cds.end + delta };
        } else if (selection.end >= cds.end) {
            return null;
        } else {
            const selLen = selection.end - selection.start;
            const newStart = selection.start + selLen + delta;
            const newFrame = cds.direction === "+"
                             ? (cds.frame + cds.start - newStart) % 3
                             : cds.frame;
            return { ...cds,
                     start: newStart,
                     end: cds.end + delta,
                     frame: newFrame };
        }
    } else if (selection.start < cds.end) {
        if (selection.end < cds.end ) {
            return { ...cds,
                     end: cds.end + delta }
        } else {
            const newFrame = cds.direction === "+"
                             ? cds.frame
                             : (cds.frame + cds.end - selection.start) % 3;
            return { ...cds,
                     end: selection.start,
                     frame: newFrame };
        }
    } else {
        return { ...cds };
    }
};

/*
 * Return the reverse complement of a DNA sequence.
 */
export const revcomp = (seq) => {
    const complement = seq.replaceAll("A", "t")
                          .replaceAll("C", "g")
                          .replaceAll("G", "c")
                          .replaceAll("T", "a")
                          .toUpperCase();
    return complement.split("").reverse().join("");
};

export const moveToFront = (a, x) => {
    const idx = a.indexOf(x);
    if (idx === -1) {
        throw new Error("Bad idx")
    }
    return [x, ...a.toSpliced(idx, 1)];
}

export const splitDNAbyCDS = (dna, cdsList) => {
    // Sort CDS segments by start coordinate
    cdsList.sort((a, b) => a.start - b.start);
    let result = [];
    let lastIndex = 0;
    for (const cds of cdsList) {
        const { start, end } = cds;
        // Append non-CDS sequence (as one continuous block) from the end of the previous segment to the start of the CDS.
        if (start > lastIndex) {
            result = [...result, [dna.slice(lastIndex, start)]];
        }
        let segment = dna.slice(start, end);
        // For minus-strand CDS, reverse-complement the sequence.
        if (cds.direction === '-') {
            segment = revcomp(segment);
        }
        // Apply the frame:
        // The first `frame` bases (if any) remain unsplit.
        // The rest is split into groups of three (codons).
        const frame = cds.frame || 0;
        const prefix = segment.slice(0, frame);
        const remainder = segment.slice(frame);
        // Use a regex to match groups of 1-3 characters.
        let codons = remainder.match(/.{1,3}/g) || [];
        codons = (prefix ? [prefix, ...codons] : codons);
        codons = codons.map(x => x.length === 3 ? moveToFront(codonTableReverse[codonTableForward[x]], x) : [x]);
        if (cds.direction === "-") {
            codons = codons.map(x => x.map(revcomp)).toReversed();
        }
        result = [...result, ...codons];
        lastIndex = end;
    }
    // Append any trailing non-CDS sequence.
    if (lastIndex < dna.length) {
        result = [...result, [dna.slice(lastIndex)]];
    }
    return result;
}

export const findProtosDirection = (uSeq, eSeq, direction, pamdaData, searchDist = 18) => {
    const pamStr = Object.keys(pamdaData).join("|");
    const PAM_RE = new RegExp(`(?=[ACGT]{24}(?:${pamStr}))`, "g");
    const {minU, preLen, postLen} = minEdit(uSeq, eSeq);
    const uDelta = uSeq.length > eSeq.length ? uSeq.length - eSeq.length : 0;
    const eDelta = eSeq.length > uSeq.length ? eSeq.length - uSeq.length : 0;
    const preHom = uSeq.substring(0, preLen);
    const postHom = uSeq.substring(uSeq.length - postLen);
    const uLen = minU.length;
    const search = (preHom.substring(preLen - searchDist - 21) +
        minU.substring(0, Math.min(uLen, 7)) +
        postHom.substring(0, Math.max(0, 7 - Math.min(uLen, 7))));
    const idxs = [...search.matchAll(PAM_RE)].map(x => x.index);
    return idxs.map(x => {
        const idx = x + (preLen - searchDist - 21);  // Index of match start
        const nickDist = preHom.length - (idx + 21) + 1;
        const start20 = idx + 4;
        const end20 = start20 + 20;
        const proto30 = uSeq.substring(idx, idx + 30);
        const unedited = uSeq.substring(start20 - 4, start20 + 71 + uDelta);
        const edited =   eSeq.substring(start20 - 4, start20 + 71 + eDelta);
        const offset = edited.length - minEdit(unedited, edited).postLen;
        const pam = uSeq.substring(idx + 24, idx + 28);
        const [pamVar, pamScore] = pamdaData[pam]
        return { direction, start20, end20, proto30, unedited, edited,
                 offset, pam, pamVar, pamScore, nickDist };
    });
};

export const scaleProtoScore = (score, pamda) => {
    const PAMDA_BIAS = -1.45;
    const SLOPE = 1;
    const h = Math.min(PAMDA_BIAS, pamda);
    const tenTerm = Math.pow(10, PAMDA_BIAS - h);
    const expTerm = 1 + Math.pow(10, -SLOPE * score);
    const rawScaled = -Math.log10(tenTerm * expTerm - 1) / SLOPE;
    return Math.max(-5, rawScaled);
};

export const sliceSegments = (segments, start, end) => {
    let oldTotal = 0, total = 0;
    let retval = [];
    segments.forEach(segment => {
        const segLen = segment[0].length;
        // oldTotal: # of characters before current, total: # of characters after current
        oldTotal = total;
        total += segLen;
        if (total <= start || oldTotal >= end) {}
        else if (oldTotal < start) {
            retval = [...retval, [segment[0].slice(start - oldTotal, end - oldTotal)]];
        } else if (total < end) {
            retval = [...retval, segment];
        } else {
            retval = [...retval, [segment[0].slice(0, end - oldTotal)]];
        }
    });
    return retval;
};

export const reduceSegments = (segments, offset) => {
    let oldTotal = 0, total = 0;
    let retval = [];
    let segment0 = [];
    let tail = [];
    segments.forEach(segment => {
        const segLen = segment[0].length;
        oldTotal = total;
        total += segLen;
        if (total < 21) {
            segment0 = [...segment0, segment[0]];
        } else if (oldTotal < 21) {
            const prefix = segment[0].slice(0, 21 - oldTotal);
            segment0 = [...segment0, prefix].join("");
            const trimmed = segment.filter(x => x.slice(0, 21 - oldTotal) === prefix)
                                   .map(x => x.slice(21 - oldTotal));
            retval = total === 21 ? [[segment0]] : [[segment0], trimmed];
        } else if (oldTotal < offset || retval.length < 5) {
            retval = [...retval, segment];
        } else {
            tail = [...tail, segment[0]];
        }
    });
    tail = tail.join("");
    retval = tail !== "" ? [...retval, [tail]] : retval;
    return retval;
};

/*
 * Check that an RSA signature is valid. Probably not 100% secure but we'll have
 * backend checks as well.
 */
export const verifyRSASignature = (publicKey, b64Sig, msgStr) => {
    const sigObj = new KJUR.crypto.Signature({ alg: "SHA256withRSA" });
    const hexSig = Buffer.from(b64Sig, "base64").toString("hex");
    sigObj.init(publicKey);
    sigObj.updateString(msgStr);
    return sigObj.verify(hexSig);
};

export const fetchAuth = (tokenName, resource, init) => {
    const token = Cookies.get(tokenName);
    let newInit;
    if (typeof init === "undefined") {
        newInit = { headers: { "Authorization": token } };
    } else if (!("headers" in init)) {
        newInit = { headers: { "Authorization": token }, ...init };
    } else {
        newInit = { ...init, headers: { ...init.headers, Authorization: token } };
    }
    return fetch(resource, newInit);
};

export const suspensePromiseWrapper = (promise) => {
    let status = "pending";
    let result;
    let suspender = promise
    .then(r => {
        status = "success";
        result = r;
    })
    .catch(e => {
        status = "error";
        result = e;
    });
    return {
        read: () => {
            if (status === "pending") {
                throw suspender;
            } else if (status === "error") {
                throw result;
            } else {
                return result;
            }
        }
    };
};
