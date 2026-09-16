export function datasetExcelFilename(name){
  const base=String(name||'hasil-analisis').trim().replace(/\.(xlsx?|csv|tsv|txt)$/i,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/g,'').slice(0,180).trim();
  return (base||'hasil-analisis')+'.xlsx';
}
