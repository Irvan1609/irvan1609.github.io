// Preserve document order and both notation directions in RPT output.
export function excelRichText(element){
  const runs=[];
  function visit(node,vertAlign){
    if(node.nodeType===3){if(node.textContent)runs.push({text:node.textContent,font:{name:'Calibri',size:11,...(vertAlign?{vertAlign}:{})}});return;}
    const align=node.tagName==='SUP'?'superscript':node.tagName==='SUB'?'subscript':vertAlign;
    for(const child of node.childNodes||[])visit(child,align);
  }
  visit(element);
  return {richText:runs};
}
