import * as readline from "node:readline";
import process from "node:process";

interface Tick {
    routeId: number;
    difficulty: string;
    route_types: string[];
    id: number;
    date: string;
    style: string;
    leadStyle: string;
    pitches: number;
    text: string | false;
    user: {
        id: number;
        name: string;
    } | false;
}

interface UserStats {
    totalLeads: number;
    fellHung: number;
    redpoint: number;
    onsight: number;
    flash: number;
    pinkpoint: number;
    other: number;
    name: string;
}

type LeadStyleCount = {
    "Fell/Hung": number;
    "Redpoint": number;
    "Onsight": number;
    "Flash": number;
    "Pinkpoint": number;
    "other": number;
};

function initLeadStyleCount(): LeadStyleCount {
    return {
        "Fell/Hung": 0,
        "Redpoint": 0,
        "Onsight": 0,
        "Flash": 0,
        "Pinkpoint": 0,
        "other": 0,
    };
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
});

// Track stats globally and per user
let globalTotalLeads = 0;
let globalFellHung = 0;
const userStats = new Map<number, UserStats>();
const gradeStats = new Map<string, LeadStyleCount>();

function normalizeGrade(grade: string): string {
    // "5.10b/c"   -> "10"
    // "5.10a/b"   -> "10-"
    // "5.10c/d"   -> "10+"
    // "5.10 PG10" -> "10"
    return grade.replace(/^5\./, "").replace("a/b", "-").replace("c/d", "+")
        .replace("b/c", "").replace(/( .*)$/, "");
}

// Process each tick
for await (const line of rl) {
    const tick = JSON.parse(line) as Tick;

    // Skip if leadStyle is empty or user is false
    if (!tick.leadStyle || !tick.user || tick.style !== "Lead") continue;

    // Update global stats
    globalTotalLeads++;
    if (tick.leadStyle === "Fell/Hung") {
        globalFellHung++;
    }

    // Process grade statistics
    const grade = normalizeGrade(tick.difficulty);
    if (!gradeStats.has(grade)) {
        gradeStats.set(grade, initLeadStyleCount());
    }
    const gradeStyle = gradeStats.get(grade)!;

    // Update grade-specific style stats
    if (tick.leadStyle === "Fell/Hung") gradeStyle["Fell/Hung"]++;
    else if (tick.leadStyle === "Redpoint") gradeStyle["Redpoint"]++;
    else if (tick.leadStyle === "Onsight") gradeStyle["Onsight"]++;
    else if (tick.leadStyle === "Flash") gradeStyle["Flash"]++;
    else if (tick.leadStyle === "Pinkpoint") gradeStyle["Pinkpoint"]++;
    else if (tick.leadStyle !== "") gradeStyle["other"]++;

    // Update user stats
    if (tick.user) {
        const userId = tick.user.id;
        if (!userStats.has(userId)) {
            userStats.set(userId, {
                totalLeads: 0,
                fellHung: 0,
                redpoint: 0,
                onsight: 0,
                flash: 0,
                pinkpoint: 0,
                other: 0,
                name: tick.user.name,
            });
        }

        const stats = userStats.get(userId)!;
        stats.totalLeads++;
        switch (tick.leadStyle) {
            case "Fell/Hung":
                stats.fellHung++;
                break;
            case "Redpoint":
                stats.redpoint++;
                break;
            case "Onsight":
                stats.onsight++;
                break;
            case "Flash":
                stats.flash++;
                break;
            case "Pinkpoint":
                stats.pinkpoint++;
                break;
            default:
                if (tick.leadStyle !== "") stats.other++;
        }
    }
}

// Calculate global ratio
const globalRatio = globalFellHung / globalTotalLeads;
console.log("\nGlobal Statistics:");
console.log(`Total Lead Attempts: ${globalTotalLeads}`);
console.log(`Total Falls/Hangs: ${globalFellHung}`);
console.log(`Global Fall/Hang Ratio: ${(globalRatio * 100).toFixed(2)}%`);

// Print lead style distribution by grade
console.log("\nLead Style Distribution by Grade:");
const sortedGrades = Array.from(gradeStats.entries())
    .sort(([a], [b]) => {
        const aNum = parseFloat(a);
        const bNum = parseFloat(b);
        return aNum - bNum;
    });

for (const [grade, styles] of sortedGrades) {
    const total = Object.values(styles).reduce((a, b) => a + b, 0);
    if (total < 5) continue; // Skip grades with very few attempts

    console.log(`\n5.${grade}:`);
    Object.entries(styles)
        .filter(([_, count]) => count > 0)
        .sort(([_, a], [__, b]) => b - a)
        .forEach(([style, count]) => {
            const percentage = (count / total * 100).toFixed(2);
            const bar = "█".repeat(
                Math.floor(count * 30 / Math.max(...Object.values(styles))),
            );
            console.log(
                `  ${style.padEnd(10)}: ${bar} ${count} (${percentage}%)`,
            );
        });
}

// Calculate user ratios and create histogram
const userRatios = Array.from(userStats.entries())
    .map(([_, stats]) => ({
        name: stats.name,
        ratio: stats.fellHung / stats.totalLeads,
        totalLeads: stats.totalLeads,
        fellHung: stats.fellHung,
    }))
    .filter((user) => user.totalLeads >= 5) // Filter for users with at least 5 leads
    .sort((a, b) => a.ratio - b.ratio);

// Create and print histogram
const histogramBuckets = new Array(10).fill(0);
userRatios.forEach((user) => {
    const bucketIndex = Math.min(Math.floor(user.ratio * 10), 9);
    histogramBuckets[bucketIndex]++;
});

console.log("\nHistogram of User Fall/Hang Ratios (users with 5+ leads):");
histogramBuckets.forEach((count, i) => {
    const start = (i * 10).toString().padStart(2, " ");
    const end = (i * 10 + 10).toString().padStart(2, " ");
    console.log(
        `${start}%-${end}%: ${
            "█".repeat(count * 50 / Math.max(...histogramBuckets))
        } (${count} users)`,
    );
});

// Zero falls statistics
const usersWithZeroFalls = userRatios.filter((user) => user.ratio === 0);
const usersWithoutFalls = usersWithZeroFalls.length;
const totalUsers = userRatios.length;

console.log("\nZero Falls Statistics:");
console.log(
    `Users with no falls (out of users with 5+ leads): ${usersWithoutFalls}/${totalUsers} (${
        (usersWithoutFalls / totalUsers * 100).toFixed(2)
    }%)`,
);
