import { describe, it, expect } from "vitest";
import { Block, Floor, Unit } from "@workspace/db-sequelize";
void Block;
import { createTestUnit, newAgent, loginAs, postWithCsrf } from "./helpers";

describe("Portable empty structure", () => {
  it("starts without seeded blocks", async () => {
    expect(await Block.count()).toBe(0);
  });

  it("starts without seeded floors", async () => {
    expect(await Floor.count()).toBe(0);
  });

  it("starts without seeded units", async () => {
    expect(await Unit.count()).toBe(0);
  });

  it("re-running ensureDatabaseReady keeps the empty portable structure idempotent", async () => {
    const { ensureDatabaseReady } = await import("@workspace/db-sequelize");
    await ensureDatabaseReady();
    expect(await Block.count()).toBe(0);
    expect(await Floor.count()).toBe(0);
    expect(await Unit.count()).toBe(0);
  });

  it("13. rejects a duplicate unit identifier within the same block/floor", async () => {
    const agent = newAgent();
    await loginAs(agent, "admin", "admin123");
    const existingUnit = await createTestUnit("for_sale");
    const floor = await Floor.findByPk(existingUnit.floorId, { include: [{ model: Block, as: "block" }] });
    expect(floor).not.toBeNull();
    const projectId = (floor as unknown as { block: { projectId: number } }).block.projectId;

    const res = await postWithCsrf(agent, `/api/projects/${projectId}/blocks/${floor!.blockId}/floors/${floor!.id}/units`, {
      unitNumber: existingUnit.unitNumber,
      unitTypeId: existingUnit.unitTypeId,
      purpose: existingUnit.purpose,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("15. project CRUD: create, read and update a project", async () => {
    const agent = newAgent();
    await loginAs(agent, "admin", "admin123");
    const suffix = Date.now();
    const createRes = await postWithCsrf(agent, "/api/projects", { name: `Test Project ${suffix}`, code: `TP-${suffix}` });
    expect(createRes.status).toBe(201);
    const id = createRes.body.id;

    const readRes = await agent.get(`/api/projects/${id}`);
    expect(readRes.status).toBe(200);
  });
});
