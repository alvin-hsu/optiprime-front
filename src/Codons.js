export const codonTableForward = {
    "AAA": "K",
    "AAC": "N",
    "AAG": "K",
    "AAT": "N",
    "ACA": "T",
    "ACC": "T",
    "ACG": "T",
    "ACT": "T",
    "AGA": "R",
    "AGC": "S",
    "AGG": "R",
    "AGT": "S",
    "ATA": "I",
    "ATC": "I",
    "ATG": "M",
    "ATT": "I",
    "CAA": "Q",
    "CAC": "H",
    "CAG": "Q",
    "CAT": "H",
    "CCA": "P",
    "CCC": "P",
    "CCG": "P",
    "CCT": "P",
    "CGA": "R",
    "CGC": "R",
    "CGG": "R",
    "CGT": "R",
    "CTA": "L",
    "CTC": "L",
    "CTG": "L",
    "CTT": "L",
    "GAA": "E",
    "GAC": "D",
    "GAG": "E",
    "GAT": "D",
    "GCA": "A",
    "GCC": "A",
    "GCG": "A",
    "GCT": "A",
    "GGA": "G",
    "GGC": "G",
    "GGG": "G",
    "GGT": "G",
    "GTA": "V",
    "GTC": "V",
    "GTG": "V",
    "GTT": "V",
    "TAA": "*",
    "TAC": "Y",
    "TAG": "*",
    "TAT": "Y",
    "TCA": "S",
    "TCC": "S",
    "TCG": "S",
    "TCT": "S",
    "TGA": "*",
    "TGC": "C",
    "TGG": "W",
    "TGT": "C",
    "TTA": "L",
    "TTC": "F",
    "TTG": "L",
    "TTT": "F"
};

export const codonTableReverse = {
    "A": ["GCA", "GCC", "GCG", "GCT"],
    "C": ["TGC", "TGT"],
    "D": ["GAC", "GAT"],
    "E": ["GAA", "GAG"],
    "F": ["TTC", "TTT"],
    "G": ["GGA", "GGC", "GGG", "GGT"],
    "H": ["CAC", "CAT"],
    "I": ["ATA", "ATC", "ATT"],
    "K": ["AAA", "AAG"],
    "L": ["CTA", "CTC", "CTG", "CTT", "TTA", "TTG"],
    "M": ["ATG"],
    "N": ["AAC", "AAT"],
    "P": ["CCA", "CCC", "CCG", "CCT"],
    "Q": ["CAA", "CAG"],
    "R": ["AGA", "AGG", "CGA", "CGC", "CGG", "CGT"],
    "S": ["AGC", "AGT", "TCA", "TCC", "TCG", "TCT"],
    "T": ["ACA", "ACC", "ACG", "ACT"],
    "V": ["GTA", "GTC", "GTG", "GTT"],
    "W": ["TGG"],
    "Y": ["TAC", "TAT"],
    "*": ["TAA", "TAG", "TGA"],
};

const COLORS = [
    "#9DEAED", // cyan          / H T
    "#8FDE8C", // green         / I
    "#CFF283", // light green   /   V
    "#8CDEBD", // teal          / K W
    "#F0A3CE", // pink          / L
    "#F7C672", // orange        / A M
    "#F07F7F", // red           /   N *
    "#FAA887", // red-orange    / C
    "#F099F7", // magenta       / D P
    "#C59CFF", // purple        / E Q
    "#6B81FF", // blue          / F R
    "#85A6FF", // light blue    / G S
];
const DARK_COLORS = [
    "#4E7576", // cyan          / H T
    "#476F46", // green         / I
    "#677941", // light green   /   V
    "#466F5E", // teal          / K W
    "#785167", // pink          / L
    "#7B6339", // orange        / A M
    "#783F3F", // red           /   N *
    "#7D5443", // red-orange    / C
    "#784C7B", // magenta       / D P
    "#624E7F", // purple        / E Q
    "#35407F", // blue          / F R
    "#42537F", // light blue    / G S
];

export const aminoAcidColors = Object.fromEntries(
    Object.keys(codonTableReverse).map(a => [a, COLORS[a.charCodeAt(0) % COLORS.length]])
);
export const darkAminoAcidColors = Object.fromEntries(
    Object.keys(codonTableReverse).map(a => [a, DARK_COLORS[a.charCodeAt(0) % COLORS.length]])
);
