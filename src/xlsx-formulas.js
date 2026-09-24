function positiveInteger(value,name){
  if(!Number.isInteger(value)||value<1)throw new Error(`${name} harus bilangan bulat positif.`);
  return value;
}

export function excelColumn(index){
  positiveInteger(index,'Indeks kolom');
  let n=index,label='';
  while(n>0){
    n-=1;
    label=String.fromCharCode(65+(n%26))+label;
    n=Math.floor(n/26);
  }
  return label;
}

export function excelRef(row,col,absolute=true){
  positiveInteger(row,'Nomor baris');
  positiveInteger(col,'Nomor kolom');
  const column=excelColumn(col);
  return absolute?`$${column}$${row}`:`${column}${row}`;
}

export function excelRange(row1,col1,row2,col2,absolute=true){
  return `${excelRef(row1,col1,absolute)}:${excelRef(row2,col2,absolute)}`;
}

export function observationFormulaPlan(context){
  const {dataStartRow,dataEndRow,repStartCol,repEndCol,totalCol,meanCol,footerRow}=context;
  [dataStartRow,dataEndRow,repStartCol,repEndCol,totalCol,meanCol,footerRow].forEach((value,index)=>positiveInteger(value,`Konteks ${index+1}`));
  if(dataEndRow<dataStartRow||repEndCol<repStartCol)throw new Error('Rentang data observasi tidak valid.');
  const cells=[];
  for(let row=dataStartRow;row<=dataEndRow;row++){
    cells.push({row,col:totalCol,formula:`SUM(${excelRange(row,repStartCol,row,repEndCol,false)})`});
    cells.push({row,col:meanCol,formula:`AVERAGE(${excelRange(row,repStartCol,row,repEndCol,false)})`});
  }
  for(let col=repStartCol;col<=repEndCol;col++){
    cells.push({row:footerRow,col,formula:`SUM(${excelRange(dataStartRow,col,dataEndRow,col,false)})`});
  }
  cells.push({row:footerRow,col:totalCol,formula:`SUM(${excelRange(dataStartRow,totalCol,dataEndRow,totalCol,false)})`});
  cells.push({row:footerRow,col:meanCol,formula:`AVERAGE(${excelRange(dataStartRow,repStartCol,dataEndRow,repEndCol,false)})`});
  return cells;
}

export function oneWayAnovaFormulaPlan(design,rowByLabel,observation){
  if(!['ral','rak'].includes(design))throw new Error('Formula ANOVA satu faktor hanya mendukung RAL/RAK.');
  const treatment=rowByLabel.perlakuan,error=rowByLabel.galat,total=rowByLabel.total;
  const block=rowByLabel.kelompok??rowByLabel.ulangan;
  if(!treatment||!error||!total||(design==='rak'&&!block))return [];
  const o=observation;
  const data=excelRange(o.dataStartRow,o.repStartCol,o.dataEndRow,o.repEndCol);
  const treatmentTotals=excelRange(o.dataStartRow,o.totalCol,o.dataEndRow,o.totalCol);
  const treatmentMeans=excelRange(o.dataStartRow,o.meanCol,o.dataEndRow,o.meanCol);
  const treatmentLabels=excelRange(o.dataStartRow,1,o.dataEndRow,1);
  const grandTotal=excelRef(o.footerRow,o.totalCol);
  const cf=`(${grandTotal}^2/COUNT(${data}))`;
  const cells=[
    {row:treatment,col:2,formula:`ROWS(${treatmentLabels})-1`},
    {row:treatment,col:3,formula:`SUMPRODUCT(${treatmentTotals},${treatmentMeans})-${cf}`},
    {row:total,col:2,formula:`COUNT(${data})-1`},
    {row:total,col:3,formula:`SUMSQ(${data})-${cf}`}
  ];
  if(design==='rak'){
    const blockTotals=excelRange(o.footerRow,o.repStartCol,o.footerRow,o.repEndCol);
    cells.push(
      {row:block,col:2,formula:`COLUMNS(${data})-1`},
      {row:block,col:3,formula:`SUMSQ(${blockTotals})/ROWS(${treatmentLabels})-${cf}`},
      {row:error,col:2,formula:`${excelRef(total,2,false)}-${excelRef(treatment,2,false)}-${excelRef(block,2,false)}`},
      {row:error,col:3,formula:`${excelRef(total,3,false)}-${excelRef(treatment,3,false)}-${excelRef(block,3,false)}`}
    );
  }else{
    cells.push(
      {row:error,col:2,formula:`${excelRef(total,2,false)}-${excelRef(treatment,2,false)}`},
      {row:error,col:3,formula:`${excelRef(total,3,false)}-${excelRef(treatment,3,false)}`}
    );
  }
  const tested=design==='rak'?[block,treatment]:[treatment];
  for(const row of [...tested,error]){
    cells.push({row,col:4,formula:`IFERROR(${excelRef(row,3,false)}/${excelRef(row,2,false)},"")`});
  }
  for(const row of tested){
    cells.push(
      {row,col:5,formula:`IFERROR(${excelRef(row,4,false)}/${excelRef(error,4)},"")`},
      {row,col:6,formula:`IFERROR(F.INV.RT(0.05,${excelRef(row,2,false)},${excelRef(error,2)}),"")`},
      {row,col:7,formula:`IFERROR(F.INV.RT(0.01,${excelRef(row,2,false)},${excelRef(error,2)}),"")`}
    );
  }
  return cells;
}

function excelString(value){
  return '"' + String(value ?? '').replace(/"/g,'""') + '"';
}
function sheetRange(sheetName,startRow,col,endRow=startRow){
  const sheet="'"+String(sheetName||'all data').replace(/'/g,"''")+"'";
  return `${sheet}!${excelRange(startRow,col,endRow,col)}`;
}
function groupedSquareTerm(yRange,criteria){
  const args=criteria.flatMap(([range,value])=>[range,excelString(value)]);
  return `SUMIFS(${[yRange,...args].join(',')})^2/COUNTIFS(${args.join(',')})`;
}

export function factorialAnovaFormulaPlan(design,rowByLabel,raw){
  if(!['fral','frak','split'].includes(design))throw new Error('Formula JK faktorial hanya mendukung Faktorial RAL/RAK dan RPT.');
  const treatment=rowByLabel.perlakuan;
  const factorA=rowByLabel['faktor a'];
  const factorB=rowByLabel['faktor b'];
  const interaction=rowByLabel['interaksi (a × b)']??rowByLabel['a × b'];
  const total=rowByLabel.total;
  const block=rowByLabel.kelompok??rowByLabel.ulangan;
  const error=rowByLabel.acak??rowByLabel.galat;
  const errorA=rowByLabel['galat (a)'];
  const errorB=rowByLabel['galat (b)'];
  if(!factorA||!factorB||!interaction||!total)return [];
  if(design!=='split'&&(!treatment||!error))return [];
  if(['frak','split'].includes(design)&&!block)return [];
  if(design==='split'&&(!errorA||!errorB))return [];

  const {sheetName='all data',startRow,endRow,aLevels=[],bLevels=[],reps=[]}=raw||{};
  if(!startRow||!endRow||!aLevels.length||!bLevels.length)return [];
  if(['frak','split'].includes(design)&&!reps.length)return [];
  const aRange=sheetRange(sheetName,startRow,2,endRow);
  const bRange=sheetRange(sheetName,startRow,3,endRow);
  const repRange=sheetRange(sheetName,startRow,4,endRow);
  const yRange=sheetRange(sheetName,startRow,5,endRow);
  const cf=`(SUM(${yRange})^2/COUNT(${yRange}))`;
  const ssA=`${aLevels.map(level=>groupedSquareTerm(yRange,[[aRange,level]])).join('+')}-${cf}`;
  const ssB=`${bLevels.map(level=>groupedSquareTerm(yRange,[[bRange,level]])).join('+')}-${cf}`;
  const ssCells=`${aLevels.flatMap(a=>bLevels.map(b=>groupedSquareTerm(yRange,[[aRange,a],[bRange,b]]))).join('+')}-${cf}`;
  const cells=[
    {row:factorA,col:2,formula:`${aLevels.length}-1`},
    {row:factorA,col:3,formula:ssA},
    {row:factorB,col:2,formula:`${bLevels.length}-1`},
    {row:factorB,col:3,formula:ssB},
    {row:interaction,col:2,formula:`(${aLevels.length}-1)*(${bLevels.length}-1)`},
    {row:total,col:2,formula:`COUNT(${yRange})-1`},
    {row:total,col:3,formula:`SUMSQ(${yRange})-${cf}`}
  ];

  if(design==='split'){
    const ssBlock=`${reps.map(rep=>groupedSquareTerm(yRange,[[repRange,rep]])).join('+')}-${cf}`;
    const ssWhole=`${reps.flatMap(rep=>aLevels.map(a=>groupedSquareTerm(yRange,[[repRange,rep],[aRange,a]]))).join('+')}-${cf}`;
    cells.push(
      {row:block,col:2,formula:`${reps.length}-1`},
      {row:block,col:3,formula:ssBlock},
      {row:errorA,col:2,formula:`(${reps.length}-1)*(${aLevels.length}-1)`},
      {row:errorA,col:3,formula:`(${ssWhole})-${excelRef(block,3,false)}-${excelRef(factorA,3,false)}`},
      {row:interaction,col:3,formula:`(${ssCells})-${excelRef(factorA,3,false)}-${excelRef(factorB,3,false)}`},
      {row:errorB,col:2,formula:`${aLevels.length}*(${reps.length}-1)*(${bLevels.length}-1)`},
      {row:errorB,col:3,formula:`${excelRef(total,3,false)}-${excelRef(block,3,false)}-${excelRef(factorA,3,false)}-${excelRef(errorA,3,false)}-${excelRef(factorB,3,false)}-${excelRef(interaction,3,false)}`}
    );
    return cells;
  }

  cells.push(
    {row:treatment,col:2,formula:`${aLevels.length}*${bLevels.length}-1`},
    {row:treatment,col:3,formula:ssCells},
    {row:interaction,col:3,formula:`${excelRef(treatment,3,false)}-${excelRef(factorA,3,false)}-${excelRef(factorB,3,false)}`}
  );
  if(design==='frak'){
    const ssBlock=`${reps.map(rep=>groupedSquareTerm(yRange,[[repRange,rep]])).join('+')}-${cf}`;
    cells.push(
      {row:block,col:2,formula:`${reps.length}-1`},
      {row:block,col:3,formula:ssBlock},
      {row:error,col:2,formula:`COUNT(${yRange})-${aLevels.length}*${bLevels.length}-(${reps.length}-1)`},
      {row:error,col:3,formula:`${excelRef(total,3,false)}-${excelRef(block,3,false)}-${excelRef(treatment,3,false)}`}
    );
  }else{
    cells.push(
      {row:error,col:2,formula:`COUNT(${yRange})-${aLevels.length}*${bLevels.length}`},
      {row:error,col:3,formula:`${excelRef(total,3,false)}-${excelRef(treatment,3,false)}`}
    );
  }
  return cells;
}
