import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as initOAuth } from "@/app/api/auth/oauth/route";
import { GET as callbackOAuth } from "@/app/api/auth/callback/[provider]/route";
import * as projectRepo from "@/core/projects/project.repository";
import * as mailboxRepo from "./mailbox.repository";

interface MockUserSession {
  user: {
    id: string;
  };
}

let mockSession: MockUserSession | null = null;
let mockCsrfCookie: string | null = null;

// Mock env
vi.mock("@/env", () => ({
  env: {
    APP_URL: "https://omni.example.com",
    GOOGLE_CLIENT_ID: "test-google-id",
    GOOGLE_CLIENT_SECRET: "test-google-secret",
    MICROSOFT_CLIENT_ID: "test-microsoft-id",
    MICROSOFT_CLIENT_SECRET: "test-microsoft-secret",
    ENCRYPTION_MASTER_KEY: "xBS3JEr/26nDwBSZTxJM/MqSmcNr6rOQn/OqHu9MD3I=",
  },
}));

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: vi.fn().mockImplementation(() => {
    return Promise.resolve(new Headers());
  }),
  cookies: vi.fn().mockImplementation(() => {
    return Promise.resolve({
      get: (name: string) => {
        if (name === "omni_oauth_csrf") return { value: mockCsrfCookie };
        return null;
      },
      set: vi.fn().mockImplementation((name, value) => {
        if (name === "omni_oauth_csrf") mockCsrfCookie = value;
      }),
      delete: vi.fn().mockImplementation((name) => {
        if (name === "omni_oauth_csrf") mockCsrfCookie = null;
      }),
    });
  }),
}));

// Mock Better Auth
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn().mockImplementation(() => {
        return Promise.resolve(mockSession);
      }),
    },
  },
}));

// Mock project repository
vi.mock("@/core/projects/project.repository", () => ({
  findAccessibleProject: vi.fn(),
  isMember: vi.fn(),
  checkProjectExistsOnly: vi.fn(),
}));

// Mock mailbox repository
vi.mock("./mailbox.repository", () => ({
  findByEmail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

describe("Mailbox Connections Hardening Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = null;
    mockCsrfCookie = null;

    // Reset standard fetch mock
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("token")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            access_token: "test-access-token",
            refresh_token: "test-refresh-token",
            expires_in: 3600,
          }),
        } as unknown as Response);
      }
      if (url.includes("userinfo")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            email: "authenticated-user@gmail.com",
          }),
        } as unknown as Response);
      }
      return Promise.reject(new Error("Unknown fetch"));
    });
  });

  it("returns 401 when unauthenticated user tries to initiate OAuth", async () => {
    mockSession = null; // Logged out
    const req = new Request("https://omni.example.com/api/auth/oauth?provider=google&projectId=proj1");
    const res = await initOAuth(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated user tries to initiate OAuth for a non-existent or unauthorized project", async () => {
    mockSession = { user: { id: "user123" } }; // Logged in
    vi.spyOn(projectRepo, "isMember").mockResolvedValue(false);
    vi.spyOn(projectRepo, "checkProjectExistsOnly").mockResolvedValue(true);
    vi.spyOn(projectRepo, "findAccessibleProject").mockResolvedValue(null); // No project access / not found

    const req = new Request("https://omni.example.com/api/auth/oauth?provider=google&projectId=00000000-0000-0000-0000-000000000000");
    const res = await initOAuth(req);
    expect(res.status).toBe(403);
  });

  it("initiates OAuth redirect and sets CSRF nonce when authenticated user has project access", async () => {
    mockSession = { user: { id: "user123" } };
    const mockProject = { id: "00000000-0000-0000-0000-000000000000", name: "Project One" };
    vi.spyOn(projectRepo, "isMember").mockResolvedValue(true);
    vi.spyOn(projectRepo, "findAccessibleProject").mockResolvedValue(mockProject as unknown as projectRepo.ProjectRow);

    const req = new Request("https://omni.example.com/api/auth/oauth?provider=google&projectId=00000000-0000-0000-0000-000000000000");
    const res = await initOAuth(req);
    
    expect(res.status).toBe(307); // Redirect to Google
    expect(res.headers.get("location")).toContain("accounts.google.com");
    
    // Read cookie directly from NextResponse response cookies
    const cookieHeader = res.headers.get("set-cookie");
    expect(cookieHeader).toContain("omni_oauth_csrf=");
  });

  it("returns 401 when callback runs without an authenticated session", async () => {
    mockSession = null; // Logged out
    mockCsrfCookie = "csrf-nonce-123";
    const state = Buffer.from(JSON.stringify({ projectId: "proj1", nonce: "csrf-nonce-123" })).toString("base64url");

    const req = new Request(`https://omni.example.com/api/auth/callback/google?code=auth_code&state=${state}`);
    const res = await callbackOAuth(req, { params: Promise.resolve({ provider: "google" }) });

    expect(res.status).toBe(401);
    expect(mailboxRepo.create).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns 403 when callback runs for a project that the user does not have access to", async () => {
    mockSession = { user: { id: "user123" } }; // Logged in
    mockCsrfCookie = "csrf-nonce-123";
    const state = Buffer.from(JSON.stringify({ projectId: "00000000-0000-0000-0000-000000000000", nonce: "csrf-nonce-123" })).toString("base64url");

    vi.spyOn(projectRepo, "isMember").mockResolvedValue(false);
    vi.spyOn(projectRepo, "checkProjectExistsOnly").mockResolvedValue(true);
    vi.spyOn(projectRepo, "findAccessibleProject").mockResolvedValue(null); // No project access

    const req = new Request(`https://omni.example.com/api/auth/callback/google?code=auth_code&state=${state}`);
    const res = await callbackOAuth(req, { params: Promise.resolve({ provider: "google" }) });

    expect(res.status).toBe(403);
    expect(mailboxRepo.create).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled(); // Safe check: did not perform OAuth code exchange
  });

  it("completes OAuth connection successfully and creates mailbox when user is authenticated and authorized", async () => {
    mockSession = { user: { id: "user123" } };
    mockCsrfCookie = "csrf-nonce-123";
    const targetProjectUuid = "00000000-0000-0000-0000-000000000000";
    const state = Buffer.from(JSON.stringify({ projectId: targetProjectUuid, nonce: "csrf-nonce-123" })).toString("base64url");

    const mockProject = { id: targetProjectUuid, name: "Project One" };
    vi.spyOn(projectRepo, "isMember").mockResolvedValue(true);
    vi.spyOn(projectRepo, "findAccessibleProject").mockResolvedValue(mockProject as unknown as projectRepo.ProjectRow);
    vi.spyOn(mailboxRepo, "findByEmail").mockResolvedValue(null);
    vi.spyOn(mailboxRepo, "create").mockResolvedValue({} as unknown as mailboxRepo.MailboxRow);

    const req = new Request(`https://omni.example.com/api/auth/callback/google?code=auth_code&state=${state}`);
    const res = await callbackOAuth(req, { params: Promise.resolve({ provider: "google" }) });

    expect(res.status).toBe(307); // Redirect back to cockpit
    expect(res.headers.get("location")).toContain(`/projects/${targetProjectUuid}/mailboxes`);
    expect(mailboxRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      projectId: targetProjectUuid,
      email: "authenticated-user@gmail.com",
    }));
  });
});
