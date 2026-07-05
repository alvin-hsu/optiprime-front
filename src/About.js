import React from "react";
import ReactMarkdown from "react-markdown";
import { View } from "@aws-amplify/ui-react"

const intro = `
OptiPrime is a mechanism-based machine learning model that predicts prime editing (PE)
efficiencies. Rather than treating prime editing as a black box, OptiPrime encodes the
biochemical mechanism of PE directly into its mathematical structure: separate machine
learning models predict the effective rates ("pseudo-rates") of individual steps in the PE
reaction, and these rates define a system of differential equations that is integrated
through time to predict editing efficiency.

This interactive online webserver is a companion to our publication:

Alvin Hsu†, Peter J. Chen†, Angus H. Li†, Colin F. Hemez, Xin D. Gao, Markus Terrey,
Charlie Nelson, Vijay Selvam, Ana Cristian, Amber N. McElroy, Benjamin J. Steinbeck,
Gandhar K. Mahadeshwar, Smriti Pandey, Zachary Barsdale, Paul Z. Chen, Alexander A. Sousa,
Holt A. Sakai, Rachel A. Silverstein, Ilias Morad, Ryan K. Krueger, Max W. Shen,
Benjamin P. Kleinstiver, Cathleen M. Lutz, Jakub Tolar, Bruce R. Blazar, Mark J. Osborn,
David R. Liu.
**Mechanistic machine learning for prediction of prime editing outcomes.**
*Nat. Biotechnol*. (2026).

Please cite our paper if this webserver was helpful in your work.

## Overview

Efficient prime editing often requires evaluating hundreds or thousands of pegRNA design
parameters — the spacer, reverse-transcriptase template (RTT), primer-binding site (PBS), and
optional silent edits — in order to find a pegRNA that maximizes efficiency. OptiPrime
addresses this by predicting PE efficiency from sequence, letting you prioritize a small number
of promising pegRNAs before going to the bench.

OptiPrime was trained on 297,962 PE measurements collected across 40 experimental contexts,
including matched pegRNA–target site screens in partially MMR-deficient HEK293T cells and
MMR-proficient HeLa cells.
`;

const caption = `(A) The mechanism of PE used by OptiPrime as an inductive bias. Numbers 
(1–6) in circles represent the different genomic states that are used in the OptiPrime mechanism. 
Colored rates represent those which are predicted by machine learning models (left), while gray 
rates represent those that are kept constant (for a given cell type). (B) The differential equation 
that governs how the concentration of each state (cᵢ) evolves over time. Predicted and constant 
rates are placed in the generator matrix at off-diagonal positions. −Φᵢ terms are the negative sum 
of all rates in the row, which maintains mass balance. (C) An overview of the procedure used to 
generate predictions with OptiPrime.`;

const guide = `
## Designing a prime edit

Start on the **design** tab. You can specify your target in several ways:

- **ClinVar** — select a pathogenic variant directly from the ClinVar database.
- **dbSNP** — enter an rsID to look up a variant.
- **HGVS** — enter coding (\`c.\`) notation for a transcript.
- **Genomic coordinates** — enter coordinates directly.
- **Manual sequence** — paste a sequence and edit it by hand.

Any genome available through the UCSC Genome Browser is supported, including model organisms
such as mice, rats, and non-human primates. For human variants, built-in ClinVar and dbSNP
integration means you usually do not need to look up the genomic context yourself.

Once a target is specified, OptiPrime automatically finds candidate protospacers and detects
overlapping coding sequences. You can also edit sequences manually, specify a coding sequence,
and insert \`N\` (A, C, G, or T) bases to design site-saturation mutagenesis experiments. By
default, only canonical NGG protospacers are shown.

Submitting a design consumes tokens; your results appear under the **my jobs** tab once the
job finishes.

## How do I design silent edits?

Evading cellular mismatch repair (MMR) substantially increases PE efficiency. Incorporating
additional silent or benign mutations near the intended edit causes the heteroduplex PE
intermediate to carry enough mismatches to evade recognition by MMR proteins, so the edit is
less likely to be reverted to the original sequence.

When your edit falls in a coding sequence, OptiPrime automatically generates and scores all
silent-edit combinations proximal to the edit. We validate in our paper that OptiPrime has
learned the sequence determinants of MMR and is well-suited to nominate MMR-evasive silent
edits. Results are ordered by silent-edit combination so you can pick the most promising
designs.

## Which cell type and conditions should I use?

OptiPrime's default settings are HeLa cells, PE2max, and epegRNAs. We recommend using the
default settings for typical applications: high-performing pegRNAs optimized with OptiPrime's
HeLa-cell parameters tend to retain their performance in HEK293T cells, while the converse is
not true. pegRNAs designed with these defaults performed well across primary human T cells,
patient-derived fibroblasts, mouse embryonic fibroblasts, and in vivo mouse brain editing.

## Can I use non-NGG PAMs?

By default OptiPrime shows canonical NGG protospacers. We also integrate HT-PAMDA data so you
can obtain predictions for prime editors that use non-canonical PAM sequences.

## Limitations

OptiPrime was trained primarily on synthetic reporters randomly integrated into the genome, so
it does not incorporate chromatin context; models such as ePRIDICT can estimate locus-level
effects separately. OptiPrime is also less accurate in cases where Cas9 nuclease scores fail to
correlate with PE efficiency.

## Programmatic access

For programmatic access, see our [API documentation](api).

---

This webserver was developed by Alvin Hsu with help from Ilias Morad and Gandhar Mahadeshwar. Sequence visualization
functionality was adapted from [seqviz](https://github.com/Lattice-Automation/seqviz), with
sequence editing capabilities added by Alvin Hsu.

To view our current terms of service, click [here](terms-of-service).
`;

const About = () => {
    return (
        <View width="80%">
            <ReactMarkdown children={intro} />
            <figure style={{ margin: "24px auto 32px", maxWidth: "55%" }}>
                <img src="/Figure3.png" alt="Overview of the OptiPrime prime editing mechanism"
                     style={{ width: "100%", height: "auto", display: "block" }} />
                <figcaption style={{ fontSize: "0.8em", color: "gray", lineHeight: 1.5,
                                     marginTop: "12px", textAlign: "left" }}>
                    {caption}
                </figcaption>
            </figure>
            <ReactMarkdown children={guide} />
        </View>
    );
}

export default About;
