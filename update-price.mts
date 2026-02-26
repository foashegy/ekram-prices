import { getStore } from "@netlify/blobs";
import type { Context, Config } from "@netlify/functions";

const DEFAULT_MATERIALS: Record<string, string> = {
  yellow_corn: "ذرة صفراء",
  soybean_meal: "كسب فول صويا",
  wheat_bran: "ردة قمح",
  orange_peel_fresh: "قشر برتقال فريش",
  orange_peel_dried: "قشر برتقال مجفف",
  sunflower_meal: "كسب عباد شمس",
  hay: "دريس",
  straw: "تبن"
};

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

    if (material && CODE_ALIASES[material]) {
      material = CODE_ALIASES[material];
    }

    if (!material) {
      return new Response(JSON.stringify({ error: "Material is required" }), {
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

    // Load custom materials to validate
    const customMaterials = (await store.get("custom-materials", { type: "json" })) || {};
    const allValidMaterials = { ...DEFAULT_MATERIALS };

    // Add custom material names
    for (const [key, val] of Object.entries(customMaterials)) {
      allValidMaterials[key] = (val as any).name || key;
    }

    if (!allValidMaterials[material]) {
      return new Response(JSON.stringify({ error: "Unknown material", valid: Object.keys(allValidMaterials) }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const currentPrices = (await store.get("current-prices", { type: "json" })) || {};
    const currentHistory = (await store.get("price-history", { type: "json" })) || [];

    const prevPrice = currentPrices[material]?.price || Number(price);
    const newPrice = Number(price);
    const changePct = prevPrice > 0
      ? (((newPrice - prevPrice) / prevPrice) * 100).toFixed(1)
      : "0";
    const dir = newPrice > prevPrice ? "up" : newPrice < prevPrice ? "down" : "stable";

    const now = new Date().toISOString();

    currentPrices[material] = {
      price: newPrice,
      prevPrice,
      supplier: supplier || currentPrices[material]?.supplier || "",
      updatedBy: user || "API",
      updatedAt: now
    };

    const materialName = allValidMaterials[material] || material;

    currentHistory.unshift({
      materialKey: material,
      materialName,
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

    await store.setJSON("current-prices", currentPrices);
    await store.setJSON("price-history", currentHistory);

    return new Response(JSON.stringify({
      success: true,
      material,
      materialName,
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
