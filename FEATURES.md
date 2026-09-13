# Statistical Web — analysis capabilities

The application runs calculations in the browser. Dataset and analysis history storage is local to that browser. Export XLSX files for durable copies or sharing; deleting browser data removes local history.

## Data and reports

- Import XLSX with worksheet selection, preview, typed numeric conversion and cached-formula checks. Imports create a new dataset.
- Download example XLSX templates for RAL, RAK, two-factor factorial RAL/RAK and split-plot in RAK. Replace the example observations before analysis.
- Validate selected factor/replicate/response roles, missing labels, invalid numbers, duplicate experimental units and balance. Problems identify their original row and mark the data cells.
- Save and reopen up to 20 analysis snapshots. Snapshots include design, settings, observations and numerical results; reopening does not recalculate.
- Export a single parameter or all parameters as native XLSX. Each parameter gets a separate, uniquely named worksheet. Numerical report cells retain full values when available; labels remain text and letters are native superscript rich text. SVG charts are rasterized locally and embedded in the workbook.
- Mean ± model-SE charts, two-factor interaction charts, residual/Q–Q diagnostics and SVG downloads. Treatment order follows first occurrence in the data.
- Automatic statistical descriptions include F, degrees of freedom, alpha, CV, mean/SE and within-family post-hoc comparisons.

## Statistical scope

- Fixed treatment effects: one-factor RAL (unequal replication allowed), complete RAK, balanced two-factor factorial RAL/RAK, and balanced split-plot (RPT) in RAK.
- Split-plot: A is the whole-plot treatment and B the subplot treatment. A uses whole-plot error; B and A×B use subplot error. Complete block×A×B data with one record per cell is required. Other randomization structures and missing-cell models are not approximated as these designs.
- Following a significant interaction, B is compared within each A. Letters apply only within that comparison family. Marginal post-hoc grouping is used when interaction is not significant.
- BNT: two-sided protected LSD. BNJ: Tukey with Tukey–Kramer for unequal replication. DMRT: studentized ranges with cumulative probability `(1-alpha)^(range-1)`; unequal group sizes use harmonic replication. BNT and DMRT do not have Tukey's familywise error protection.
- Planned orthogonal contrasts and orthogonal polynomial decomposition apply to one-factor RAL/RAK. Coefficients sum to zero; orthogonality uses the group-size-weighted covariance. Quantitative polynomial levels must be distinct. Planned contrast p-values are unadjusted, and omnibus significance is not required.
- Normality diagnostic: D'Agostino–Pearson K² for at least 20 residuals. Smaller samples receive a Q–Q plot and an explicit unavailable-test message. Homogeneity uses median-centered Levene (Brown–Forsythe), with at least two residuals per group. Split-plot diagnostics cover both residual strata. These are diagnostic approximations, not evidence that independent randomization was achieved.
- BNJ and DMRT require at least two error degrees of freedom in the selected numerical implementation. Nonpositive error variance prevents inferential analysis.

## Verification and references

`npm run verify` includes the existing UI/build checks and statistical regression fixtures. `scripts/generate-statistics-reference.py` regenerates independent NumPy least-squares and SciPy reference values; Python is not needed to run the saved-fixture checks. Statistical tests cover factorial/split-plot sums of squares and df, normality and Brown–Forsythe, both alpha levels of BNT/BNJ/DMRT, pairwise letter consistency, and contrast/polynomial sums of squares.

- Agricolae, Duncan implementation (documentation 2023): https://rdrr.io/cran/agricolae/src/R/duncan.test.R
- SciPy normality: https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.normaltest.html
- SciPy Levene: https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.levene.html
- Shi, W., Zhao, A., & Liu, H. (2022), split-plot randomization and experimental-unit levels: https://arxiv.org/abs/2209.12385

XLSX/DOM checks were performed locally for multiple parameters, numeric and superscript cell types, worksheet names, leading-zero identifiers, import preview and history reopening. Browser rendering and Microsoft Excel desktop execution are separate from these checks.
