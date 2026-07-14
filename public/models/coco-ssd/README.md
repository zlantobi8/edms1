# COCO-SSD model weights go here

This folder is intentionally empty in git except for this file. Run once,
on a machine with internet access, before your first build:

```
node scripts/download-coco-ssd-model.js
```

This downloads `model.json` and its weight shard files into this folder.
Commit them to your repo afterward — after that, the exam machine itself
never needs internet access; detection runs entirely offline in the
browser via TensorFlow.js.
