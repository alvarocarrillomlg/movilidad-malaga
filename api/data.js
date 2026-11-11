// Función del despliegue: /data/<nombre>.json llega aquí (ver vercel.json).
// La caché del propio alojamiento evita pedir a la fuente más de una vez por intervalo.
const { DATOS } = require('../lib/fuentes');

module.exports = async (req, res) => {
  const entrada = DATOS[String(req.query.name || '')];
  if (!entrada) return res.status(404).json({ error: 'No encontrado' });
  const [leer, normal] = entrada;
  try {
    const datos = await leer();
    const ttl = datos.parcial ? 60 : normal; // un resultado incompleto se reintenta al minuto
    res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=${ttl * 3}`);
    res.status(200).json(datos);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'Fuente no disponible' });
  }
};
