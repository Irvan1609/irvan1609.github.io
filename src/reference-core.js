const DOI_RE=/^10\.\d{4,9}\/\S+$/i;

export function normalizeDoi(value){
  let doi=String(value??'').trim();
  doi=doi.replace(/^doi\s*:\s*/i,'').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'');
  doi=doi.trim().replace(/\s+/g,'');
  doi=doi.replace(/[.,;]+$/,'');
  while(doi.endsWith(')')&&(doi.match(/\(/g)||[]).length<(doi.match(/\)/g)||[]).length)doi=doi.slice(0,-1);
  return DOI_RE.test(doi)?doi.toLowerCase():'';
}

export function extractDoi(value){
  const direct=normalizeDoi(value);
  if(direct)return direct;
  const text=String(value??'');
  const match=text.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  return match?normalizeDoi(match[0]):'';
}

function first(value){return Array.isArray(value)?String(value[0]??''):String(value??'');}
function yearOf(message){
  const candidates=[
    message?.published?.['date-parts'],
    message?.['published-print']?.['date-parts'],
    message?.['published-online']?.['date-parts'],
    message?.issued?.['date-parts']
  ];
  for(const parts of candidates){
    const y=Number(parts?.[0]?.[0]);
    if(Number.isInteger(y)&&y>0)return y;
  }
  return null;
}
function cleanText(value){return String(value??'').replace(/\s+/g,' ').trim();}
function authorFromCrossref(author){
  return {given:cleanText(author?.given),family:cleanText(author?.family),literal:cleanText(author?.name)};
}

export function referenceFromCrossref(message){
  if(!message||typeof message!=='object')throw Error('Metadata Crossref tidak valid.');
  const title=cleanText(first(message.title));
  if(!title)throw Error('Judul referensi tidak tersedia.');
  const doi=normalizeDoi(message.DOI||'');
  const authors=Array.isArray(message.author)?message.author.map(authorFromCrossref).filter(a=>a.family||a.given||a.literal):[];
  return {
    doi,
    title,
    authors,
    year:yearOf(message),
    journal:cleanText(first(message['container-title'])),
    volume:cleanText(message.volume),
    issue:cleanText(message.issue),
    pages:cleanText(message.page),
    publisher:cleanText(message.publisher),
    type:cleanText(message.type)||'journal-article',
    url:doi?'https://doi.org/'+doi:cleanText(message.URL),
    issn:Array.isArray(message.ISSN)?message.ISSN.map(cleanText).filter(Boolean):[],
    createdAt:new Date().toISOString()
  };
}

export function referenceKey(reference){
  const doi=normalizeDoi(reference?.doi);
  if(doi)return 'doi:'+doi;
  const title=cleanText(reference?.title).toLocaleLowerCase('id-ID').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const year=Number(reference?.year)||'';
  return 'meta:'+title+'|'+year;
}

export function mergeUniqueReferences(existing,incoming){
  const map=new Map((existing||[]).map(item=>[referenceKey(item),item]));
  const added=[],duplicates=[];
  for(const item of incoming||[]){
    const key=referenceKey(item);
    if(map.has(key)){duplicates.push(item);continue;}
    map.set(key,item);added.push(item);
  }
  return {references:[...map.values()],added,duplicates};
}

function authorDisplay(author){
  if(author?.literal)return author.literal;
  return [author?.family,author?.given].filter(Boolean).join(', ');
}
function initials(given){
  return cleanText(given).split(/[\s-]+/).filter(Boolean).map(part=>(part[0]?.toUpperCase()||'')+'.').join(' ');
}
function apaAuthor(author){
  if(author?.literal)return author.literal;
  return [author?.family,initials(author?.given)].filter(Boolean).join(', ');
}
function harvardAuthor(author){
  if(author?.literal)return author.literal;
  const initial=cleanText(author?.given).split(/\s+/).filter(Boolean).map(x=>(x[0]?.toUpperCase()||'')+'.').join('');
  return [author?.family,initial].filter(Boolean).join(', ');
}
function joinAuthors(authors,formatter){
  const list=(authors||[]).map(formatter).filter(Boolean);
  if(list.length<=1)return list[0]||'Tanpa nama';
  if(list.length===2)return list.join(' & ');
  return list.slice(0,-1).join(', ')+', & '+list.at(-1);
}

export function formatApa(reference){
  const authors=joinAuthors(reference.authors,apaAuthor);
  const year=reference.year||'n.d.';
  const journal=reference.journal?' '+reference.journal+(reference.volume?', '+reference.volume:'')+(reference.issue?'('+reference.issue+')':'')+(reference.pages?', '+reference.pages:'')+'.':'';
  const doi=normalizeDoi(reference.doi);
  return (authors+' ('+year+.'). '+reference.title+'.'+journal+(doi?' https://doi.org/'+doi:'')).replace(/\s+/g,' ').trim();
}

export function formatHarvard(reference){
  const authors=joinAuthors(reference.authors,harvardAuthor);
  const year=reference.year||'n.d.';
  const journal=reference.journal?' '+reference.journal++reference.volume?', '+reference.volume:'')+(reference.issue?'('+reference.issue+')':'')+(reference.pages?', pp. '+reference.pages:'')+'.':'';
  const doi=normalizeDoi(reference.doi);
  return (authors+' ('+year+') "'+reference.title+"'. "+journal+(doi?' doi: '+doi+'.':'')).replace(/\s+/g,' ').trim();
}

function risType(type){
  if(/book/i.test(type))return 'BOOK';
  if(/proceedings|conference/i.test(type))return 'CPAPER';
  if(/thesis|dissertation/i.test(type))return 'THES';
  return 'JOUR';
}
function risLine(tag,value){
  const text=cleanText(value);
  return text?tag+'  - '+text+'\n':'';
}

export function toRis(references){
  return (references||[]).map(ref=>{
    const doi=normalizeDoi(ref.doi);
    let out='TY  - '+risType(ref.type)+'\n';
    for(const author of ref.authors||[])out+=risLine('AU',authorDisplay(author));
    out+=risLine('TI',ref.title);
    out+=risLine('JO',ref.journal);
    out+=risLine('PY',ref.year);
    out+=risLine('VL',ref.volume);
    out+=risLine('IS',ref.issue);
    if(ref.pages){
      const [start,end]=String(ref.pages).split(/[-–—]/,2);
      out+=risLine('SP',start);
      if(end)out+=risLine('EP',end);
    }
    out+=risLine('PB',ref.publisher);
    for(const issn of ref.issn||[])out+=risLine('SN',issn);
    out+=risLine('DO',doi);
    out+=risLine('UR',doi?'https://doi.org/'+doi:ref.url);
    return out+'ER  - \n';
  }).join('\n');
}

function bibEscape(value){
  return cleanText(value).replace(/([&#_%])/g,'\\$1').replace(/[{}]/g,'');
}
function citeKey(reference,index){
  const family=(reference.authors?.[0]?.family||reference.authors?.[0]?.literal||'ref').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]/g,'');
  const year=reference.year||'nd';
  const word=String(reference.title||'reference').normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/[A-Za-z0-9]+/)?.[0]||'reference';
  return (family||'ref')+year+word+(reference.index?reference.index+1:'');
}
function bibType(type){
  if(/book/i.test(type))return 'book';
  if(/proceedings|conference/i.test(type))return 'inproceedings';
  if(/thesis|dissertation/i.test(type))return 'phdthesis';
  return 'article';
}

export function toBibtex(references){
  const used=new Set();
  return (references||[]).map((ref,index)=>{
    let key=citeKey(ref,index),n=2;
    while(used.has(key.toLowerCase()))key=citeKey(ref,index)+n++;
    used.add(key.toLowerCase());
    const authors=(ref.authors||[]).map(a=>a.literal?bibEscape(a.literal):[bibEscape(a.family),bibEscape(a.given)].filter(Boolean).join(', ')).join(' and ');
    const fields=[
      ['title',ref.title],['author',authors],['year',ref.year],['journal',ref.journal],['volume',ref.volume],
      ['number',ref.issue],['pages',ref.pages],['publisher',ref.publisher],['doi',normalizeDoi(ref.doi)],
      ['url',normalizeDoi(ref.doi)?'https://doi.org/'+normalizeDoi(ref.doi):ref.url]
    ].filter(([,value])=>value!==null&&value!==undefined&&String(value).trim()!=='');
    return '@'+bibType(ref.type)+'{'+key+',\n'+fields.map(([name,value])=>'  '+name+' = {'+bibEscape(value)+'}').join(',\n')+'\n}';
  }).join('\n\n');
}
