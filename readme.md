## Mountain Project Elo

Very experimental attempt to use the Glicko2 rating system to determine the
difficulty of climbs.

```bash
# Download route data (currently just downloads RRG)
deno run --allow-net ./pull-routes.ts > rrg-routes.json

# Download tick data (takes a long time 183MB of json)
cat rrg-routes.json | deno run --allow-net ./download-ticks.ts > rrg-ticks.json

# Show some stats on the distribution of climbing outcomes
cat rrg-ticks.json | deno run fell-hung-stats.ts

# Calculate ratings (very WIP), outputs climber-ratings.json and route-ratings.json
deno run --allow-read --allow-write ratings.ts
```
