import { Buffer } from "buffer";
import { KJUR } from "jsrsasign";
import Cookies from "js-cookie";

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
               console.log(byTaxId);
               return byTaxId;
           });
};

export const coordsToRefSeq = (coords) => {
    let query;
    if (("start" in coords) && ("end" in coords)) {
        const { assembly, chrom, start, end } = coords;
        query = { track: "ncbiRefSeqSelect", genome: assembly, chrom, start, end };
    } else {
        const { assembly, chrom, pos } = coords;
        const start = parseInt(pos);
        const end = parseInt(pos) + 1;
        query = { track: "ncbiRefSeqSelect", genome: assembly, chrom, start, end }
    }
    const url = new URL("https://api.genome.ucsc.edu/getData/track");
    url.search = new URLSearchParams(query).toString().replace(/&/g, ';');

    return fetch(url).then(resp => {
               if (!resp.ok) {
                   throw new Error("Failed to get RefSeq annotations from UCSC");
               }
               return resp.json();
           }).then(data => {
               return data["ncbiRefSeqSelect"][0];
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
            if (geneData["strand"] === '-') {
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
    // console.log("Context Exons:", contextExons);
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

/*
 * Make a random string for an ID
 */
export const randomId = (len) => {
    const charSet = "0123456789ABCDEF";
    const chars = [ ...Array(len) ].map(_ => (
        charSet.charAt(Math.floor(Math.random() * charSet.length))));
    return chars.join("");
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
        newInit = { headers: { "Authorization": token, ...init.headers }, ...init };
    }
    return fetch(resource, newInit);
};

export const suspensePromiseWrapper = (promise) => {
    let status = "pending";
    let result;
    let suspender = promise.then(
        r => {
            status = "success";
            result = r;
        },
        e => {
            status = "error";
            result = e;
        }
    );
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
