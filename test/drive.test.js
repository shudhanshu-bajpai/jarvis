import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuery, driveService } from '../src/drive.js';

test('search escapes query operators and handles folder/trash filters', () => {
  assert.equal(buildQuery({search: "O'Brien\\notes", parent:'root'}), "trashed = false and name contains 'O\\'Brien\\\\notes' and 'root' in parents");
  assert.equal(buildQuery({trash:true}), 'trashed = true');
});
test('pagination and shared-drive options reach Google', async () => {
  let params;
  const service = driveService(async () => ({files:{list:async p => { params=p; return {data:{files:[],nextPageToken:'next'}}; }}}));
  assert.equal((await service.list({pageToken:'current'})).nextPageToken, 'next');
  assert.equal(params.pageToken,'current');
  assert.equal(params.includeItemsFromAllDrives,true);
});
test('move removes old parents; trash and restore use reversible updates', async () => {
  const calls=[];
  const service=driveService(async()=>({files:{ get:async()=>({data:{parents:['old']}}), update:async p=>{calls.push(p);return {data:{id:'file'}};} }}));
  await service.update('file',{parent:'new'});
  assert.equal(calls[0].addParents,'new'); assert.equal(calls[0].removeParents,'old');
  await service.update('file',{trashed:true});
  await service.update('file',{trashed:false});
  assert.deepEqual(calls.slice(1).map(c=>c.requestBody),[{trashed:true},{trashed:false}]);
});
test('upload preserves binary bytes and folder creation omits media', async () => {
  const calls=[];
  const service=driveService(async()=>({files:{create:async p=>{calls.push(p);return {data:{id:'created'}};}}}));
  await service.create({name:'Folder',folder:true});
  assert.equal(calls[0].media,undefined);
  assert.equal(calls[0].requestBody.mimeType,'application/vnd.google-apps.folder');
  const bytes=Buffer.from([0,255,128,1]);
  await service.create({name:'binary.dat',content:bytes.toString('base64')});
  const chunks=[]; for await(const chunk of calls[1].media.body) chunks.push(chunk);
  assert.deepEqual(Buffer.concat(chunks),bytes);
});
test('reject invalid changes and uploads before requesting Google', async()=>{
  const service=driveService(async()=>{throw new Error('Should not call Google');});
  for(const changes of [{name:''},{trashed:'true'},{parent:42},{}]) await assert.rejects(service.update('file',changes),{status:400});
  await assert.rejects(service.create({name:'x',content:'!invalid'}),{status:400});
});
