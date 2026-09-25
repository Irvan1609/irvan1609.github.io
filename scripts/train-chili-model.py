#!/usr/bin/env python3
import argparse, json, os, pathlib, shutil
from datetime import datetime, timezone

def metric_value(results, fragment, default=0.0):
    for key,value in getattr(results,"results_dict",{}).items():
        if fragment.lower() in key.lower():
            try:return float(value)
            except Exception:pass
    return float(default)

def set_output(name,value):
    path=os.getenv("GITHUB_OUTPUT")
    if path:
        with open(path,"a",encoding="utf-8") as fh: fh.write(f"{name}={value}\n")

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--data",required=True)
    p.add_argument("--public-dir",default="public/hitung-cabai")
    p.add_argument("--epochs",type=int,default=30)
    p.add_argument("--sample-count",type=int,default=0)
    args=p.parse_args()

    from ultralytics import YOLO

    public=pathlib.Path(args.public_dir)
    metrics_path=public/"models"/"metrics.json"
    previous={}
    if metrics_path.exists():
        try: previous=json.loads(metrics_path.read_text(encoding="utf-8"))
        except Exception: previous={}

    model=YOLO("yolov8n.pt")
    model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=640,
        batch=8,
        device="cpu",
        workers=2,
        patience=8,
        project=".chili-training",
        name="candidate",
        exist_ok=True,
        verbose=False
    )
    candidate=YOLO(".chili-training/candidate/weights/best.pt")
    results=candidate.val(data=args.data,imgsz=640,device="cpu",verbose=False)
    precision=metric_value(results,"precision")
    recall=metric_value(results,"recall")
    map50=metric_value(results,"mAP50(B)")
    map5095=metric_value(results,"mAP50-95")

    first=not bool(previous)
    if first:
        accepted=map50>=0.55 and recall>=0.50
    else:
        old_map=float(previous.get("map50",0)); old_recall=float(previous.get("recall",0))
        safe=map50>=old_map-0.003 and recall>=old_recall-0.01
        improvement=map50>old_map+0.001 or recall>old_recall+0.005
        accepted=safe and improvement

    metrics={
        "precision":round(precision,6),
        "recall":round(recall,6),
        "map50":round(map50,6),
        "map50_95":round(map5095,6),
        "accepted":bool(accepted),
        "evaluated_at":datetime.now(timezone.utc).isoformat(),
        "sample_count":int(args.sample_count)
    }
    pathlib.Path(".chili-training").mkdir(exist_ok=True)
    pathlib.Path(".chili-training/candidate-metrics.json").write_text(json.dumps(metrics,indent=2),encoding="utf-8")
    print(json.dumps(metrics,indent=2))
    set_output("accepted","true" if accepted else "false")

    if not accepted:return 0

    exported=pathlib.Path(candidate.export(format="onnx",imgsz=640,opset=12,simplify=True,dynamic=False))
    model_dir=public/"models";model_dir.mkdir(parents=True,exist_ok=True)
    shutil.copy2(exported,model_dir/"cabai-latest.onnx")
    version=f"yolo-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{os.getenv('GITHUB_RUN_NUMBER','local')}"
    metrics["version"]=version
    metrics_path.write_text(json.dumps(metrics,indent=2),encoding="utf-8")
    manifest={
        "enabled":True,
        "version":version,
        "modelUrl":"./models/cabai-latest.onnx",
        "inputSize":640,
        "confidence":0.25,
        "iou":0.45
    }
    (public/"model-manifest.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
    return 0

if __name__=="__main__":
    raise SystemExit(main())
