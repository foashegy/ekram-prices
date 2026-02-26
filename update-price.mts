import { getStore } from "@netlify/blobs";
import type { Context, Config } from "@netlify/functions";

const VALID_MATERIALS = [
  "yellow_corn", "soybean_meal", "wheat_bran",
  "orange_peel_fresh", "orange_peel_dried",
  "sunflower_meal", "hay", "straw"
];

const MATERIAL_NAMES: Record<string, string> = {
  yellow_corn: "ذرة صفراء",
  soybean_meal: "كسب فول صويا",
  wheat_bran: "ردة قمح",
  orange_peel_fresh: "قشر برتقال فريش",
  orange_peel_dried: "قشر برتقال مجفف",
  sunflower_meal: "كسب عباد شمس",
  hay: "دريس",
  straw: "تبن"
};

// Alias mapping for Telegram bot messages (parsed by Make.com/OpenAI)
const CODE_ALIASES: Record<string, string> = {
  corn: "yellow_corn",
  soya: "soybean_meal",
  bran: "wheat_bran",
  orange_f: "orange_peel_fresh",
  orange_d: "orange_peel_dried",
  sunflower: "sunflower_meal",
  hay: "hay",
  straw: "straw"
};

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Optional: simple API key auth for the Telegram webhook
  const apiKey = Netlify.env.get("EKRAM_API_KEY");
  const authHeader = req.headers.get("x-api-key");
  if (apiKey && authHeader && authHeader !== apiKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const body = await req.json();
    let { material, price, supplier, user } = body;

    // Resolve alias codes from Telegram bot
    if (material && CODE_ALIASES[material]) {
      material = CODE_ALIASES[material];
    }

    if (!material || !VALID_MATERIALS.includes(material)) {
      return new Response(JSON.stringify({ error: "Invalid material", valid: VALID_MATERIALS }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!price || isNaN(Number(price)) || Number(price) <= 0) {
      return new Response(JSON.stringify({ error: "Invalid price" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const store = getStore({ name: "ekram-prices", consistency: "strong" });

    // Get current prices
    const currentPrices = (await store.get("current-prices", { type: "json" })) || {};
    const currentHistory = (await store.get("price-history", { type: "json" })) || [];

    const prevPrice = currentPrices[material]?.price || Number(price);
    const newPrice = Number(price);
    const changePct = prevPrice > 0
      ? (((newPrice - prevPrice) / prevPrice) * 100).toFixed(1)
      : "0";
    const dir = newPrice > prevPrice ? "up" : newPrice < prevPrice ? "down" : "stable";

    const now = new Date().toISOString();

    // Update current price
    currentPrices[material] = {
      price: newPrice,
      prevPrice,
      supplier: supplier || currentPrices[material]?.supplier || "",
      updatedBy: user || "API",
      updatedAt: now
    };

    // Add to history (keep last 100)
    currentHistory.unshift({
      materialKey: material,
      materialName: MATERIAL_NAMES[material] || material,
      price: newPrice,
      prevPrice,
      changePct: `${dir === "up" ? "+" : ""}${changePct}%`,
      dir,
      supplier: supplier || "",
      updatedBy: user || "API",
      time: now
    });

    if (currentHistory.length > 100) {
      currentHistory.length = 100;
    }

    // Save both
    await store.setJSON("current-prices", currentPrices);
    await store.setJSON("price-history", currentHistory);

    return new Response(JSON.stringify({
      success: true,
      material,
      materialName: MATERIAL_NAMES[material],
      price: newPrice,
      prevPrice,
      change: `${changePct}%`,
      dir
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Server error", details: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config: Config = {
  path: "/api/update-price"
};
