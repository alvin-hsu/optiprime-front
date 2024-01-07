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

export const coordsToRefSeq = (coords) => {
   const query = ("genome=" + coords.assembly + ";" +
                   "chrom=" + coords.chrom + ";" +
                   "start=" + String(coords.pos) + ";" +
                   "end=" + String(parseInt(coords.pos)+1) + ';' +
                   "track=ncbiRefSeq")
    
    // TODO: Convert Query to URL() onject
    // TODO: Handle 500 on track endpoint 

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

export const fetchSequenceFromCoords = async (coords, contextLen) => {
    try {
      const { assembly, chrom, pos } = coords;
      const startPos = parseInt(pos) - contextLen;
      const endPos = parseInt(pos) + contextLen;
  
      // format 'chrom:start-end'
      const position = `${chrom}:${startPos}-${endPos}`;
  
      const url = new URL(`https://api.genome.ucsc.edu/getData/sequence`);
      url.search = new URLSearchParams({
        genome: assembly,
        chrom: chrom,
        start: startPos,
        end: endPos
      }).toString().replace(/&/g, ';'); /* ??? we don't like HTTP spec apparently 
                                         * https://www.w3.org/Protocols/rfc2616/rfc2616-sec3.html
                                         */
      
      const response = await fetch(url);
  
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      const data = await response.json();  
      return data.dna;

    } catch (error) {
      console.error('Failed to fetch sequence from UCSC:', error);
      return null;
    }
};

// ****************************** COMPUTATION ******************************
/* 
 * Figure out if an index is in an intron, exon or out of scope based on 
 * ncbiRefSeq objects from https://api.genome.ucsc.edu/getData/track
 * 
 */
export const isIntronOrExon = (index, geneData) => {
    // console.log("Debug Parameters:", { index, geneData });

    if (!geneData || !geneData.exonStarts || !geneData.exonEnds) {
        return ["invalid data", -1];
    }    

    const exonStarts = geneData.exonStarts.split(',').map(Number).filter(n => !isNaN(n));
    const exonEnds = geneData.exonEnds.split(',').map(Number).filter(n => !isNaN(n));
    const exonFrames =  geneData.exonFrames.split(',').map(Number).filter(n => !isNaN(n));

    // are we in any of the exons?
    for (let i = 0; i < exonStarts.length; i++) {
        if (index >= exonStarts[i] && index <= exonEnds[i]) {

            // it's an exon! Which one, where does it start and what's the frame?
            return ["exon", i+1, exonStarts[i], exonFrames[i]];
        }
    }

    // Out of scope?
    if (index < geneData.txStart || index > geneData.txEnd) {
        return ["OOS", -1];
    }

    // intron?
    for (let i = 0; i < exonEnds.length; i++) {
        if (index > exonEnds[i] && (i === exonEnds.length - 1 || index < exonStarts[i + 1])) {
            return ["intron", i + 1];
        }
    }

    return ["huh?", -1]; // Default return if not caught by above cases
}


/* 
 * Figure out the starts and ends of Exons in a specific context window
 * using ncbiRefSeq objects from https://api.genome.ucsc.edu/getData/track
 * 
 */
export const getContextExonTranslations = (geneData, target, contextLen) => {
    const contextStart = Number(target) - Number(contextLen);
    const contextEnd = Number(target) + Number(contextLen);
    
    const exonStarts = geneData.exonStarts.split(',').map(Number).filter(n => !isNaN(n));
    const exonEnds = geneData.exonEnds.split(',').map(Number).filter(n => !isNaN(n));
    const exonFrames = geneData.exonFrames.split(',').map(Number).filter(n => !isNaN(n));

    let contextExons = [];
    console.log("Context Start:", contextStart);
    console.log("Context End:", contextEnd);
    console.log("Context Len:", contextLen);
    console.log("Tartet:", target);

    for (let i = 0; i < exonStarts.length; i++) {
        
        // Check handles all four cases:
        // - Start before end after
        // - Start before end within
        // - Start within end after
        // - Start within end within
        if (exonStarts[i] <= contextEnd && exonEnds[i] >= contextStart) {
            
            // Clip to start/end in case of partial overlap
            const startOffset = Math.max(0, exonStarts[i] - contextStart);
            const endOffset = Math.min(exonEnds[i], contextEnd) - contextStart;
    
            // If the exon starts before the context we gotta adjust the frame
            let adjustedFrame = exonFrames[i];
            if (exonStarts[i] < contextStart) {
                const distanceFromContextStart = contextStart - exonStarts[i];
                adjustedFrame = (exonFrames[i] + distanceFromContextStart) % 3;
            }
    
            contextExons.push({
                exonNumber: i + 1,
                startOffset,
                endOffset,
                frame: adjustedFrame
            });
        }
    }
    
    // Debug log
    console.log("Context Exons:", contextExons);

    return { contextExons };
}