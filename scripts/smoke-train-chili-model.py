#!/usr/bin/env python3
import argparse
import json
import pathlib
import shutil
from datetime import datetime, timezone

def metric_value(results, fragment, default=0.0):
    for key,value in getattr(results,"results_dict",{}).items():
        if fragment.lower() in key.lower():
            try:
                return float(value)
            except Exception:
                pass
    return float(default)

def count_split_images(data_yaml):
    try:
        import yaml
        raw=yaml.safe_load(pathlib.Path(data_yaml).read_text(encoding="utf-8")) or {}
    except Exception:
        return {},[]
    names=raw.get("names",[])
    if isinstance(names,dict):
        names=[names[k] for k in sorted(names,key=lambda x:int(x) if str(x).isdigit() else str(x))]
    root=pathlib.Path(raw.get("path") or pathlib.Path(data_yaml).parent)
    if not root.is_absolute():
        root=(pathlib.Path(data_yaml).parent/root).resolve()
    result={}
    for key in ("train","val","valid","test"):
        value=raw.get(key)
        if not value:
            continue
        paths=value if isinstance(value,list) else [value]
        total=0
        for item in paths:
            p=pathlib.Path(item)
            if not p.is_absolute():
                p=(root/p).resolve()
            if p.is_dir():
                total+=sum(1 for f in p.rglob("*") if f.suffix.lower() in {".jpg",".jpeg",".png",".webp",".bmp"})
            elif p.is_file() and p.suffix.lower()==".txt":
                total+=sum(1 for line in p.read_text(encoding="utf-8").splitlines() if line.strip())
        result[key]=total
    return result,names

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--data",required=True)
    parser.add_argument("--epochs",type=int,default=2)
    parser.add_argument("--imgsz",type=int,default=512)
    args=parser.parse_args()

    if args.epochs<1 or args.epochs>3:
        raise SystemExit("Smoke test dibatasi 1–3 epoch.")

    from ultralytics import YOLO

    out=pathlib.Path(".chili-smoke")
    out.mkdir(exist_ok=True)
    split_counts,class_names=count_split_images(args.data)

    model=YOLO("yolov8n.pt")
    model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=8,
        device="cpu",
        workers=2,
        patience=args.epochs,
        project=str(out),
        name="run",
        exist_ok=True,
        verbose=False,
        plots=False
    )

    best=out/"run"/"weights"/"best.pt"
    if not best.exists():
        raise SystemExit("Training selesai tetapi best.pt tidak ditemukan.")

    candidate=YOLO(str(best))
    results=candidate.val(data=args.data,imgsz=args.imgsz,device="cpu",verbose=False)
    exported=pathlib.Path(candidate.export(format="onnx",imgsz=args.imgsz,opset=12,simplify=True,dynamic=False))
    target=out/"smoke-model.onnx"
    shutil.copy2(exported,target)

    report={
        "purpose":"smoke-test-only",
        "promoted":False,
        "epochs":args.epochs,
        "imgsz":args.imgsz,
        "classes":class_names,
        "split_image_counts":split_counts,
        "precision":round(metric_value(results,"precision"),6),
        "recall":round(metric_value(results,"recall"),6),
        "map50":round(metric_value(results,"mAP50(B)"),6),
        "map50_95":round(metric_value(results,"mAP50-95"),6),
        "onnx_bytes":target.stat().st_size,
        "finished_at":datetime.now(timezone.utc).isoformat()
    }
    (out/"smoke-report.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    print(json.dumps(report,indent=2))

if __name__=="__main__":
    main()
