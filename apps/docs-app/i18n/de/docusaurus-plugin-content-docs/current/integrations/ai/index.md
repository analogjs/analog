---
sidebar_position: 4
---

# AI

Die Analog-Dokumentationsseite veröffentlicht zwei KI-freundliche Indexdateien im Stammverzeichnis der Website:

- `https://analogjs.org/llms.txt`
- `https://analogjs.org/llms-full.txt`

Diese Dateien erleichtern es, die Dokumentation in KI-gestützte Workflows einzubinden, ohne die komplette Website manuell zu durchsuchen.

## Was ist der Unterschied?

### `llms.txt`

`llms.txt` ist ein kompakter Index der Dokumentation. Er enthält Seitentitel, URLs und kurze Beschreibungen, damit Assistenten oder Retrieval-Pipelines schnell die relevanten Seiten finden.

Verwende die Datei, wenn du Folgendes möchtest:

- einen leichten Einstiegspunkt für Retrieval
- einen Seitenindex für eigene RAG-Pipelines
- eine schnelle Möglichkeit, ein KI-Tool auf die Analog-Dokumentation zu verweisen

### `llms-full.txt`

`llms-full.txt` ist die ausführliche Variante. Sie fasst den vollständigen Markdown-Inhalt der Dokumentationsseiten in einer einzigen Textdatei zusammen.

Verwende die Datei, wenn du Folgendes möchtest:

- eine einzelne Datei für lokales Indexing
- mehr Kontext für längere Prompts
- Offline-Verarbeitung ohne jede Dokumentationsseite einzeln abzurufen

## Wie Analog diese Dateien erzeugt

Die Docs-App erzeugt beide Dateien automatisch in `apps/docs-app/docusaurus.config.js`.

Während des Docs-Builds:

- wird `llms.txt` aus den aktuellen Docs-Routen erzeugt
- wird `llms-full.txt` durch das Zusammenführen der Markdown-Quelldateien unter `apps/docs-app/docs` erzeugt

Dadurch bleiben die Dateien mit der veröffentlichten Dokumentation synchron, ohne einen separaten Export-Schritt zu benötigen.

## Beispiel-Workflows

### Einen Assistenten auf den Docs-Index verweisen

Verwende `llms.txt`, wenn dein KI-Tool einen entfernten Dokumentationsindex unterstützt:

```text
Use https://analogjs.org/llms.txt as the primary AnalogJS documentation index.
```

### Einen lokalen Retrieval-Korpus erstellen

Verwende `llms-full.txt`, wenn du eine einzelne Quelldatei für Embeddings oder lokale Suche möchtest:

```shell
curl -O https://analogjs.org/llms-full.txt
```

### Mit normalen Docs-Links kombinieren

Die KI-orientierten Dateien ergänzen die veröffentlichte Dokumentationsoberfläche, ersetzen sie aber nicht. Verlinke weiterhin die kanonischen Docs-Seiten für die normale Navigation und verwende die `llms`-Dateien für KI-freundliche Ingestion.
