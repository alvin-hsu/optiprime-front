# OptiPrime

This is the web frontend for [OptiPrime](https://optipri.me), a prime-editing pegRNA
design service. It lets users look up a target variant (by rsID, ClinVar ID, HGVS `c.`
notation, genomic coordinates, or raw sequence), design pegRNAs against it, and browse
the resulting jobs, plots, and downloads.

The design and scoring backend lives at `https://api.optipri.me` and is **not** part of
this repository. This app is a [Create React App](https://create-react-app.dev/) project
that talks to that API.

## Development

Clone the repository, then install dependencies and start the dev server:

```commandline
npm install
npm start
```

`npm start` runs the app at http://localhost:3000. The `proxy` field in `package.json`
forwards unknown requests to `https://api.optipri.me`, so the dev server works against the
live backend without extra configuration.

Other commands:

```commandline
npm run build   # production bundle in build/
npm test        # Jest test runner (watch mode)
```

ESLint (CRA's `react-app` config) runs inline during `start` and `build`; there is no
separate lint step.

## Architecture

- `src/App.js` — routing and authentication. Login is Cognito-hosted Google OAuth; tokens
  are stored as cookies and API calls attach them via `fetchAuth` (`src/Utils.js`). Routes
  split into public pages, and protected pages (`/design`, `/jobs`) gated on a valid token
  plus a signed terms-of-service acceptance.
- `src/Design.js` — the pegRNA design wizard. Resolves a target into genomic coordinates
  and alleles, then builds and submits a design job.
- `src/Jobs.js` / `src/Job.js` — list and detail views for submitted designs, including
  Plotly result plots and downloads.
- `src/ModdedSeqViz.js` — [seqviz](https://github.com/Lattice-Automation/seqviz) wrappers
  that add CDS-aware annotations and an editable sequence view used by the design wizard.
- `src/Utils.js` — the domain core: wrappers around external genomic APIs (dbSNP, ClinVar,
  UCSC, mygene.info), an HGVS `c.`-to-genomic parsing pipeline, and sequence/CDS
  computation.

Styling uses [AWS Amplify UI React](https://ui.docs.amplify.aws/) components rather than
raw CSS.

## License

See [LICENSE](LICENSE). Licensed for research use by non-profit and government
institutions; commercial use requires a separate agreement.
