"""Exploratory probes backing docs in evidence/. Run against the live docker-compose stack:

    python -I evidence/probes/assessment_probes.py

Each section writes its raw transcript to evidence/probes/output/<section>.txt.
These probes are read-mostly exploration (they do create a few throw-away claims/users);
they are NOT the automated regression suite.
"""
import json
import os
import sys
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bffclient import BFF, CLAIMS, BffSession, bearer_call, keycloak_token  # noqa: E402

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

VALID_CLAIM = {
    "incidentDate": "2026-01-10",
    "incidentLocation": "Probe Street 1",
    "description": "Probe claim for assessment",
    "claimAmount": 100,
}


@contextmanager
def section(name: str, title: str):
    path = os.path.join(OUTPUT_DIR, f"{name}.txt")
    lines = [f"# {title}", ""]
    yield lines
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")
    print("\n".join(lines))


def record(lines, label, result, limit=230):
    status, body = result
    body = " ".join(body.split())
    lines.append(f"{label}\n    -> HTTP {status}  {body[:limit]}")


def raw_get(url):
    try:
        response = urllib.request.urlopen(url)
        return response.status, response.read().decode()
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode()


def run_actuator_section():
    """Read-only checks plus ONE reversible write (log level), which is restored afterwards."""
    with section("01-actuator", "Unauthenticated access to Spring Boot Actuator (no token sent)") as out:
        for service, base in (("claims-service", CLAIMS), ("bff-service", BFF)):
            for endpoint in ("env", "beans", "mappings", "loggers/ROOT", "metrics"):
                status, body = raw_get(f"{base}/actuator/{endpoint}")
                out.append(f"GET {service} /actuator/{endpoint}  ->  HTTP {status}, {len(body):,} bytes")
        out.append("")
        out.append("Write access (claims-service, no token): change ROOT log level, read it back, then restore it")
        url = f"{CLAIMS}/actuator/loggers/ROOT"
        original = json.loads(raw_get(url)[1]).get("configuredLevel")
        def set_level(level):
            request = urllib.request.Request(url, data=json.dumps({"configuredLevel": level}).encode(),
                                             headers={"Content-Type": "application/json"}, method="POST")
            try:
                return urllib.request.urlopen(request).status
            except urllib.error.HTTPError as error:
                return error.code
        changed = set_level("TRACE")
        now = json.loads(raw_get(url)[1]).get("configuredLevel")
        restored = set_level(original)
        out.append(f"POST configuredLevel=TRACE -> HTTP {changed}; read back configuredLevel={now}")
        out.append(f"POST configuredLevel={original} (restore) -> HTTP {restored}")


def main():
    admin = BffSession("admin@demo.com", "Admin123!")
    claimant = BffSession("claimant@demo.com", "Claimant123!")
    admin_token = keycloak_token("admin@demo.com", "Admin123!")
    claimant_token = keycloak_token("claimant@demo.com", "Claimant123!")

    run_actuator_section()

    with section("02-claims-service-rbac", "claims-service called directly with a CLAIMANT token") as out:
        record(out, "GET /api/admin/claims            (admin-only)", bearer_call("GET", "/api/admin/claims", claimant_token))
        record(out, "GET /api/admin/dashboard/stats   (admin-only)", bearer_call("GET", "/api/admin/dashboard/stats", claimant_token))
        record(out, "GET /api/users                   (admin-only)", bearer_call("GET", "/api/users", claimant_token), 330)
        record(out, "GET /api/users/{adminId}         (no role check)", bearer_call("GET", f"/api/users/{admin.user['userId']}", claimant_token))
        new_id = str(uuid.uuid4())
        record(out, "POST /api/users role=ADMIN       (no role check)", bearer_call("POST", "/api/users", claimant_token,
               {"userId": new_id, "email": f"qa-probe-{new_id[:6]}@example.com", "name": "QA Probe", "role": "ADMIN"}))
        out.append("")
        out.append("Same admin endpoints through the BFF with the CLAIMANT cookie session (URL rule applies):")
        record(out, "GET BFF /api/admin/claims", claimant.request("GET", "/api/admin/claims"))
        record(out, "GET BFF /api/admin/dashboard/stats", claimant.request("GET", "/api/admin/dashboard/stats"))

    with section("03-bff-error-mapping", "Error mapping through the BFF (what a client actually sees)") as out:
        created = claimant.request("POST", "/api/claims", VALID_CLAIM)
        claim_id = json.loads(created[1])["claimId"]
        record(out, "POST valid claim", created, 90)
        record(out, "POST incidentDate in the future (domain rule)", claimant.request("POST", "/api/claims", {**VALID_CLAIM, "incidentDate": "2099-01-01"}))
        record(out, "POST description padded with spaces to >=10 chars", claimant.request("POST", "/api/claims", {**VALID_CLAIM, "description": "          short   "}))
        record(out, "POST claimAmount 1000000.01 (DTO rule)", claimant.request("POST", "/api/claims", {**VALID_CLAIM, "claimAmount": 1000000.01}))
        record(out, "GET unknown claim id (expect 404)", claimant.request("GET", f"/api/claims/{uuid.uuid4()}"))
        record(out, "GET another user's claim as admin (expect 403)", admin.request("GET", f"/api/claims/{claim_id}"))
        record(out, "POST without CSRF header", claimant.request("POST", "/api/claims", VALID_CLAIM, csrf=False))
        out.append("")
        out.append("Same defects directly on claims-service (the source of the BFF 500s):")
        record(out, "GET unknown claim", bearer_call("GET", f"/api/claims/{uuid.uuid4()}", claimant_token))
        record(out, "GET another user's claim", bearer_call("GET", f"/api/claims/{claim_id}", admin_token))

    with section("04-status-transitions", "Claim status state machine, exercised through the BFF as ADMIN") as out:
        created = claimant.request("POST", "/api/claims", VALID_CLAIM)
        claim_id = json.loads(created[1])["claimId"]
        path = f"/api/admin/claims/{claim_id}/status"
        steps = [
            ("SUBMITTED   -> APPROVED  (illegal)", "APPROVED"),
            ("SUBMITTED   -> CLOSED    (illegal)", "CLOSED"),
            ("SUBMITTED   -> UNDER_REVIEW", "UNDER_REVIEW"),
            ("UNDER_REVIEW-> SUBMITTED (backwards, allowed)", "SUBMITTED"),
            ("SUBMITTED   -> UNDER_REVIEW", "UNDER_REVIEW"),
            ("UNDER_REVIEW-> APPROVED", "APPROVED"),
            ("APPROVED    -> REJECTED  (illegal)", "REJECTED"),
            ("APPROVED    -> CLOSED", "CLOSED"),
            ("CLOSED      -> SUBMITTED (illegal)", "SUBMITTED"),
        ]
        for label, target in steps:
            status, body = admin.request("PATCH", path, {"newStatus": target})
            shown = json.loads(body).get("status") if status == 200 else body[:90]
            out.append(f"{label:<48} -> HTTP {status}  {shown}")
        out.append("")
        record(out, "claims-service direct: SUBMITTED -> APPROVED on a fresh claim (illegal)",
               bearer_call("PATCH", f"/api/admin/claims/{json.loads(claimant.request('POST', '/api/claims', VALID_CLAIM)[1])['claimId']}/status",
                           admin_token, {"newStatus": "APPROVED"}))

    with section("05-dashboard-cache", "Dashboard stats: three identical calls inside the 300 s cache TTL") as out:
        for attempt in range(1, 4):
            status, body = admin.request("GET", "/api/admin/dashboard/stats")
            parsed = json.loads(body)
            out.append(f"call {attempt}: HTTP {status}  cacheHit={parsed['cacheHit']}  queryTimeMs={parsed['queryTimeMs']}")
        out.append("")
        out.append("Expected: call 1 cacheHit=false, calls 2-3 cacheHit=true.")

    with section("06-concurrent-identity", "40 concurrent claim submissions via the BFF from two different users") as out:
        sessions = {"claimant": claimant, "admin": admin}
        jobs = [(name, i) for i in range(20) for name in sessions]

        def submit(job):
            name, index = job
            session = sessions[name]
            status, body = session.request("POST", "/api/claims", {**VALID_CLAIM, "description": f"Concurrency probe {name} #{index}"})
            owner = json.loads(body).get("userId") if status == 201 else None
            return name, status, owner

        with ThreadPoolExecutor(max_workers=16) as pool:
            results = list(pool.map(submit, jobs))
        mismatches = [r for r in results if r[1] == 201 and r[2] != sessions[r[0]].user["userId"]]
        failures = [r for r in results if r[1] != 201]
        out.append(f"requests={len(results)}  created={sum(1 for r in results if r[1] == 201)}  non-201={len(failures)}")
        out.append(f"claims stored under the WRONG owner (userId != submitting session): {len(mismatches)}")
        for name, status, owner in mismatches[:5]:
            out.append(f"   submitted by {name} ({sessions[name].user['userId']}) but stored for {owner}")


if __name__ == "__main__":
    main()
