import fs from "fs";
import path from "path";
import { connectMongo, isMongoConfigured } from "./mongodb";
import { ERPModels, type ERPCollectionKey } from "./models";
import { createSeedState } from "./seed";
import type { AuditLog, ERPDatabaseState, SafeUser } from "@/types/erp";

const COLLECTION_KEYS: ERPCollectionKey[] = [
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
  var __apexMongoSeeded: boolean | undefined;
}

const LOCAL_DATA_DIR = path.join(process.cwd(), ".local-data");
const LOCAL_DATA_FILE = path.join(LOCAL_DATA_DIR, "erp-db.json");

function stripMongoInternal<T>(doc: Record<string, unknown>): T {
  const copy = { ...doc };
  delete copy._id;
  delete copy.__v;
  return copy as T;
}

function readLocalState(): ERPDatabaseState {
  if (global.__apexMemoryState) return global.__apexMemoryState;

  try {
    if (fs.existsSync(LOCAL_DATA_FILE)) {
      const raw = fs.readFileSync(LOCAL_DATA_FILE, "utf8");
      const parsed = JSON.parse(raw) as ERPDatabaseState;
      if (parsed && parsed.products && parsed.users) {
        global.__apexMemoryState = parsed;
        return parsed;
      }
    }
  } catch {
    // Fallback to fresh seed if local file unreadable
  }

  const seeded = createSeedState();
  global.__apexMemoryState = seeded;
  writeLocalState(seeded);
  return seeded;
}

function writeLocalState(state: ERPDatabaseState): void {
  global.__apexMemoryState = state;
  try {
    if (!fs.existsSync(LOCAL_DATA_DIR)) {
      fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_DATA_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch {
    // In read-only serverless environments without MONGODB_URI, keep in memory
  }
}

async function ensureMongoSeeded(): Promise<void> {
  if (global.__apexMongoSeeded) return;
  const SettingsModel = ERPModels.settings();
  const existingSettings = await SettingsModel.findOne({ id: "company-settings" }).lean();
  if (existingSettings) {
    global.__apexMongoSeeded = true;
    return;
  }

  const seed = createSeedState();
  await SettingsModel.updateOne(
    { id: seed.settings.id },
    { $set: seed.settings },
    { upsert: true }
  );

  for (const key of COLLECTION_KEYS) {
    const model = ERPModels[key]();
    const items = seed[key] as unknown as Array<Record<string, unknown>>;
    if (items.length > 0) {
      const count = await model.countDocuments();
      if (count === 0) {
        await model.insertMany(items);
      }
    }
  }
  global.__apexMongoSeeded = true;
}

export async function getStorageInfo(): Promise<{
  mode: "mongodb" | "local-seeded";
  mongoConfigured: boolean;
}> {
  const configured = isMongoConfigured();
  if (configured) {
    const conn = await connectMongo();
    if (conn) return { mode: "mongodb", mongoConfigured: true };
  }
  return { mode: "local-seeded", mongoConfigured: configured };
}

export async function loadERPState(): Promise<ERPDatabaseState> {
  if (isMongoConfigured()) {
    const conn = await connectMongo();
    if (conn) {
      await ensureMongoSeeded();
      const SettingsModel = ERPModels.settings();
      const settingsDoc = await SettingsModel.findOne({ id: "company-settings" }).lean();

      const entries = await Promise.all(
        COLLECTION_KEYS.map(async (key) => {
          const docs = await ERPModels[key]().find({}).lean();
          return [key, docs.map((d) => stripMongoInternal(d as Record<string, unknown>))] as const;
        })
      );

      const fallback = createSeedState();
      const state: Record<string, unknown> = {
        settings: settingsDoc
          ? stripMongoInternal(settingsDoc as Record<string, unknown>)
          : fallback.settings,
      };
      for (const [k, v] of entries) {
        state[k] = v;
      }
      return state as unknown as ERPDatabaseState;
    }
  }

  return readLocalState();
}

export async function saveERPState(
  state: ERPDatabaseState,
  changedCollections?: Array<ERPCollectionKey | "settings">
): Promise<void> {
  if (isMongoConfigured()) {
    const conn = await connectMongo();
    if (conn) {
      const targets = changedCollections || (["settings", ...COLLECTION_KEYS] as Array<ERPCollectionKey | "settings">);

      for (const target of targets) {
        if (target === "settings") {
          await ERPModels.settings().updateOne(
            { id: state.settings.id },
            { $set: state.settings },
            { upsert: true }
          );
        } else {
          const model = ERPModels[target]();
          const items = state[target] as unknown as Array<Record<string, unknown>>;
          await model.deleteMany({});
          if (items.length > 0) {
            await model.insertMany(items);
          }
        }
      }
      return;
    }
  }

  writeLocalState(state);
}

export function sanitizeStateForClient(state: ERPDatabaseState): Omit<ERPDatabaseState, "users"> & { users: SafeUser[] } {
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
  state.auditLogs = [log, ...state.auditLogs].slice(0, 400);
}
