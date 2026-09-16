"""Independent NumPy/SciPy oracle; CI reads the committed JSON fixture."""
import json
from pathlib import Path
import numpy as np
from scipy import stats
rng=np.random.default_rng(431)
x=rng.normal(size=(30,3));x[:,1]+=.6*x[:,0]
y=x@np.array([1.2,-.8,.4])+rng.normal(size=30)
rows=np.column_stack([y,x]);z=(rows-rows.mean(axis=0))/rows.std(axis=0,ddof=1)
beta=np.linalg.lstsq(z[:,1:],z[:,0],rcond=None)[0]
res=z[:,0]-z[:,1:]@beta;sse=res@res;df=26
cov=np.linalg.inv(z[:,1:].T@z[:,1:]);se=np.sqrt(sse/df*np.diag(cov))
out={'rows':rows.tolist(),'beta':beta.tolist(),'se':se.tolist(),'p':(2*stats.t.sf(abs(beta/se),df)).tolist(),'r2':1-sse/(z[:,0]@z[:,0]),'vif':np.diag(np.linalg.inv(np.corrcoef(x.T))).tolist(),'pearson':[],'spearman':[]}
for i in range(4):
 for j in range(i+1,4):
  out['pearson'].append(list(stats.pearsonr(rows[:,i],rows[:,j])))
  out['spearman'].append(list(stats.spearmanr(rows[:,i],rows[:,j])))
Path(__file__).with_name('association-reference.json').write_text(json.dumps(out,indent=2)+'\n')
