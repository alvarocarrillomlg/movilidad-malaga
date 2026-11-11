// Prepara la carpeta public/ para el despliegue: la página completa y el mapa base guardado.
const fs = require('fs');
const { pagina } = require('./lib/fuentes');

fs.rmSync('public', { recursive: true, force: true });
fs.mkdirSync('public');
fs.writeFileSync('public/index.html', pagina(fs.readFileSync('index.html', 'utf8')));
fs.cpSync('tiles', 'public/tiles', { recursive: true });
fs.copyFileSync('calles.json', 'public/calles.json'); // índice de calles del buscador
console.log('public/ lista');
