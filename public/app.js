const statusEl = document.getElementById("status");
const setupEl = document.getElementById("setup");
const replyEl = document.getElementById("reply");
const emailsEl = document.getElementById("emails");
const form = document.getElementById("command-form");
const input = document.getElementById("command");
const listView = document.getElementById("list-view");
const detailView = document.getElementById("detail-view");
const detailEl = document.getElementById("email-detail");
const loadInboxBtn = document.getElementById("load-inbox");
const backBtn = document.getElementById("back-to-list");

function field(label, value) {
  if (!value) return "";
  return `
    <div class="field">
      <span class="label">${escapeHtml(label)}</span>
      <span class="value">${escapeHtml(value)}</span>
    </div>
  `;
}

function renderEmails(emails = []) {
  showList();
  if (!emails.length) {
    emailsEl.innerHTML = '<p class="status">No emails to show.</p>';
    return;
  }

  emailsEl.innerHTML = emails
    .map(
      (email) => `
        <article class="email-card" data-id="${email.id}">
          ${email.unread ? '<div class="unread">UNREAD</div>' : ""}
          ${field("Subject", email.subject)}
          ${field("From", email.from)}
          ${field("To", email.to)}
          ${field("Cc", email.cc)}
          ${field("Date", email.date)}
          ${field("Snippet", email.snippet)}
          <button type="button" class="view-full" data-id="${email.id}">View full email</button>
        </article>
      `
    )
    .join("");
}

function showList() {
  listView.hidden = false;
  detailView.hidden = true;
}

function showDetail() {
  listView.hidden = true;
  detailView.hidden = false;
}

function renderDetail(email) {
  const bodyHtml = email.html
    ? `<iframe class="email-frame" sandbox srcdoc="${escapeAttribute(email.html)}" title="Email body"></iframe>`
    : `<pre class="body">${escapeHtml(email.body || email.snippet || "")}</pre>`;

  detailEl.innerHTML = `
    ${email.unread ? '<div class="unread">UNREAD</div>' : ""}
    ${field("Subject", email.subject)}
    ${field("From", email.from)}
    ${field("To", email.to)}
    ${field("Cc", email.cc)}
    ${field("Date", email.date)}
    ${field("Labels", (email.labels || []).join(", "))}
    <div class="field">
      <span class="label">Body</span>
    </div>
    ${bodyHtml}
  `;
  showDetail();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function loadStatus() {
  const res = await fetch("/api/status");
  const data = await res.json();
  if (data.connected) {
    statusEl.textContent = `Connected as ${data.profile.emailAddress}`;
    setupEl.textContent = "";
    document.getElementById("drive-status").textContent = data.driveConnected ? "Drive connected" : "Reconnect Google above to grant Drive access.";
    if (data.driveConnected) await loadDrive();
    await loadInbox();
  } else {
    statusEl.textContent = "Google is not connected. Click Connect / reconnect Google.";
    if (data.redirectUri) {
      setupEl.textContent = `If Google shows redirect_uri_mismatch, add this exact URI to the OAuth client: ${data.redirectUri}`;
    }
  }
}

async function loadInbox() {
  replyEl.textContent = "Loading inbox…";
  const res = await fetch("/api/emails?max=15");
  const data = await res.json();
  if (!res.ok) {
    replyEl.textContent = data.error || "Could not load emails.";
    emailsEl.innerHTML = "";
    return;
  }
  replyEl.textContent = `${data.emails.length} email${data.emails.length === 1 ? "" : "s"} in inbox.`;
  renderEmails(data.emails);
}

async function openEmail(id) {
  replyEl.textContent = "Opening email…";
  const res = await fetch(`/api/emails/${encodeURIComponent(id)}`);
  const data = await res.json();
  if (!res.ok) {
    replyEl.textContent = data.error || "Could not open that email.";
    return;
  }
  replyEl.textContent = data.email.subject;
  renderDetail(data.email);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  replyEl.textContent = "Working…";
  const res = await fetch("/api/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  if (!res.ok) {
    replyEl.textContent = data.error || "Something went wrong.";
    emailsEl.innerHTML = "";
    return;
  }
  replyEl.textContent = data.reply;
  if (data.drive) { driveState = { search: text.replace(/^(?:list |show |search )?(?:my )?drive(?: files)?\s*/i, "") }; renderDrive(data.drive); }
  else renderEmails(data.emails || []);
});

emailsEl.addEventListener("click", (event) => {
  const target = event.target.closest("[data-id]");
  if (!target) return;
  openEmail(target.dataset.id);
});

loadInboxBtn.addEventListener("click", loadInbox);
backBtn.addEventListener("click", () => {
  showList();
  replyEl.textContent = "Inbox";
});


let driveState = { parent: 'root' };
let driveNext;
const driveFiles = document.getElementById('drive-files');
const driveStatus = document.getElementById('drive-status');
async function driveRequest(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Drive request failed.');
  return data;
}
async function driveAction(action) {
  try { await action(); }
  catch (error) { driveStatus.textContent = error.message; }
}
function renderDrive(data, append = false) {
  if (!append) driveFiles.replaceChildren();
  for (const file of data.files || []) {
    const card = document.createElement('article');
    card.className = 'email-card';
    card.innerHTML = `${field('Name', file.name)}${field('Type', file.mimeType)}${field('Modified', file.modifiedTime)}${field('ID', file.id)}`;
    const actions = document.createElement('div');
    actions.className = 'toolbar';
    function button(label, action) {
      const button = document.createElement('button');
      button.className = 'secondary';
      button.textContent = label;
      button.onclick = () => driveAction(async () => {
        button.disabled = true;
        try { await action(); } finally { button.disabled = false; }
      });
      actions.append(button);
    }
    if (file.mimeType === 'application/vnd.google-apps.folder' && !file.trashed) {
      button('Browse folder', async () => {
        driveState = { parent: file.id };
        document.getElementById('drive-location').textContent = file.name;
        await loadDrive();
      });
    }
    if (file.webViewLink) {
      const url = new URL(file.webViewLink);
      if (url.protocol === 'https:') {
        const link = document.createElement('a');
        link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.textContent = 'Open in Google'; link.className = 'secondary'; actions.append(link);
      }
    }
    async function update(changes) {
      await driveRequest(`/api/drive/files/${encodeURIComponent(file.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes)
      });
      await loadDrive();
    }
    if (!file.trashed) {
      button('Rename', async () => {
        const name = prompt('New name', file.name);
        if (name?.trim() && name !== file.name) await update({ name });
      });
      button('Move', async () => {
        const parent = prompt('Destination folder ID (or root for My Drive)');
        if (parent?.trim()) await update({ parent: parent.trim() });
      });
    }
    button(file.trashed ? 'Restore' : 'Move to trash', async () => {
      if (file.trashed || confirm(`Move "${file.name}" to trash?`)) await update({ trashed: !file.trashed });
    });
    card.append(actions); driveFiles.append(card);
  }
  driveNext = data.nextPageToken;
  document.getElementById('drive-more').hidden = !driveNext;
  driveStatus.textContent = driveFiles.children.length ? 'Drive connected' : 'No matching files.';
}
async function loadDrive(append = false) {
  driveStatus.textContent = 'Loading Drive…';
  const query = new URLSearchParams(driveState);
  if (append && driveNext) query.set('pageToken', driveNext);
  renderDrive(await driveRequest(`/api/drive/files?${query}`), append);
}
document.getElementById('drive-search-form').onsubmit = (event) => {
  event.preventDefault();
  driveState = { search: document.getElementById('drive-search').value.trim() };
  document.getElementById('drive-location').textContent = 'Search across Drive';
  driveAction(() => loadDrive());
};
document.getElementById('drive-home').onclick = () => {
  driveState = { parent: 'root' };
  document.getElementById('drive-location').textContent = 'My Drive';
  driveAction(() => loadDrive());
};
document.getElementById('drive-trash').onclick = () => {
  driveState = { trash: true };
  document.getElementById('drive-location').textContent = 'Trash';
  driveAction(() => loadDrive());
};
document.getElementById('drive-more').onclick = (event) => driveAction(async () => {
  event.target.disabled = true;
  try { await loadDrive(true); } finally { event.target.disabled = false; }
});
async function createDriveFile(body) {
  await driveRequest('/api/drive/files', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, parent: driveState.parent || 'root' })
  });
  driveState = { parent: driveState.parent || 'root' };
  if (driveState.parent === 'root') document.getElementById('drive-location').textContent = 'My Drive';
  await loadDrive();
}
document.getElementById('drive-folder').onclick = () => driveAction(async () => {
  const name = prompt('Folder name (created in the current folder, or My Drive when searching)');
  if (name?.trim()) await createDriveFile({ name, folder: true });
});
document.getElementById('drive-upload').onchange = (event) => driveAction(async () => {
  const input = event.target;
  const file = input.files[0];
  if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('Uploads are limited to 10 MB.');
    input.disabled = true;
    driveStatus.textContent = 'Uploading…';
    const content = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = () => reject(new Error('Could not read the file.'));
      reader.readAsDataURL(file);
    });
    await createDriveFile({ name: file.name, content, mimeType: file.type || 'application/octet-stream' });
  } finally { input.value = ''; input.disabled = false; }
});
loadStatus().catch((error) => { statusEl.textContent = error.message; });
