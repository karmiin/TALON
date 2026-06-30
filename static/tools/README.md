# TALON tool modules

Un tool UI puo essere aggiunto senza modificare `static/index.html` e senza
toccare il file principale `static/app.js`.

## Struttura

- `static/tools/<tool>.html`: vista HTML della pagina SPA.
- `static/js/tools/<tool>.js`: logica del tool.
- `static/tools/manifest.json`: registra vista e modulo JS opzionale.
- `talon/modules/builtin.json`: registra il tool nel launcher e nella sidebar logica.

## Manifest frontend

```json
{
  "id": "collatinus",
  "view": "/tools/collatinus.html",
  "module": "/js/tools/collatinus.js"
}
```

Per una vista solo statica basta omettere `module`.

## Modulo JS

Il modulo deve esportare `init(ctx)`.

```js
export function init(ctx) {
  ctx.$("#run-my-tool")?.addEventListener("click", async () => {
    const ids = ctx.selectedIds("[data-my-tool-id]");
    const result = await ctx.api("/api/my-tool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
  });
}
```

`ctx` espone helper condivisi:

- `ctx.$`, `ctx.$$`
- `ctx.api`
- `ctx.toast`
- `ctx.escapeHtml`
- `ctx.formatNumber`
- `ctx.selectedIds`
- `ctx.selectedFullDocuments`
- `ctx.renderDocumentChecklist`
- `ctx.loadDocuments`, `ctx.loadRuns`
- hook di refresh: `ctx.onDocumentsChanged`, `ctx.onModulesChanged`,
  `ctx.onParserStatusChanged`, `ctx.onRunsChanged`
- `ctx.state`

## Vista HTML

Ogni vista deve usare un id nella forma:

```html
<section class="app-view" id="view-my-tool">
  ...
</section>
```

Il valore dopo `view-` deve coincidere con `ui.view` nel catalogo backend.
