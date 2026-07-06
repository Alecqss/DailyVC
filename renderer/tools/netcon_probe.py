"""
Sonde de diagnostic du canal console de CS2 (session 8).

Contexte : -netconport 29000 accepte UNE connexion TCP mais aucune commande
envoyée (texte brut \n, ou length-prefix naïf) n'a d'effet, et zéro octet ne
revient jamais. Or 29000 est AUSSI le port par défaut de VConsole2 (la console
dev de Source 2), qui parle un protocole binaire à chunks (CMND/PRNT/...).

Ce script discrimine toutes les hypothèses en un run. Prérequis : un CS2
lancé manuellement avec `-netconport 31337` (voir docs/sessions.md session 8).

Pour chaque port candidat (31337 = netcon supposé, 29000 = VConsole supposé) :
  1. teste si le port est ouvert
  2. envoie `echo MARK_TEXT_<port>` en texte brut terminé par \n
  3. envoie `echo MARK_VCON_<port>` en paquet VConsole2 CMND :
     b"CMND" + \x00\xD2 + \x00\x00 + u16BE(longueur totale) + \x00\x00 + cmd + \x00
  4. dump (repr) tout ce que le socket renvoie pendant quelques secondes
Puis grep console.log : quel(s) marqueur(s) ont été réellement exécutés.
"""

import socket
import struct
import time

CONSOLE_LOG = "/data/cs2/game/csgo/console.log"
PORTS = [31337, 29000]
READ_WINDOW_S = 4.0


def vconsole_cmnd(cmd: str) -> bytes:
    payload = cmd.encode()
    total_len = len(payload) + 13  # header 12 octets + terminateur nul
    return (
        b"CMND"
        + bytes([0x00, 0xD2, 0x00, 0x00])
        + struct.pack("!h", total_len)
        + bytes([0x00, 0x00])
        + payload
        + b"\x00"
    )


def drain(sock: socket.socket, seconds: float) -> bytes:
    sock.settimeout(0.5)
    buf = b""
    end = time.time() + seconds
    while time.time() < end:
        try:
            data = sock.recv(4096)
            if not data:
                print("   (connexion fermée par le pair)")
                break
            buf += data
        except socket.timeout:
            continue
        except OSError as e:
            print(f"   (erreur socket: {e})")
            break
    return buf


def probe(port: int) -> None:
    print(f"\n===== PORT {port} =====")
    try:
        sock = socket.create_connection(("127.0.0.1", port), timeout=3)
    except OSError as e:
        print(f"❌ fermé / injoignable ({e})")
        return
    print("✅ ouvert — connexion établie")

    greeting = drain(sock, 2.0)
    print(f"→ reçu à la connexion : {len(greeting)} octets  {greeting[:200]!r}")

    text_cmd = f"echo MARK_TEXT_{port}\n".encode()
    print(f"→ envoi texte brut : {text_cmd!r}")
    sock.sendall(text_cmd)
    after_text = drain(sock, READ_WINDOW_S)
    print(f"→ reçu après texte : {len(after_text)} octets  {after_text[:200]!r}")

    vcon_pkt = vconsole_cmnd(f"echo MARK_VCON_{port}")
    print(f"→ envoi paquet VConsole CMND : {vcon_pkt!r}")
    sock.sendall(vcon_pkt)
    after_vcon = drain(sock, READ_WINDOW_S)
    print(f"→ reçu après CMND : {len(after_vcon)} octets  {after_vcon[:300]!r}")

    sock.close()


def main() -> None:
    for port in PORTS:
        probe(port)

    print("\n===== console.log : quels marqueurs exécutés ? =====")
    time.sleep(1.5)
    try:
        content = open(CONSOLE_LOG, errors="replace").read()
    except OSError as e:
        print(f"(console.log illisible : {e})")
        return
    for port in PORTS:
        for kind in ("TEXT", "VCON"):
            marker = f"MARK_{kind}_{port}"
            status = "✅ EXÉCUTÉ" if marker in content else "❌ absent"
            print(f"{marker}: {status}")


if __name__ == "__main__":
    main()
