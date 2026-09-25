#!/usr/bin/env python3
import argparse, hashlib, json, os, pathlib, sys, urllib.request

def request_json(url, token):
    req=urllib.request.Request(url,headers={"Authorization":f"Bearer {token}","Accept":"application/json"})
    with urllib.request.urlopen(req,timeout=60) as response:
        return json.load(response)

def download(url, token):
    req=urllib.request.Request(url,headers={"Authorization":f"Bearer {token}"})
    with urllib.request.urlopen(req,timeout=90) as response:
        return response.read(), response.headers.get_content_type()

def valid_boxes(value):
    return isinstance(value,list) and value and all(
        isinstance(b,list) and len(b)==4 and all(isinstance(v,(int,float)) for v in b)
        and b[0]>=0 and b[1]>=0 and b[2]>0 and b[3]>0 and b[0]+b[2]<=1.000001 and b[1]+b[3]<=1.000001
        for b in value
    )

def yolo_line(box):
    x,y,w,h=box
    return f"0 {x+w/2:.7f} {y+h/2:.7f} {w:.7f} {h:.7f}"

def split_name(sample_id):
    bucket=int(hashlib.sha256(sample_id.encode()).hexdigest()[:8],16)%5
    return "val" if bucket==0 else "train"

def set_output(name,value):
    path=os.getenv("GITHUB_OUTPUT")
    if path:
        with open(path,"a",encoding="utf-8") as fh: fh.write(f"{name}={value}\n")

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--api-url",required=True)
    p.add_argument("--token",required=True)
    p.add_argument("--out",default=".chili-dataset")
    p.add_argument("--min-samples",type=int,default=100)
    p.add_argument("--limit",type=int,default=2000)
    args=p.parse_args()
    api=args.api_url.rstrip("/")
    payload=request_json(f"{api}/v1/admin/manifest?limit={args.limit}",args.token)
    rows=[]
    for item in payload.get("items",[]):
        try: boxes=json.loads(item.get("boxes_json","[]"))
        except Exception: continue
        if float(item.get("quality_score",0))<0.72 or not valid_boxes(boxes): continue
        rows.append((item,boxes))
    set_output("sample_count",len(rows))
    if len(rows)<args.min_samples:
        print(f"Dataset belum cukup: {len(rows)}/{args.min_samples} sampel.")
        set_output("ready","false"); return 0

    root=pathlib.Path(args.out)
    for split in ("train","val"):
        (root/"images"/split).mkdir(parents=True,exist_ok=True)
        (root/"labels"/split).mkdir(parents=True,exist_ok=True)

    counts={"train":0,"val":0}
    for item,boxes in rows:
        sid=str(item["id"]); split=split_name(sid)
        raw,mime=download(f"{api}/v1/admin/image/{sid}",args.token)
        ext={"image/webp":".webp","image/jpeg":".jpg","image/png":".png"}.get(mime,".jpg")
        (root/"images"/split/f"{sid}{ext}").write_bytes(raw)
        (root/"labels"/split/f"{sid}.txt").write_text("\n".join(yolo_line(b) for b in boxes)+"\n",encoding="utf-8")
        counts[split]+=1

    if counts["val"]<10:
        print(f"Validation set terlalu kecil: {counts['val']} sampel.")
        set_output("ready","false"); return 0

    yaml=(
        f"path: {root.resolve()}\n"
        "train: images/train\n"
        "val: images/val\n"
        "names:\n"
        "  0: cabai\n"
    )
    (root/"data.yaml").write_text(yaml,encoding="utf-8")
    (root/"summary.json").write_text(json.dumps({"samples":len(rows),**counts},indent=2),encoding="utf-8")
    print(f"Dataset siap: {counts}")
    set_output("ready","true")
    set_output("dataset_path",str(root))
    return 0

if __name__=="__main__":
    sys.exit(main())
