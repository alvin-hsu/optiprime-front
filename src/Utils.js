import "./Utils.css";

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
            }).then(data => {
                let trueIdx = undefined;
                for (let i = 0; i < data[1].length; i++) {
                    if (data[1][i] === rsID) {
                        trueIdx = i;
                        break;
                    }
                }
                if (typeof trueIdx === "undefined") {
                    throw new Error("Could not find rsID in dbSNP");
                }
                return data[3][trueIdx];
            });
}

export const coordsToRefSequence = (coords, contextLen) => {
    let startPos, endPos;
    if (typeof coords.pos === "object") {  // Range represented as [start, end] both as ints
        startPos = coords.pos[0] - contextLen;
        endPos = coords.pos[1] + contextLen;
    } else if (typeof coords.pos === "number") {  // Range represented as single int
        startPos = coords.pos - contextLen;
        endPos = coords.pos + contextLen;
    } else if (typeof coords.pos === "string") {
        endPos = Number(coords.pos)
        if (isNaN(endPos)) {
            throw new Error("Invalid position specified in coordsToRefSequence [AH]");
        }
        startPos = endPos - contextLen;
        endPos = endPos + contextLen;
    } else {
        throw new Error("Invalid position specified in coordsToRefSequence [AH]");
    }
    const query = ("genome=" + coords.assembly + ";" +
                   "chrom=" + coords.chrom + ";" +
                   "start=" + String(startPos) + ";" +
                   "end=" + String(endPos))
    return fetch("https://api.genome.ucsc.edu/getData/sequence?" + query)
            .then(resp => {
                if (!resp.ok) {
                    throw new Error("Failed to query UCSC genome browser");
                }
                return resp.json();})
            .then(data => {
                return data["dna"];
            });
}

export const coordsToRefSeq = (coords) => {
    const query = ("genome=" + coords.assembly + ";" +
                   "chrom=" + coords.chrom + ";" +
                   "start=" + String(coords.pos) + ";" +
                   "end=" + String(coords.pos) + ';' +
                   "track=ncbiRefSeq")
    return fetch("https://api.genome.ucsc.edu/getData/track?" + query)
            .then(resp => {
                if (!resp.ok) {
                    throw new Error("Failed to get RefSeq annotations from UCSC")
                }
                return resp.json();})
            .then(data => {
                return data['ncbiRefSeq'][0];
            });
}
