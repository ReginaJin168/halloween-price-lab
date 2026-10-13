# Halloween Price Lab

An offline classroom activity for seventh graders: choose a ticket price, watch guests move through a Halloween park, and explore the trade-off between profit and guest satisfaction.

## Run the activity

Download the repository and open **`halloween_simulator.html`** in a browser. No installation or sign-in is needed. Keep the `halloween_simulator` folder together if opening its editable `ui-template.html` instead.

- Choose a whole-dollar ticket price from $1 to $100.
- Play, pause, replay, or scrub the animated night. Guests walk, queue, visit activities, and rest.
- Compare the same 1,000 simulated nights at each price.
- At the end, reveal the two-curve plot: ticket price on the horizontal axis, average profit on the left axis, and guest satisfaction on the right axis.
- Find the highest average profit among prices with **average satisfaction at least 90/100**.

## Classroom assumptions

This is a fictional teaching model, not a real park forecast. The schematic map and walking distances affect simulated journeys. Satisfaction starts at 100 and loses 0.8 points per minute waiting and 25 points per unfinished activity, with a minimum of zero. It does not measure ticket affordability or actual survey opinions.

Profit is averaged per night; satisfaction is averaged across admitted guests. An average of 90 does **not** mean every guest or every night scores 90. With no guests, satisfaction is unavailable rather than 100. The two curves use different units; their intersection has no special meaning.

See [the classroom instructions](START_HERE.txt), [the final-plot notes](FINAL_PLOT_README.txt), and [the model documentation](halloween_simulator/model_notes.md).

## Edit and verify

Node.js is needed only for development, not for playing the activity.

```sh
node halloween_simulator/tests.cjs
node halloween_simulator/page-tests.cjs
node halloween_simulator/finale-tests.cjs
```

Edit `halloween_simulator/ui-template.html` for the main interface and `finale.js` / `finale.css` for the final plot. Rebuild the standalone page with:

```sh
node halloween_simulator/build.cjs
```

After changing `engine.js`, regenerate the 100-price comparison before building:

```sh
node halloween_simulator/build-finale.cjs
node halloween_simulator/build.cjs
```

The build rejects stale final-plot data when the engine changes. Commit both editable sources and the regenerated standalone page.

## Team workflow

Use a branch for changes, run the tests, and open a pull request for teammates to review. Repository collaborators need to accept their GitHub invitations before they can push.

For genuinely shared commits, use each contributor's agreed name and GitHub-associated commit email in `Co-authored-by` trailers. Collaboration access and commit authorship are separate: being invited to a repository does not automatically add co-author credit.
