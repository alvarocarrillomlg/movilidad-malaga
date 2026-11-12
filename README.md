# La movilidad de Málaga en directo

Mapa en 3D de la movilidad de Málaga: autobuses de la EMT (en su última posición publicada, con el color oficial y el recorrido real de cada línea), paradas con el próximo paso programado de cada línea, aparcamientos municipales, cortes de tráfico, cámaras de tráfico (municipales y de la DGT), webcams públicas de terceros e incidencias de tráfico en tiempo real de la DGT en el municipio, con buscador de calles.

## Uso

```
node server.js
```

y abrir http://localhost:8080. Solo necesita Node 18 o posterior, sin instalar nada más. El puerto se cambia con la variable `PORT`.

El servidor hace de intermediario con el portal de datos abiertos, que no admite peticiones directas desde el navegador, y guarda los datos en caché unos segundos.

`node server.js --snapshot` guarda una copia de los datos en `data/`. Con esos ficheros y los de `tiles/`, `index.html` también funciona sin servidor como instantánea estática.

## Publicarlo en internet

El repositorio está preparado para [Vercel](https://vercel.com) (plan gratuito): entrar con la cuenta de GitHub, «Add New… → Project», elegir este repositorio y pulsar «Deploy». No hay que configurar nada: `vercel.json` indica cómo construir la página (`build.js`) y `api/data.js` sirve los datos. Cada cambio en `main` se publica solo.

Los cortes situados en calles peatonales o de acceso restringido del centro histórico no se muestran; esas calles salen de `centro-restringido.json`, generado con `herramientas/generar-centro.js` a partir del callejero municipal.

La lectura de las fuentes está en `lib/fuentes.js`, que comparten el servidor local y el despliegue.

## Fuentes

- [Datos abiertos del Ayuntamiento de Málaga](https://datosabiertos.malaga.eu) (CC BY 4.0)
- [DGT](https://nap.dgt.es): cámaras de carretera e incidencias de tráfico (DATEX II)
- [Windy Webcams](https://api.windy.com/webcams) (plan gratuito): webcams públicas de playas, puerto, aeropuerto y otros puntos del municipio. Solo aparecen si la variable de entorno `WINDY_API_KEY` tiene una clave gratuita de https://api.windy.com/keys (en Vercel: «Settings → Environment Variables», y volver a publicar). Cada imagen enlaza a su página en Windy y se muestra «Webcams provided by windy.com», como piden sus condiciones.
- Buscador de calles: callejero municipal (`calles.json`, generado con `herramientas/generar-calles.js`); para lugares que no son calles, [Nominatim](https://nominatim.openstreetmap.org) (OpenStreetMap)
- Vista satélite: ortofoto del [PNOA](https://pnoa.ign.es) cedida por © [IGN](https://www.ign.es) (CC BY 4.0)
- Mapa base: [OpenFreeMap](https://openfreemap.org) © OpenMapTiles, datos de [OpenStreetMap](https://www.openstreetmap.org/copyright). Si no está disponible, la página usa el mapa plano guardado en `tiles/`, que es ese mismo mapa dibujado de antemano sin puntos de interés.

## Autoría

Elaborado por Álvaro Carrillo.
