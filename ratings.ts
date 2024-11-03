// @deno-types="npm:@types/node"
import { Glicko2 } from "npm:glicko2";

const startTime = Date.now();
const getTimestamp = () => `[${((Date.now() - startTime) / 1000).toFixed(2)}s]`;
const log = (...args: any[]) => console.log(`${getTimestamp()}`, ...args);
log(`Defining interfaces and types...`);

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

log(`Initializing Glicko-2 system...`);
// Initialize Glicko-2 settings
const ranking = new Glicko2({
    tau: 0.5, // Rating volatility constraint
    rating: 1500, // Default rating
    rd: 350, // Default rating deviation (higher for new players/routes)
    vol: 0.06, // Default volatility
});

log(`Reading route data from rrg-routes.json...`);
// Read and parse the JSON files
const routes: Route[] = (await Deno.readTextFile("./rrg-routes.json"))
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
log(`Loaded ${routes.length} routes`);

log(`Reading tick data from rrg-ticks.json...`);
const ticks: Tick[] = (await Deno.readTextFile("./rrg-ticks.json"))
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
log(`Loaded ${ticks.length} ticks`);

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
            return 0.9;
        case "Redpoint":
            return 0.7;
        case "Fell/Hung":
            return 0.0;
        default:
            return null;
    }
}

const names: Record<number, string> = {};
const userTicks = new Map<number, Tick[]>();
log(`Filtering and sorting ticks by date...`);
// Sort ticks by date
const sortedTicks = ticks
    .filter((tick): tick is Tick & { user: User } => {
        // console.log(tick);
        if (
            tick.user !== undefined && tick.user !== false &&
            tick.leadStyle !== undefined && tick.style == "Lead"
        ) {
            names[tick.user.id] = tick.user.name;
            userTicks.set(tick.user.id, [
                ...(userTicks.get(tick.user.id) || []),
                tick,
            ]);
            return true;
        }
        return false;
    })
    // Only include users who have at least one "Fell/Hung" tick
    .filter((tick) => {
        return userTicks.get(tick.user.id)?.some((t) =>
            t.leadStyle === "Fell/Hung"
        );
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

log(`Processing ${sortedTicks.length} valid ticks`);

// Process ticks in batches by date
let currentDate = "";
let currentMatches = [];
let processedTicks = 0;

log(`Processing ticks in batches by date...`);
for (const tick of sortedTicks) {
    const score = getScore(tick.leadStyle as LeadStyle);
    if (score === null) continue;

    const tickDate = tick.date.split(",")[0]; // Get just the date part

    // If we've moved to a new date, process the previous batch
    if (currentDate && tickDate !== currentDate && currentMatches.length > 0) {
        ranking.updateRatings(currentMatches);
        processedTicks += currentMatches.length;
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

    if ((processedTicks + currentMatches.length) % 50_000 === 0) {
        log(`Processed ${processedTicks + currentMatches.length} ticks...`);
    }
}

// Process final batch
if (currentMatches.length > 0) {
    ranking.updateRatings(currentMatches);
    processedTicks += currentMatches.length;
}
log(`Finished processing all ${processedTicks} ticks`);

// Format results
function formatRating(player: any): Omit<RatingResult, "id"> {
    return {
        rating: Math.round(player.getRating()),
        rd: Math.round(player.getRd()),
        vol: player.getVol(),
    };
}

log(`Calculating climber ratings...`);
// Get climber ratings
const climberRatings: ClimberRatingResult[] = Array.from(players.entries()).map(
    ([id, player]) => {
        return {
            id,
            userName: names[id],
            ...formatRating(player),
        };
    },
);
log(`Calculated ratings for ${climberRatings.length} climbers`);

log(`Calculating route ratings...`);
// Get route ratings
const routeResults: RouteRatingResult[] = Array.from(routeRatings.entries())
    .map(([id, rating]) => ({
        id,
        ...formatRating(rating),
        routeInfo: routes.find((r) => r.id === Number(id)),
    }));
log(`Calculated ratings for ${routeResults.length} routes`);

log(`Sorting results...`);
// Sort by rating
climberRatings.sort((a, b) => b.rating - a.rating);
routeResults.sort((a, b) => b.rating - a.rating);

// Print specific climber ratings
const targetClimbers = ["Max McDonnell", "Jillian Genova"];
console.log(`\nTarget Climber Ratings:`);
climberRatings
    .filter((c) => targetClimbers.includes(c.userName || ""))
    .forEach((c) => log(`${c.userName}: ${c.rating} (±${c.rd})`));

// Print specific route ratings
const targetRoutes = [
    "Johnny B. Good",
    "Rising",
    "Banshee",
    "Loompa",
    "Oompa",
    "Starry Night",
    "King Me",
    "A Brief History of Climb",
    "Super Dario",
    "Up Yonder",
    "Ro Shampo",
    "Monkey in the Middle",
    "Jungle Trundler",
    "Dain Bramage",
    "27 Years of Climbing",
,];
console.log(`\nTarget Route Ratings:`);
routeResults
    .filter((r) => targetRoutes.includes(r.routeInfo?.title || ""))
    .forEach((r) => log(`${r.routeInfo?.title}: ${r.rating} (±${r.rd}) - ${r.routeInfo?.difficulty}`));

console.log(`Saving results to files...`);
// Save results to files
await Deno.writeTextFile(
    "./climber-ratings.json",
    "[\n" + climberRatings.map((r) => JSON.stringify(r)).join("\n") + "\n]",
);

await Deno.writeTextFile(
    "./route-ratings.json",
    "[\n" + routeResults.map((r) => JSON.stringify(r)).join("\n") + "\n]",
);

console.log(`Done!`);
