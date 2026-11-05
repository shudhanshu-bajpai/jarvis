import { google } from 'googleapis';
import { Readable } from 'node:stream';
import { loadSavedClient } from './gmail.js';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const fields = 'id,name,mimeType,size,modifiedTime,webViewLink,parents,trashed';
const folderType = 'application/vnd.google-apps.folder';
function bad(message) { return Object.assign(new Error(message), { status: 400 }); }
export function required(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw bad(`${label} is required.`);
  return value.trim();
}
export function escapeQuery(value) { return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'"); }
export function buildQuery({ search = '', parent, trash = false } = {}) {
  const parts = [`trashed = ${trash ? 'true' : 'false'}`];
  if (search) parts.push(`name contains '${escapeQuery(search)}'`);
  if (parent) parts.push(`'${escapeQuery(parent)}' in parents`);
  return parts.join(' and ');
}
export async function driveConnected() {
  const auth = await loadSavedClient();
  return Boolean(auth?.credentials.scope?.split(' ').includes(DRIVE_SCOPE));
}
async function client() {
  const auth = await loadSavedClient();
  if (!auth || !auth.credentials.scope?.split(' ').includes(DRIVE_SCOPE)) {
    throw Object.assign(new Error('Reconnect Google to grant Drive access.'), { status: 401 });
  }
  return google.drive({ version: 'v3', auth });
}
export function driveService(getClient = client) {
  return {
    async list(options = {}) {
      const drive = await getClient();
      return (await drive.files.list({ q: buildQuery(options), pageSize: 50,
        pageToken: options.pageToken || undefined, fields: `nextPageToken,files(${fields})`,
        orderBy: 'folder,modifiedTime desc', supportsAllDrives: true, includeItemsFromAllDrives: true })).data;
    },
    async create({ name, parent = 'root', folder = false, content, mimeType = 'application/octet-stream' }) {
      name = required(name, 'Name');
      if (typeof folder !== 'boolean') throw bad('folder must be a boolean.');
      if (!folder && (typeof content !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content))) throw bad('Valid base64 file content is required.');
      const drive = await getClient();
      return (await drive.files.create({ supportsAllDrives: true, fields,
        requestBody: { name, parents: [required(parent, 'Parent')], ...(folder ? { mimeType: folderType } : {}) },
        ...(!folder ? { media: { mimeType, body: Readable.from(Buffer.from(content, 'base64')) } } : {}) })).data;
    },
    async update(id, changes) {
      const requestBody = {};
      if ('name' in changes) requestBody.name = required(changes.name, 'Name');
      if ('trashed' in changes) {
        if (typeof changes.trashed !== 'boolean') throw bad('trashed must be a boolean.');
        requestBody.trashed = changes.trashed;
      }
      if (!Object.keys(requestBody).length && !changes.parent) throw bad('Provide name, parent, or trashed.');
      const parent = 'parent' in changes ? required(changes.parent, 'Parent') : undefined;
      const drive = await getClient();
      let move = {};
      if (parent) {
        const current = await drive.files.get({ fileId: id, fields: 'parents', supportsAllDrives: true });
        if (!(current.data.parents || []).includes(parent)) move = { addParents: parent, removeParents: (current.data.parents || []).join(',') || undefined };
      }
      return (await drive.files.update({ fileId: id, requestBody, ...move, fields, supportsAllDrives: true })).data;
    }
  };
}
export const drive = driveService();
