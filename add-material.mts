import { getStore } from "@netlify/blobs";
import type { Context, Config } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const body = await req.json();
    const { key, nameAr, nameEn, icon, unit } = body;

    if (!key || !nameAr) {
      return new Response(JSON.stringify({ error: "key and nameAr are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Sanitize key: lowercase, underscores
    const safeKey = key.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const store = getStore({ name: "ekram-prices", consistency: "strong" });

    // Get current custom materials list
    const customMaterials = (await store.get("custom-materials", { type: "json" })) || {};

    // Add new material
    customMaterials[safeKey] = {
      name: nameAr,
      nameEn: nameEn || safeKey,
      icon: icon || "📦",
      unit: unit || "جنيه/طن",
      addedAt: new Date().toISOString()
    };

    await store.setJSON("custom-materials", customMaterials);

    return new Response(JSON.stringify({
      success: true,
      material: safeKey,
      name: nameAr
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
  path: "/api/add-material"
};
