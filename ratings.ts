// @deno-types="npm:@types/node"
import { Glicko2 } from "npm:glicko2";

interface Route {
    id: number;
    type: string;
    title: string;
    rating: number;
    summary: string;
    difficulty: string;
    pitches: number;
    route_types: string[];
    area: number;
}

interface User {
    id: number;
    name: string;
}

interface Tick {
    routeId: number;
    difficulty: string;
    route_types: string[];
    id: number;
    date: string;
    comment: string | null;
    style: string;
    leadStyle: string;
    pitches: number;
    text: string | boolean;
    createdAt: string;
    updatedAt: string;
    user?: User | false;
}

interface RatingResult {
    id: number;
    rating: number;
    rd: number;
    vol: number;
}

interface RouteRatingResult extends RatingResult {
    routeInfo?: Route;
}

interface ClimberRatingResult extends RatingResult {
    userName?: string;
}

type LeadStyle = "Onsight" | "Flash" | "Redpoint" | "Fell/Hung";

// Initialize Glicko-2 settings
const ranking = new Glicko2({
    tau: 0.5, // Rating volatility constraint
    rating: 1500, // Default rating
    rd: 350, // Default rating deviation (higher for new players/routes)
    vol: 0.06, // Default volatility
});

// Read and parse the JSON files
const routes: Route[] = (await Deno.readTextFile("./rrg-routes.json"))
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));

const ticks: Tick[] = (await Deno.readTextFile("./rrg-ticks.json"))
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));

// Keep track of all players and routes
const players = new Map<number, any>();
const routeRatings = new Map<number, any>();

// Helper function to get or create a rating
function getOrCreateRating(id: number, map: Map<number, any>): any {
    if (!map.has(id)) {
        map.set(id, ranking.makePlayer());
    }
    return map.get(id)!;
}

// Convert leadStyle to score
function getScore(leadStyle: LeadStyle): number | null {
    switch (leadStyle) {
        case "Onsight":
            return 1.0;
        case "Flash":
            return 0.8;
        case "Redpoint":
            return 0.6;
        case "Fell/Hung":
            return 0.0;
        default:
            return null;
    }
}

// Sort ticks by date
const sortedTicks = ticks
    .filter((tick): tick is Tick & { user: User } =>
        tick.user !== undefined && tick.user !== false &&
        tick.leadStyle !== undefined
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

// Process ticks in batches by date
let currentDate = "";
let currentMatches = [];

for (const tick of sortedTicks) {
    const score = getScore(tick.leadStyle as LeadStyle);
    if (score === null) continue;

    const tickDate = tick.date.split(",")[0]; // Get just the date part

    // If we've moved to a new date, process the previous batch
    if (currentDate && tickDate !== currentDate && currentMatches.length > 0) {
        ranking.updateRatings(currentMatches);
        currentMatches = [];
    }

    currentDate = tickDate;
    if (!tick.user) {
        continue;
    }
    const player = getOrCreateRating(tick.user.id, players);
    const route = getOrCreateRating(tick.routeId, routeRatings);

    // Add to current batch of matches
    currentMatches.push([player, route, score]);
}

// Process final batch
if (currentMatches.length > 0) {
    ranking.updateRatings(currentMatches);
}

// Format results
function formatRating(player: any): Omit<RatingResult, "id"> {
    return {
        rating: Math.round(player.getRating()),
        rd: Math.round(player.getRd()),
        vol: player.getVol(),
    };
}

// Get climber ratings
const climberRatings: ClimberRatingResult[] = Array.from(players.entries()).map(
    ([id, player]) => {
        const tick = sortedTicks.find((t) => t.user.id === id);
        return {
            id,
            userName: tick?.user.name,
            ...formatRating(player),
        };
    },
);

// Get route ratings
const routeResults: RouteRatingResult[] = Array.from(routeRatings.entries())
    .map(([id, rating]) => ({
        id,
        ...formatRating(rating),
        routeInfo: routes.find((r) => r.id === Number(id)),
    }));

// Sort by rating
climberRatings.sort((a, b) => b.rating - a.rating);
routeResults.sort((a, b) => b.rating - a.rating);


// // Print some predictions
// if (climberRatings.length >= 2) {
//     const topClimber = getOrCreateRating(climberRatings[0].id, players);
//     const secondClimber = getOrCreateRating(climberRatings[1].id, players);
//     const predicted = ranking.predict(topClimber, secondClimber);
//     console.log(
//         `\nPrediction: ${climberRatings[0].userName} has ${
//             (predicted * 100).toFixed(1)
//         }% chance of outperforming ${climberRatings[1].userName}`,
//     );
// }

// Save results to files
await Deno.writeTextFile(
    "./climber-ratings.json",
    "[\n" + climberRatings.map((r) => JSON.stringify(r)).join("\n") + "\n]",
);

await Deno.writeTextFile(
    "./route-ratings.json",
    "[\n" + routeResults.map((r) => JSON.stringify(r)).join("\n") + "\n]",
);
