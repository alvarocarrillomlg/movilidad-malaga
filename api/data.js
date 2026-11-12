// Función del despliegue: /data/<nombre>.json llega aquí (ver vercel.json).
// La caché del propio alojamiento evita pedir a la fuente más de una vez por intervalo.
const { DATOS } = require('../lib/fuentes');

const ultimo = {}; // último resultado bueno de cada conjunto de datos

module.exports = async (req, res) => {
  const entrada = DATOS[String(req.query.name || '')];
  if (!entrada) return res.status(404).json({ error: 'No encontrado' });
  const [leer, normal] = entrada;
  const nombre = String(req.query.name);
  try {
    const datos = await leer();
    ultimo[nombre] = datos;
    const ttl = datos.parcial ? 60 : normal; // un resultado incompleto se reintenta al minuto
    res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${nombre === 'webcams' || nombre === 'incidencias' ? 60 : ttl * 3}`);
    res.status(200).json(datos);
  } catch (e) {
    // Si la fuente falla, se devuelve lo último bueno que esta instancia tenga en memoria (lleva su propia hora en «t»).
    // Las incidencias guardadas solo valen unos minutos y sin las que ya han terminado.
    if (ultimo[nombre] && nombre === 'incidencias') {
      const u = ultimo[nombre];
      ultimo[nombre] = Date.now() - u.t > 15 * 60000 ? null : { ...u, list: u.list.filter((x) => !x.hasta || x.hasta > Date.now()) };
    }
    if (ultimo[nombre]) {
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30');
      return res.status(200).json(ultimo[nombre]);
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'Fuente no disponible' });
  }
};
