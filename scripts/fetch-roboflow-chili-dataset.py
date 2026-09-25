#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path

def set_output(name, value):
    output = os.getenv("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as fh:
            fh.write(f"{name}={value}\n")

def count_images(folder):
    exts={".jpg",".jpeg",".png",".webp",".bmp"}
    return sum(1 for p in Path(folder).rglob("*") if p.is_file() and p.suffix.lower() in exts)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--dataset",required=True,help="workspace/project/version")
    parser.add_argument("--api-key",default=os.getenv("ROBOFLOW_API_KEY",""))
    parser.add_argument("--out",default=".roboflow-dataset")
    args=parser.parse_args()

    parts=[p for p in args.dataset.strip("/").split("/") if p]
    if len(parts)!=3 or not parts[2].isdigit():
        raise SystemExit("ROBOFLOW_DATASET_ID harus berbentuk workspace/project/version, misalnya my-ws/cabai/3.")
    if not args.api_key:
        raise SystemExit("ROBOFLOW_API_KEY belum tersedia.")

    workspace_slug,project_slug,version_number=parts

    from roboflow import Roboflow
    rf=Roboflow(api_key=args.api_key)
    workspace=rf.workspace(workspace_slug)
    project=workspace.project(project_slug)
    version=project.version(int(version_number))

    out=Path(args.out)
    dataset=version.download(model_format="yolov8",location=str(out),overwrite=True)

    candidates=[out/"data.yaml",*out.rglob("data.yaml")]
    data_yaml=next((p for p in candidates if p.exists()),None)
    if data_yaml is None:
        raise SystemExit("Roboflow selesai diunduh tetapi data.yaml tidak ditemukan.")

    image_count=count_images(out)
    if image_count<5:
        raise SystemExit(f"Dataset terlalu kecil untuk smoke test: {image_count} gambar.")

    summary={
        "source":"roboflow",
        "dataset_id":args.dataset,
        "download_location":str(getattr(dataset,"location",out)),
        "data_yaml":str(data_yaml),
        "image_count":image_count
    }
    (out/"download-summary.json").write_text(json.dumps(summary,indent=2),encoding="utf-8")
    print(json.dumps(summary,indent=2))
    set_output("ready","true")
    set_output("data_yaml",str(data_yaml))
    set_output("sample_count",str(image_count))

if __name__=="__main__":
    main()
