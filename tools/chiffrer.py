"""Chiffre les données privées du site (chronos exacts, liens Strava, photos).

Usage (depuis le dossier du site) :
    pip install cryptography
    python tools/chiffrer.py <dossier-source-prive> .

<dossier-source-prive> contient prive.json et le dossier photos/ d'origine.
Ce dossier ne doit JAMAIS être poussé sur GitHub : garde-le sur ton ordinateur.
Le script demande le mot de passe, puis écrit data/prive.json et photos/*.bin dans le site.
Relancer le script (par exemple avec un nouveau mot de passe) remplace les anciens fichiers chiffrés.
"""
import base64, getpass, hashlib, json, os, secrets, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ITER = 600_000
src, site = sys.argv[1], sys.argv[2]
pw = getpass.getpass("Mot de passe : ")
if len(pw) < 12:
    sys.exit("Choisis un mot de passe d'au moins 12 caractères (une phrase de quelques mots, par exemple).")
if getpass.getpass("Confirme le mot de passe : ") != pw:
    sys.exit("Les deux mots de passe sont différents.")

salt = secrets.token_bytes(16)
key = hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt, ITER, 32)
aes = AESGCM(key)
data = json.load(open(os.path.join(src, "prive.json"), encoding="utf-8"))

out = os.path.join(site, "photos")
os.makedirs(out, exist_ok=True)
for f in os.listdir(out):
    if f.endswith(".bin"):
        os.remove(os.path.join(out, f))

fichiers = {}
for c in data["courses"].values():
    for p in c.get("photos") or []:
        for k in ("src", "min"):
            with open(os.path.join(src, p[k]), "rb") as fh:
                raw = fh.read()
            iv = secrets.token_bytes(12)
            name = "photos/" + secrets.token_hex(8) + ".bin"
            with open(os.path.join(site, name), "wb") as fh:
                fh.write(iv + aes.encrypt(iv, raw, None))
            fichiers[p[k]] = name
data["fichiers"] = fichiers

iv = secrets.token_bytes(12)
ct = aes.encrypt(iv, json.dumps(data, ensure_ascii=False).encode("utf-8"), None)
b = lambda x: base64.b64encode(x).decode()
with open(os.path.join(site, "data", "prive.json"), "w") as fh:
    json.dump({"v": 1, "iter": ITER, "salt": b(salt), "iv": b(iv), "ct": b(ct)}, fh)
print(f"OK : {len(fichiers)} photos chiffrées, data/prive.json écrit.")
