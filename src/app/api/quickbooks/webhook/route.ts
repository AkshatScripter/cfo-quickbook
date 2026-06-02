import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/db";
import { cfoQbConnections, cfoWebhookEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { syncEntityById, deleteEntityById } from "@/lib/quickbooks/sync";

// POST /api/quickbooks/webhook — receives real-time change notifications from Intuit.
//
// Security model:
//   1. Verify intuit-signature (HMAC-SHA256 over raw body with QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN).
//   2. Ack with 200 immediately — Intuit retries on non-2xx.
//   3. Process events asynchronously (fire-and-forget).
//
// Notifications do NOT include the changed data — only the entity type + Id.
// We fetch the current record from QBO and upsert it.
export async function POST(request: Request) {
  const rawBody = await request.text();

  // ── Signature verification ──────────────────────────────────────────────────
  const signature = request.headers.get("intuit-signature") ?? "";
  if (!verifySignature(rawBody, signature)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // ── Parse payload ───────────────────────────────────────────────────────────
  let payload: QBWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as QBWebhookPayload;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  // ── Persist events & ack ────────────────────────────────────────────────────
  // Insert all events into cfo_webhook_events synchronously so the record exists
  // before async processing begins. Return 200 before any QBO API calls.
  const events: WebhookEvent[] = [];
  for (const notification of payload.eventNotifications ?? []) {
    const { realmId, dataChangeEvent } = notification;
    for (const entity of dataChangeEvent?.entities ?? []) {
      events.push({ realmId, entityType: entity.name, entityId: entity.id, operation: entity.operation });
    }
  }

  // Batch-insert all events from this notification in one round-trip
  if (events.length > 0) {
    await db.insert(cfoWebhookEvents).values(
      events.map((e) => ({
        realmId: e.realmId,
        entityType: e.entityType,
        entityId: e.entityId,
        eventType: e.operation,
        rawPayload: payload,
        processed: false,
      }))
    );
  }

  // Ack immediately — Intuit requires a fast 2xx response
  // Process in background (fire-and-forget)
  processEvents(events).catch(console.error);

  return new Response(null, { status: 200 });
}

// ─── Async processing ─────────────────────────────────────────────────────────

async function processEvents(events: WebhookEvent[]) {
  for (const event of events) {
    try {
      await processOne(event);
      // Mark processed
      await db
        .update(cfoWebhookEvents)
        .set({ processed: true })
        .where(
          eq(cfoWebhookEvents.entityId, event.entityId)
        );
    } catch (err) {
      // Log but continue — a failed event stays processed=false for retry/debugging
      console.error(`Webhook processing failed for ${event.entityType}#${event.entityId}:`, err);
    }
  }
}

async function processOne(event: WebhookEvent) {
  const { realmId, entityType, entityId, operation } = event;

  // Look up the userId for this realm so we can call qbQuery with a valid token
  const [conn] = await db
    .select({ userId: cfoQbConnections.userId })
    .from(cfoQbConnections)
    .where(eq(cfoQbConnections.realmId, realmId))
    .limit(1);

  if (!conn) return; // unknown realm — nothing to do

  if (operation === "Delete") {
    await deleteEntityById(realmId, entityType, entityId);
  } else {
    // Create | Update | Void | Merge — fetch current state from QBO and upsert
    await syncEntityById(realmId, conn.userId, entityType, entityId);
  }
}

// ─── Signature verification ───────────────────────────────────────────────────

function verifySignature(rawBody: string, signature: string): boolean {
  const token = process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN;
  // If the token is not configured, reject all webhooks in production.
  // In development you may skip this by setting the var to a test value.
  if (!token) return false;
  if (!signature) return false;

  const expected = createHmac("sha256", token).update(rawBody).digest("base64");
  try {
    // timingSafeEqual prevents timing attacks; both buffers must be same length.
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface QBWebhookPayload {
  eventNotifications?: Array<{
    realmId: string;
    dataChangeEvent?: {
      entities?: Array<{
        name: string;
        id: string;
        operation: string; // "Create" | "Update" | "Delete" | "Void" | "Merge"
        lastUpdated?: string;
      }>;
    };
  }>;
}

interface WebhookEvent {
  realmId: string;
  entityType: string;
  entityId: string;
  operation: string;
}
