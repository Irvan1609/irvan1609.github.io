export const VIRTUALIZE_AFTER_ROWS=320;
export const VIRTUAL_OVERSCAN_ROWS=24;

export function virtualWindow({rowCount,scrollTop=0,viewportHeight=600,rowHeight=40,overscan=VIRTUAL_OVERSCAN_ROWS}={}){
  const total=Math.max(0,Number(rowCount)||0),height=Math.max(24,Number(rowHeight)||40);
  if(total<=VIRTUALIZE_AFTER_ROWS)return {virtualized:false,start:0,end:total,top:0,bottom:0,rowHeight:height};
  const visible=Math.max(1,Math.ceil(Math.max(1,Number(viewportHeight)||600)/height));
  const first=Math.max(0,Math.floor(Math.max(0,Number(scrollTop)||0)/height)-overscan);
  const end=Math.min(total,first+visible+overscan*2);
  return {
    virtualized:true,
    start:first,
    end,
    top:first*height,
    bottom:Math.max(0,(total-end)*height),
    rowHeight:height
  };
}
