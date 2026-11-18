import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

export function createPrismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  // Render's external database address (used by the GitHub jobs) only accepts encrypted connections.
  const host = (() => {
    try {
      return new URL(connectionString).hostname;
    } catch {
      return "";
    }
  })();
  const ssl = /\.render\.com$/.test(host) || /sslmode=require/.test(connectionString);
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, ...(ssl ? { ssl: { rejectUnauthorized: true } } : {}) }) });
}

// One shared client per server process (Next.js dev reloads would otherwise open new connections).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getDb(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}
