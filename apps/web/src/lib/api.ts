const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function requestJson(path) {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API request failed: ${res.status}`);
  return res.json();
}

export async function getSignalsPage(cursor = "", limit = 20) {
  const qs = new URLSearchParams();
  qs.set("limit", String(limit));
  if (cursor) qs.set("cursor", cursor);
  return requestJson(`/signals?${qs.toString()}`);
}

export async function getLatestDigest() {
  return requestJson("/digests/latest");
}
