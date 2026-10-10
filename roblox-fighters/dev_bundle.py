"""Solo para desarrollo: genera bundle.json con todos los scripts para cargarlos en Studio por HTTP local.
Uso: python dev_bundle.py <carpeta_de_salida>
"""
import glob
import json
import os
import sys

out_dir = sys.argv[1]
os.chdir(os.path.dirname(os.path.abspath(__file__)))


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read().replace("\r\n", "\n")


def modules(folder, skip):
    result = []
    for path in sorted(glob.glob(f"src/{folder}/*.lua")):
        name = os.path.basename(path)
        if name.endswith(skip):
            continue
        result.append({"name": name[:-4], "source": read(path)})
    return result


bundle = {
    "main": read("src/server/Main.server.lua"),
    "server": modules("server", ".server.lua"),
    "clientMain": read("src/client/ClientMain.client.lua"),
    "client": modules("client", ".client.lua"),
}
with open(os.path.join(out_dir, "bundle.json"), "w", encoding="utf-8") as f:
    json.dump(bundle, f)
print("bundle ok")
