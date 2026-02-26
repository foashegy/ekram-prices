import { getStore } from "@netlify/blobs";
import type { Context, Config } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  const store = getStore({ name: "ekram-prices", consistency: "strong" });

  try {
    const prices = await store.get("current-prices", { type: "json" });
    const history = await store.get("price-history", { type: "json" });

    return new Response(JSON.stringify({
      prices: prices || {},
      history: history || []
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ prices: {}, history: [] }), {
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config: Config = {
  path: "/api/prices"
};
