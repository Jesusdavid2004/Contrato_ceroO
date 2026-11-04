# Case Study — ContratoClaro

## Problem
Tenants, consumers, and employees routinely sign contracts with abusive or
disproportionate clauses they cannot interpret: automatic renewals, unilateral
termination, non-refundable deposits, waivers of legal rights. The imbalance
of legal knowledge makes informed consent fiction.

## Users
- **Tenants** reviewing lease agreements (Ley 820 de 2003 context).
- **Consumers** accepting service terms (Ley 1480 de 2011 context).
- **Employees** signing standard-form employment terms.

## Worked scenario: an abusive lease
A tenant uploads a 3-clause lease excerpt:

1. *"Si el pago se retrasa un solo día, el arrendador podrá quedarse con la
   totalidad del depósito como compensación."* → expected **HIGH**.
2. *"El arrendador podrá modificar el canon a su discreción cuando lo
   considere necesario."* → expected **HIGH**.
3. *"Ambas partes acuerdan un plazo de doce meses prorrogable por mutuo
   acuerdo."* → expected **LOW**.

The app extracts the text, segments the clauses in order, classifies each one,
and — because two clauses are medium/high risk — offers a one-click objection
letter with placeholders (`[DESTINATARIO]`, `[REFERENCIA DEL CONTRATO]`),
editable in the UI and downloadable as PDF. The disclaimer on every result
states the analysis is general information, not legal advice.

## What the numbers say (from `docs/evaluation.md`)
On 27 hand-labeled clauses across 9 Spanish/English scenarios:

| Provider | HIGH precision | HIGH recall |
|---|---|---|
| Deterministic regex double | 100.0% | 12.5% |
| Local neural (multilingual-e5 prototypes) | 50.0% | 62.5% |
| Hosted Gemini (JSON mode + RAG corpus) | 100.0% | 75.0% |

Citation grounding on 10 expected references (lease/service high-risk clauses;
employment expects none until a labor corpus exists):

| Provider | Citation precision | Citation recall | Hallucinated |
|---|---|---|---|
| Deterministic regex double | 100.0% | 0.0% | 0 |
| Local neural | 100.0% | 0.0% | 0 |
| Hosted Gemini | 100.0% | 80.0% | 0 |

The regex baseline never cries wolf but misses English traps and paraphrases
without its keywords (7 of 8 abusive clauses missed) and never cites by design.
The neural provider generalizes across languages and paraphrases at the cost of
5 false alarms — the classic precision/recall trade-off, measured rather than
asserted. Gemini grounds every citation in the supplied corpus (0 hallucinated)
and recovers 8 of 10 expected references; the 2 misses are paraphrase choices,
not invented laws.

## Live-demo path
Register → upload the lease PDF → watch the extraction/analysis stages →
open the READY result → generate the letter → replace the placeholders →
save → download the PDF → delete the contract → switch language and theme.
The whole loop runs offline with `AI_PROVIDER=local` and no API keys.
