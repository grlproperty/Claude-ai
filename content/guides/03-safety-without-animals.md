---
title: How Safety Is Established Without Animals
summary: The replacement of animal tests is not one substitution but a change in method — from a whole-organism proxy to a mechanistic account of how harm occurs.
order: 3
duration: 12
outcomes:
  - Explain what an adverse outcome pathway is and why it enables replacement
  - Describe the difference between a test guideline and a defined approach
  - Explain why validation, not scientific development, is the rate-limiting step
---

The intuitive model of replacement is substitution: find a test tube that does what the rabbit did. For a few endpoints that is roughly what happened. For the rest, something more interesting occurred — the question itself was reformulated.

## From proxy to mechanism

An animal test is a proxy. It does not explain why a substance is harmful; it exposes an organism and observes an outcome, on the assumption that a human would respond comparably. Everything rests on that assumption, and the assumption is never fully verified — you cannot run the human comparison.

The modern approach starts elsewhere. It asks: *by what mechanism does this harm occur?* Once the mechanism is described as a sequence of events, each event can be measured directly, in human cells, with a quantitative readout.

This is not merely a way of avoiding animals. It produces information the animal test never could. A severity score tells you a substance is a sensitiser. A mechanistic account tells you it is a sensitiser *because* it binds nucleophilic protein residues at a particular rate — which supports inference about related molecules, so that the next similar substance is not assessed from zero.

## Adverse Outcome Pathways

The formal expression of this is the **Adverse Outcome Pathway** (AOP): a structured description of the causal chain from a molecular initiating event, through key intermediate events, to an adverse outcome.

The skin sensitisation AOP is the best-developed example and the one worth learning in full:

**Molecular initiating event.** The substance binds covalently to skin proteins, forming a hapten-protein complex.

**Key event 2.** Keratinocytes respond, activating inflammatory and antioxidant gene expression pathways.

**Key event 3.** Dendritic cells activate and mature, upregulating surface markers.

**Key event 4.** T-cells proliferate in response to antigen presentation.

**Adverse outcome.** Allergic contact dermatitis.

Each of the first three events has an OECD Test Guideline that measures it: TG 442C for protein binding, TG 442D for keratinocyte activation, TG 442E for dendritic cell activation. Together they cover enough of the pathway to support a classification.

The AOP is what makes that scientifically defensible. Without it, three unrelated cell assays would just be three unrelated cell assays. With it, they are three measurements of one causal chain.

## Test guidelines and defined approaches

Two terms that are easy to confuse and important to separate.

A **Test Guideline** is a standardised protocol for a single method, adopted by the OECD. Under Mutual Acceptance of Data, results generated in accordance with an adopted guideline must be accepted by all member countries. That mutual acceptance is what converts a validated method into a usable regulatory instrument — without it, every jurisdiction would demand its own testing.

A **Defined Approach** is a fixed rule for combining results from several methods into a single conclusion. It specifies which tests, in what order, and exactly how to resolve disagreement between them, with the data interpretation procedure written down in advance.

The distinction is what allowed skin sensitisation to be fully replaced. No single assay covered the endpoint. TG 497 specifies how to combine them, and — critically — does so as a fixed procedure rather than as expert judgement exercised case by case. A regulator can apply it consistently, and two assessors reach the same answer from the same data.

## The supporting toolkit

Several approaches reduce the need for new testing of any kind, and they do a large share of the practical work.

**Read-across** infers a substance's properties from structurally analogous substances with existing data. A well-justified read-across generates no new data at all. Its weakness is the justification: establishing that two molecules are similar in the ways that matter for a given endpoint is a substantive scientific argument, not a structural observation.

**QSAR models** predict toxicity from molecular structure using statistical relationships derived from known substances. The OECD QSAR Toolbox is the reference implementation. Reliable within their applicability domain; unreliable outside it, and knowing which is which is the skill.

**PBK models** simulate how a substance moves through the body, translating an external dose into an internal tissue concentration. This is the piece that makes in vitro results usable for real-world risk assessment: a concentration that harms cells in a dish only matters if that concentration is reached in tissue.

**High-throughput transcriptomics** measures the expression of thousands of genes simultaneously after exposure, partly addressing the problem that targeted assays only detect effects someone anticipated.

## Why validation is the bottleneck

A method demonstrated in a laboratory is not a method a regulator will accept. Between the two lies **validation** — a formal, multi-laboratory process establishing that a method is reliable, reproducible, and relevant for a defined purpose.

Validation is conducted by bodies including EURL ECVAM in the European Union, ICCVAM and NICEATM in the United States, and JaCVAM in Japan, coordinated internationally through ICATM. It typically takes years, requires participation from multiple independent laboratories, and is chronically under-resourced relative to the number of methods awaiting assessment.

This has a consequence that should reshape how the campaign is argued. The rate-limiting step in replacing animal tests is not scientific imagination — the literature contains far more promising methods than the validation pipeline can process. It is validation capacity, which is a funding and infrastructure question.

That is a far more actionable target than a general demand for prohibition. Prohibitions can be refused on the grounds that alternatives are not available; funding the process that makes alternatives available removes the grounds.

## Check yourself

Why does describing an adverse outcome pathway make it possible to replace one animal test with several in vitro assays?

What does a defined approach add that a set of individual test guidelines does not?

Why is a PBK model necessary to make an in vitro result usable for risk assessment?

Why might funding validation infrastructure achieve more, faster, than a further legislative prohibition?
