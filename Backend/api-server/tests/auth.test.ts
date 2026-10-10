import { describe, it, expect } from "vitest";
import { newAgent, loginAs, postWithCsrf, getCsrfToken } from "./helpers";
import { User, hashPassword } from "@workspace/db-sequelize";

describe("Authentication & RBAC", () => {
  it("1. logs in with valid credentials", async () => {
    const agent = newAgent();
    const res = await loginAs(agent, "admin", "admin123");
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("admin");
    expect(res.body.roles).toContain("admin");
  });

  it("rejects an unknown/invalid username or password", async () => {
    const agent = newAgent();
    const res = await loginAs(agent, "admin", "wrong-password");
    expect(res.status).toBe(401);
  });

  it("2+3. locks the account after three failed attempts", async () => {
    const username = `locktest_${Date.now()}`;
    const { hashPassword } = await import("@workspace/db-sequelize");
    const user = await User.create({
      username,
      passwordHash: await hashPassword("Correct#123"),
      fullName: "Lock Test",
      isActive: true,
    });

    const agent = newAgent();
    for (let i = 0; i < 3; i++) {
      const res = await loginAs(agent, username, "wrong-password");
      expect(res.status).toBe(401);
    }

    await user.reload();
    expect(user.failedLoginAttempts).toBe(3);
    expect(user.lockedUntil).not.toBeNull();

    // A subsequent attempt with the CORRECT password is still rejected while locked.
    const lockedRes = await loginAs(agent, username, "Correct#123");
    expect(lockedRes.status).toBe(423);
  });

  it("4. administrator unlock clears the lock", async () => {
    const username = `unlocktest_${Date.now()}`;
    const { hashPassword } = await import("@workspace/db-sequelize");
    const user = await User.create({
      username,
      passwordHash: await hashPassword("Correct#123"),
      fullName: "Unlock Test",
      isActive: true,
      failedLoginAttempts: 3,
      lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
    });

    const adminAgent = newAgent();
    await loginAs(adminAgent, "admin", "admin123");
    const unlockRes = await postWithCsrf(adminAgent, `/api/users/${user.id}/unlock`, {});
    expect([200, 204]).toContain(unlockRes.status);

    await user.reload();
    expect(user.lockedUntil).toBeNull();
    expect(user.failedLoginAttempts).toBe(0);

    const loginAgent = newAgent();
    const res = await loginAs(loginAgent, username, "Correct#123");
    expect(res.status).toBe(200);
  });

  it("36. rejects unauthorized API access without a session", async () => {
    const agent = newAgent();
    const res = await agent.get("/api/parties");
    expect(res.status).toBe(401);
  });

  it("6. RBAC blocks a permission-less endpoint for a role without that permission", async () => {
    const csrfAgent = newAgent();
    await getCsrfToken(csrfAgent);
    const csrfRes = await csrfAgent.get("/api/auth/me");
    const cookies = (csrfRes.headers["set-cookie"] as unknown as string[]) ?? [];
    const csrfCookie = cookies.find((c) => c.startsWith("csrf_token="));
    const csrfToken = csrfCookie ? decodeURIComponent(csrfCookie.split(";")[0]!.split("=")[1]!) : "";

    // Create a viewer-ish user with no roles at all, then attempt a manage-only action.
    const username = `rbactest_${Date.now()}`;
    const { hashPassword } = await import("@workspace/db-sequelize");
    await User.create({
      username,
      passwordHash: await hashPassword("Correct#123"),
      fullName: "RBAC Test",
      isActive: true,
    });

    const agent = newAgent();
    const loginRes = await loginAs(agent, username, "Correct#123");
    expect(loginRes.status).toBe(200);

    const res = await postWithCsrf(agent, "/api/parties", { name: "Should Be Blocked", type: "individual_customer" });
    expect(res.status).toBe(403);
    void csrfToken;
  });

  it("37. returns safe (no stack trace) error responses", async () => {
    const agent = newAgent();
    await loginAs(agent, "admin", "admin123");
    const res = await agent.get("/api/parties/999999999");
    expect([404, 400]).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toMatch(/at\s+.*\(.*:\d+:\d+\)/);
  });

  it("keeps login-form credential recovery permanent for the only admin account", async () => {
    const newUsername = `recovered_${Date.now()}`;
    const newPassword = "Strong#12345";
    const recoveryAgent = newAgent();

    try {
      const recoverRes = await postWithCsrf(recoveryAgent, "/api/auth/recover-credentials", {
        username: newUsername,
        newPassword,
        confirmNewPassword: newPassword,
      });

      expect(recoverRes.status).toBe(200);
      expect(recoverRes.body.username).toBe(newUsername);

      const loginAgent = newAgent();
      const loginRes = await loginAs(loginAgent, newUsername, newPassword);

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.username).toBe(newUsername);
      expect(loginRes.body.roles).toContain("admin");
    } finally {
      const user = (await User.findOne({ where: { username: newUsername } })) ?? (await User.findOne({ where: { username: "admin" } }));
      if (user) {
        user.username = "admin";
        user.passwordHash = await hashPassword("admin123");
        user.isActive = true;
        user.failedLoginAttempts = 0;
        user.lockedUntil = null;
        await user.save();
      }
    }
  });
});
