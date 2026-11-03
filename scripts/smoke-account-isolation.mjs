import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const base=(process.env.CHILI_API_URL||'').replace(/\/$/,'');
const tokenA=process.env.AUTHZ_TEST_USER_A_TOKEN||'';
const tokenB=process.env.AUTHZ_TEST_USER_B_TOKEN||'';

if(!base||!tokenA||!tokenB){
  console.log('Account isolation smoke test skipped: CHILI_API_URL/AUTHZ_TEST_USER_A_TOKEN/AUTHZ_TEST_USER_B_TOKEN not all configured.');
  process.exit(0);
}

async function api(path,token,{method='GET',body}={}){
  const headers={Authorization:'Bearer '+token};
  if(body!==undefined)headers['Content-Type']='application/json';
  const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  let data={};
  try{data=await response.json();}catch{}
  return {response,data};
}
function expectStatus(actual,expected,label){
  assert.equal(actual,expected,label+' expected HTTP '+expected+', got '+actual);
}

const id=randomUUID();
const name='authz-isolation-'+Date.now();
const original='Perlakuan,Ulangan,Y\nA,1,1\n';
let revision=null;

try{
  let r=await api('/v1/datasets/'+id,tokenA,{method:'PUT',body:{name,content:original,meta:{securityTest:true},expectedRevision:null}});
  assert.ok(r.response.ok,'User A could not create isolation-test dataset: HTTP '+r.response.status);
  revision=Number(r.data?.item?.revision);
  assert.ok(Number.isFinite(revision),'Created dataset has no revision');

  r=await api('/v1/datasets/'+id,tokenB);
  expectStatus(r.response.status,404,'User B GET');

  r=await api('/v1/datasets/'+id,tokenB,{method:'PATCH',body:{expectedRevision:revision,operationId:randomUUID(),operations:[]}});
  expectStatus(r.response.status,404,'User B PATCH');

  r=await api('/v1/datasets/'+id,tokenB,{method:'DELETE',body:{expectedRevision:revision}});
  expectStatus(r.response.status,404,'User B DELETE');

  r=await api('/v1/datasets/'+id,tokenB,{method:'PUT',body:{name:name+'-b',content:'x,y\n1,999\n',meta:{securityTest:true},expectedRevision:null}});
  assert.ok(!r.response.ok,'User B PUT unexpectedly modified/overwrote User A dataset');

  r=await api('/v1/datasets/'+id,tokenA);
  assert.ok(r.response.ok,'User A can no longer read its dataset after cross-account probes');
  assert.equal(r.data?.item?.content,original,'Cross-account mutation changed User A content');
  revision=Number(r.data?.item?.revision);

  console.log('Account isolation smoke test OK: account B could not GET/PATCH/DELETE/overwrite account A dataset.');
}finally{
  if(Number.isFinite(revision)){
    await api('/v1/datasets/'+id,tokenA,{method:'DELETE',body:{expectedRevision:revision}}).catch(()=>{});
  }
}
