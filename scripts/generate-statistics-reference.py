"""Independent NumPy least-squares and SciPy reference for deterministic fixtures."""
import json, math
from pathlib import Path
import numpy as np
from scipy import stats

rows=[dict(a=f'A{a}',b=f'B{b}',rep=f'R{r}',values=[10+3*a+2*b+1.7*a*b+r*.4+math.sin(r*3+a*2+b*5)]) for r in range(4) for a in range(3) for b in range(2)]
y=np.array([o['values'][0] for o in rows])
dummy=lambda field:np.array([[float(o[field]==v) for v in sorted(set(x[field] for x in rows))[1:]] for o in rows])
A,B,R=dummy('a'),dummy('b'),dummy('rep')
AB=np.column_stack([A[:,i]*B[:,j] for i in range(A.shape[1]) for j in range(B.shape[1])])
RA=np.column_stack([R[:,i]*A[:,j] for i in range(R.shape[1]) for j in range(A.shape[1])])
refs={}
for design,blocks in [('fral',[('Faktor A',A),('Faktor B',B),('A × B',AB)]),('frak',[('Ulangan',R),('Faktor A',A),('Faktor B',B),('A × B',AB)]),('split',[('Ulangan',R),('Faktor A',A),('Galat (a)',RA),('Faktor B',B),('A × B',AB)])]:
 X=np.ones((len(y),1));prev=float(np.sum((y-y.mean())**2));terms=[]
 for label,columns in blocks:
  X=np.column_stack([X,columns]);res=y-X@np.linalg.lstsq(X,y,rcond=None)[0];sse=float(res@res)
  terms.append(dict(label=label,ss=prev-sse,df=columns.shape[1]));prev=sse
 df=len(y)-np.linalg.matrix_rank(X);terms.append(dict(label='Galat (b)' if design=='split' else 'Galat',ss=sse,df=int(df)))
 normal=stats.normaltest(res)
 groups=[res[[i for i,o in enumerate(rows) if o['a']==a and o['b']==b]] for a in ['A0','A1','A2'] for b in ['B0','B1']]
 bf=stats.levene(*groups,center='median')
 refs[design]=dict(terms=terms,normal=[float(normal.statistic),float(normal.pvalue)],bf=[float(bf.statistic),float(bf.pvalue)])
single=[[13.5,13.9,11.6],[19.3,21.7,19],[23.7,24.2,19.4],[18,19.8,17.5],[21.2,19.4,22.9],[20,19,18.9],[19.6,14.4,17.7],[19.9,20,21],[20.4,20.8,21],[14.3,17.1,18.8],[20.7,23.9,21],[19.9,19,16.5],[17.2,18,20],[21.7,23,22.7],[24,24.2,22.2],[22,20.5,21.6],[20.2,19.9,19.5]]
means=np.mean(single,axis=1);mse=np.sum((np.array(single)-means[:,None])**2)/34
critical={str(alpha):dict(bnt=float(stats.t.ppf(1-alpha/2,34)),bnj=float(stats.studentized_range.ppf(1-alpha,17,34)),dmrt=[float(stats.studentized_range.ppf((1-alpha)**(p-1),p,34)) for p in range(2,18)]) for alpha in [.05,.01]}
Path('scripts/statistics-reference.json').write_text(json.dumps(dict(rows=rows,refs=refs,single=single,mse=float(mse),critical=critical),indent=2))
print('Reference generated using NumPy least-squares and SciPy distributions.')
