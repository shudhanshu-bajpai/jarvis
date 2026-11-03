# Jarvis — Gmail

Jarvis can read your Gmail inbox through the official Gmail API (`gmail.readonly`).

## 1. Google Cloud setup

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project (or pick an existing one).
3. Enable **Gmail API**.
4. Configure the OAuth consent screen (External is fine for your own account).
5. Add yourself as a test user.
6. Create OAuth credentials: **Web application**.
7. Add authorized redirect URI: `http://localhost:3000/auth/google/callback`.
8. Copy the client ID and client secret.

## 2. Run locally

```bash
cd jarvis
cp .env.example .env
```

Fill in `.env`:

```
PORT=3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

```bash
npm install
npm start
```

Open http://localhost:3000, click **Connect Gmail**, and approve read access.

Then ask:

- `read my emails`
- `unread mail`
- `latest email`
- `emails from someone@gmail.com`
