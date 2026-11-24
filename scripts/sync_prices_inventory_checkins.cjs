const fs = require("fs");
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing required env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_ANON_KEY");
}
const sb = createClient(supabaseUrl.replace(/\/rest\/v1\/?$/, ""), supabaseKey);

const SYNTHETIC_SEED_IDS = new Set([
  "ef235819-47b1-4523-ac24-3c39bea18ad5",
  "2842e4ec-f1a5-4a1f-917b-41a3e22692b8",
  "f66d88fa-cf5b-4809-88ab-a16407fd50bf",
  "2d84d199-70e6-4466-acb1-c158873068d3",
  "a3569c63-dd0c-4f92-a5fd-738be016ecc0",
  "a98ddc9d-afe9-4041-abef-d808b8ce1a7e",
  "d12385d7-5c4a-48a5-adc2-81f2226be449",
  "b8c153f9-0b47-462a-a0e8-01043d4eea2d",
  "f19ac9d4-4687-4083-9c67-2297b592141c",
  "e9cde11f-03fc-43ba-a995-c404bb42a7ac",
]);
const SYNTHETIC_DEMO_PROMOTERS = new Set(["maria gonzalez", "ana silva", "ana perez", "grecia castillo"]);

const PROMOTER_CREATOR_MAP = {
  "mariaalmarza16@gmail.com": "MARIA ALMARZA",
  "7ecc4132-41a1-457f-8b5b-a351d516eea7": "MARIA ALMARZA",
  "f4b01b87-ddc6-4d57-b5ce-89f365d84bcc": "MARIA ALMARZA",
  "maria de los angeles almarza arnedo": "MARIA ALMARZA",
  "maria de los ángeles almarza arnedo": "MARIA ALMARZA",
  "scarmichell22@gmail.com": "SCARLETH PIÑA",
  "b49a24e1-f634-4323-a393-6e4c83090a17": "SCARLETH PIÑA",
  "anavecheverriar@gmail.com": "ANA ECHEVERRIA",
  "abmjyjm3rsfomc940zpp96ookqi1": "ANA ECHEVERRIA",
  "8e39ef7e-1e3c-4f25-830b-8c80fcde519e": "ANA ECHEVERRIA",
  "luzz010203@gmail.com": "OSMAIRY VILLASMIL",
  "11a20f7f-f9c9-4520-b759-e6cadae3693f": "OSMAIRY VILLASMIL",
  "tataacardenas@gmail.com": "TANIA CARDENAS",
  "3fb11b83-0fe8-4fbb-9206-9f97fab5f728": "TANIA CARDENAS",
  "hxlloueipcm2uqncdotsdzuibc3": "TANIA CARDENAS",
  "hxlcloueipcm2uqncdotsdzuibc3": "TANIA CARDENAS",
  "tata cardenas": "TANIA CARDENAS",
  "tata cárdenas": "TANIA CARDENAS",
  "antuneznairelis@gmail.com": "NAIRELIS ANTUNEZ",
  "5695f4f2-88c9-450f-b6e0-d164147f97d8": "NAIRELIS ANTUNEZ",
  "5p4txlh7hupfb2eyuxtwxvqyea53": "NAIRELIS ANTUNEZ",
  "demo-uid": "NAIRELIS ANTUNEZ",
  "demo-merch-uid": "NAIRELIS ANTUNEZ",
  "jaivelinfereira20@gmail.com": "JAIVELIN FEREIRA",
  "pw6cn7jc4hugm6msomg1kxyxiw53": "JAIVELIN FEREIRA",
  "ff491544-e39b-42b7-b8ae-12676f784bd7": "JAIVELIN FEREIRA",
  "ruizahyrleth22@gmail.com": "AHYRLET RUIZ",
  "93246df4-ccba-41dd-8400-b811157453d0": "AHYRLET RUIZ",
  "valevalentina0111@gmail.com": "VALERIA ACEVEDO",
  "43b38a3c-1bd7-4491-8a74-7ba138b3eed4": "VALERIA ACEVEDO",
  "clausofidaza@gmail.com": "CLAUDIA ALVAREZ",
  "738c0941-615b-4cd6-b6e9-0d09e7457a64": "CLAUDIA ALVAREZ",
  "jelaryacosta@gmail.com": "JELARY ACOSTA",
  "6fca1c0d-5df5-43a4-ba0e-acf9694362fb": "JELARY ACOSTA",
  "mariangelulacio3110@gmail.com": "MARIANGEL VALDIVIESO",
  "91550c4c-5fa8-4fa6-84cd-3cbd9835b5b7": "MARIANGEL VALDIVIESO",
  "enuksqjurey0ilfujlxzalwl0fg1": "MARIANGEL VALDIVIESO",
  "angelicaquero13@gmail.com": "ANGELICA SANCHEZ",
  "eneliejoseph@gmail.com": "ENELIANGELA GONZALEZ",
  "403c29c0-298d-46e5-a31a-b8056b0113db": "ENELIANGELA GONZALEZ",
  "zwmq3nkkxxxwzqyachmw2bqzty1": "ENELIANGELA GONZALEZ",
  "zwmq3nkkxxxwzqyachmw2bqzzty1": "ENELIANGELA GONZALEZ",
  "marianyelaranda@gmail.com": "MARIANYEL ARANDA",
  "juliannys.gil.crespo@gmail.com": "JULIANNYS GIL",
  "3e0b2b81-4785-41f3-8a15-e66ff02ae0ad": "JULIANNYS GIL",
  "joseabraham.barroso@gmail.com": "JOSE BARROSO",
  "bd271523-05d7-430c-9dd7-d859f3d848f8": "JOSE BARROSO",
  "jose-barroso-official": "JOSE BARROSO",
  "ziorelis.grangger@codizulca.com": "ZIORELI GRANGGER",
  "6a14294a-7ac4-4d0b-af3c-652b7ff06ce6": "ZIORELI GRANGGER",
  "43c070f1-f005-4843-868c-9ebb4caaf836": "CARELIZ REYES",
};

function isSynthetic(row) {
  if (!row || !row.id) return true;
  if (SYNTHETIC_SEED_IDS.has(String(row.id).trim())) return true;
  if (String(row.creatorId || "").trim().toLowerCase() === "admin") return true;
  const rawP = String(row.promoter || "").trim().toLowerCase();
  if (SYNTHETIC_DEMO_PROMOTERS.has(rawP)) return true;
  const rawS = String(row.store || "").trim().toLowerCase();
  if (rawS === "supermercado a" || rawS === "abasto b") return true;
  if (!rawP && !String(row.creatorId || "").trim()) return true;
  return false;
}

function resolvePromoter(rawP, creatorId) {
  const cleanRaw = String(rawP || "").trim();
  const cleanCreator = String(creatorId || "").trim().toLowerCase();
  if (cleanRaw && !cleanRaw.includes("@")) {
    const mapped = PROMOTER_CREATOR_MAP[cleanRaw.toLowerCase()];
    if (mapped) return mapped;
    return cleanRaw.toUpperCase();
  }
  if (cleanRaw && cleanRaw.includes("@")) {
    const mapped = PROMOTER_CREATOR_MAP[cleanRaw.toLowerCase()];
    if (mapped) return mapped;
  }
  if (cleanCreator && PROMOTER_CREATOR_MAP[cleanCreator]) {
    return PROMOTER_CREATOR_MAP[cleanCreator];
  }
  return cleanRaw || "Promotora";
}

(async () => {
  const rate = 478.299;
  const { data: pData } = await sb.from("prices").select("*").order("date", { ascending: false }).limit(2000);
  const prices = (pData || []).filter(r => !isSynthetic(r)).map(row => {
    const ownUsd = Number(row.ourPrice ?? row.ownPriceUsd) || 0;
    const ownBs = Number((ownUsd * rate).toFixed(2));
    const rawPairs = [
      { brand: row.competitor1Brand, price: row.competitor1Price },
      { brand: row.competitor2Brand, price: row.competitor2Price },
      { brand: row.competitor3Brand, price: row.competitor3Price },
    ];
    if (rawPairs.every(p => !p.brand && !p.price) && (row.competitorBrand || row.competitorPrice)) {
      rawPairs.push({ brand: row.competitorBrand, price: row.competitorPrice });
    }
    const competitors = rawPairs.filter(p => (p.brand && String(p.brand).trim()) || Number(p.price) > 0).map(p => {
      const name = String(p.brand || "Competidor").trim();
      const priceUsd = Number(p.price) || 0;
      const priceBs = Number((priceUsd * rate).toFixed(2));
      const diffPercent = ownUsd > 0 && priceUsd > 0 ? Number((((priceUsd - ownUsd) / ownUsd) * 100).toFixed(1)) : 0;
      return { name, priceUsd, priceBs, diffPercent };
    });
    const rawComments = String(row.comments ?? row.observations ?? "").trim();
    const cleanObs = rawComments === "AI_SCANNED" ? "Escaneo de etiqueta en anaquel (App Promotora)" : rawComments;
    return {
      id: String(row.id),
      date: row.date || row.created_at,
      store: String(row.store || "Punto de Venta").trim(),
      promoter: resolvePromoter(row.promoter, row.creatorId),
      productName: String(row.ourProduct || row.productName || "Producto Codizulca").trim(),
      ownPriceUsd: ownUsd,
      ownPriceBs: ownBs,
      bcvRate: rate,
      competitors,
      observations: cleanObs,
      created_at: row.created_at || row.date,
    };
  });
  fs.writeFileSync("data_price_surveys.json", JSON.stringify(prices, null, 2));

  const { data: iData } = await sb.from("inventory").select("*").order("date", { ascending: false }).limit(2000);
  const inv = (iData || []).filter(r => !isSynthetic(r)).map(row => {
    const init = Number(row.initialQuantity ?? row.initialStock) || 0;
    const fin = Number(row.finalQuantity ?? row.finalStock) || 0;
    const tastings = Number(row.degustations ?? row.tastingsGiven) || 0;
    const rawDiff = Number((init - fin).toFixed(3));
    const netRotation = tastings > 0 && rawDiff > tastings ? Number((rawDiff - tastings).toFixed(3)) : Math.max(0, rawDiff);
    return {
      id: String(row.id),
      date: row.date || row.created_at,
      store: String(row.store || "Punto de Venta").trim(),
      promoter: resolvePromoter(row.promoter, row.creatorId),
      productName: String(row.product || row.productName || "Producto Codizulca").trim(),
      initialStock: init,
      tastingsGiven: tastings,
      finalStock: fin,
      netRotation,
      observations: String(row.comments ?? row.observations ?? "").trim(),
      created_at: row.created_at || row.date,
    };
  });
  fs.writeFileSync("data_inventory_logs.json", JSON.stringify(inv, null, 2));
  console.log("Wrote data_price_surveys.json:", prices.length, "and data_inventory_logs.json:", inv.length);
})();
