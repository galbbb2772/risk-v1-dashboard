# Risk V1 Dashboard

Public research dashboard for the canonical Risk V1 strategy family.

## Source of truth

Private canonical research repository: `galbbb2772/risk-v1-lab`.

This public dashboard mirrors **derived research/performance evidence only**. It does not publish credentials, private source code, or secrets.

## Dashboard sections

- **历史演化** — Fixed 3-slot / Risk V1 10-14 / Same-Close / Strict Next-Open / Next-Open→T+6 / Same-Close+3M / Next-Open+3M / 100% Exposure, with evidence-granularity labels.
- **3M 美债层** — formal 0%-cash vs 3M Treasury comparison, cumulative cash-layer contribution, annual uplift, legacy Same-Close cash overlay, model metrics and crisis windows.
- **Capital Layer** — canonical 5.2803x audit, 0/10/20/30/40% Risk sleeve marginal curve, annual return/exposure, return-source attribution, correlation drift, drawdown attribution and regime panels.
- **308 笔交易** — full historical Strict Next-Open trade ledger with distribution, annual count and searchable rows.
- **Forward OOS** — prospective NAV, three persistent slots and official trades. Historical backfill is forbidden.
- **规则 / 版本** — frozen strategy definition and governance boundary.

## Evidence discipline

Daily MTM, monthly-only evidence, and metrics-only research are explicitly separated.

The legacy pre-audit Capital Layer daily curve ended around 5.4038x, while the final canonical audit ends at **5.2803x**. Because those accounting versions do not match, the legacy curve is **not** presented as the canonical Capital Layer daily NAV.

## Data export pipeline

The private lab owns a reproducible exporter:

`scripts/export_dashboard_sources.py`

It recovers hidden Plotly traces from the preserved original Risk V1 reports and extracts canonical Capital Layer audit tables from the full audit package. Derived exports are stored under `risk-v1-lab/dashboard_exports/` before being mirrored here.

GitHub Pages deployment is defined in `.github/workflows/pages.yml`.
