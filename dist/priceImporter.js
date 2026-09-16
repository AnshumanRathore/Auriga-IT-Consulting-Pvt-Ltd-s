"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importPriceList = importPriceList;
const money_1 = require("./money");
function normalizeName(name) {
    const cleaned = name.trim().toLowerCase();
    const names = {
        silver: "Silver",
        gold: "Gold",
        recliner: "Recliner"
    };
    return names[cleaned] ?? "";
}
function parsePrice(value) {
    if (value === null || value === undefined) {
        return null;
    }
    const raw = String(value).trim();
    if (!raw) {
        return null;
    }
    const cleaned = raw
        .replace(/₹/g, "")
        .replace(/rs\.?/gi, "")
        .replace(/inr/gi, "")
        .replace(/,/g, "")
        .trim();
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
        return null;
    }
    const numeric = Number(cleaned);
    if (!Number.isFinite(numeric) || numeric < 0) {
        return null;
    }
    return (0, money_1.toPaise)(numeric);
}
function importPriceList(rows) {
    const imported = [];
    const duplicates = [];
    const rejected = [];
    const seen = new Map();
    rows.forEach((row, index) => {
        const rowNumber = index + 1;
        const name = normalizeName(String(row.seatClass ?? ""));
        if (!name) {
            rejected.push({
                row: rowNumber,
                seatClass: String(row.seatClass ?? ""),
                reason: "Unknown or blank seat class"
            });
            return;
        }
        const pricePaise = parsePrice(row.price);
        if (pricePaise === null) {
            rejected.push({
                row: rowNumber,
                seatClass: name,
                reason: "Invalid, blank, or negative price"
            });
            return;
        }
        if (seen.has(name)) {
            duplicates.push({
                row: rowNumber,
                seatClass: name,
                reason: "Duplicate seat class"
            });
            return;
        }
        seen.set(name, rowNumber);
        imported.push({
            seatClass: name,
            pricePaise
        });
    });
    return {
        imported,
        duplicates,
        rejected,
        summary: {
            totalRows: rows.length,
            imported: imported.length,
            deduplicated: duplicates.length,
            rejected: rejected.length
        }
    };
}
