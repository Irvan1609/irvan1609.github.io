// Resolve merged HTML cells once so XLSX and plain-text clipboard agree.
export function tableLayout(rows){
  const grid=[],cells=[];let width=0;
  rows.forEach((sources,row)=>{
    grid[row]||=[];let col=0;
    for(const source of sources){
      while(grid[row][col])col++;
      const rowSpan=Math.max(1,Number(source.rowSpan)||1),colSpan=Math.max(1,Number(source.colSpan)||1);
      cells.push({source,row,col,rowSpan,colSpan});
      for(let r=row;r<row+rowSpan;r++){
        grid[r]||=[];
        for(let c=col;c<col+colSpan;c++)grid[r][c]=true;
      }
      col+=colSpan;width=Math.max(width,col);
    }
  });
  return {cells,width,height:grid.length};
}
