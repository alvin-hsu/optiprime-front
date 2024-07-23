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
