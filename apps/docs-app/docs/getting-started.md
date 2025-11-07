---

## sidebar_position: 2

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Başlarken

Bir Analog projesi oluşturmak yalnızca birkaç basit adım gerektirir.

## Sistem Gereksinimleri

Analog aşağıdaki Node ve Angular sürümlerini gerektirir:

* Node v18.13.0 veya üzeri önerilir
* Angular v15 veya üzeri

## Yeni Bir Uygulama Oluşturma

Yeni bir Analog projesi oluşturmak için, tercih ettiğiniz paket yöneticisiyle `create-analog` paketini kullanabilirsiniz:

<Tabs groupId="package-manager">

<TabItem value="npm">

```shell
npm create analog@latest
```

</TabItem>

<TabItem value="yarn" label="Yarn">

```shell
yarn create analog
```

</TabItem>

<TabItem value="pnpm">

```shell
pnpm create analog
```

</TabItem>

<TabItem value="bun">

```shell
bun create analog
```

</TabItem>

</Tabs>

Ayrıca [Nx ile yeni bir proje iskeleti oluşturabilirsiniz](/docs/integrations/nx).

### Uygulamayı Çalıştırma

Uygulama için geliştirme sunucusunu başlatmak üzere `start` komutunu çalıştırın.

<Tabs groupId="package-manager">

<TabItem value="npm">

```shell
npm run start
```

</TabItem>

<TabItem value="yarn" label="Yarn">

```shell
yarn start
```

</TabItem>

<TabItem value="pnpm">

```shell
pnpm start
```

</TabItem>

<TabItem value="bun">

```shell
bun start
```

</TabItem>

</Tabs>

Uygulamayı görmek için tarayıcınızda [http://localhost:5173](http://localhost:5173) adresini ziyaret edin.

Sonraki adımda, gezinme için [bileşenler kullanarak ek yönlendirmeler tanımlayabilirsiniz](/docs/features/routing/overview).

### Uygulamayı Derleme

Uygulamayı dağıtım için derlemek üzere:

<Tabs groupId="package-manager">

<TabItem value="npm">

```shell
npm run build
```

</TabItem>

<TabItem value="yarn" label="Yarn">

```shell
yarn build
```

</TabItem>

<TabItem value="pnpm">

```shell
pnpm run build
```

</TabItem>

<TabItem value="bun">

```shell
bun run build
```

</TabItem>

</Tabs>

### Derleme Çıktıları (Build Artifacts)

Varsayılan olarak Analog, [Sunucu Taraflı Rendering (SSR)](/docs/features/server/server-side-rendering) özelliği etkin şekilde gelir.
İstemci (client) çıktıları `dist/analog/public` dizininde bulunur.
API/SSR derleme çıktılarının sunucusu ise `dist/analog/server` dizininde yer alır.

## Mevcut Bir Uygulamayı Taşımak

Ayrıca mevcut bir Angular uygulamasını Analog’a taşıyabilirsiniz.
Taşıma adımları için [taşıma rehberine](/docs/guides/migrating) bakın.
