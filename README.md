# Halloween Price Lab

## Current version — October 13, 2026

The current activity combines **the fullscreen animation from `Halloween_Teaching_Kit.zip` supplied by ReginaJin168 on October 13, 2026** with the final profit-and-satisfaction two-curve plot. The original simulation engine is unchanged.

**Start here:** download the repository and open **`halloween_simulator.html`** in your browser. It works offline; no installation or sign-in is required. This is the merged classroom version.

Source ZIP SHA-256 (before merging the plot): `98e7b185ac8552e5833c7367b5d1eb300e619aaff88ffa9a83ef8d3a835c2436`

## Classroom activity

- Choose a whole-dollar ticket price from $1 to $100.
- Play, pause, replay, change speed, or view the Halloween map in fullscreen.
- Observe visitors walking, queueing, completing activities, and resting.
- Compare profit and guest experience over the same 1,000 simulated nights.
- Adjust the ticket price and discuss the trade-off between earnings and experience.
- Reveal the final plot: ticket price on the horizontal axis, profit on the left axis, satisfaction on the right. The highest-profit qualifying price has average satisfaction at least 90/100. This is not a guarantee for every person or night.

See [START_HERE.txt](START_HERE.txt) for the latest classroom instructions and [model notes](halloween_simulator/model_notes.md) for assumptions. This is a fictional classroom simulation, not a real park forecast.

## Editable source

The `halloween_simulator/` folder contains the merged editable source. Use Node.js for development:

```sh
node halloween_simulator/tests.cjs
node halloween_simulator/page-tests.cjs
node halloween_simulator/finale-tests.cjs
node halloween_simulator/build.cjs
```

The build creates the standalone `halloween_simulator.html`. After changing the engine, regenerate comparison data with `node halloween_simulator/build-finale.cjs` before building. Both the template (with its folder intact) and standalone page can run the animation.

## Earlier prototype files

`animation-restored.png` shows the earlier non-fullscreen layout. The current executable includes the latest fullscreen presentation and the final two-curve plot. Earlier work remains recoverable in commit history.

## Team collaboration

Use branches and pull requests to review changes. Teammates must accept repository collaborator invitations before they can push. Invitations and co-author attribution are pending the teammates' GitHub usernames and agreed author names/commit emails. No teammate attribution has been invented.
