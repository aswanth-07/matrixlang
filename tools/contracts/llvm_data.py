"""Real data for the LLVM study: MNIST images and the Cora citation graph.

Downloads two public datasets once, checks their SHA-256 digests, and writes
the raw arrays that llvm/kernels/driver.c reads:

    mnist_train.u8      60,000 x 784 pixels (uint8), the MNIST training images
    mnist_test.u8       10,000 x 784 pixels (uint8), the MNIST test images
    mnist_templates.i8  10 x 784 int8 weights of a linear (softmax) classifier
                        trained on the training images and quantized
                        symmetrically to [-127, 127]
    cora_adj.u8         2,708 x 2,708 symmetric 0/1 adjacency of Cora
    cora_deg.i16        the 2,708 vertex degrees (int16)

The downloaded files are data, never code: the MNIST archive is read with
numpy.load(allow_pickle=False) and Cora is parsed as text.

    python tools/contracts/llvm_data.py [--out build/data]

Writes results/contracts/llvm_data.json (sources, digests, shapes).
"""

from pathlib import Path
import argparse
import hashlib
import sys
import urllib.request

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common  # noqa: E402

SOURCES = {
    "mnist.npz": "https://storage.googleapis.com/tensorflow/tf-keras-datasets/mnist.npz",
    "cora.cites": "https://raw.githubusercontent.com/tkipf/pygcn/master/data/cora/cora.cites",
    "cora.content": "https://raw.githubusercontent.com/tkipf/pygcn/master/data/cora/cora.content",
}
# Digests of the files as published; a different file stops the study.
DIGESTS = {
    "mnist.npz": "731c5ac602752760c8e48fbffcf8c3b850d9dc2a2aedcf2cc48468fc17b673d1",
    "cora.cites": "ec1a372391b7f0f60a6aff0084e8abd8f19f0faa7e1f2441a41c492042d5945e",
    "cora.content": "b8ebed0fd45e53995abafd1b70cf6a9fcc8f86abc5826d69b97fe6ca46e9c8ee",
}


def fetch(name, out):
    path = out / "downloads" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        print(f"downloading {SOURCES[name]}", flush=True)
        with urllib.request.urlopen(SOURCES[name], timeout=300) as r:
            data = r.read()
        path.write_bytes(data)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if DIGESTS[name] and digest != DIGESTS[name]:
        raise SystemExit(f"{name}: SHA-256 {digest} differs from the published {DIGESTS[name]}")
    return path, digest


def mnist(out):
    path, digest = fetch("mnist.npz", out)
    with np.load(path, allow_pickle=False) as z:
        train, labels, test = z["x_train"], z["y_train"], z["x_test"]
    assert train.shape == (60000, 28, 28) and train.dtype == np.uint8
    assert test.shape == (10000, 28, 28) and test.dtype == np.uint8
    train = train.reshape(60000, 784)
    test = test.reshape(10000, 784)
    (out / "mnist_train.u8").write_bytes(train.tobytes())
    (out / "mnist_test.u8").write_bytes(test.tobytes())
    # A softmax classifier, trained by minibatch SGD with a fixed seed, then
    # quantized to int8 weights; inputs are pixels >> 1, also int8.
    with np.load(path, allow_pickle=False) as z:
        y_test = z["y_test"]
    rng = np.random.default_rng(0)
    x = train.astype(np.float32) / 255.0
    w = np.zeros((784, 10), dtype=np.float32)
    b = np.zeros(10, dtype=np.float32)
    onehot = np.eye(10, dtype=np.float32)[labels]
    for _ in range(5):
        order = rng.permutation(len(x))
        for start in range(0, len(x), 128):
            idx = order[start:start + 128]
            logits = x[idx] @ w + b
            logits -= logits.max(axis=1, keepdims=True)
            p = np.exp(logits)
            p /= p.sum(axis=1, keepdims=True)
            g = (p - onehot[idx]) / len(idx)
            w -= 0.5 * (x[idx].T @ g)
            b -= 0.5 * g.sum(axis=0)
    scale = 127.0 / float(np.abs(w).max())
    templates = np.clip(np.rint(w.T * scale), -127, 127).astype(np.int8)
    (out / "mnist_templates.i8").write_bytes(templates.tobytes())
    # Accuracy of the int8 model (the kernel's dot products plus the bias).
    q = (test >> 1).astype(np.int64)
    scores = (q @ templates.astype(np.int64).T) / (scale * 127.0) + b
    accuracy = float((scores.argmax(axis=1) == y_test).mean())
    float_accuracy = float(((test.astype(np.float32) / 255.0 @ w + b).argmax(axis=1) == y_test).mean())
    return {"source": SOURCES["mnist.npz"], "sha256": digest, "train": list(train.shape),
            "test": list(test.shape), "int8_accuracy": accuracy,
            "float_accuracy": float_accuracy}


def cora(out):
    cites, d1 = fetch("cora.cites", out)
    content, d2 = fetch("cora.content", out)
    ids = [line.split("\t", 1)[0] for line in content.read_text().splitlines() if line.strip()]
    index = {p: i for i, p in enumerate(ids)}
    n = len(ids)
    adj = np.zeros((n, n), dtype=np.uint8)
    edges = 0
    for line in cites.read_text().splitlines():
        if not line.strip():
            continue
        a, b = line.split()
        i, j = index[a], index[b]
        if i != j:
            adj[i, j] = adj[j, i] = 1
            edges += 1
    deg = adj.sum(axis=1).astype(np.int16)
    (out / "cora_adj.u8").write_bytes(adj.tobytes())
    (out / "cora_deg.i16").write_bytes(deg.tobytes())
    return {"source": [SOURCES["cora.cites"], SOURCES["cora.content"]],
            "sha256": [d1, d2], "vertices": n, "citations": edges,
            "undirected_edges": int(adj.sum() // 2), "max_degree": int(deg.max())}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(common.ROOT / "build" / "data"))
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    info = {"mnist": mnist(out), "cora": cora(out)}
    assert info["cora"]["vertices"] == 2708
    files = sorted(p for p in out.iterdir() if p.is_file())
    info["files"] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    common.RESULTS.mkdir(parents=True, exist_ok=True)
    common.write_json(common.RESULTS / "llvm_data.json", info)
    print(f"MNIST int8 classifier accuracy {info['mnist']['int8_accuracy']:.4f} "
          f"(float {info['mnist']['float_accuracy']:.4f}); "
          f"Cora {info['cora']['vertices']} vertices, {info['cora']['undirected_edges']} edges")


if __name__ == "__main__":
    main()
