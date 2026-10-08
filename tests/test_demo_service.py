"""Behavior and request-boundary checks for the local compiler demo."""

import hashlib
import http.client
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import demo_service as demo


class CompilerAdapterTests(unittest.TestCase):
    def test_inferred_product_and_execution(self):
        source = "matrix A[1,2]={{2,3}}; matrix B[2,1]={{4},{5}}; matrix C=A*B; print(C);"
        result = demo.compile_source(source)
        self.assertEqual(result["status"], "accepted")
        self.assertEqual(result["symbols"][-1]["rows"], 1)
        self.assertEqual(result["symbols"][-1]["cols"], 1)
        self.assertEqual(result["metrics"]["before"], 3)
        self.assertEqual(result["sourceHash"], hashlib.sha256(source.encode()).hexdigest())
        self.assertTrue(result["comparison"]["identical"])
        self.assertIn("23", result["stages"][-1]["text"])
        self.assertTrue(all(stage["state"] == "complete" for stage in result["stages"]))

    def test_shape_rejection_blocks_code_generation(self):
        result = demo.compile_source("matrix A[2,3]; matrix B[5,4]; matrix C=A*B; print(C);")
        self.assertEqual(result["status"], "rejected")
        self.assertEqual(result["diagnostics"][0]["phase"], "semantic")
        self.assertIn("cannot multiply", result["diagnostics"][0]["message"])
        self.assertTrue(all(stage["state"] == "blocked" for stage in result["stages"][4:]))
        self.assertIsNone(result["comparison"])

    def test_syntax_and_lexical_diagnostics(self):
        for source, phase in [("scalar x=;", "syntax"), ("scalar x=2 @;", "lexical")]:
            with self.subTest(phase=phase):
                result = demo.compile_source(source)
                self.assertEqual(result["status"], "rejected")
                self.assertTrue(any(error["phase"] == phase for error in result["diagnostics"]))

    def test_contracts_have_distinct_costs(self):
        # Real-valued products round, so only the bounded and algebraic
        # contracts may reorder this chain.
        source = ("matrix A[100,2]=input(real(1)); matrix B[2,100]=input(real(1)); "
                  "matrix C[100,2]=input(real(1)); matrix R=A*B*C; print(R);")
        strict, bounded, algebraic = [demo.compile_source(source, mode) for mode in demo.CONTRACTS]
        self.assertEqual(strict["metrics"]["after"], 69800)
        self.assertEqual(bounded["metrics"]["after"], 1396)
        self.assertEqual(algebraic["metrics"]["after"], 1396)
        self.assertEqual(strict["guarantees"]["outputs"][0]["level"], "bit-identical")
        self.assertEqual(bounded["guarantees"]["outputs"][0]["level"], "bound-preserving")

    def test_strict_reorders_a_chain_it_proves_exact(self):
        source = ("matrix A[40,2]=input(int8); matrix B[2,40]=input(int8); "
                  "matrix C[40,2]=input(int8); matrix R=A*B*C; print(R);")
        result = demo.compile_source(source, "strict", 7)
        self.assertEqual((result["metrics"]["before"], result["metrics"]["after"]), (11120, 556))
        self.assertEqual(result["seed"], 7)
        self.assertEqual([item["domain"] for item in result["inputs"]], ["int8"] * 3)
        self.assertEqual(result["inputs"][0]["rows"], 40)
        output = result["guarantees"]["outputs"][0]
        self.assertEqual((output["label"], output["level"], output["identical"]), ("R", "bit-identical", True))
        self.assertIn("exact", output["reasons"][0])
        self.assertTrue(result["comparison"]["identical"])

    def test_every_certificate_is_checked_against_execution(self):
        source = ("matrix A[24,2]=input(int16); matrix B[2,24]=input(int16); matrix C[24,2]=input(int16); "
                  "matrix X[24,2]=input(real(1)); matrix R=A*B*C; matrix S=X*B*C; print(R); print(S);")
        for mode in demo.CONTRACTS:
            for seed in (1, 2, 3):
                with self.subTest(mode=mode, seed=seed):
                    result = demo.compile_source(source, mode, seed)
                    outputs = result["guarantees"]["outputs"]
                    self.assertEqual([item["label"] for item in outputs], ["R", "S"])
                    for item in outputs:
                        self.assertIsNotNone(item["identical"])
                        if item["level"] == "bit-identical":
                            self.assertTrue(item["identical"])
                    self.assertEqual(outputs[0]["level"], "bit-identical")
                    self.assertEqual(outputs[1]["level"], "bit-identical" if mode == "strict" else "bound-preserving")

    def test_unbounded_reals_are_reordered_only_as_relaxed(self):
        source = ("matrix A[40,2]=input(real); matrix B[2,40]=input(real); "
                  "matrix C[40,2]=input(real); matrix R=A*B*C; print(R);")
        results = {mode: demo.compile_source(source, mode) for mode in demo.CONTRACTS}
        self.assertEqual([results[mode]["metrics"]["after"] for mode in demo.CONTRACTS], [11120, 11120, 556])
        self.assertEqual([results[mode]["guarantees"]["outputs"][0]["level"] for mode in demo.CONTRACTS],
                         ["bit-identical", "bit-identical", "relaxed"])

    def test_seed_validation(self):
        for seed in (0, -1, 2**31, 1.5, "3", True):
            with self.subTest(seed=seed), self.assertRaises(demo.DemoError):
                demo.compile_source("scalar x=1; print(x);", "strict", seed)

    def test_signed_zero_comparison_is_exact(self):
        source = "scalar x=-2; scalar y=x*0; print(y);"
        strict, bounded, algebraic = [demo.compile_source(source, mode) for mode in demo.CONTRACTS]
        self.assertTrue(strict["comparison"]["identical"])
        self.assertFalse(bounded["comparison"]["identical"])
        self.assertFalse(algebraic["comparison"]["identical"])
        self.assertEqual(bounded["guarantees"]["outputs"][0]["level"], "bound-preserving")
        self.assertIn("-0x0p+0", strict["comparison"]["optimized"])
        self.assertIn("0x0p+0", algebraic["comparison"]["optimized"])

    def test_large_program_is_checked_without_execution(self):
        result = demo.compile_source("matrix A[1000,1000]; print(A);")
        self.assertEqual(result["status"], "accepted")
        self.assertEqual(result["execution"], "limited")
        self.assertIsNone(result["comparison"])
        self.assertIn("Execution skipped", result["stages"][-1]["text"])

    def test_empty_and_non_string_source(self):
        for source in (None, 0, [], "", "  "):
            with self.subTest(source=source), self.assertRaises(demo.DemoError):
                demo.compile_source(source)

    def test_source_byte_token_and_depth_limits(self):
        for source in ("/" * (demo.MAX_SOURCE_BYTES + 1), "x;" * 601, "(" * 65 + "1" + ")" * 65):
            with self.subTest(length=len(source)), self.assertRaises(demo.DemoError) as context:
                demo.compile_source(source)
            self.assertEqual(context.exception.status, 413)
        demo.validate_source("/*" + "(" * 200 + "*/scalar x=1;")

    def test_mode_and_null_rejection(self):
        with self.assertRaises(demo.DemoError):
            demo.compile_source("scalar x=1;", "--run")
        with self.assertRaises(demo.DemoError):
            demo.compile_source("scalar x=1;\0")
        with self.assertRaises(demo.DemoError):
            demo.compile_source("scalar x=1;\ud800")

    def test_invocation_timeout_and_output_limit(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "case.ml"
            path.write_text("", encoding="utf-8")
            with patch.object(demo, "binary_path", return_value=Path(sys.executable)):
                with patch.object(demo, "TIMEOUT_SECONDS", 0.1), self.assertRaises(demo.DemoError) as context:
                    demo.invoke(path, ["-c", "import time; time.sleep(3)"])
                self.assertEqual(context.exception.status, 422)
                with patch.object(demo, "MAX_OUTPUT_BYTES", 100), self.assertRaises(demo.DemoError):
                    demo.invoke(path, ["-c", "print('x'*1000)"])

    def test_recorded_examples_replay(self):
        text = (ROOT / "demo/workspace-data.js").read_text(encoding="utf-8")
        data = json.loads(text.split("window.MATRIXLANG_WORKSPACE = ", 1)[1].rstrip(";\n"))
        self.assertEqual(len(data["examples"]), 8)
        for example in data["examples"]:
            self.assertEqual(sorted(example["captures"]), sorted(demo.CONTRACTS))
            for mode, capture in example["captures"].items():
                with self.subTest(example=example["id"], mode=mode):
                    self.assertEqual(capture, demo.compile_source(example["source"], mode, data["seed"]))


class HttpBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = demo.DemoServer(("127.0.0.1", 0))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=15)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        status, raw, mime = response.status, response.read(), response.getheader("Content-Type", "")
        connection.close()
        return status, json.loads(raw) if "application/json" in mime else raw

    def test_health_and_page(self):
        status, health = self.request("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertTrue(health["available"])
        self.assertEqual(health["contracts"], ["strict", "bounded", "algebraic"])
        self.assertIn(b"Compiler workspace", self.request("GET", "/")[1])

    def test_compilation_request(self):
        status, result = self.request("POST", "/api/compile", json.dumps({"source": "scalar x=7; print(x);"}), {"Content-Type": "application/json"})
        self.assertEqual(status, 200)
        self.assertEqual(result["status"], "accepted")
        self.assertIn("7", result["stages"][-1]["text"])
        status, result = self.request("POST", "/api/compile", json.dumps({"source": "scalar x=7; print(x);", "mode": "bounded", "seed": 9}), {"Content-Type": "application/json"})
        self.assertEqual((status, result["mode"], result["seed"]), (200, "bounded", 9))
        self.assertEqual(self.request("POST", "/api/compile", json.dumps({"source": "scalar x=7;", "seed": 0}), {"Content-Type": "application/json"})[0], 400)

    def test_invalid_json_type_and_content_type(self):
        for body, headers, expected in [("{", {"Content-Type": "application/json"}, 400), ("[]", {"Content-Type": "application/json"}, 400), ("{}", {}, 415)]:
            with self.subTest(body=body, headers=headers):
                self.assertEqual(self.request("POST", "/api/compile", body, headers)[0], expected)

    def test_foreign_host_and_origin(self):
        self.assertEqual(self.request("GET", "/api/health", headers={"Host": "example.com"})[0], 403)
        self.assertEqual(self.request("POST", "/api/compile", "{}", {"Content-Type": "application/json", "Origin": "https://example.com"})[0], 403)

    def test_oversized_request_and_missing_endpoint(self):
        self.assertEqual(self.request("POST", "/api/compile", headers={"Content-Type": "application/json", "Content-Length": "9999999"})[0], 413)
        self.assertEqual(self.request("POST", "/api/other", "{}", {"Content-Type": "application/json"})[0], 404)

    def test_busy_compiler_has_recoverable_response(self):
        self.server.compile_slots.acquire()
        self.server.compile_slots.acquire()
        try:
            status, result = self.request("POST", "/api/compile", "{}", {"Content-Type": "application/json"})
            self.assertEqual(status, 429)
            self.assertIn("busy", result["error"])
        finally:
            self.server.compile_slots.release()
            self.server.compile_slots.release()

    def test_missing_binary(self):
        with patch.object(demo, "binary_path", side_effect=demo.DemoError("Compiler unavailable", 503)):
            self.assertEqual(self.request("GET", "/api/health")[0], 503)


if __name__ == "__main__":
    unittest.main()
