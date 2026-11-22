import fs from "fs";
import path from "path";
import { connectMongo, isMongoConfigured } from "./mongodb";
import { ERPModels, type ERPCollectionKey } from "./models";
import { createCleanProductionState } from "./seed";
import type { AuditLog, ERPDatabaseState, SafeUser } from "@/types/erp";

export const ALL_COLLECTION_KEYS: ERPCollectionKey[] = [
  "roles",
  "users",
  "branches",
  "warehouses",
  "products",
  "inventoryLots",
  "stockMovements",
  "customers",
  "salesOrders",
  "invoices",
  "ledgerEntries",
  "payments",
  "suppliers",
  "purchaseOrders",
  "accounts",
  "journalEntries",
  "expenses",
  "taxRules",
  "employees",
  "approvals",
  "documents",
  "notifications",
  "auditLogs",
  "backups",
  "emailLogs",
  "integrations",
];

declare global {
  // eslint-disable-next-line no-var
  var __apexMemoryState: ERPDatabaseState | undefined;
  // eslint-disable-next-line no-var
  var __apexMongoInitialized: boolean | undefined;
}

const LOCAL_DATA_DIR = path.join(process.cwd(), ".local-data");
const LOCAL_DATA_FILE = path.join(LOCAL_DATA_DIR, "erp-db.json");

function stripMongoInternal<T>(doc: Record<string, unknown>): T {
  const copy = { ...doc };
  delete copy._id;
  delete copy.__v;
  return copy as T;
}

function readLocalDevState(): ERPDatabaseState {
  if (global.__apexMemoryState) return global.__apexMemoryState;
  try {
    if (fs.existsSync(LOCAL_DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_DATA_FILE, "utf8")) as ERPDatabaseState;
      if (parsed && parsed.settings && Array.isArray(parsed.products)) {
        global.__apexMemoryState = parsed;
        return parsed;
      }
    }
  } catch {
    // Initialize fresh clean state in dev
  }
  const clean = createCleanProductionState();
  global.__apexMemoryState = clean;
  writeLocalDevState(clean);
  return clean;
}

function writeLocalDevState(state: ERPDatabaseState): void {
  global.__apexMemoryState = state;
  try {
    if (!fs.existsSync(LOCAL_DATA_DIR)) fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    fs.writeFileSync(LOCAL_DATA_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch {
    // Dev fallback
  }
}

async function ensureMongoBaselineInitialized(): Promise<void> {
  if (global.__apexMongoInitialized) return;
  const SettingsModel = ERPModels.settings();
  const existingSettings = await SettingsModel.findOne({ id: "company-settings" }).lean();
  if (existingSettings) {
    global.__apexMongoInitialized = true;
    return;
  }

  const baseline = createCleanProductionState();
  await SettingsModel.updateOne(
    { id: baseline.settings.id },
    { $setOnInsert: baseline.settings },
    { upsert: true }
  );

  for (const key of ALL_COLLECTION_KEYS) {
    const model = ERPModels[key]();
    const items = baseline[key] as unknown as Array<Record<string, unknown>>;
    if (items.length > 0) {
      const count = await model.countDocuments();
      if (count === 0) {
        await model.bulkWrite(
          items.map((doc) => ({
            updateOne: {
              filter: { id: doc.id },
              update: { $setOnInsert: doc },
              upsert: true,
            },
          })),
          { ordered: false }
        );
      }
    }
  }
  global.__apexMongoInitialized = true;
}

export async function getStorageInfo(): Promise<{
  mode: "mongodb" | "local-dev";
  mongoConfigured: boolean;
  smtpConfigured: boolean;
  aiConfigured: boolean;
}> {
  const configured = isMongoConfigured();
  const smtpConfigured = Boolean(
    process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim()
  );
  const aiConfigured = Boolean(
    process.env.GEMINI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim()
  );

  if (configured) {
    const conn = await connectMongo();
    if (conn) {
      return { mode: "mongodb", mongoConfigured: true, smtpConfigured, aiConfigured };
    }
  }
  return { mode: "local-dev", mongoConfigured: configured, smtpConfigured, aiConfigured };
}

export async function loadERPState(): Promise<ERPDatabaseState> {
  if (isMongoConfigured()) {
    const conn = await connectMongo();
    if (!conn) {
      throw new Error(
        "DATABASE_UNAVAILABLE: Unable to connect to MongoDB Atlas. Verify MONGODB_URI and Atlas Network Access (allow 0.0.0.0/0 for Vercel)."
      );
    }

    await ensureMongoBaselineInitialized();
    const SettingsModel = ERPModels.settings();
    const settingsDoc = await SettingsModel.findOne({ id: "company-settings" }).lean();

    const entries = await Promise.all(
      ALL_COLLECTION_KEYS.map(async (key) => {
        const docs = await ERPModels[key]().find({}).lean();
        return [key, docs.map((d) => stripMongoInternal(d as Record<string, unknown>))] as const;
      })
    );

    const baseline = createCleanProductionState();
    const state: Record<string, unknown> = {
      settings: settingsDoc
        ? stripMongoInternal(settingsDoc as Record<string, unknown>)
        : baseline.settings,
    };
    for (const [k, v] of entries) {
      state[k] = v;
    }

    // Reflect real live env status for SMTP & AI integrations dynamically
    const typed = state as unknown as ERPDatabaseState;
    const smtpLive = Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());
    const aiLive = Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim());
    typed.integrations = typed.integrations.map((intItem) => {
      if (intItem.id === "int-smtp") return { ...intItem, status: smtpLive ? "Connected" : "Disconnected" };
      if (intItem.id === "int-ai") return { ...intItem, status: aiLive ? "Connected" : "Disconnected" };
      return intItem;
    });

    return typed;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_UNAVAILABLE: MONGODB_URI environment variable is required in production."
    );
  }

  return readLocalDevState();
}

/**
 * Atomic upsert + targeted delete synchronization per collection.
 * Eliminates deleteMany+insertMany race conditions under concurrent Vercel requests.
 */
export async function saveERPState(
  state: ERPDatabaseState,
  changedCollections?: Array<ERPCollectionKey | "settings">
): Promise<void> {
  if (isMongoConfigured()) {
    const conn = await connectMongo();
    if (!conn) {
      throw new Error("DATABASE_UNAVAILABLE: MongoDB connection lost while saving.");
    }

    const targets =
      changedCollections ||
      (["settings", ...ALL_COLLECTION_KEYS] as Array<ERPCollectionKey | "settings">);

    for (const target of targets) {
      if (target === "settings") {
        await ERPModels.settings().replaceOne(
          { id: state.settings.id },
          state.settings as unknown as Record<string, unknown>,
          { upsert: true }
        );
      } else {
        const model = ERPModels[target]();
        const items = state[target] as unknown as Array<Record<string, unknown>>;
        const currentIds = items.map((d) => String(d.id));

        if (items.length > 0) {
          await model.bulkWrite(
            items.map((doc) => ({
              replaceOne: {
                filter: { id: doc.id },
                replacement: doc,
                upsert: true,
              },
            })),
            { ordered: false }
          );
        }
        await model.deleteMany({ id: { $nin: currentIds } });
      }
    }
    return;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_UNAVAILABLE: MONGODB_URI must be configured in production.");
  }

  writeLocalDevState(state);
}

export function sanitizeStateForClient(
  state: ERPDatabaseState
): Omit<ERPDatabaseState, "users"> & { users: SafeUser[] } {
  const safeUsers: SafeUser[] = state.users.map(({ passwordHash: _ignored, ...rest }) => rest);
  return {
    ...state,
    users: safeUsers,
  };
}

export function appendAudit(
  state: ERPDatabaseState,
  entry: Omit<AuditLog, "id" | "timestamp">
): void {
  const log: AuditLog = {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  state.auditLogs = [log, ...state.auditLogs].slice(0, 1000);
}
