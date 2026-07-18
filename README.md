# TALON

TALON significa Text Analysis and Latin Organization Network. E una webapp locale per importare, leggere, annotare e analizzare trascrizioni latine, con attenzione a testi storici e documentari.

Il progetto non e pensato come un sistema che decide automaticamente l'interpretazione filologica. Produce indizi controllabili: frequenze, contesti, differenze tra testi, termini giuridici evidenziati, PCA lessicale e report di lavoro.

## Funzioni principali

- Archivio testi: import, lettura, metadati e rimozione controllata di file `.docx`, `.txt`, `.xml`, `.conllu` e PDF testuali.
- Editor: modifica del testo e annotazioni direttamente sulla trascrizione.
- Pipeline report: selezione dei testi, scelta del parser, scelta dei moduli e generazione di report HTML/PDF.
- Lessico e grammatica: conteggi, varieta lessicale, KWIC, collocazioni e analisi morfosintattica delle singole frasi.
- Termini giuridici: famiglie lessicali configurabili e testo completo con occorrenze evidenziate.
- Differenze tra due testi: confronto visuale con sostituzioni, omissioni e aggiunte.
- PCA: mappa PC1/PC2 dei testi, con switch tra lessico/lemmi e function words.
- Voyant: apertura integrata di un workspace Voyant, con export zip come fallback.
- Collatinus: chiamata a Collatinus-web per analisi morfologica e lemmatizzazione.
- Parser linguistici: baseline a forme normalizzate e parser LatinCy opzionale.

## Requisiti

Versione Python consigliata: Python 3.13.x.

Il progetto e stato eseguito e testato localmente con Python 3.13.12. Usare la stessa major/minor riduce problemi con dipendenze e sintassi. Evitare Python molto vecchi: il codice usa type hint moderni e moduli standard recenti.

Dipendenze base dichiarate in `requirements.txt`:

```txt
pypdf>=4.3,<7
pdfminer.six>=20231228
pdfplumber>=0.11
```

Queste servono soprattutto per l'import di PDF testuali. I file `.docx` vengono letti con librerie standard Python, senza dipendenza esterna dedicata.

Dipendenze opzionali ma importanti:

```powershell
python -m pip install "spacy>=3.9,<3.10"
python -m pip install https://huggingface.co/latincy/la_core_web_sm/resolve/main/la_core_web_sm-3.9.5-py3-none-any.whl
```

LatinCy e il parser consigliato per lemmi, POS, morfologia e dipendenze sintattiche. Se non viene installato, TALON resta usabile con il parser "Forme normalizzate", ma non produce vera lemmatizzazione.

Se il link diretto al wheel cambia, aprire la pagina del modello `latincy/la_core_web_sm` su Hugging Face e usare il comando indicato nella sezione "Use in spaCy".

Per forzare il modello LatinCy usato dall'app:

```powershell
$env:TALON_LATINCY_MODEL="la_core_web_sm"
```

In modo persistente su Windows:

```powershell
setx TALON_LATINCY_MODEL la_core_web_sm
```

Il codice prova anche `la_core_web_lg`, `la_core_web_md` e `la_core_web_sm` se la variabile non e impostata.

## Installazione

Da PowerShell, nella cartella del progetto:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Per abilitare LatinCy:

```powershell
python -m pip install "spacy>=3.9,<3.10"
python -m pip install https://huggingface.co/latincy/la_core_web_sm/resolve/main/la_core_web_sm-3.9.5-py3-none-any.whl
$env:TALON_LATINCY_MODEL="la_core_web_sm"
```

Su macOS i comandi sono gli stessi, ma l'attivazione del virtualenv e le variabili d'ambiente cambiano:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install "spacy>=3.9,<3.10"
python -m pip install https://huggingface.co/latincy/la_core_web_sm/resolve/main/la_core_web_sm-3.9.5-py3-none-any.whl
export TALON_LATINCY_MODEL=la_core_web_sm
```

## Avvio

```powershell
python app.py --host 127.0.0.1 --port 8000
```

Su macOS, se `python` non punta a Python 3, usare:

```bash
python3 app.py --host 127.0.0.1 --port 8000
```

Poi aprire:

```txt
http://127.0.0.1:8000/
```

Il frontend e composto da HTML, CSS e JavaScript nativo. Non serve `npm install` e non c'e una fase di build.

## Dati locali

Alla prima esecuzione vengono create le cartelle e il database locale:

```txt
data/reti.sqlite3
data/uploads/
```

Il database contiene documenti importati, annotazioni e storico dei run. Gli upload originali vengono conservati con hash SHA-256. In un repository pubblico questi file normalmente non vanno versionati, salvo dataset dimostrativi esplicitamente scelti.

TALON non inserisce testi di esempio: un database nuovo parte vuoto e viene popolato solo tramite importazione.

## Vocabolario giuridico

Le famiglie predefinite del modulo `Termini giuridici` sono nel file:

```txt
talon/legal_terms.json
```

Ogni famiglia dichiara `id`, `label`, `description`, `lemmas` e `aliases`. Il file viene riletto a ogni analisi, quindi puo essere ampliato o corretto senza modificare il codice Python. `lemmas` viene usato con LatinCy; `aliases` contiene le forme da cercare quando si lavora senza lemmatizzazione.

## Test

```powershell
python -m unittest -q
```

## Note sui parser

`Forme normalizzate` e la baseline: tokenizza il testo dopo la pulizia scelta dall'utente, per esempio minuscole, `j -> i`, `v -> u`. Non riduce automaticamente forme diverse allo stesso lemma.

`LatinCy` usa spaCy e un modello latino come `la_core_web_sm`. Produce CoNLL-U interno con lemma, POS, morfologia e dipendenze. Le analisi che possono usare lemmi, come termini giuridici e PCA lessicale, sfruttano questo livello quando disponibile.

## Integrazioni esterne

Collatinus usa l'endpoint pubblico Biblissima. Serve connessione internet.

Voyant viene aperto come workspace integrato quando possibile. L'export zip resta disponibile come fallback per corpus grandi o per uso con VoyantServer locale.

## File principali

- `app.py`: server HTTP locale, API, storage, analisi principali e report.
- `talon/`: moduli Python riusabili per catalogo, parser, import PDF, report, Voyant, Collatinus.
- `talon/legal_terms.json`: vocabolario modificabile delle famiglie terminologiche giuridiche.
- `talon/modules/builtin.json`: catalogo dei tool, analisi, parser, integrazioni e stili report.
- `static/index.html`: shell principale della webapp.
- `static/app.css`: stile globale.
- `static/ui.css`: sistema visivo dell'interfaccia desktop.
- `static/app.js`: orchestratore frontend.
- `static/tools/manifest.json`: manifest delle viste frontend caricate dinamicamente.
- `static/tools/*.html`: viste dei tool.
- `static/js/tools/*.js`: logica frontend dei tool.
- `static/js/shared/*.js`: funzioni condivise tra tool.

Per aggiungere o rimuovere tool, vedere `TOOLS.md`.
