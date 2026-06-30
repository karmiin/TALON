# Aggiungere e rimuovere tool in TALON

TALON usa due livelli di manifest.

Il primo e il manifest frontend:

```txt
static/tools/manifest.json
```

Serve al browser per caricare le viste della single page application.

Il secondo e il catalogo backend:

```txt
talon/modules/builtin.json
```

Serve al server per sapere quali tool, analisi, parser, integrazioni e stili di report esistono. Questo catalogo alimenta la dashboard, la pipeline e la pagina moduli.

I due manifest sono collegati dal campo `view`: se nel catalogo backend un tool dichiara `"ui": {"view": "legal"}`, allora deve esistere una vista frontend con id `legal` registrata in `static/tools/manifest.json`.

## Struttura di un tool frontend

Un tool con interfaccia propria di solito ha due file:

```txt
static/tools/<nome>.html
static/js/tools/<nome>.js
```

Esempio:

```txt
static/tools/diff.html
static/js/tools/diff.js
```

La vista HTML deve avere un id nella forma:

```html
<section class="app-view" id="view-my-tool">
  ...
</section>
```

Il valore dopo `view-` e l'id della vista. In questo esempio e `my-tool`.

Il modulo JavaScript deve esportare `init(ctx)`:

```js
export function init(ctx) {
  ctx.$("#run-my-tool")?.addEventListener("click", async () => {
    const ids = ctx.selectedIds("[data-my-tool-id]");
    const payload = await ctx.api("/api/my-tool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    ctx.$("#my-tool-results").innerHTML = ctx.escapeHtml(JSON.stringify(payload));
  });
}
```

## Registrare la vista frontend

Aggiungere una voce in `static/tools/manifest.json`:

```json
{
  "id": "my-tool",
  "view": "/tools/my-tool.html",
  "module": "/js/tools/my-tool.js"
}
```

`module` e opzionale. Se la pagina e solo HTML statico, si puo omettere.

L'id deve coincidere con:

- `view-my-tool` nel file HTML.
- `ui.view` nel catalogo backend, se il tool deve apparire nella dashboard.

## Registrare il tool nel catalogo backend

Aggiungere una voce in `talon/modules/builtin.json`, dentro l'array `modules`:

```json
{
  "id": "tool_my_tool",
  "label": "Nome visibile",
  "category": "tool",
  "status": "active",
  "description": "Descrizione breve del tool.",
  "outputs": ["output principale"],
  "ui": {
    "view": "my-tool",
    "icon": "06"
  },
  "order": 60
}
```

Con `category: "tool"` il modulo appare come tool apribile dalla dashboard.

Il campo `ui.view` deve puntare alla vista caricata dal manifest frontend. Se la vista non esiste, TALON puo mostrare una scheda generica, ma non il tool operativo.

## Categorie del catalogo backend

`tool`: tool apribile dalla dashboard, di solito con pagina dedicata.

`analysis`: modulo selezionabile nella pipeline report.

`parser`: parser o livello linguistico selezionabile dai menu parser.

`integration`: integrazione esterna o servizio collegato alla pipeline.

`report_style`: stile disponibile nel menu "Stile report".

`pipeline`: voce descrittiva del metodo. Non esegue codice, serve a documentare le fasi.

Ogni voce deve avere almeno:

```json
{
  "id": "id_unico",
  "label": "Etichetta",
  "category": "tool",
  "status": "active",
  "description": "Descrizione"
}
```

Campi utili:

- `inputs`: lista degli input richiesti.
- `outputs`: lista degli output prodotti.
- `notes`: note operative o limiti del modulo.
- `references`: fonti o documentazione esterna.
- `ui`: configurazione della UI.
- `runtime`: configurazione di esecuzione automatica da manifest.
- `order`: posizione di ordinamento.

## Moduli pipeline con runtime da manifest

Per un modulo `analysis` o `integration`, il catalogo puo dichiarare anche un runtime.

Runtime statico:

```json
{
  "id": "my_static_analysis",
  "label": "Analisi statica",
  "category": "analysis",
  "status": "active",
  "description": "Modulo dichiarativo.",
  "runtime": {
    "kind": "static",
    "status": "ok",
    "message": "Modulo eseguito dal manifest.",
    "result": {
      "value": "output dimostrativo"
    }
  },
  "order": 90
}
```

Runtime HTTP JSON:

```json
{
  "id": "my_http_analysis",
  "label": "Analisi esterna",
  "category": "analysis",
  "status": "active",
  "description": "Chiama un servizio locale.",
  "runtime": {
    "kind": "http_json",
    "url": "http://127.0.0.1:9000/analyze",
    "method": "POST",
    "include_text": true,
    "timeout_seconds": 20,
    "min_documents": 1
  },
  "order": 95
}
```

Per sicurezza, `http_json` accetta solo URL locali (`localhost`, `127.0.0.1`, `::1`) a meno che non venga dichiarato:

```json
"allow_remote": true
```

Il payload inviato al servizio esterno contiene:

- dati del modulo.
- documenti selezionati.
- profilo di normalizzazione.
- parser scelto.
- stile report.
- termini configurati.
- parametri della pipeline.

Se `include_text` e `true`, vengono inviati anche i testi normalizzati.

## Moduli backend con codice Python

Per un'analisi integrata direttamente nel server, il solo manifest non basta. Serve anche un runner Python.

Passi minimi:

1. Aggiungere la voce `analysis` in `talon/modules/builtin.json`.
2. Implementare la funzione Python, preferibilmente in un file dentro `talon/`.
3. Collegare la funzione in `runtime_module_catalog()` dentro `app.py` con `ModuleRunner`.
4. Se serve una API dedicata per il tool frontend, aggiungere la route in `app.py`.
5. Se serve una UI dedicata, aggiungere `static/tools/<nome>.html`, `static/js/tools/<nome>.js` e la voce in `static/tools/manifest.json`.

Esempio concettuale:

```python
def run_my_analysis_module(context: PipelineContext) -> dict[str, Any]:
    return {
        "status": "ok",
        "result": {
            "documents": len(context.rows)
        }
    }
```

Poi nel dizionario `runners`:

```python
"my_analysis": ModuleRunner("my_analysis", run_my_analysis_module)
```

L'id del runner deve coincidere con l'id dichiarato nel manifest backend.

## Parser

I parser sono dichiarati nel catalogo backend con `category: "parser"`, ma l'esecuzione reale e in:

```txt
talon/parsers.py
```

Per aggiungere un parser:

1. Aggiungere la voce parser in `talon/modules/builtin.json`.
2. Aggiornare `parser_statuses()` per indicare se il parser e disponibile.
3. Aggiornare `run_parser()` per eseguire il parser.
4. Restituire CoNLL-U quando possibile, cosi gli altri moduli possono leggere lemmi e morfologia.

LatinCy funziona tramite spaCy e modello `la_core_web_*`. Il modello preferito puo essere scelto con:

```txt
TALON_LATINCY_MODEL
```

## Rimuovere un tool

Per rimuovere un tool dalla UI:

1. Rimuovere o disattivare la voce `category: "tool"` in `talon/modules/builtin.json`.
2. Rimuovere la voce corrispondente da `static/tools/manifest.json` se la vista non deve piu essere caricata.
3. Eliminare i file `static/tools/<nome>.html` e `static/js/tools/<nome>.js` se non sono piu usati.
4. Se il tool aveva una voce fissa nella barra laterale in `static/index.html`, rimuovere anche quel pulsante.

Per rimuovere un modulo dalla pipeline:

1. Rimuovere o disattivare la voce `category: "analysis"` o `category: "integration"` dal catalogo backend.
2. Se aveva un runner Python, rimuoverlo dal dizionario `runners` in `app.py`.
3. Se aveva API dedicate, rimuovere le route non piu usate.

## Manifest esterni

Oltre a `talon/modules/builtin.json`, TALON puo leggere manifest JSON da cartelle esterne tramite:

```powershell
$env:TALON_MODULE_PATH="C:\percorso\moduli"
```

Ogni file `.json` in quella cartella viene letto come manifest. Il formato puo essere:

```json
{
  "modules": [
    {
      "id": "external_tool",
      "label": "Tool esterno",
      "category": "tool",
      "status": "active",
      "description": "Tool caricato da manifest esterno."
    }
  ]
}
```

Gli id devono essere unici. Se due manifest dichiarano lo stesso id, il duplicato viene ignorato e compare un errore nel catalogo moduli.

## Helper disponibili nei tool JavaScript

`init(ctx)` riceve helper condivisi:

```txt
ctx.$
ctx.$$
ctx.api
ctx.toast
ctx.escapeHtml
ctx.formatNumber
ctx.setView
ctx.loadDocuments
ctx.loadRuns
ctx.renderDocumentChecklist
ctx.selectedIds
ctx.selectedFullDocuments
ctx.selectedProfile
ctx.renderAnnotatedText
ctx.annotationToneClass
ctx.state
```

Hook disponibili:

```txt
ctx.onDocumentsChanged
ctx.onModulesChanged
ctx.onParserStatusChanged
ctx.onImporterStatusChanged
ctx.onAuditChanged
ctx.onRunsChanged
```

Usare questi hook quando un tool deve aggiornarsi dopo import, cambio parser o nuovo run.

## Controlli dopo una modifica

Dopo aver aggiunto o rimosso un tool:

```powershell
python -m unittest -q
node --check static\app.js
```

Per i moduli JavaScript nuovi:

```powershell
node --check static\js\tools\<nome>.js
```

Poi riavviare il server:

```powershell
python app.py --host 127.0.0.1 --port 8000
```
