import "./Utils.css";

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
   const query = ("genome=" + coords.assembly + ";" +
                   "chrom=" + coords.chrom + ";" +
                   "start=" + String(coords.pos) + ";" +
                   "end=" + String(parseInt(coords.pos)+1) + ';' +
                   "track=ncbiRefSeq")

    return fetch("https://api.genome.ucsc.edu/getData/track?" + query)
           .then(resp => {
               if (!resp.ok) {
                   throw new Error("Failed to get RefSeq annotations from UCSC")
               }
               return resp.json();
           })
           .then(data => {
               return data['ncbiRefSeq'][0];
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
           .then(data => {
               return data["dna"];
           });
};

// ****************************** COMPUTATION ******************************
/* 
 * Figure out if an index is in an intron, exon or out of scope based on 
 * ncbiRefSeq objects from https://api.genome.ucsc.edu/getData/track
 *
 */
export const indexAnnotations = (index, geneData) => {
    // console.log("Debug Parameters:", { index, geneData });
    if (!geneData || !geneData["exonStarts"] || !geneData["exonEnds"]) {
        return { posType: "Intergenic" };
    }
    const exonStarts = geneData["exonStarts"].split(',').map(Number).filter(n => !isNaN(n));
    const exonEnds = geneData["exonEnds"].split(',').map(Number).filter(n => !isNaN(n));
    const exonFrames =  geneData["exonFrames"].split(',').map(Number).filter(n => !isNaN(n));
    // are we in any of the exons?
    for (let i = 0; i < exonStarts.length; i++) {
        if (index >= exonStarts[i] && index <= exonEnds[i]) {
            // it's an exon! Which one, where does it start and what's the frame?
            return { posType: "Exon",
                     exonNum: i + 1,
                     exonStart: exonStarts[i],
                     exonEnd: exonEnds[i],
                     exonFrame: exonFrames[i] };  // TODO: Is this data necessary?
        }
    }
    // Out of scope?
    if (index < geneData["txStart"] || index > geneData["txEnd"]) {
        return { posType: "Intergenic",
                 nearestGene: geneData["name2"] };
    }
    // intron?
    for (let i = 0; i < exonEnds.length; i++) {
        if (index > exonEnds[i] && (i === exonEnds.length - 1 || index < exonStarts[i + 1])) {
            return { posType: "Intergenic",
                     prevExonNum: i + 1 };
        }
    }
    return ["huh?", -1]; // Default return if not caught by above cases
}

/* 
 * Figure out the starts and ends of Exons in a specific context window
 * using ncbiRefSeq objects from https://api.genome.ucsc.edu/getData/track
 * Schema: https://genome.ucsc.edu/cgi-bin/hgTables?db=hg38&hgta_group=genes&hgta_track=refSeqComposite&hgta_table=refGene&hgta_doSchema=describe+table+schema
 * 
 */
export const getContextExonTranslations = (geneData, target, contextLen) => {
    const contextStart = Number(target) - Number(contextLen);
    const contextEnd = Number(target) + Number(contextLen);

    const exonStarts = geneData["exonStarts"].split(',').map(Number).filter(n => !isNaN(n));
    const exonEnds = geneData["exonEnds"].split(',').map(Number).filter(n => !isNaN(n));
    const exonFrames = geneData["exonFrames"].split(',').map(Number).filter(n => !isNaN(n));
    const cdsStart = geneData["cdsStart"] - contextStart;  // relative to display window
    const cdsEnd = geneData["cdsEnd"] - contextStart;      // relative to display window

    // Makes the math way easier down the line
    if (geneData["strand"] === "+") {
        exonStarts[0] = cdsStart;
        exonEnds[exonEnds.length - 1] = cdsEnd;
        exonFrames[0] = 0;
    } else {
        exonStarts[0] = cdsEnd;
        exonEnds[exonEnds.length - 1] = cdsStart;
        exonFrames[exonFrames.length - 1] = 0;
    }

    let contextExons = [];
    // console.log("Context Start:", contextStart);
    // console.log("Context End:", contextEnd);
    // console.log("Context Len:", contextLen);
    // console.log("Target:", target);
    for (let i = 0; i < exonStarts.length; i++) {
        // Check handles all four cases:
        // - Start before end after
        // - Start before end within
        // - Start within end after
        // - Start within end within
        if (exonStarts[i] <= contextEnd && exonEnds[i] >= contextStart) {
            const exonNumber = geneData["strand"] === '+' ? i + 1 : exonStarts.length - i - 1;
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
                console.log(distanceFromContextStart);
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
    // console.log("Context Exons:", contextExons);
    return contextExons;
};

/*
 * Make *A*nnotations and *T*ranslation props for a given CDS, as annotated from
 * getContextExonTranslations. Notably, start, end, and frame are taken directly from the output.
 */
export const makeCDSAandTs = ({ name, start, end, direction, frame }) => {
    // The annotation itself is easy
    const annotation = {
        name: name,
        start: start,
        end: end,
        direction: direction === "+" ? 1 : -1,
        color: "orange"
    };
    // SeqViz makes the translation part annoying though, since it doesn't let you specify frame
    frame = ((frame % 3) + 3) % 3;  // Ensure frame is positive
    if (direction === "+") {
        frame = (3 - frame) % 3;  // Thanks, NCBI, for making this weird...
    } else {
        const cdsLen = end - start;
        frame = (cdsLen + frame) % 3;  // ...not to mention inconsistent.
    }
    const translation = {
        start: start + frame,
        end: end,
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
