# La movilidad de Málaga en directo

Mapa de la movilidad de Málaga: autobuses de la EMT (con estimación de avance entre lecturas), paradas, aparcamientos municipales, cortes de tráfico, cámaras y clima.

## Uso

```
ruby server.rb
```

y abrir http://localhost:8080. Solo necesita Ruby (biblioteca estándar). El puerto se cambia con la variable `PORT`.

El servidor hace de intermediario con el portal de datos abiertos, que no admite peticiones directas desde el navegador, y guarda los datos en caché unos segundos.

`ruby server.rb --snapshot` guarda una copia de los datos en `data/`. Con esos ficheros y los de `tiles/`, `index.html` también funciona sin servidor como instantánea estática.

## Fuentes

- [Datos abiertos del Ayuntamiento de Málaga](https://datosabiertos.malaga.eu) (CC BY 4.0)
- [Open-Meteo](https://open-meteo.com): tiempo, calidad del aire y estado del mar
- Mapa base © colaboradores de [OpenStreetMap](https://www.openstreetmap.org/copyright)
