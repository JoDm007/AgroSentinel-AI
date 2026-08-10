"""
AgroSentinel AI - Serveur HTTPS local (démo smartphone sans internet).

POURQUOI CE SCRIPT
Les navigateurs mobiles n'autorisent l'accès à la caméra que dans un
"contexte sécurisé". Une adresse http://192.168.x.x:3000 est donc REFUSÉE,
alors que https:// fonctionne. Ce script sert l'application en HTTPS avec un
certificat auto-signé régénéré à chaque lancement pour couvrir l'adresse IP
courante de la machine.

LIMITE IMPORTANTE
Un certificat auto-signé déclenche un avertissement de sécurité sur le
téléphone (à accepter une fois), et Chrome REFUSE d'enregistrer un service
worker sur une origine dont le certificat n'est pas approuvé : le mode hors
ligne ne fonctionnera donc pas ici. C'est une solution de SECOURS pour la
caméra. Pour une démo complète (caméra + hors ligne + installation PWA),
préférez GitHub Pages, qui fournit un vrai certificat.

USAGE
    python tools/serve-https.py          # port 8443 par défaut
    python tools/serve-https.py 9443
"""

import http.server
import os
import pathlib
import shutil
import socket
import ssl
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CERT_DIR = ROOT / ".certs"
CERT = CERT_DIR / "dev-cert.pem"
KEY = CERT_DIR / "dev-key.pem"


def find_openssl():
    found = shutil.which("openssl")
    if found:
        return found
    candidates = [
        r"C:\Program Files\Git\usr\bin\openssl.exe",
        r"C:\Program Files\Git\mingw64\bin\openssl.exe",
        r"C:\Program Files (x86)\Git\usr\bin\openssl.exe",
    ]
    return next((c for c in candidates if os.path.exists(c)), None)


def local_ips():
    ips = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except socket.gaierror:
        pass
    # Adresse réellement utilisée pour sortir sur le réseau local
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("8.8.8.8", 80))
        ips.add(probe.getsockname()[0])
    except OSError:
        pass
    finally:
        probe.close()
    ips.discard("127.0.0.1")
    return sorted(ips)


def make_cert(ips):
    openssl = find_openssl()
    if not openssl:
        sys.exit("openssl introuvable. Installez Git for Windows ou ajoutez openssl au PATH.")

    CERT_DIR.mkdir(exist_ok=True)
    sans = ["DNS:localhost", "IP:127.0.0.1"] + [f"IP:{ip}" for ip in ips]

    subprocess.run([
        openssl, "req", "-x509", "-newkey", "rsa:2048", "-nodes",
        "-keyout", str(KEY), "-out", str(CERT),
        "-days", "30", "-subj", "/CN=AgroSentinel AI (dev)",
        "-addext", "subjectAltName=" + ",".join(sans),
    ], check=True, capture_output=True)

    print(f"Certificat auto-signé généré pour : {', '.join(sans)}")


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8443
    ips = local_ips()

    # Régénéré à chaque lancement : l'IP change en changeant de réseau wifi.
    make_cert(ips)

    os.chdir(ROOT)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=CERT, keyfile=KEY)

    server = http.server.ThreadingHTTPServer(
        ("0.0.0.0", port), http.server.SimpleHTTPRequestHandler)
    server.socket = context.wrap_socket(server.socket, server_side=True)

    print("\n  AgroSentinel AI — serveur HTTPS local")
    print("  " + "-" * 46)
    print(f"  Sur cet ordinateur : https://localhost:{port}")
    for ip in ips:
        print(f"  Sur le smartphone  : https://{ip}:{port}")
    print("  " + "-" * 46)
    print("  Le téléphone doit être sur le MÊME wifi (ou le partage de")
    print("  connexion de ce PC). Acceptez l'avertissement de sécurité.")
    print("  Ctrl+C pour arrêter.\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServeur arrêté.")


if __name__ == "__main__":
    main()
