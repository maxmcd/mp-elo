import * as readline from "node:readline";
import process from "node:process";

interface RouteData {
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

interface TickResponse {
    data: Tick[];
    current_page: number;
    last_page: number;
    total: number;
}

interface Tick {
    id: number;
    date: string;
    comment: string | null;
    style: string;
    leadStyle: string;
    pitches: number;
    text: string | false;
    user: {
        id: number;
        name: string;
    } | false;
}

async function fetchAllTicks(routeId: number) {
    const TICKS_PER_PAGE = 250;
    const BASE_URL =
        `https://www.mountainproject.com/api/v2/routes/${routeId}/ticks?per_page=${TICKS_PER_PAGE}`;

    try {
        // Fetch first page to get total pages
        const firstPageResponse = await fetch(`${BASE_URL}&page=1`);
        if (!firstPageResponse.ok) {
            throw new Error(`HTTP error! status: ${firstPageResponse.status}`);
        }
        const firstPageData: TickResponse = await firstPageResponse.json();
        const { difficulty, route_types } = routeData.get(routeId) ?? {};

        // Log first page of ticks
        firstPageData.data.forEach((tick) => {
            console.log(JSON.stringify({
                routeId,
                    difficulty,
                    route_types,
                    ...tick,
                }),
            );
        });

        // Fetch remaining pages
        for (let page = 2; page <= firstPageData.last_page; page++) {
            try {
                // Add a small delay to avoid rate limiting
                await new Promise((resolve) => setTimeout(resolve, 100));

                const response = await fetch(`${BASE_URL}&page=${page}`);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const pageData: TickResponse = await response.json();

                // Log each tick with the route ID
                pageData.data.forEach((tick) => {
                    console.log(JSON.stringify({
                        routeId,
                        difficulty,
                        route_types,
                        ...tick,
                        }),
                    );
                });
            } catch (error) {
                console.error(
                    `Error fetching page ${page} for route ${routeId}:`,
                    error,
                );
            }
        }
    } catch (error) {
        console.error(`Error fetching ticks for route ${routeId}:`, error);
    }
}

// Create readline interface to read stdin line by line
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
});

const routeIds: number[] = [];
const routeData = new Map<number, RouteData>();

// Read and parse each line
for await (const line of rl) {
    try {
        const data = JSON.parse(line) as RouteData;
        routeIds.push(data.id);
        routeData.set(data.id, data);
    } catch (error) {
        console.error("Error parsing line:", error);
    }
}

// Process each route sequentially
for (const routeId of routeIds) {
    await fetchAllTicks(routeId);
    // Add a small delay between routes
    await new Promise((resolve) => setTimeout(resolve, 500));
}
