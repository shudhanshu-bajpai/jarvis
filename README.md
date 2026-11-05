# Jarvis — Gmail and Google Drive

Jarvis reads Gmail (`gmail.readonly`) and manages existing Google Drive files and folders (`drive`) through the official Google APIs.

## 1. Google Cloud setup

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project (or pick an existing one).
3. Enable **Gmail API** and **Google Drive API**.
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

Open http://localhost:3000, click **Connect / reconnect Google**, and approve Gmail read access and Drive access. Existing Gmail users must reconnect once: enabling Drive API does not add permissions to the saved token.

Then ask:

- `read my emails`
- `unread mail`
- `latest email`
- `emails from someone@gmail.com`

## Google Drive

Use the Drive panel to browse My Drive and folders, search file names across Drive, and load additional pages. You can create folders, upload files up to 10 MB, rename files/folders, move them by destination folder ID (`root` means My Drive), move them to trash, and restore them from Trash. **Open in Google** opens the original file for viewing or editing.

Uploads and new folders go into the currently browsed folder; from search or Trash they go into My Drive. File operations follow your Google account permissions. Permanent deletion and sharing management are not exposed.

Commands: `drive files`, `show my drive`, or `search drive budget`. Gmail commands continue to work.

The full `https://www.googleapis.com/auth/drive` scope is required to manage your existing files. Google may require adding this scope to the OAuth consent screen's Data Access configuration. Keep your account listed as a test user while the OAuth app is in testing.

API routes:
- `GET /api/drive/files?search=budget&parent=FOLDER_ID&trash=false&pageToken=...`
- `POST /api/drive/files` with `{ "name": "Projects", "folder": true, "parent": "root" }`, or `{ "name": "file.txt", "content": "BASE64", "mimeType": "text/plain", "parent": "root" }`
- `PATCH /api/drive/files/:id` with `name`, `parent`, or boolean `trashed`.

Run `npm test` for isolated Drive service tests (no live files are changed). API reference: [Google Drive file updates](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update).
