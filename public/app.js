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
    await loadInbox();
  } else {
    statusEl.textContent = "Gmail is not connected. Click Connect Gmail.";
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
  renderEmails(data.emails || []);
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

loadStatus();
