import React, {useEffect, useRef} from "react";
import "autocomplete-lhc/source/auto_completion.css";

const ClinvarAutocomplete = ({ setCvData, submitCvID }) => {
    const parentRef = useRef(null);
    const inputRef = useRef(null);
    const scriptsLoaded = useRef(false);
    // Load scripts
    useEffect(() => {
        if (scriptsLoaded.current) { return; }
        scriptsLoaded.current = true;
        const jq = document.createElement("script");
        jq.src = "https://ajax.googleapis.com/ajax/libs/jquery/3.3.1/jquery.min.js";
        jq.async = true;
        const lhc = document.createElement("script");
        lhc.src = "https://lhcforms-static.nlm.nih.gov/autocomplete-lhc-versions/19.2.4/autocomplete-lhc.min.js";
        lhc.async = true;
        const inline = document.createElement("script");
        inline.innerText = `
            new Def.Autocompleter.Search(
                "clinvar-search",
                "https://clinicaltables.nlm.nih.gov/api/variants/v4/search" +
                    "?df=VariationID,GeneSymbol,Chromosome,GenomicLocation,NucleotideChange,AminoAcidChange,dbSNP",
                {
                    tableFormat: true,
                    valueCols: [0],
                    colHeaders: ["ClinVar ID",
                                 "Gene Symbol",
                                 "Chromosome",
                                 "Position",
                                 "cDNA change",
                                 "Protein Change",
                                 "dbSNP rsID"],
                    minChars: 2,
                    showLoadingIndicator: true
                }
            );
            Def.Autocompleter.Event.observeListSelections("clinvar-search", (sel) => {
                setCvData(sel);
            });
        `
        let thisLhc, thisInline;
        jq.onload = () => {
            thisLhc = lhc;
            inputRef.current.before(thisLhc);
        };
        lhc.onload = () => {
            if (window.$) {
                const AA_MAP = {
                    A:'Ala', C:'Cys', D:'Asp', E:'Glu', F:'Phe', G:'Gly',
                    H:'His', I:'Ile', K:'Lys', L:'Leu', M:'Met', N:'Asn',
                    P:'Pro', Q:'Gln', R:'Arg', S:'Ser', T:'Thr', V:'Val',
                    W:'Trp', Y:'Tyr'
                };
                const NUCL = new Set(['A', 'C', 'G', 'T']);
                const expand = l => AA_MAP[l] || l;
                window.$.ajaxPrefilter((options) => {
                    if (!options.url || !options.url.includes('clinicaltables.nlm.nih.gov')) return;
                    const url = new URL(options.url);
                    const terms = url.searchParams.get('terms');
                    if (!terms) return;
                    const expanded = terms.replace(
                        /\b([A-Z])(\d+)([A-Z])\b/g,
                        (match, a, n, b) => {
                            if (NUCL.has(a) && NUCL.has(b)) {
                                return `${match} ${expand(a)}${n}${expand(b)}`;
                            }
                            return `${expand(a)}${n}${expand(b)}`;
                        }
                    );
                    if (expanded !== terms) {
                        url.searchParams.set('terms', expanded);
                        options.url = url.toString();
                    }
                });
            }
            thisInline = inline;
            inputRef.current.after(thisInline);
        };
        inputRef.current.before(jq);
        return () => {
            if (jq && parentRef.current) {
                parentRef.current.removeChild(jq);
            }
            if (thisLhc && parentRef.current) {
                parentRef.current.removeChild(thisLhc);
            }
            if (thisInline && parentRef.current) {
                parentRef.current.removeChild(thisInline);
            }
        }
    }, []);
    // Set window.setCvID() to setCvID() so the javascript can use it
    useEffect(() => {
        window.setCvData = setCvData;
    }, []);  // eslint-disable-line

    return (
        <div id="clinvar-autocomplete" ref={parentRef} style={{ padding: "10px" }} >
            <input type="text"
                   id="clinvar-search"
                   placeholder="Search..."
                   onKeyDown={e => {if (e.key === "Enter") {submitCvID(e.target.value);}}}
                   ref={inputRef} />
        </div>
    );
};

export default ClinvarAutocomplete;
