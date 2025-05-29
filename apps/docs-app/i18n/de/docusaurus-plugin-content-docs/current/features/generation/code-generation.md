import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Code-Generierung

Analog unterstützt die automatische Codegenerierung mit Nx Generatoren und Angular Schemata.

<Tabs groupId="project-type">
  <TabItem value="Nx Generators">

### Generatoren

Das Analog-Plugin für Nx bietet eine Reihe von Generatoren, die dabei helfen, einige der häufigen Aufgaben innerhalb eines Nx-Arbeitsbereichs zu automatisieren, wie z. B. die Erzeugung einer **application** oder **page**. Um diese Generatoren zu verwenden, kann die Erweiterung **Nx Console** installiert werden oder es kann manuell über die Nx CLI aufgerufen werden:

### Generierung einer Anwendung

Um eine neue analoge Anwendung innerhalb eines Nx-Arbeitsbereichs zu erstellen, verwenden Sie den Anwendungsgenerator:

```shell
npx nx generate @analogjs/platform:application --analogAppName=analog-app
```

### Generierung von Seiten

```shell
npx nx generate @analogjs/platform:page --pathname=index --project=analog-app
```

Es funktioniert auch mit den Analog-spezifischen Dateinamen, **Anmerkung: diese Namen müssen in einfache Anführungszeichen** gesetzt werden:

```shell
npx nx generate @analogjs/platform:page --pathname='(blog)' --project=analog-app
```

Das Schemata lässt auch Unterordner zu, um das Projekt richtig zu strukturieren.

```shell
npx nx generate @analogjs/platform:page --pathname='products/[products]' --project=analog-app
```

  </TabItem>

  <TabItem label="Angular Schematics" value="schematics">

### Angular Schemata

Analog stellt eine Reihe von Schemata zur Verfügung, die dabei helfen, einige häufige Aufgaben innerhalb eines Angular-CLI-Arbeitsbereichs zu automatisieren, wie z. B. die Erzeugung einer **application** oder einer **page**. Um diese Schemata zu verwenden, verwenden Sie den Befehl generate:

### Generierung einer Anwendung

Um eine neue Analog-Anwendung innerhalb eines Angular CLI-Arbeitsbereichs zu erstellen, verwende das `app`-schema:

```shell
npx ng generate @analogjs/platform:application my-app
```

### Generierung von Seiten

```shell
npx ng g @analogjs/platform:page --pathname=index --project=/
```

Es funktioniert auch mit den Analog-spezifischen Dateinamen, **Anmerkung: diese Namen müssen in einfache Anführungszeichen** gesetzt werden:

```shell
npx ng g @analogjs/platform:page --pathname='(blog)' --project=/
```

Das Schemata lässt auch Unterordner zu, um das Projekt richtig zu strukturieren.

```shell
npx ng g @analogjs/platform:page --pathname='products/[products]' --project=/
```

  </TabItem>
</Tabs>
