import { google } from "googleapis";
import fs from "node:fs/promises";
import path from "node:path";

const TOKEN_PATH = path.resolve("token.json");
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

export function createOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing Google OAuth env vars. Copy .env.example to .env and set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI."
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(oauth2Client) {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function saveTokens(tokens) {
  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2), "utf8");
}

export async function loadSavedClient() {
  const oauth2Client = createOAuthClient();
  try {
    const raw = await fs.readFile(TOKEN_PATH, "utf8");
    oauth2Client.setCredentials(JSON.parse(raw));
    oauth2Client.on("tokens", async (tokens) => {
      const current = JSON.parse(await fs.readFile(TOKEN_PATH, "utf8"));
      await saveTokens({ ...current, ...tokens });
    });
    return oauth2Client;
  } catch {
    return null;
  }
}

export async function exchangeCode(code) {
  const oauth2Client = createOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  await saveTokens(tokens);
  return oauth2Client;
}

export async function isConnected() {
  const client = await loadSavedClient();
  return Boolean(client);
}

function decodeBase64Url(data = "") {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf8");
}

function collectParts(payload, collected = { text: "", html: "" }) {
  if (!payload) return collected;

  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if (payload.mimeType === "text/plain") collected.text += decoded;
    if (payload.mimeType === "text/html") collected.html += decoded;
  }

  for (const part of payload.parts || []) {
    collectParts(part, collected);
  }

  return collected;
}

function header(headers, name) {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function toEmailSummary(message) {
  const headers = message.payload?.headers || [];
  const labels = (message.labelIds || []).filter((label) => !label.startsWith("CATEGORY_"));
  return {
    id: message.id,
    threadId: message.threadId,
    snippet: message.snippet || "",
    from: header(headers, "From"),
    to: header(headers, "To"),
    cc: header(headers, "Cc"),
    subject: header(headers, "Subject") || "(no subject)",
    date: header(headers, "Date"),
    unread: Boolean(message.labelIds?.includes("UNREAD")),
    labels,
  };
}

async function gmailClient() {
  const auth = await loadSavedClient();
  if (!auth) {
    const error = new Error("Gmail is not connected. Visit /auth/google first.");
    error.status = 401;
    throw error;
  }
  return google.gmail({ version: "v1", auth });
}

export async function listEmails({ maxResults = 10, query = "in:inbox" } = {}) {
  const gmail = await gmailClient();
  const listed = await gmail.users.messages.list({
    userId: "me",
    maxResults,
    q: query,
  });

  const messages = listed.data.messages || [];
  const detailed = await Promise.all(
    messages.map(async (msg) => {
      const full = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "metadata",
        metadataHeaders: ["From", "To", "Cc", "Subject", "Date"],
      });
      return toEmailSummary(full.data);
    })
  );

  return detailed;
}

export async function getEmail(id) {
  const gmail = await gmailClient();
  const full = await gmail.users.messages.get({
    userId: "me",
    id,
    format: "full",
  });

  const summary = toEmailSummary(full.data);
  const bodies = collectParts(full.data.payload);
  const textBody = bodies.text.trim() || bodies.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  return {
    ...summary,
    body: textBody,
    html: bodies.html.trim(),
  };
}

export async function getProfile() {
  const gmail = await gmailClient();
  const profile = await gmail.users.getProfile({ userId: "me" });
  return {
    emailAddress: profile.data.emailAddress,
    messagesTotal: profile.data.messagesTotal,
    threadsTotal: profile.data.threadsTotal,
  };
}

export function parseEmailIntent(text) {
  const input = (text || "").toLowerCase().trim();
  if (!input) return null;

  const wantsEmail =
    /\b(email|emails|inbox|mail|gmail|messages)\b/.test(input) ||
    /\bread my (mail|email)/.test(input);

  if (!wantsEmail) return null;

  if (/\bunread|new mail|new email/.test(input)) {
    return { action: "list", query: "in:inbox is:unread", maxResults: 10 };
  }

  if (/\blatest|recent|last/.test(input) && /\bone|email|mail|message/.test(input)) {
    return { action: "latest" };
  }

  const fromMatch = input.match(/\bfrom\s+([a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}|[a-z0-9._\-]+)/i);
  if (fromMatch) {
    return { action: "list", query: `in:inbox from:${fromMatch[1]}`, maxResults: 10 };
  }

  return { action: "list", query: "in:inbox", maxResults: 10 };
}
