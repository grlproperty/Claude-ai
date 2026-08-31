---
title: The Endpoint Nobody Has Solved
summary: Repeated-dose systemic toxicity is where the replacement project runs out of finished answers. Saying so plainly is not a concession to the industry — it is the precondition for arguing about the gap that actually exists.
topic: Method
date: 2026-07-22
updated: 2026-08-31
---

Advocacy has an incentive problem. The strongest version of an argument for ending animal testing is that alternatives are available and better. The weakest version of the same argument is that alternatives are available for everything — because that claim is checkable, it is not true, and being caught making it costs more than the claim ever gained.

This entry is about the part that is not solved.

## What repeated-dose toxicity asks

Most of the endpoints discussed in this archive are about what happens on contact. Does this substance corrode skin? Damage an eye? Provoke an allergic response? These are local effects with short time courses, and they are the endpoints where in vitro replacement has been most complete.

Repeated-dose systemic toxicity asks something structurally harder: what happens to an organism exposed to small quantities of this substance, day after day, for weeks or months? Does something accumulate? Does an organ begin to fail in a way invisible at any single time point? Does a metabolite — not the parent substance, but something the liver makes from it — cause harm the parent never would?

The historical answer was a 28-day or 90-day rodent study, with tissue examination at the end. It is a whole-organism question, answered with a whole organism.

## Why it resists replacement

Three properties make this endpoint different in kind, not merely in difficulty.

**It is systemic.** A cell culture models a tissue. It does not model a liver metabolising a substance into something the kidney then concentrates. The interaction between organs is the phenomenon under study, and isolated tissue cannot exhibit it.

**It is temporal.** Cultured cells do not survive ninety days in a state that resembles the tissue they came from. The exposure duration that defines the endpoint exceeds the useful life of the standard model system.

**It is undirected.** The other endpoints ask a specific question with a defined readout. This one asks whether *anything* goes wrong, anywhere. A targeted assay measures what it was designed to measure; it cannot detect an effect nobody anticipated.

## What exists instead

The response is a framework rather than a test, and the shift from one to the other is the important conceptual move.

**Next Generation Risk Assessment (NGRA)** is exposure-led and hypothesis-driven. Rather than generating a hazard number and comparing it to an exposure afterwards, it begins with the exposure — how much of this substance actually reaches internal tissues when a person uses this product in this way? — and asks whether that internal concentration is below the level at which any biological activity is observed.

The components:

A **physiologically based kinetic model** simulates absorption, distribution, metabolism, and excretion to convert an external dose into an internal tissue concentration. This is the bridge between a product-use scenario and a cell-culture result, and without it in vitro data cannot be related to real-world exposure at all.

**In vitro bioactivity profiling** across a wide panel of assays establishes the lowest concentration at which the substance perturbs any measured biological process. High-throughput transcriptomics can survey the response of thousands of genes at once, which partly addresses the undirectedness problem: rather than asking whether a specific pathway is affected, it asks whether anything in the transcriptome moves.

**Computational and read-across approaches** bring in what is already known about structurally similar substances, so that each new molecule is not assessed from zero.

A protective decision follows if the internal concentration sits comfortably below the lowest concentration producing any bioactivity — with an explicit margin.

## Where it stands

This is not speculative. The SEURAT-1 programme and the subsequent EU-ToxRisk project built the methodology, and published case studies have applied it to specific cosmetic ingredients, reaching safety conclusions accepted in specific regulatory contexts.

It is also not finished. General acceptance across all regulatory sectors, for all substance classes, at all exposure levels, has not been achieved. PBK models require substance-specific parameters that are themselves not always easy to obtain without animal data. The coverage of in vitro panels, however broad, is not exhaustive. And a framework requiring expert construction case by case is harder for a regulator to accept as routine than a test guideline with a fixed protocol.

The honest summary: for cosmetic ingredients with well-characterised exposure and adequate analogue data, NGRA can and does support safety decisions without animals. For a novel substance with unusual chemistry, high exposure, and no useful analogues, the gap is real.

## Why the gap is the argument

Consider what follows from stating this clearly.

If replacement were complete, the only remaining question would be why anyone still tests — a question with no interesting answer beyond inertia and cost. Stating that the gap exists opens the more productive question: what closes it, and who is paying for that?

The answer is validation. A method demonstrated in a laboratory is not a method a regulator will accept; between the two lies a formal process establishing reliability and relevance, run by bodies such as EURL ECVAM and ICCVAM, which takes years and is chronically under-resourced relative to the scale of the task. The rate-limiting step in replacing animal tests is not scientific imagination. It is validation capacity.

That reframing is worth a great deal. It converts a moral demand that a regulator can only refuse or accept into a funding question with a specific answer — and funding questions are the kind that legislatures are equipped to act on.

It is also why the European Citizens' Initiative asked for a roadmap and investment rather than only a prohibition, and why the Commission's response, whatever else can be said about it, was addressed to the right constraint.

## Sources

1. OECD (2021), *Guidance Document on the Characterisation, Validation and Reporting of Physiologically Based Kinetic (PBK) Models for Regulatory Purposes*, Series on Testing and Assessment No. 331. https://www.oecd.org/
2. Berggren, E. et al. (2017), 'Ab initio chemical safety assessment: A workflow based on exposure considerations and non-animal methods', *Computational Toxicology*, 4, 31–44.
3. EU-ToxRisk project, *An Integrated European Flagship Programme Driving Mechanism-based Toxicity Testing and Risk Assessment for the 21st Century*. https://www.eu-toxrisk.eu/
4. SEURAT-1 research initiative, *Safety Evaluation Ultimately Replacing Animal Testing*, final reports.
5. Dent, M. et al. (2018), 'Principles underpinning the use of new methodologies in the risk assessment of cosmetic ingredients', *Computational Toxicology*, 7, 20–26.
6. EURL ECVAM, status reports on the development, validation and regulatory acceptance of alternative methods. https://joint-research-centre.ec.europa.eu/eu-reference-laboratory-alternatives-animal-testing_en
