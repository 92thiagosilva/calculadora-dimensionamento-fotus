"""Monta a pagina unica do artefato: junta CSS + motor + app e embute data.json.

Saidas em artifact/dist/: page.html (o que se publica; a plataforma adiciona o
esqueleto <html>) e test.html (versao com esqueleto, para abrir localmente).
Uso: python artifact/build.py
"""
import json, pathlib, sys
here = pathlib.Path(__file__).resolve().parent
data = json.loads((here / "data.json").read_text(encoding="utf-8"))
payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\u003c").replace("\u2028", "\u2028").replace("\u2029", "\u2029")
css = (here / "src" / "app.css").read_text(encoding="utf-8")
engine = (here / "src" / "engine.js").read_text(encoding="utf-8")
app = (here / "src" / "app.js").read_text(encoding="utf-8")
assert "</script" not in engine.lower() and "</script" not in app.lower()
body = f"""<title>Calculadora de Dimensionamento Fotus</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap">
<style>
{css}
</style>
<div class="app" id="app"></div>
<noscript>Esta calculadora precisa de JavaScript para funcionar.</noscript>
<script id="fotus-data" type="application/json">{payload}</script>
<script>
{engine}
</script>
<script>
{app}
</script>
"""
dist = here / "dist"
dist.mkdir(exist_ok=True)
(dist / "page.html").write_text(body, encoding="utf-8")
# versao de teste local: com o esqueleto que a plataforma adiciona na publicacao
test = ('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style></head><body>'
        + body + '</body></html>')
(dist / "test.html").write_text(test, encoding="utf-8")
print("dist/page.html:", len(body.encode("utf-8")) // 1024, "KB")
