# Inspection dataset

There is **no real inspection data yet**. This folder defines the format that real
data should use, and holds a small evaluation set.

| File | What it is |
|---|---|
| `record.schema.json` | One training record: input, the generated protocol and its versions, and technician labels |
| `benchmark.jsonl` | 16 hand-authored acceptance cases, one per line. Used for evaluation only, never for training |
| `split.js` | Grouped train/val/test split by `productKey`, so there is no leakage |
| `eval-report.json` | Last output of `npm run inspect:eval` |

## Collecting real records

Write one record per completed inspection, with `source: "technician_feedback"`.
The record needs:

- the exact `input` the generator received;
- `protocol`, which is the protocol id, model/prompt/template versions and parameter ids;
- `labels.requiredParameterIds`, the checks that mattered;
- `labels.irrelevantParameterIds`, the checks marked not applicable;
- `labels.missingChecks`, the checks the technician had to add;
- `labels.observations`, which holds the claimed vs observed value and result per parameter, plus evidence references.

Set `productKey` to a normalised `brand|model`, or `generic|<type>` for unbranded
items. Splits are grouped on it.

## Splits

`node split.js records.jsonl --write` assigns every product group to train
(70%), validation (15%) or test (15%) by a stable hash. It reports any product
found in more than one split (there should be none), and refuses to write
training splits from fewer than 300 technician/expert records.
