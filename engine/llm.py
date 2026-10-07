"""Provider-neutral LLM port. The model only ever returns anchor ids, quotes and labels; never numbers we use."""
import hashlib
import json
import os
import re
import time
from pathlib import Path

import yaml
from openai import OpenAI
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

ROOT = Path(__file__).parent.parent
CACHE = ROOT / ".cache" / "llm"


def load_env():
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def providers(only: list[str] | None = None):
    ps = yaml.safe_load((ROOT / "providers.yaml").read_text())["providers"]
    return [p for p in ps if only is None or p["name"] in only]


class LLMError(Exception):
    pass


def _transient(e):
    s = str(e).lower()
    return any(k in s for k in ("429", "rate", "timeout", "500", "502", "503", "overloaded", "connection"))


class Port:
    def __init__(self, only: list[str] | None = None, cache: bool = True):
        load_env()
        self.providers = providers(only)
        self.cache = cache
        self.calls = []        # one record per real (non-cached) call, for the cost ledger

    def _client(self, p):
        key = os.environ.get(p["key_env"]) if p.get("key_env") else "ollama"
        return OpenAI(base_url=p["base_url"], api_key=key, timeout=p.get("timeout", 180), max_retries=0)

    @retry(retry=retry_if_exception(_transient), stop=stop_after_attempt(7), wait=wait_exponential(min=8, max=70), reraise=True)
    def _call(self, p, messages):
        kw = {"response_format": {"type": "json_object"}} if p.get("json_mode") else {}
        kw |= p.get("extra", {})
        t0 = time.time()
        r = self._client(p).chat.completions.create(model=p["model"], messages=messages, temperature=0, **kw)
        u = r.usage
        return r.choices[0].message.content or "", {
            "provider": p["name"], "model": p["model"], "latency_ms": int((time.time() - t0) * 1000),
            "tokens_in": getattr(u, "prompt_tokens", None), "tokens_out": getattr(u, "completion_tokens", None)}

    def ask(self, task: str, prompt_v: str, system: str, user: str, validate) -> dict:
        """Ask for JSON, validate it, repair once, fall back across providers. Returns parsed + stamp."""
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        errors = []
        for p in self.providers:
            key = hashlib.sha256(json.dumps([p["name"], p["model"], prompt_v, messages]).encode()).hexdigest()[:24]
            cached = CACHE / f"{key}.json"
            if self.cache and cached.exists():
                return json.loads(cached.read_text(encoding="utf-8")) | {"cached": True}
            try:
                raw, stamp = self._call(p, messages)
                self.calls.append(stamp | {"task": task})
                data, problems = self._check(raw, validate)
                if problems:
                    fix = messages + [{"role": "assistant", "content": raw},
                                      {"role": "user", "content": "Your answer had these problems:\n- " + "\n- ".join(problems)
                                       + "\nReturn the corrected JSON only."}]
                    raw, stamp2 = self._call(p, fix)
                    self.calls.append(stamp2 | {"task": task + ":repair"})
                    data, problems = self._check(raw, validate)
                    stamp = stamp | {"repaired": True}
                out = {"data": data, "problems": problems, "raw": raw, "by": stamp | {"prompt_v": prompt_v}}
                if self.cache:
                    CACHE.mkdir(parents=True, exist_ok=True)
                    cached.write_text(json.dumps(out), encoding="utf-8")
                return out
            except Exception as e:  # provider down or exhausted: fall through to the next one
                errors.append(f"{p['name']}: {str(e)[:160]}")
        raise LLMError("; ".join(errors))

    @staticmethod
    def _check(raw, validate):
        m = re.search(r"\{.*\}", raw, re.S)
        if not m:
            return None, ["no JSON object found"]
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError as e:
            return None, [f"invalid JSON: {e}"]
        return data, validate(data)


if __name__ == "__main__":
    port = Port(cache=False)
    for p in port.providers:
        one = Port(only=[p["name"]], cache=False)
        try:
            out = one.ask("smoke", "smoke-1", "Reply with JSON only.", 'Return {"ok": true, "word": "anchor"}.',
                          lambda d: [] if d.get("ok") is True else ["ok must be true"])
            print(f"{p['name']:<22} ok  {out['by']['latency_ms']}ms  {out['data']}")
        except LLMError as e:
            print(f"{p['name']:<22} FAIL {str(e)[:150]}")
