import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# create-analog

Das Paket `create-analog` enthält Vorlagen für die Erstellung neuer Analog-Projekte.

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm create analog@latest
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn create analog
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm create analog
```

  </TabItem>
</Tabs>

### Optionale `create-analog`-Kennzeichen

| Kennzeichen  | Beschreibung                                                                            | Werttyp | Standardwert |
| ------------ | --------------------------------------------------------------------------------------- | ------- | ------------ |
| &lt;name&gt; | Name des Projekts. Geben mit `.` an, das Projekt im aktuellen Verzeichnis einzurichten. | string  |              |
| `--template` | Voreingestellte Vorlage.                                                                | string  |              |

### Vorlagen

| Vorlage                  | Beschreibung                                       |
| ------------------------ | -------------------------------------------------- |
| `Full-stack Application` | Standardanwendung Analog.                          |
| `Blog`                   | Standardvorlage, erweitert um einem Blog-Beispiel. |

### Beispiel

Um eine Angular-Anwendung im Verzeichnis `my-angular-app` zu erstellen, ist Folgendes auszuführen:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
# npm >=7.0
npm create analog@latest my-angular-app -- --template latest
# npm 6.x
npm create analog@latest my-angular-app -- --template blog
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn create analog my-angular-app --template blog
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm create analog my-angular-app --template blog
```

  </TabItem>
</Tabs>
