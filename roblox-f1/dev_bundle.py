"""Solo para desarrollo: genera bundle.json con todos los scripts para cargarlos en Studio por HTTP local.
Uso: python dev_bundle.py <carpeta_de_salida>
"""
import json
import os
import sys

out_dir = sys.argv[1]
root = os.path.dirname(os.path.abspath(__file__))


def read(*parts):
    with open(os.path.join(root, "src", *parts), encoding="utf-8") as f:
        return f.read().replace("\r\n", "\n")


bundle = {
    "main": read("server", "Main.server.lua"),
    "server": [{"name": n, "source": read("server", n + ".lua")} for n in ("Race", "Net")],
    "shared": [{"name": n, "source": read("shared", n + ".lua")} for n in ("Config", "Path", "CarBuilder")],
    "client": read("client", "ClientMain.client.lua"),
    "trackBuilder": read("build", "TrackBuilder.lua"),
}
with open(os.path.join(out_dir, "bundle.json"), "w", encoding="utf-8") as f:
    json.dump(bundle, f)
print("bundle ok")
