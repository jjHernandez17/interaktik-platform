"""Empaqueta los scripts de src/ en un unico archivo PeleaCallejera.rbxmx para insertarlo en Roblox Studio.

Estructura resultante (un solo objeto):
  Script "PeleaCallejera"            <- src/server/Main.server.lua
    ModuleScript Config, Util, ...   <- el resto de src/server/*.lua
    LocalScript "Client"             <- src/client/ClientMain.client.lua (Main lo copia a StarterPlayerScripts)
      ModuleScript Poses, Animator, Fx, CameraRig, Hud

Uso:  python build_rbxmx.py [ruta_salida]
"""

import sys
import uuid
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent
SERVER = ROOT / "src" / "server"
CLIENT = ROOT / "src" / "client"
DEFAULT_OUT = ROOT.parent / "frontend" / "downloads" / "PeleaCallejera.rbxmx"


def referent():
    return "RBX" + uuid.uuid4().hex.upper()


def read(path):
    return path.read_text(encoding="utf-8").replace("\r\n", "\n")


def cdata(text):
    # un CDATA no puede contener "]]>"
    return "<![CDATA[" + text.replace("]]>", "]]]]><![CDATA[>") + "]]>"


def item(class_name, name, source, children=(), extra=""):
    parts = [
        f'<Item class="{class_name}" referent="{referent()}">',
        "<Properties>",
        f'<string name="Name">{escape(name)}</string>',
        extra,
        f'<ProtectedString name="Source">{cdata(source)}</ProtectedString>',
        "</Properties>",
        *children,
        "</Item>",
    ]
    return "\n".join(parts)


def module(path):
    return item("ModuleScript", path.stem, read(path))


def build():
    server_modules = [
        module(p) for p in sorted(SERVER.glob("*.lua")) if not p.name.endswith(".server.lua")
    ]

    client_modules = [
        module(p) for p in sorted(CLIENT.glob("*.lua")) if not p.name.endswith(".client.lua")
    ]
    client = item(
        "LocalScript",
        "Client",
        read(CLIENT / "ClientMain.client.lua"),
        client_modules,
        '<token name="RunContext">0</token>',
    )

    main = item(
        "Script",
        "PeleaCallejera",
        read(SERVER / "Main.server.lua"),
        server_modules + [client],
        '<token name="RunContext">0</token>',
    )

    return '<roblox version="4">\n' + main + "\n</roblox>\n"


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(build(), encoding="utf-8")
    print(f"Generado {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
