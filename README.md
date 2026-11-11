# La movilidad de Málaga en directo

Mapa en 3D de la movilidad de Málaga: autobuses de la EMT (con su color oficial y estimación de avance sobre el recorrido real de cada línea), paradas, aparcamientos municipales, cortes de tráfico, cámaras y clima.

## Uso

```
node server.js
```

y abrir http://localhost:8080. Solo necesita Node 18 o posterior, sin instalar nada más. El puerto se cambia con la variable `PORT`.

El servidor hace de intermediario con el portal de datos abiertos, que no admite peticiones directas desde el navegador, y guarda los datos en caché unos segundos.

`node server.js --snapshot` guarda una copia de los datos en `data/`. Con esos ficheros y los de `tiles/`, `index.html` también funciona sin servidor como instantánea estática.

## Publicarlo en internet

El repositorio está preparado para [Vercel](https://vercel.com) (plan gratuito): entrar con la cuenta de GitHub, «Add New… → Project», elegir este repositorio y pulsar «Deploy». No hay que configurar nada: `vercel.json` indica cómo construir la página (`build.js`) y `api/data.js` sirve los datos. Cada cambio en `main` se publica solo.

La lectura de las fuentes está en `lib/fuentes.js`, que comparten el servidor local y el despliegue.

## Fuentes

- [Datos abiertos del Ayuntamiento de Málaga](https://datosabiertos.malaga.eu) (CC BY 4.0)
- [Open-Meteo](https://open-meteo.com): tiempo, calidad del aire y estado del mar
- Mapa base: [OpenFreeMap](https://openfreemap.org) © OpenMapTiles, datos de [OpenStreetMap](https://www.openstreetmap.org/copyright). Si no está disponible, la página usa el mapa plano guardado en `tiles/`.
