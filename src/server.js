import "dotenv/config";
import express from "express";
import path from "node:path";
import {
  createOAuthClient,
  exchangeCode,
  getAuthUrl,
  getEmail,
  getProfile,
  isConnected,
  listEmails,
  parseEmailIntent,
} from "./gmail.js";

import { drive, driveConnected } from "./drive.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Browser mutations must originate from this local app.
app.use((req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers.origin &&
      req.headers.origin !== `${req.protocol}://${req.get("host")}`) {
    return res.status(403).json({ error: "Cross-origin requests are not allowed." });
  }
  next();
});
app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.resolve("public")));

app.get("/api/status", async (_req, res) => {
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  try {
    const connected = await isConnected();
    if (!connected) {
      return res.json({ connected: false, redirectUri });
    }
    const profile = await getProfile();
    res.json({ connected: true, driveConnected: await driveConnected(), profile, redirectUri });
  } catch (error) {
    res.status(500).json({ connected: false, error: error.message, redirectUri });
  }
});

app.get("/auth/google", (_req, res) => {
  try {
    const url = getAuthUrl(createOAuthClient());
    res.redirect(url);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get("/auth/google/callback", async (req, res) => {
  try {
    const { code, error } = req.query;
    if (error) {
      return res.status(400).send(`Google auth failed: ${error}`);
    }
    if (!code) {
      return res.status(400).send("Missing authorization code.");
    }
    await exchangeCode(String(code));
    res.redirect("/");
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get("/api/emails", async (req, res) => {
  try {
    const maxResults = Math.min(Number(req.query.max) || 10, 25);
    const query = String(req.query.q || "in:inbox");
    const emails = await listEmails({ maxResults, query });
    res.json({ emails });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.get("/api/emails/:id", async (req, res) => {
  try {
    const email = await getEmail(req.params.id);
    res.json({ email });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

const driveRoute = (handler) => async (req, res) => {
  try { await handler(req, res); }
  catch (error) {
    const status = Number(error.status || error.response?.status || error.code);
    res.status(status >= 400 && status < 600 ? status : 500).json({ error: error.message });
  }
};
app.get("/api/drive/files", driveRoute(async (req, res) => {
  res.json(await drive.list({ search: String(req.query.search || ""), parent: req.query.parent ? String(req.query.parent) : undefined,
    trash: req.query.trash === "true", pageToken: String(req.query.pageToken || "") }));
}));
app.post("/api/drive/files", driveRoute(async (req, res) => {
  res.status(201).json({ file: await drive.create(req.body || {}) });
}));
app.patch("/api/drive/files/:id", driveRoute(async (req, res) => {
  res.json({ file: await drive.update(req.params.id, req.body || {}) });
}));

app.post("/api/command", async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    if (/^(?:list |show |search )?(?:my )?drive(?: files)?(?:\s|$)/i.test(text)) {
      const search = text.replace(/^(?:list |show |search )?(?:my )?drive(?: files)?\s*/i, "");
      const result = await drive.list({ search });
      return res.json({ reply: "Drive files", drive: result });
    }
    const intent = parseEmailIntent(text);

    if (!intent) {
      return res.json({
        reply:
          'I can manage Drive in the Drive panel. Try "drive files" or "search drive budget". For Gmail, try "read my emails", "unread mail", "latest email", or "emails from someone@gmail.com".',
      });
    }

    if (intent.action === "latest") {
      const emails = await listEmails({ maxResults: 1, query: "in:inbox" });
      if (!emails.length) {
        return res.json({ reply: "Your inbox is empty.", emails: [] });
      }
      const email = await getEmail(emails[0].id);
      return res.json({
        reply: `Latest email from ${email.from}: ${email.subject}`,
        emails: [email],
      });
    }

    const emails = await listEmails({
      maxResults: intent.maxResults,
      query: intent.query,
    });

    if (!emails.length) {
      return res.json({ reply: "No matching emails found.", emails: [] });
    }

    res.json({
      reply: `I found ${emails.length} email${emails.length === 1 ? "" : "s"}.`,
      emails,
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Jarvis running at http://localhost:${PORT}`);
});
