import { Buffer } from "buffer";
import { KJUR } from "jsrsasign";
import Cookies from "js-cookie";
import { codonTableForward, codonTableReverse } from "./Codons.js";

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
               const [start, ref, mut] = spdi.split(":").slice(1);
               const coord = varData["variation_loc"].filter(x => (x["status"] === "current"))[0];
               const { chr, assembly_name } = coord;
               const aaMatch = varData["variation_name"].match(/\(p\.([^)]+)\)/);
               const aminoAcidChange = aaMatch ? aaMatch[1] : null;
               return { coords: { assembly: ASM_MAP[assembly_name],
                                  chrom: "chr" + chr,
                                  pos: start },
                        alleles: { vName: varData["variation_name"],
                                   ref: ref,
                                   mut: mut,
                                   aminoAcidChange },
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

export const computeProteinPos = (refSeq, genomicPos) => {
    if (!refSeq) return null;
    const pos = parseInt(genomicPos);
    const cdsStart = refSeq["cdsStart"];
    const cdsEnd   = refSeq["cdsEnd"];
    const strand   = refSeq["strand"];
    const exonStarts = refSeq["exonStarts"].split(',').map(Number).filter(n => !isNaN(n) && n !== 0);
    const exonEnds   = refSeq["exonEnds"].split(',').map(Number).filter(n => !isNaN(n) && n !== 0);

    const idxs = strand === '+'
        ? Array.from({length: exonStarts.length}, (_, i) => i)
        : Array.from({length: exonStarts.length}, (_, i) => exonStarts.length - 1 - i);

    let cdsOffset = 0;
    for (const i of idxs) {
        const exStart = Math.max(exonStarts[i], cdsStart);
        const exEnd   = Math.min(exonEnds[i],   cdsEnd);
        if (exEnd <= exStart) continue;

        if (strand === '+') {
            if (pos < exStart) break;
            if (pos < exEnd) {
                return Math.floor((cdsOffset + pos - exStart) / 3) + 1;
            }
            cdsOffset += exEnd - exStart;
        } else {
            if (pos >= exEnd) break;
            if (pos >= exStart) {
                return Math.floor((cdsOffset + exEnd - 1 - pos) / 3) + 1;
            }
            cdsOffset += exEnd - exStart;
        }
    }
    return null;
};

const _HGVS_POS_STR = String.raw`[-*]?\d+(?:[+-]\d+)?`;
const _parseHgvsPos = (s) => {
    const m = s.match(/^([-*]?)(\d+)([+-]\d+)?$/);
    if (!m) throw new Error(`Invalid HGVS position: ${s}`);
    const [, prefix, num, intron] = m;
    const region = prefix === '-' ? "utr5" : prefix === '*' ? "utr3" : "cds";
    return { region, cdsOffset: parseInt(num), intronOffset: intron ? parseInt(intron) : 0 };
};
const _HGVS_PATTERNS = [
    { re: new RegExp(`^(${_HGVS_POS_STR})([A-Z])>([A-Z])$`, 'i'),
      make: m => ({ type: "sub", pos1: _parseHgvsPos(m[1]), pos2: null,
                    ref: m[2].toUpperCase(), mut: m[3].toUpperCase() }) },
    { re: new RegExp(`^(${_HGVS_POS_STR})_(${_HGVS_POS_STR})delins([ACGT]+)$`, 'i'),
      make: m => ({ type: "delins", pos1: _parseHgvsPos(m[1]), pos2: _parseHgvsPos(m[2]),
                    ref: null, mut: m[3].toUpperCase() }) },
    { re: new RegExp(`^(${_HGVS_POS_STR})delins([ACGT]+)$`, 'i'),
      make: m => ({ type: "delins", pos1: _parseHgvsPos(m[1]), pos2: null,
                    ref: null, mut: m[2].toUpperCase() }) },
    { re: new RegExp(`^(${_HGVS_POS_STR})_(${_HGVS_POS_STR})ins([ACGT]+)$`, 'i'),
      make: m => ({ type: "ins", pos1: _parseHgvsPos(m[1]), pos2: _parseHgvsPos(m[2]),
                    ref: null, mut: m[3].toUpperCase() }) },
    { re: new RegExp(`^(${_HGVS_POS_STR})_(${_HGVS_POS_STR})del([ACGT]*)$`, 'i'),
      make: m => ({ type: "del", pos1: _parseHgvsPos(m[1]), pos2: _parseHgvsPos(m[2]),
                    ref: m[3] ? m[3].toUpperCase() : null, mut: "" }) },
    { re: new RegExp(`^(${_HGVS_POS_STR})del([ACGT]*)$`, 'i'),
      make: m => ({ type: "del", pos1: _parseHgvsPos(m[1]), pos2: null,
                    ref: m[2] ? m[2].toUpperCase() : null, mut: "" }) },
    { re: new RegExp(`^(${_HGVS_POS_STR})_(${_HGVS_POS_STR})dup([ACGT]*)$`, 'i'),
      make: m => ({ type: "dup", pos1: _parseHgvsPos(m[1]), pos2: _parseHgvsPos(m[2]),
                    ref: m[3] ? m[3].toUpperCase() : null, mut: null }) },
    { re: new RegExp(`^(${_HGVS_POS_STR})dup([ACGT]*)$`, 'i'),
      make: m => ({ type: "dup", pos1: _parseHgvsPos(m[1]), pos2: null,
                    ref: m[2] ? m[2].toUpperCase() : null, mut: null }) },
];
export const parseHgvs = (input) => {
    const cleaned = input.trim();
    const cMatch = cleaned.match(/c\.[A-Za-z0-9+\-*>_]+/i);
    if (!cMatch) throw new Error("Missing 'c.' notation in HGVS input");
    const cPayload = cMatch[0];
    const rest = cleaned.slice(0, cMatch.index) + " " + cleaned.slice(cMatch.index + cPayload.length);
    const nmMatch = rest.match(/\bNM_\d+(?:\.\d+)?\b/i);
    let transcriptKey, isNM;
    if (nmMatch) {
        transcriptKey = nmMatch[0].toUpperCase();
        isNM = true;
    } else {
        const geneMatch = rest.match(/[A-Za-z][A-Za-z0-9]{1,9}/);
        if (!geneMatch) throw new Error("Missing transcript identifier (gene symbol or NM accession)");
        transcriptKey = geneMatch[0].toUpperCase();
        isNM = false;
    }
    const body = cPayload.slice(2);
    for (const { re, make } of _HGVS_PATTERNS) {
        const m = body.match(re);
        if (m) return { transcriptKey, isNM, ...make(m) };
    }
    throw new Error(`Unsupported HGVS c. notation: c.${body}`);
};

export const cdsOffsetToGenomicPos = (refSeq, region, cdsOffset, intronOffset = 0) => {
    if (!refSeq) return null;
    const cdsStart = refSeq["cdsStart"];
    const cdsEnd   = refSeq["cdsEnd"];
    const strand   = refSeq["strand"];
    const exStarts = refSeq["exonStarts"].split(',').map(Number).filter(n => !isNaN(n) && n !== 0);
    const exEnds   = refSeq["exonEnds"].split(',').map(Number).filter(n => !isNaN(n) && n !== 0);
    const exons = exStarts.map((s, i) => ({ gStart: s, gEnd: exEnds[i] }));
    const txExons = strand === '+' ? exons : exons.slice().reverse();
    const clip = (ex) => {
        let s = ex.gStart, e = ex.gEnd;
        if (region === "cds")        { s = Math.max(s, cdsStart); e = Math.min(e, cdsEnd); }
        else if (region === "utr5" && strand === '+') { e = Math.min(e, cdsStart); }
        else if (region === "utr5" && strand === '-') { s = Math.max(s, cdsEnd); }
        else if (region === "utr3" && strand === '+') { s = Math.max(s, cdsEnd); }
        else if (region === "utr3" && strand === '-') { e = Math.min(e, cdsStart); }
        return e > s ? { gStart: s, gEnd: e } : null;
    };
    const applyIntron = (g) => strand === '+' ? g + intronOffset : g - intronOffset;
    // UTR5: position -N counts from CDS boundary backwards in transcript order
    if (region === "utr5") {
        let total = 0;
        for (const ex of txExons) { const c = clip(ex); if (c) total += c.gEnd - c.gStart; }
        const target = total - cdsOffset + 1;
        if (target < 1) return null;
        let count = 0;
        for (const ex of txExons) {
            const c = clip(ex);
            if (!c) continue;
            const len = c.gEnd - c.gStart;
            if (count + len >= target) {
                const within = target - count;
                const g = strand === '+' ? c.gStart + within - 1 : c.gEnd - within;
                return applyIntron(g);
            }
            count += len;
        }
        return null;
    }
    // CDS and UTR3: count the Nth nucleotide in transcript order
    let count = 0;
    for (const ex of txExons) {
        const c = clip(ex);
        if (!c) continue;
        const len = c.gEnd - c.gStart;
        if (count + len >= cdsOffset) {
            const within = cdsOffset - count;
            const g = strand === '+' ? c.gStart + within - 1 : c.gEnd - within;
            return applyIntron(g);
        }
        count += len;
    }
    return null;
};

export const cdsOffsetToGenomicRange = (refSeq, pos1, pos2) => {
    const g1 = cdsOffsetToGenomicPos(refSeq, pos1.region, pos1.cdsOffset, pos1.intronOffset);
    const p2 = pos2 || pos1;
    const g2 = cdsOffsetToGenomicPos(refSeq, p2.region, p2.cdsOffset, p2.intronOffset);
    if (g1 === null || g2 === null) return null;
    return { genomicStart: Math.min(g1, g2), genomicEnd: Math.max(g1, g2) };
};

const _fetchGenomicSeq = async ({ assembly, chrom }, startPos, endPos) => {
    const url = new URL("https://api.genome.ucsc.edu/getData/sequence");
    url.search = new URLSearchParams({ genome: assembly, chrom, start: startPos, end: endPos })
                 .toString().replace(/&/g, ';');
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Failed to fetch sequence from UCSC");
    const data = await resp.json();
    return (data["dna"] || "").toUpperCase();
};

const _fetchTrackEntries = async ({ assembly, chrom, start, end }, track) => {
    const url = new URL("https://api.genome.ucsc.edu/getData/track");
    url.search = new URLSearchParams({ track, genome: assembly, chrom, start, end })
                 .toString().replace(/&/g, ';');
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to fetch ${track} from UCSC`);
    const data = await resp.json();
    return data[track] || [];
};

export const resolveTranscript = async (transcriptKey, isNM, assembly) => {
    // Resolve gene symbol (or NM accession) → { symbol, chrom, chr range } for
    // the requested assembly. We go direct to UCSC's `ncbiRefSeqSelect` track
    // (which is MANE Select for human) via UCSC's search endpoint: that avoids
    // the hg19/hg38 confusion in mygene's `genomic_pos` field.
    const unversionedNm = isNM ? transcriptKey.replace(/\.\d+$/, '') : null;
    const q = isNM ? `refseq.rna:${unversionedNm}` : `symbol:${transcriptKey}`;
    const myGeneUrl = new URL("https://mygene.info/v3/query");
    myGeneUrl.search = new URLSearchParams({
        q, species: "human",
        fields: "symbol,genomic_pos,genomic_pos_hg19,genomic_pos_hg38",
    }).toString();
    const myGeneResp = await fetch(myGeneUrl).then(r => r.json());
    const hits = myGeneResp["hits"] || [];
    const hit = isNM
        ? hits[0]
        : hits.find(h => (h.symbol || "").toUpperCase() === transcriptKey);
    if (!hit) throw new Error(`No gene found for ${transcriptKey}`);
    console.debug("[hgvs] mygene hit:", hit);
    const gene = hit["symbol"] || transcriptKey;
    // Prefer an explicit assembly-specific field when present, else `genomic_pos`.
    const candidates = [
        hit[`genomic_pos_${assembly}`],
        assembly === "hg38" ? hit["genomic_pos"] : null,
        assembly === "hg19" ? hit["genomic_pos_hg19"] : null,
    ].filter(Boolean);
    let genomicPos = candidates[0];
    if (Array.isArray(genomicPos)) {
        genomicPos = genomicPos.find(g => /^(chr)?(\d+|[XYM])$/.test(g.chr)) || genomicPos[0];
    }
    if (!genomicPos) throw new Error(`No ${assembly} genomic location for ${transcriptKey}`);
    const rawChr = String(genomicPos["chr"]);
    const chrom = rawChr.startsWith("chr") ? rawChr : `chr${rawChr}`;
    const pad = 1000;
    const chrStart = Math.max(0, Math.min(genomicPos["start"], genomicPos["end"]) - pad);
    const chrEnd   = Math.max(genomicPos["start"], genomicPos["end"]) + pad;
    console.debug("[hgvs] mygene resolved:", { gene, assembly, chrom, chrStart, chrEnd });
    // Strategy: pull all ncbiRefSeqCurated entries in the range, filter to this gene
    // by `name2`. For gene-path, prefer the entry also present in ncbiRefSeqSelect
    // (MANE Select canonical). For NM-path, match on accession (versioned then unversioned).
    const curatedEntries = await _fetchTrackEntries(
        { assembly, chrom, start: chrStart, end: chrEnd }, "ncbiRefSeqCurated");
    console.debug("[hgvs] ncbiRefSeqCurated entries:",
        curatedEntries.map(e => ({ name: e.name, name2: e.name2 })));
    let refSeq;
    if (isNM) {
        refSeq = curatedEntries.find(e => e.name?.toUpperCase() === transcriptKey);
        if (!refSeq) {
            refSeq = curatedEntries.find(
                e => e.name?.toUpperCase().replace(/\.\d+$/, '') === unversionedNm);
        }
        if (!refSeq) {
            throw new Error(`Transcript ${transcriptKey} not found in ncbiRefSeqCurated at ${chrom}:${chrStart}-${chrEnd}`);
        }
    } else {
        const geneMatches = curatedEntries.filter(
            e => (e.name2 || "").toUpperCase() === transcriptKey);
        if (geneMatches.length === 0) {
            throw new Error(`No ncbiRefSeqCurated entries for ${transcriptKey} at ${chrom}:${chrStart}-${chrEnd}`);
        }
        const selectEntries = await _fetchTrackEntries(
            { assembly, chrom, start: chrStart, end: chrEnd }, "ncbiRefSeqSelect");
        const selectNames = new Set(selectEntries.map(e => e.name?.toUpperCase()));
        refSeq = geneMatches.find(e => selectNames.has(e.name?.toUpperCase()));
        if (!refSeq) {
            // Fallback: longest CDS among this gene's transcripts.
            refSeq = geneMatches.reduce((best, e) => {
                const len = (e.cdsEnd ?? 0) - (e.cdsStart ?? 0);
                const bestLen = best ? (best.cdsEnd - best.cdsStart) : -1;
                return len > bestLen ? e : best;
            }, null);
        }
    }
    console.debug("[hgvs] selected transcript:", refSeq?.name);
    return { chrom, refSeq, gene };
};

export const hgvsToHg38Coords = async (input, assembly = "hg38") => {
    const parsed = parseHgvs(input);
    const { transcriptKey, isNM, type, pos1, pos2, mut: hMut, ref: hRef } = parsed;
    const { chrom, refSeq, gene } = await resolveTranscript(transcriptKey, isNM, assembly);
    const strand = refSeq["strand"];
    console.debug("[hgvs] parsed:", parsed);
    console.debug("[hgvs] refSeq:", {
        name: refSeq["name"], strand,
        cdsStart: refSeq["cdsStart"], cdsEnd: refSeq["cdsEnd"],
        exonStarts: refSeq["exonStarts"], exonEnds: refSeq["exonEnds"],
    });
    const range = cdsOffsetToGenomicRange(refSeq, pos1, pos2);
    console.debug("[hgvs] genomic range:", range);
    if (!range) throw new Error(`Failed to map ${input} to genomic coordinates`);
    // Self-check: for CDS substitutions (no intron offset), verify the mapped
    // genomic position reproduces the expected amino-acid index. Catches
    // off-by-one / strand errors before they silently misplace the edit.
    if (pos1.region === "cds" && pos1.intronOffset === 0 && type === "sub") {
        const expectedAa = Math.floor((pos1.cdsOffset - 1) / 3) + 1;
        const actualAa = computeProteinPos(refSeq, range.genomicStart);
        console.debug("[hgvs] aa self-check:", { expectedAa, actualAa, genomicPos: range.genomicStart });
        if (actualAa !== expectedAa) {
            throw new Error(
                `HGVS self-check failed: c.${pos1.cdsOffset} mapped to ` +
                `${chrom}:${range.genomicStart} (codon ${actualAa}), expected codon ${expectedAa}. ` +
                `Transcript ${refSeq["name"]} strand=${strand}.`
            );
        }
    }
    // Self-check: verify that c.1–c.3 of the selected transcript spell ATG.
    // This is transcript-intrinsic — catches strand / exon-walk bugs regardless
    // of the user's HGVS ref base.
    {
        const g1 = cdsOffsetToGenomicPos(refSeq, "cds", 1, 0);
        const g2 = cdsOffsetToGenomicPos(refSeq, "cds", 2, 0);
        const g3 = cdsOffsetToGenomicPos(refSeq, "cds", 3, 0);
        const [lo, hi] = [Math.min(g1, g2, g3), Math.max(g1, g2, g3)];
        const seq = await _fetchGenomicSeq({ assembly, chrom }, lo, hi + 1);
        const baseAt = (g) => seq[g - lo];
        const txCodon = (strand === '+' ? [g1, g2, g3] : [g1, g2, g3])
            .map(g => {
                const b = baseAt(g);
                return strand === '+' ? b : revcomp(b);
            }).join("").toUpperCase();
        console.debug("[hgvs] ATG self-check:", { g1, g2, g3, txCodon });
        if (txCodon !== "ATG") {
            throw new Error(
                `HGVS self-check failed: start codon of ${refSeq["name"]} (strand ${strand}) ` +
                `reads "${txCodon}" at c.1–c.3, expected "ATG". CDS mapping is off.`
            );
        }
    }
    let ref, mut, genomicPos, warning = null;
    if (type === "sub") {
        genomicPos = range.genomicStart;
        ref = strand === '+' ? hRef : revcomp(hRef);
        mut = strand === '+' ? hMut : revcomp(hMut);
    } else if (type === "del") {
        genomicPos = range.genomicStart;
        if (hRef) {
            ref = strand === '+' ? hRef : revcomp(hRef);
        } else {
            ref = await _fetchGenomicSeq({ assembly, chrom }, range.genomicStart, range.genomicEnd + 1);
        }
        mut = "";
    } else if (type === "delins") {
        genomicPos = range.genomicStart;
        ref = await _fetchGenomicSeq({ assembly, chrom }, range.genomicStart, range.genomicEnd + 1);
        mut = strand === '+' ? hMut : revcomp(hMut);
    } else if (type === "ins") {
        genomicPos = range.genomicEnd;
        ref = "";
        mut = strand === '+' ? hMut : revcomp(hMut);
    } else if (type === "dup") {
        const origSeq = await _fetchGenomicSeq({ assembly, chrom }, range.genomicStart, range.genomicEnd + 1);
        if (hRef) {
            const expectedPlus = strand === '+' ? hRef : revcomp(hRef);
            if (origSeq.toUpperCase() !== expectedPlus.toUpperCase()) {
                const actualTx = strand === '+' ? origSeq : revcomp(origSeq);
                warning = `HGVS specifies reference "${hRef}" at the duplication site, ` +
                          `but the genome has "${actualTx}".`;
            }
        }
        genomicPos = strand === '+' ? range.genomicEnd + 1 : range.genomicStart;
        ref = "";
        mut = origSeq;
    } else {
        throw new Error(`Unhandled variant type: ${type}`);
    }
    return {
        coords: { assembly, chrom, pos: genomicPos.toString() },
        alleles: { vName: input, ref, mut, aminoAcidChange: null },
        gene,
        refSeq,
        warning,
    };
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
        name: name ?? "CDS",
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
                             ? ((cds.frame + cds.start - newStart) % 3 + 3) % 3
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
                             : ((cds.frame + cds.end - selection.start) % 3 + 3) % 3;
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
    const complement = seq.toUpperCase()
                          .replaceAll("A", "t")
                          .replaceAll("C", "g")
                          .replaceAll("G", "c")
                          .replaceAll("T", "a")
                          .replaceAll("N", "n")
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
    const decodeIupac = (array) => {
        const IUPAC = {
            "A": ["A"],
            "C": ["C"],
            "G": ["G"],
            "T": ["T"],
            "N": ["A", "C", "G", "T"]
        };
        if (array.length === 1) {
            return IUPAC[array[0]];
        } else {
            return IUPAC[array[0]].flatMap(x => decodeIupac(array.slice(1)).map(y => x + y));
        }
    }
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
        codons = codons.map(x => x.includes("N") || (x.length !== 3)
                                 ? [x] : moveToFront(codonTableReverse[codonTableForward[x]], x));
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
    result = result.map(seg => seg.flatMap(x => x.includes("N")
                                                ? decodeIupac(x.split("").flatMap((y, i) => i < y.length - 1
                                                                                            ? [y, "N"]
                                                                                            : [y]))
                                                : [x]));
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

// Position-dependent mismatch intolerance weights (higher = more discriminating)
// Based on Kim et al. Cell 2023 Figure 7A: relative editing at mismatched targets
// Index 0 = spacer pos 1 (PAM-distal), index 19 = spacer pos 20 (PAM-proximal)
const SPACER_WEIGHTS = [
    0.05, 0.05,
    0.2, 0.2, 0.3, 0.3, 0.3, 0.3,
    0.4, 0.4,
    0.5, 0.55, 0.6, 0.7, 0.8,
    1.0, 1.0,
    0.3, 0.2, 0.15
];
const PBS_MISMATCH_WEIGHT = 0.7;

// Compute allele specificity for a pegRNA given user-marked heterozygous positions.
// hetPositions: Map<seqIndex, altBase>
// spacerStart/spacerEnd: full-sequence indices of the 20-nt protospacer
// direction: 1 (fwd) or -1 (rev)
// pbsLen: primer binding site length
// refSeq: full reference sequence (uneditedData.seq)
// pamdaData: HT-PAMDA lookup { "AGGG": ["SpNGG", -1.35], ... }
export const computeAlleleSpecificity = (hetPositions, spacerStart, spacerEnd, direction, pbsLen, refSeq, pamdaData) => {
    if (!hetPositions || hetPositions.size === 0) return null;

    let weightedScore = 0;
    const hits = [];

    // PAM region (4 nt downstream of spacer on protospacer strand)
    const pamStart = direction === 1 ? spacerEnd : spacerStart - 4;
    const pamEnd   = direction === 1 ? spacerEnd + 4 : spacerStart;
    const pamHets = [];
    for (let seqPos = pamStart; seqPos < pamEnd; seqPos++) {
        if (hetPositions.has(seqPos)) pamHets.push(seqPos);
    }
    if (pamHets.length > 0 && pamdaData) {
        let refPam = refSeq.slice(pamStart, pamEnd).toUpperCase();
        if (direction === -1) refPam = revcomp(refPam);
        let altPam = refPam.split('');
        for (const seqPos of pamHets) {
            const pamIdx = direction === 1 ? seqPos - pamStart : pamEnd - 1 - seqPos;
            let altBase = hetPositions.get(seqPos).toUpperCase();
            if (direction === -1) altBase = revcomp(altBase);
            altPam[pamIdx] = altBase;
        }
        altPam = altPam.join('');
        const refEntry = pamdaData[refPam];
        const altEntry = pamdaData[altPam];
        const refScore = refEntry ? refEntry[1] : -3.0;
        const altScore = altEntry ? altEntry[1] : -3.0;
        const pamdaDelta = refScore - altScore;
        const pamDiscrimination = Math.min(Math.max(pamdaDelta / 0.6, 0), 1.0);
        hits.push({ region: 'pam', seqPositions: pamHets, refPam, altPam, refScore, altScore, pamdaDelta, weight: pamDiscrimination });
        weightedScore += pamDiscrimination;
    }

    // Spacer region (20 nt)
    for (let seqPos = spacerStart; seqPos < spacerEnd; seqPos++) {
        if (hetPositions.has(seqPos)) {
            const spacerIdx = direction === 1 ? seqPos - spacerStart : spacerEnd - 1 - seqPos;
            const w = SPACER_WEIGHTS[spacerIdx] || 0.3;
            weightedScore += w;
            hits.push({ seqPos, spacerPos: spacerIdx + 1, weight: w, region: 'spacer' });
        }
    }

    // PBS region (upstream of nick, excluding spacer overlap)
    const nickPos = direction === 1 ? spacerStart + 17 : spacerEnd - 18;
    const pbsS = direction === 1 ? nickPos - (pbsLen || 13) : nickPos + 1;
    const pbsE = direction === 1 ? nickPos : nickPos + (pbsLen || 13) + 1;
    for (let seqPos = Math.min(pbsS, pbsE); seqPos < Math.max(pbsS, pbsE); seqPos++) {
        if (seqPos >= spacerStart && seqPos < spacerEnd) continue;
        if (hetPositions.has(seqPos)) {
            weightedScore += PBS_MISMATCH_WEIGHT;
            hits.push({ seqPos, weight: PBS_MISMATCH_WEIGHT, region: 'pbs' });
        }
    }

    if (hits.length === 0) return { score: 0, label: "None", hits };

    const score = Math.min(weightedScore, 1.0);
    let label;
    const pamHit = hits.find(h => h.region === 'pam');
    if (pamHit && pamHit.pamdaDelta >= 0.4) label = "PAM";
    else if (score >= 0.7) label = "High";
    else if (score >= 0.3) label = "Moderate";
    else label = "Low";
    return { score, label, hits };
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
        } else if (oldTotal < offset || retval.length < 6) {
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

// CFD off-target scoring is a long-running job. The API kicks off the work
// async: POST returns 202 + a job_id immediately, the actual scoring happens
// in a backend Lambda, and the client polls GET /utils/cfd_score/{id} until
// status == "complete" (or "failed"). Cold scoring takes ~75 s; warm ~5 s.
export const fetchCfdScore = async (
    guide,
    { max_mm = 6, threshold = 0.2, pollIntervalMs = 3000, timeoutMs = 180000 } = {}
) => {
    const base = "https://api.optipri.me/utils/cfd_score";
    // 1) start the job
    const postResp = await fetchAuth("ac_token", base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guide, max_mm, threshold }),
    });
    if (!postResp.ok) {
        throw new Error(`cfd_score POST failed: ${postResp.status} ${await postResp.text()}`);
    }
    const { job_id } = await postResp.json();
    // 2) poll until terminal status
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, pollIntervalMs));
        const getResp = await fetchAuth("ac_token", `${base}/${job_id}`);
        if (!getResp.ok) {
            throw new Error(`cfd_score GET failed: ${getResp.status}`);
        }
        const body = await getResp.json();
        if (body.status === "complete") return body;          // { job_id, status, hits, n_candidates }
        if (body.status === "failed") throw new Error(body.error || "scoring failed");
        // else: pending / running, keep polling
    }
    throw new Error(`cfd_score timed out after ${timeoutMs} ms`);
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

export const downloadBinary = (resp) => {
    const EXTENSIONS = {
        "application/gzip": ".gz",
        "application/zip": ".zip"
    }
    if (!resp.ok) { throw new Error(resp.status); }
    return Promise.all([resp.text(), resp.headers.get("content-type"), resp.headers.get("content-disposition")])
           .then(([text, contentType, contentDisposition]) => {
               // Decode base64
               const binary = atob(text);
               const bytes = new Uint8Array(binary.length);
               for (let i = 0; i < binary.length; i++) {
                   bytes[i] = binary.charCodeAt(i);
               }
               const blob = new Blob([bytes], { type: contentType })
               // Extract filename from header
               const ext = contentType in EXTENSIONS ? EXTENSIONS[contentType] : "";
               let filename = `download${ext}`;
               const match = /filename="([^"]+)"/.exec(contentDisposition);
               if (match && match[1]) {
                   filename = match[1];
               }
               const url = window.URL.createObjectURL(blob);
               const a = document.createElement("a");
               a.href = url;
               a.download = filename;
               document.body.appendChild(a);
               a.click();
               a.remove();
               window.URL.revokeObjectURL(url);
           });
};
