import request from "supertest";
import type TestAgent from "supertest/lib/agent";
import app from "../src/app";
import { Block, Floor, Project, Unit, UnitType, type UnitPurpose } from "@workspace/db-sequelize";

/** A supertest agent that persists cookies (session + CSRF) across requests, like a browser. */
export function newAgent(): TestAgent {
  return request.agent(app);
}

const csrfCache = new WeakMap<TestAgent, string>();

function extractCsrfFromSetCookie(res: { headers: Record<string, unknown> }): string | undefined {
  const setCookie = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookieHeader = setCookie?.find((c) => c.startsWith("csrf_token="));
  if (!cookieHeader) return undefined;
  return decodeURIComponent(cookieHeader.split(";")[0]!.split("=")[1]!);
}

/** Primes the CSRF cookie by issuing a safe GET request (if needed), then returns the token to send back as a header. */
export async function getCsrfToken(agent: TestAgent): Promise<string> {
  const cached = csrfCache.get(agent);
  if (cached) return cached;
  const res = await agent.get("/api/auth/me");
  const token = extractCsrfFromSetCookie(res);
  if (!token) {
    throw new Error("Unable to obtain CSRF token");
  }
  csrfCache.set(agent, token);
  return token;
}

export async function loginAs(agent: TestAgent, username: string, password: string) {
  const csrf = await getCsrfToken(agent);
  return agent.post("/api/auth/login").set("x-csrf-token", csrf).send({ username, password });
}

export async function postWithCsrf(agent: TestAgent, url: string, body: unknown) {
  const csrf = await getCsrfToken(agent);
  return agent.post(url).set("x-csrf-token", csrf).send(body);
}

export async function putWithCsrf(agent: TestAgent, url: string, body: unknown) {
  const csrf = await getCsrfToken(agent);
  return agent.put(url).set("x-csrf-token", csrf).send(body);
}

export async function deleteWithCsrf(agent: TestAgent, url: string) {
  const csrf = await getCsrfToken(agent);
  return agent.delete(url).set("x-csrf-token", csrf);
}

export async function createTestUnit(purpose: UnitPurpose = "for_sale") {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
  const [unitType] = await UnitType.findOrCreate({
    where: { name: "ټیسټ واحد" },
    defaults: { name: "ټیسټ واحد", isActive: true },
  });
  const project = await Project.create({
    name: `Test Project ${suffix}`,
    code: `TP${suffix.slice(-10)}`,
    status: "active",
  });
  const block = await Block.create({
    projectId: project.id,
    name: `Block ${suffix.slice(-8)}`,
    code: `B${suffix.slice(-8)}`,
    order: 1,
  });
  const floor = await Floor.create({
    blockId: block.id,
    name: `Floor ${suffix.slice(-8)}`,
    levelNumber: 1,
    floorType: "residential",
    unitTypeId: unitType.id,
    purpose: purpose === "for_rent" ? "for_rent" : "for_sale",
    order: 1,
  });
  return Unit.create({
    floorId: floor.id,
    unitTypeId: unitType.id,
    unitNumber: `U${suffix.slice(-10)}`,
    status: "available",
    purpose,
  });
}
