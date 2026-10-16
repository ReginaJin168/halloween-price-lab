# Halloween Price Lab

## Current classroom kit — October 15, 2026

This repository now contains the **Claim · Evidence · Reasoning (CER)** teaching kit supplied on October 15, 2026. Students choose a ticket price and compare two outcomes: average profit and the percentage of admitted guests who finish both Costume House and Pumpkin House. Each team sets its own minimum completion standard before looking at the price evidence. There is no preselected winning price.

**Start with [START_HERE.txt](START_HERE.txt).** The main materials are:

- [Halloween simulator](halloween_simulator.html): standalone classroom page that also works offline.
- [Price information](price_information.html): candidate prices and the full comparison table.
- [Teaching guide](teaching_guide.html): presenter guide and printable CER worksheet.
- [Lesson slides](halloween_lesson.pptx): seven-slide English lesson with speaker notes.

The [model notes](halloween_simulator/model_notes.md) explain the simulation assumptions. The park map, demand, timing, and costs are fictional teaching scenarios, not a real Griffith Park forecast.

## Source and checks

The current simulator source is `halloween_simulator/engine.js` plus `halloween_simulator/ui-template.html`. Node.js is only needed to maintain the source; students can open the standalone page directly.

```sh
node halloween_simulator/tests.cjs
node halloween_simulator/build.cjs
```

The previous classroom prototype and related preview assets remain in the repository for reference, but they are **not** the current lesson. In particular, `halloween_simulator/classroom.*` and `halloween_simulator/finale.*` are legacy files; the commands above build the current standalone page.

## Team collaboration

Use branches and pull requests to review changes. Collaborator access and co-author attribution require teammates' GitHub usernames and agreed author names/commit emails; neither is inferred here.
