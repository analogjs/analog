---
sidebar_position: 4
---

# AI

El sitio de documentación de Analog publica dos archivos de índice compatibles con IA en la raíz del sitio:

- `https://analogjs.org/llms.txt`
- `https://analogjs.org/llms-full.txt`

Estos archivos facilitan integrar la documentación en flujos de trabajo asistidos por IA sin tener que rastrear manualmente todo el sitio.

## ¿Cuál es la diferencia?

### `llms.txt`

`llms.txt` es un índice compacto de la documentación. Contiene los títulos de las páginas, sus URLs y descripciones breves para que un asistente o una canalización de recuperación encuentre rápidamente las páginas relevantes.

Úsalo cuando quieras:

- un punto de entrada liviano para recuperación
- un índice de páginas para tus propias canalizaciones RAG
- una forma rápida de apuntar una herramienta de IA a la documentación de Analog

### `llms-full.txt`

`llms-full.txt` es la versión ampliada. Concatena el contenido completo en Markdown de las páginas de documentación en un solo archivo de texto.

Úsalo cuando quieras:

- un único archivo para indexación local
- más contexto para prompts largos
- procesamiento sin conexión sin descargar cada página por separado

## Cómo genera Analog estos archivos

La app de documentación genera ambos archivos automáticamente en `apps/docs-app/docusaurus.config.js`.

Durante la compilación de la documentación:

- `llms.txt` se genera a partir de los registros actuales de rutas de la documentación
- `llms-full.txt` se genera concatenando los archivos Markdown bajo `apps/docs-app/docs`

Eso mantiene ambos archivos alineados con la documentación publicada sin requerir un paso de exportación separado.

## Ejemplos de flujos de trabajo

### Apuntar un asistente al índice de documentación

Usa `llms.txt` cuando tu herramienta de IA admita un índice remoto de documentación:

```text
Use https://analogjs.org/llms.txt as the primary AnalogJS documentation index.
```

### Crear un corpus local de recuperación

Usa `llms-full.txt` cuando quieras un solo archivo fuente para embeddings o búsqueda local:

```shell
curl -O https://analogjs.org/llms-full.txt
```

### Combinarlo con los enlaces normales de la documentación

Los archivos orientados a IA complementan la interfaz publicada de la documentación, no la reemplazan. Sigue enlazando a las páginas canónicas cuando quieras documentación navegable y usa los archivos `llms` cuando necesites ingestión orientada a IA.
