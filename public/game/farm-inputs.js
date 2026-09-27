export const LABOR_DAY_RATE=80000;
export const LABOR_FRACTIONS={plant:.08,irrigation:.05,fertilize:.06,scout:.04,harvest:.07,sample:.25,drain:.5,trace:.4,defendBoss:.65};
export const FERTILIZERS={
  urea:{id:'urea',name:'Urea',short:'Urea',grade:'46% N',doseHa:100,priceKg:1800,n:36,p:0,k:0},
  phonska:{id:'phonska',name:'NPK Phonska',short:'NPK',grade:'15-15-15',doseHa:250,priceKg:1840,n:17,p:25,k:24},
  sp36:{id:'sp36',name:'SP-36',short:'SP36',grade:'36% P₂O₅',doseHa:100,priceKg:4200,n:0,p:35,k:0,market:true},
  kcl:{id:'kcl',name:'KCl',short:'KCl',grade:'±60% K₂O',doseHa:75,priceKg:6500,n:0,p:0,k:38,market:true},
  organic:{id:'organic',name:'Pupuk organik',short:'Org',grade:'bahan organik',doseHa:1000,priceKg:640,n:5,p:4,k:5,organic:true}
};

export function createFarmInputModel({getState,getChallenge,getSpecies,getPlotMeta,actionCost,hasTech,clamp,round,plotArea}){
  function laborRate(){
    const state=getState(),season=Math.max(1,Number(state?.season)||1),challenge=getChallenge();
    return Math.round(LABOR_DAY_RATE*(Number(challenge?.laborMultiplier)||1)*(1+Math.min(.12,(season-1)*.01))/500)*500;
  }
  function laborCost(task,units=1){
    return Math.max(0,Math.round(laborRate()*(LABOR_FRACTIONS[task]||0)*Math.max(.1,Number(units)||1)/500)*500);
  }
  function cropRatio(crop){
    const species=getSpecies(crop?.species);
    return clamp((Number(crop?.age)||0)/Math.max(1,Number(species?.maturityDays)||110),0,1.3);
  }
  function irrigationPlan(crop,index=getState()?.selectedPlot||0){
    const ratio=cropRatio(crop),maize=(crop?.species||getState()?.species)==='maize';
    let trigger=40,target=70,depthMm=28,label='Irigasi';
    if(maize){
      if(ratio<.12){trigger=42;target=70;depthMm=25;label='Irigasi awal';}
      else if(ratio<.44){trigger=40;target=72;depthMm=30;label='Irigasi vegetatif';}
      else if(ratio<.66){trigger=50;target=80;depthMm=35;label='Irigasi fase kritis';}
      else if(ratio<.86){trigger=42;target=72;depthMm=30;label='Irigasi pengisian';}
      else{trigger=32;target=58;depthMm=20;label='Irigasi akhir';}
    }
    const area=Number(getPlotMeta(index)?.areaM2)||plotArea,volumeM3=round(depthMm*area/1000,2);
    return {trigger,target,depthMm,volumeM3,label,needed:Number(crop?.water||0)<trigger};
  }
  function irrigationActionCost(crop,index=getState()?.selectedPlot||0){
    const plan=irrigationPlan(crop,index),labor=laborCost('irrigation'),pump=actionCost(hasTech('irrigation')?'waterPrecision':'water');
    return {plan,labor,pump,total:labor+pump};
  }
  function nutrientTargets(crop){
    const ratio=cropRatio(crop),maize=(crop?.species||getState()?.species)==='maize';
    if(!maize)return ratio<.5?{n:55,p:50,k:50}:{n:45,p:42,k:46};
    if(ratio<.16)return {n:58,p:62,k:58};
    if(ratio<.42)return {n:68,p:56,k:60};
    if(ratio<.66)return {n:62,p:50,k:66};
    if(ratio<.86)return {n:50,p:44,k:58};
    return {n:38,p:38,k:46};
  }
  function nutrientDeficits(crop){
    const t=nutrientTargets(crop);
    return {n:Math.max(0,t.n-Number(crop?.n||0)),p:Math.max(0,t.p-Number(crop?.p||0)),k:Math.max(0,t.k-Number(crop?.k||0))};
  }
  function fertilizerDoseHa(crop,id){
    const ratio=cropRatio(crop),base=FERTILIZERS[id]?.doseHa||100;
    if(id==='phonska')return ratio<.22?250:ratio<.45?100:75;
    if(id==='urea')return ratio<.2?100:ratio<.48?100:75;
    return base;
  }
  function fertilizerDoseKg(crop,id){return round(fertilizerDoseHa(crop,id)*plotArea/10000,3);}
  function fertilizerActionCost(crop,id){
    const product=FERTILIZERS[id]||FERTILIZERS.urea,doseKg=fertilizerDoseKg(crop,product.id),material=Math.max(500,Math.round(doseKg*product.priceKg/500)*500),labor=laborCost('fertilize');
    return {product,doseKg,material,labor,total:material+labor};
  }
  function recommendedFertilizer(crop){
    if(!crop||getChallenge()?.noFertilizer||cropRatio(crop)>.88)return '';
    const d=nutrientDeficits(crop),ratio=cropRatio(crop);
    if((d.p>=10&&d.k>=9)||(ratio<.2&&(d.p>=6||d.k>=6)))return 'phonska';
    if(d.p>=12&&d.p>d.k*1.15)return 'sp36';
    if(d.k>=12&&d.k>d.p*1.15)return 'kcl';
    if(d.n>=8)return 'urea';
    if(d.p>=7||d.k>=7)return 'phonska';
    return '';
  }
  function initialNutrients(index){
    const meta=getPlotMeta(index),fertility=Number(meta?.fertility)||1,pH=Number(meta?.pH)||6,pHAvail=clamp(1-Math.abs(pH-6.2)*.08,.75,1);
    return {n:clamp(56+(fertility-1)*35,42,72),p:clamp((54+(fertility-1)*25)*pHAvail,38,70),k:clamp(55+(fertility-1)*28,40,72)};
  }
  return {laborRate,laborCost,cropRatio,irrigationPlan,irrigationActionCost,nutrientTargets,nutrientDeficits,fertilizerDoseHa,fertilizerDoseKg,fertilizerActionCost,recommendedFertilizer,initialNutrients};
}
