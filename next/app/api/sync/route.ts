import { after } from "next/server";
import { signalDevices } from "../../../lib/push";
import { allowRequest } from "../../../lib/limits";
import { authenticated } from "../../../lib/server";
import { validatePatch, type Mutation } from "@tick/core";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function OPTIONS() {
  return new Response(null, { status: 204 });
}
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 1_000_000)
      return Response.json({ error: "Request too large" }, { status: 413 });
    const { client, user } = await authenticated(request);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 1_000_000) return Response.json({ error: "Request too large" }, { status: 413 });
    const body = JSON.parse(raw);
    if (
      !Array.isArray(body.mutations) ||
      body.mutations.length > 100 ||
      !Number.isSafeInteger(body.cursor) ||
      body.cursor < 0
    )
      return Response.json({ error: "Invalid sync request" }, { status: 400 });
    if (!allowRequest(`sync:${body.mutations.length ? 'write' : 'read'}:${user.id}`, body.mutations.length ? 120 : 1200)) return Response.json({ error: "Too many sync requests. Try again shortly." }, { status: 429, headers: { "Retry-After": "60" } });
    for (const m of body.mutations as Mutation[]) {
      if (
        !uuid.test(m.id) ||
        !uuid.test(m.itemId) ||
        !["todo", "movie"].includes(m.kind) ||
        !["patch", "delete", "restore"].includes(m.action) ||
        !m.patch ||
        typeof m.patch !== "object" ||
        Array.isArray(m.patch)
      )
        return Response.json({ error: "Invalid mutation" }, { status: 400 });
      validatePatch(m.patch);
    }
    if (body.protocol !== undefined && body.protocol !== 2) return Response.json({error:"Unsupported sync protocol"},{status:400});
    for (const name of ["pullUntil", "historyAfter", "historyUntil"]) {
      if (body[name] !== undefined && (!Number.isSafeInteger(body[name]) || body[name] < 0)) return Response.json({error:"Invalid page cursor"},{status:400});
    }
    const { data, error } = await client.rpc(body.protocol === 2 ? "tick_sync_v2" : "tick_sync", {
      mutations: body.mutations,
      after_cursor: body.cursor,
      ...(body.protocol === 2 ? { until_cursor: body.pullUntil ?? null, history_after: body.historyAfter ?? 0, history_until: body.historyUntil ?? null } : {}),
    });
    if (error) throw new Error(error.message);
    if(body.mutations.length) after(async()=>{try{await signalDevices(client,user.id);}catch{console.warn("Task-tick push hint failed; cursor catch-up remains available");}});
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const message = (e as Error).message;
    return Response.json(
      { error: message },
      { status: /sign in|session|expired/i.test(message) ? 401 : 400 },
    );
  }
}
