"""Local MatrixLang compiler adapter and demo server (Python standard library)."""

import argparse
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import subprocess
import tempfile
import threading
import time
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "demo"
MAX_SOURCE_BYTES = 16_000
MAX_TOKENS = 1_200
MAX_DEPTH = 64
MAX_OUTPUT_BYTES = 1_000_000
MAX_EXECUTION_COST = 2_000_000
MAX_EXECUTION_CELLS = 100_000
TIMEOUT_SECONDS = 6
STAGES = (
    ("tokens", "Tokens"), ("ast", "Syntax tree"), ("symbols", "Symbols"),
    ("check", "Shape check"), ("tac", "Intermediate code"),
    ("optimize", "Optimization"), ("guarantees", "Guarantees"), ("target", "VM code"),
    ("execute", "Execution"),
)
# Each contract names the weakest guarantee a rewrite may have and still apply.
CONTRACTS = {"strict": "--fp-strict", "bounded": "--fp-bounded", "algebraic": "--fp-algebraic"}
LEVELS = ("bit-identical", "bound-preserving", "relaxed")
DEFAULT_SEED = 1
MAX_SEED = 2**31 - 1


class DemoError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def binary_path():
    candidates = (ROOT / "bin/matrixc.exe", ROOT / "bin/matrixc")
    for path in candidates:
        if path.is_file():
            return path
    raise DemoError("Compiler unavailable. Build it with make, then restart the demo.", 503)


def validate_source(source):
    if not isinstance(source, str) or not source.strip():
        raise DemoError("Enter a MatrixLang program before compiling.")
    try:
        encoded = source.encode("utf-8")
    except UnicodeError:
        raise DemoError("Source contains invalid Unicode. Remove it and compile again.") from None
    if len(encoded) > MAX_SOURCE_BYTES:
        raise DemoError(f"Source exceeds the {MAX_SOURCE_BYTES:,}-byte demo limit.", 413)
    if "\0" in source:
        raise DemoError("Source contains a null character. Remove it and compile again.")
    # Comments do not contribute to syntax depth or the token budget.
    syntax = re.sub(r"/\*.*?\*/|//[^\n]*", "", source, flags=re.S)
    tokens = re.findall(r"[A-Za-z_]\w*|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[^\s]", syntax)
    if len(tokens) > MAX_TOKENS:
        raise DemoError(f"Program exceeds the {MAX_TOKENS:,}-token demo limit.", 413)
    depth = 0
    for token in tokens:
        if token in ("(", "[", "{"):
            depth += 1
            if depth > MAX_DEPTH:
                raise DemoError(f"Nesting exceeds the {MAX_DEPTH}-level demo limit.", 413)
        elif token in (")", "]", "}"):
            depth = max(0, depth - 1)


def invoke(path, flags):
    """Bound time and captured bytes; never pass source or options to a shell."""
    with tempfile.TemporaryDirectory(prefix="matrixlang-output-") as directory:
        output_path = Path(directory) / "output.txt"
        with output_path.open("wb") as output:
            process = subprocess.Popen(
                [str(binary_path()), *flags, str(path)],
                stdout=output, stderr=subprocess.STDOUT,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            deadline = time.monotonic() + TIMEOUT_SECONDS
            try:
                while process.poll() is None:
                    if time.monotonic() > deadline:
                        raise DemoError("Compilation exceeded the demo time limit. Reduce the program and try again.", 422)
                    if output_path.stat().st_size > MAX_OUTPUT_BYTES:
                        raise DemoError("Compiler output exceeded the demo limit. Reduce the program and try again.", 422)
                    time.sleep(0.025)
            finally:
                if process.poll() is None:
                    process.kill()
                process.wait()
        if output_path.stat().st_size > MAX_OUTPUT_BYTES:
            raise DemoError("Compiler output exceeded the demo limit. Reduce the program and try again.", 422)
        text = output_path.read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n")
        # Captures stay portable and never expose the temporary source location.
        text = text.replace(str(path), "program.ml")
        return process.returncode, text


def sections(raw):
    parts = re.split(r"\n={8,}\n\s*([^\n]+)\n={8,}\n", raw)
    found = {}
    for index in range(1, len(parts), 2):
        title, body = parts[index], parts[index + 1]
        body = re.sub(r"\nprogram\.ml: (?:ACCEPTED|REJECTED).*", "", body).strip()
        if "LEXICAL ANALYSIS" in title:
            key = "tokens"
        elif "SYNTAX ANALYSIS" in title:
            key = "ast"
        elif "SYMBOL TABLE" in title:
            key = "symbols"
        elif "SEMANTIC ANALYSIS" in title:
            key = "check"
        elif "OPTIMIZED INTERMEDIATE" in title:
            key = "optimize"
        elif "INTERMEDIATE CODE" in title:
            key = "tac"
        elif "TARGET CODE" in title:
            key = "target"
        elif "OUTPUT GUARANTEES" in title:
            key = "guarantees"
        elif "WHAT THE OPTIMIZER" in title or "OPTIMIZATION REPORT" in title:
            found["optimize"] = (found.get("optimize", "") + "\n\n" + body).strip()
            continue
        else:
            continue
        found[key] = body
    return found


def integer_field(raw, label):
    match = re.search(re.escape(label) + r"\s*:\s*(\d+)", raw)
    return int(match.group(1)) if match else None


def diagnostics_from(text):
    result = []
    for match in re.finditer(r"^(\d+):(\d+): (error|warning|note) \[(\w+)\] (.+)$", text, re.M):
        result.append({"line": int(match[1]), "column": int(match[2]),
                       "level": match[3], "phase": match[4], "message": match[5]})
    return result


def symbols_from(text):
    symbols = []
    for line in text.splitlines():
        cells = [cell.strip() for cell in line.split("|")[1:-1]]
        if len(cells) != 8 or cells[1] not in ("Matrix", "Scalar"):
            continue
        symbols.append({"name": cells[0], "kind": cells[1],
                        "rows": int(cells[2]) if cells[2].isdigit() else None,
                        "cols": int(cells[3]) if cells[3].isdigit() else None,
                        "line": int(cells[5]), "writes": int(cells[6]), "reads": int(cells[7])})
    return symbols


def inputs_from(text):
    """The symbol stage lists every declared input with its shape and domain."""
    inputs = []
    listing = text.split("\nInputs (", 1)
    if len(listing) < 2:
        return inputs
    for line in listing[1].splitlines()[1:]:
        match = re.match(r"^\s+(\w+)\s+(?:Matrix<(\d+)x(\d+)>|Scalar)\s+(\S+)\s+(.+?)\s*$", line)
        if not match:
            break
        inputs.append({"name": match[1], "kind": "Matrix" if match[2] else "Scalar",
                       "rows": int(match[2]) if match[2] else None,
                       "cols": int(match[3]) if match[3] else None,
                       "domain": match[4], "meaning": match[5]})
    return inputs


def guarantees_from(text):
    """One certificate per print: its guarantee level and the reasons given."""
    contract = re.search(r"^Contract: \w+\. (.+)$", text, re.M)
    outputs = []
    for line in text.splitlines():
        match = re.match(r"^\s+(\d+)\.\s+(" + "|".join(LEVELS) + r")\s+print\((.*)\)\s*$", line)
        if match:
            outputs.append({"index": int(match[1]), "level": match[2], "label": match[3],
                            "reasons": [], "identical": None})
        elif outputs and line.strip():
            outputs[-1]["reasons"].append(re.sub(r"^- ", "", line.strip()))
    return {"promise": contract[1] if contract else None, "outputs": outputs}


def split_outputs(text):
    """Splits --exact-output execution text into one block per print."""
    blocks, current = [], None
    for line in text.splitlines():
        if re.match(r"^\S.* = ", line):
            if current is not None:
                blocks.append("\n".join(current))
            current = [line]
        elif current is not None and line.strip():
            current.append(line)
    if current is not None:
        blocks.append("\n".join(current))
    return blocks


def validate_seed(seed):
    if seed is None:
        return DEFAULT_SEED
    if isinstance(seed, bool) or not isinstance(seed, int) or not 1 <= seed <= MAX_SEED:
        raise DemoError(f"Choose an input seed between 1 and {MAX_SEED:,}.")
    return seed


def compile_source(source, mode="strict", seed=None):
    validate_source(source)
    if mode not in CONTRACTS:
        raise DemoError("Choose the strict, bounded or algebraic numerical contract.")
    seed = validate_seed(seed)
    with tempfile.TemporaryDirectory(prefix="matrixlang-demo-") as directory:
        path = Path(directory) / "program.ml"
        path.write_text(source, encoding="utf-8", newline="\n")
        flags = [CONTRACTS[mode], "--tokens", "--ast", "--symbols", "--check", "--tac",
                 "--optimize", "--explain", "--report", "--cost", "--certificate", "--target", "--stats"]
        code, raw = invoke(path, flags)
        if code not in (0, 1):
            raise DemoError("The compiler could not finish this program. Reduce the source and try again.", 422)
        found = sections(raw)
        diagnostics = diagnostics_from(found.get("check", ""))
        symbols = symbols_from(found.get("symbols", ""))
        inputs = inputs_from(found.get("symbols", ""))
        guarantees = guarantees_from(found.get("guarantees", ""))
        run_inputs = ["--random-inputs", str(seed)]
        metrics = {"before": integer_field(raw, "Arithmetic before optimization"),
                   "after": integer_field(raw, "Arithmetic after optimization"),
                   "instructionsBefore": integer_field(raw, "Original TAC instructions"),
                   "instructionsAfter": integer_field(raw, "Optimized TAC instructions"),
                   "tokens": integer_field(raw, "Tokens scanned"),
                   "rewrites": integer_field(raw, "Product chains reordered")}
        comparison = None
        execution_status = "blocked"
        if code == 0:
            shapes = re.findall(r"Matrix<(\d+)x(\d+)>", found.get("tac", ""))
            cells = sum(int(rows) * int(cols) for rows, cols in shapes)
            # Check source-order work too: exact comparison executes the baseline.
            if metrics["before"] is None or metrics["before"] > MAX_EXECUTION_COST or cells > MAX_EXECUTION_CELLS:
                execution_status = "limited"
                found["execute"] = ("Execution skipped by the local demo limit.\n"
                                    "Reduce matrix sizes or arithmetic work to run this program.\n"
                                    "The compiler stages and cost report remain available.")
            else:
                execution_status = "complete"
                baseline_code, baseline = invoke(path, ["-q", "--run", "--exact-output", *run_inputs])
                selected_code, exact = invoke(path, ["-q", "--run", "--exact-output", "--optimize", CONTRACTS[mode], *run_inputs])
                human_code, human = invoke(path, ["-q", "--run", "--optimize", CONTRACTS[mode], *run_inputs])
                found["execute"] = human.strip() or "Program completed without printed output."
                comparison = {"baseline": baseline.strip(), "optimized": exact.strip(),
                              "identical": baseline_code == selected_code == 0 and baseline == exact,
                              "baselineStatus": baseline_code, "optimizedStatus": selected_code}
                # Each certificate is checked against the run it describes: an
                # output certified bit-identical must equal the unoptimized one.
                before, after = split_outputs(baseline), split_outputs(exact)
                if baseline_code == selected_code == 0 and len(before) == len(after) == len(guarantees["outputs"]):
                    for item, old, new in zip(guarantees["outputs"], before, after):
                        item["identical"] = old == new
                if baseline_code or selected_code or human_code:
                    execution_status = "error"
        stages = []
        for key, title in STAGES:
            text = found.get(key, "")
            state = "complete" if text else "blocked"
            if code and key == "check":
                state = "error"
            if key == "execute":
                state = execution_status
            if not text:
                text = "Compilation stopped before this stage. Resolve the diagnostics and compile again."
            stages.append({"id": key, "title": title, "state": state, "text": text})
        return {"schema": 2, "sourceHash": hashlib.sha256(source.encode()).hexdigest(),
                "mode": mode, "seed": seed, "status": "rejected" if code else "accepted",
                "diagnostics": diagnostics, "symbols": symbols, "inputs": inputs,
                "guarantees": guarantees, "metrics": metrics,
                "stages": stages, "comparison": comparison, "execution": execution_status,
                "command": "matrixc " + " ".join(flags) + " program.ml"}


class DemoServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address):
        self.compile_slots = threading.BoundedSemaphore(2)
        super().__init__(address, DemoHandler)


class DemoHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DEMO), **kwargs)

    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def trusted_request(self):
        port = self.server.server_port
        allowed = {f"127.0.0.1:{port}", f"localhost:{port}"}
        if self.headers.get("Host", "").lower() not in allowed:
            raise DemoError("Use the localhost demo address.", 403)
        origin = self.headers.get("Origin")
        if origin and origin not in {f"http://{host}" for host in allowed}:
            raise DemoError("Compile requests must originate from the local demo.", 403)

    def json_response(self, payload, status=200):
        data = (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        try:
            self.trusted_request()
            path = urlsplit(self.path).path
            if path == "/api/health":
                binary_path()
                self.json_response({"compiler": "matrixc", "available": True, "schema": 2,
                                    "contracts": list(CONTRACTS)})
            elif path.startswith("/api/"):
                self.json_response({"error": "Endpoint not found."}, 404)
            else:
                super().do_GET()
        except DemoError as error:
            self.json_response({"error": str(error)}, error.status)

    def do_POST(self):
        try:
            self.trusted_request()
            if urlsplit(self.path).path != "/api/compile":
                raise DemoError("Endpoint not found.", 404)
            if self.headers.get("Content-Type", "").split(";")[0].strip().lower() != "application/json":
                raise DemoError("Send a JSON compilation request.", 415)
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                raise DemoError("Invalid request length.") from None
            if length <= 0 or length > MAX_SOURCE_BYTES * 6 + 1_024:
                raise DemoError("Compilation request exceeds the demo limit.", 413)
            try:
                payload = json.loads(self.rfile.read(length))
            except (ValueError, UnicodeError):
                raise DemoError("Invalid JSON compilation request.") from None
            if not isinstance(payload, dict):
                raise DemoError("Send a JSON object with source, mode and seed.")
            if not self.server.compile_slots.acquire(blocking=False):
                raise DemoError("The compiler is busy. Try again shortly.", 429)
            try:
                result = compile_source(payload.get("source"), payload.get("mode", "strict"), payload.get("seed"))
            finally:
                self.server.compile_slots.release()
            self.json_response(result)
        except DemoError as error:
            self.json_response({"error": str(error)}, error.status)
        except (OSError, subprocess.SubprocessError):
            self.json_response({"error": "The local compiler could not run. Check the build and try again."}, 503)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8731)
    args = parser.parse_args()
    binary_path()
    server = DemoServer(("127.0.0.1", args.port))
    print(f"MatrixLang demo: http://127.0.0.1:{server.server_port}/", flush=True)
    print("Local compiler enabled. Press Ctrl+C to stop.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
