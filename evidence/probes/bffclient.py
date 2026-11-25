"""Small cookie + CSRF aware HTTP client used by the assessment probes.

It behaves like the browser UI: logs in through the BFF (cookies), fetches the CSRF
token and sends it back as X-XSRF-TOKEN on state-changing calls.  Standard library only.
"""
import http.cookiejar
import json
import urllib.error
import urllib.parse
import urllib.request

BFF = "http://localhost:8090"
CLAIMS = "http://localhost:8080"
KEYCLOAK_TOKEN_URL = "http://localhost:8180/realms/demo-app/protocol/openid-connect/token"


def keycloak_token(email: str, password: str) -> str:
    """Direct-grant token, used to call claims-service the way the BFF would."""
    form = urllib.parse.urlencode(
        {"username": email, "password": password, "grant_type": "password", "client_id": "demo-app-ui"}
    ).encode()
    response = urllib.request.urlopen(urllib.request.Request(KEYCLOAK_TOKEN_URL, data=form))
    return json.load(response)["access_token"]


def bearer_call(method: str, path: str, token: str, body=None, base: str = CLAIMS):
    """Call a service with a raw Bearer token (no cookies / CSRF)."""
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    try:
        response = urllib.request.urlopen(request)
        return response.status, response.read().decode()
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode()


class BffSession:
    def __init__(self, email: str, password: str):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        status, body = self.request("POST", "/api/auth/login", {"email": email, "password": password}, csrf=False)
        assert status == 200, f"login failed for {email}: {status} {body}"
        self.user = json.loads(body)
        self.request("GET", "/api/auth/csrf", csrf=False)

    def cookie(self, name: str):
        return next((c.value for c in self.jar if c.name == name), None)

    def request(self, method: str, path: str, body=None, csrf: bool = True, base: str = BFF):
        headers = {"Content-Type": "application/json"}
        if csrf and self.cookie("XSRF-TOKEN"):
            headers["X-XSRF-TOKEN"] = self.cookie("XSRF-TOKEN")
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(base + path, data=data, headers=headers, method=method)
        try:
            response = self.opener.open(request)
            return response.status, response.read().decode()
        except urllib.error.HTTPError as error:
            return error.code, error.read().decode()
