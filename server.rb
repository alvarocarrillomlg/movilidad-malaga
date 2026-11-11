#!/usr/bin/env ruby
# La movilidad de Málaga en directo — servidor
#
#   ruby server.rb              sirve la página en http://localhost:8080
#   ruby server.rb --snapshot   guarda una instantánea de los datos en ./data
#
# Hace de intermediario con el portal de datos abiertos del Ayuntamiento de
# Málaga (que no permite peticiones directas desde el navegador), normaliza los
# datos y los guarda en caché unos segundos. Solo usa la biblioteca estándar.

ENV['TZ'] = 'Europe/Madrid'
require 'net/http'
require 'uri'
require 'json'
require 'csv'
require 'socket'
require 'time'
require 'fileutils'

ROOT = __dir__
PORT = (ENV['PORT'] || 8080).to_i
B = 'https://datosabiertos.malaga.eu/recursos'
SRC = {
  buses:    "#{B}/transporte/EMT/EMTlineasUbicaciones/lineasyubicaciones.geojson",
  lineas:   "#{B}/transporte/EMT/EMTLineasYParadas/lineasyparadas.geojson",
  ocup:     "#{B}/aparcamientos/ocupappublicosmun/ocupappublicosmun.csv",
  aparc:    "#{B}/aparcamientos/ubappublicosmun/da_aparcamientosPublicosMunicipales-4326.geojson",
  cortes:   "#{B}/transporte/trafico/da_cortesTrafico-4326.geojson",
  camaras:  "#{B}/transporte/trafico/da_camarasTrafico-4326.geojson",
  tiempo:   'https://api.open-meteo.com/v1/forecast?latitude=36.72&longitude=-4.42&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,is_day&timezone=Europe%2FMadrid',
  aire:     'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=36.72&longitude=-4.42&current=european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone&timezone=Europe%2FMadrid',
  mar:      'https://marine-api.open-meteo.com/v1/marine?latitude=36.70&longitude=-4.40&current=wave_height,wave_direction,wave_period,sea_surface_temperature&timezone=Europe%2FMadrid'
}

# Código del fichero de ocupación -> nombre en el fichero de ubicaciones
PARKING = {
  'SA' => 'Salitre', 'CE' => 'Cervantes', 'PA' => 'El Palo', 'AN' => 'Av. de Andalucía',
  'CA' => 'Camas', 'CR' => 'Cruz De Humilladero', 'AL' => 'Alcazaba',
  'SJ' => 'San Juan De La Cruz', 'MA' => 'Pz. de la Marina', 'TE' => 'Tejón y Rodriguez',
  'PB' => 'Pío Baroja'
}
# El fichero municipal trae Pío Baroja sin coordenadas; posición aproximada.
PARKING_FIX = { 'Pío Baroja' => [36.7213, -4.3556] }

def http_get(url, binary: false)
  uri = URI(url)
  5.times do
    px = uri.find_proxy # respeta https_proxy si el entorno lo define
    http = px ? Net::HTTP.new(uri.host, uri.port, px.host, px.port) : Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == 'https'
    http.open_timeout = 15
    http.read_timeout = 40
    res = http.request(Net::HTTP::Get.new(uri, 'User-Agent' => 'MovilidadMalaga/1.0'))
    if res.is_a?(Net::HTTPRedirection)
      uri = URI.join(uri.to_s, res['location'])
      next
    end
    raise "HTTP #{res.code} en #{uri.host}" unless res.is_a?(Net::HTTPSuccess)
    body = res.body
    return body if binary
    body = body.force_encoding('UTF-8')
    body = body.encode('UTF-8', 'ISO-8859-1') unless body.valid_encoding?
    return body
  end
  raise 'demasiadas redirecciones'
end

def r5(x) = x.to_f.round(5)
def clean(s) = s.to_s.gsub(/\s+/, ' ').strip
def now_ms = (Time.now.to_f * 1000).round

def fecha_ms(s) # "09/11/2026 08:00"
  m = s.to_s.match(%r{(\d{2})/(\d{2})/(\d{4}) (\d{2}):(\d{2})}) or return nil
  (Time.local(m[3].to_i, m[2].to_i, m[1].to_i, m[4].to_i, m[5].to_i).to_f * 1000).round
end

def build_buses
  raw = JSON.parse(http_get(SRC[:buses]))
  upd = nil
  buses = raw.filter_map do |f|
    lon, lat = f.dig('geometry', 'coordinates')&.map(&:to_f)
    next if lat.nil? || lat.abs < 1
    u = f.dig('properties', 'last_update')
    upd = u if u && (upd.nil? || u > upd)
    { id: f['codBus'].to_s, c: f['codLinea'].to_f.to_i, s: f['sentido'].to_i,
      lat: r5(lat), lon: r5(lon), p: f['codParIni'].to_i }
  end
  upd_ms = upd ? (Time.strptime(upd, '%Y-%m-%d %H:%M:%S').to_f * 1000).round : now_ms
  { t: now_ms, upd: upd_ms, buses: buses }
end

def build_lineas
  raw = JSON.parse(http_get(SRC[:lineas]))
  stops = {}
  lines = raw.map do |l|
    rutas = { '1' => [], '2' => [] }
    l['paradas'].sort_by { |p| [p['sentido'].to_i, p['orden'].to_i] }.each do |p|
      pa = p['parada']
      id = pa['codParada'].to_i
      next if pa['latitud'].to_f.abs < 1
      stops[id] ||= { id: id, n: clean(pa['nombreParada']), d: clean(pa['direccion']),
                      lat: r5(pa['latitud']), lon: r5(pa['longitud']) }
      (rutas[p['sentido'].to_i.to_s] ||= []) << id
    end
    { c: l['codLinea'].to_f.to_i, u: l['userCodLinea'].to_s, n: clean(l['nombreLinea']),
      ida: clean(l['cabeceraIda']), vuelta: clean(l['cabeceraVuelta']),
      obs: clean(l['observaciones']), r: rutas }
  end
  { t: now_ms, lines: lines, stops: stops.values }
end

def build_aparcamientos
  libres = {}
  CSV.parse(http_get(SRC[:ocup]), headers: true).each { |r| libres[r['id'].to_s.strip] = r['libres'].to_i }
  geo = JSON.parse(http_get(SRC[:aparc]))['features'].to_h { |f| [f['properties']['name'], f] }
  list = libres.filter_map do |cod, n|
    name = PARKING[cod] or next
    f = geo[name]
    lon, lat = f ? f['geometry']['coordinates'] : [0, 0]
    aprox = false
    if lat.to_f.abs < 1 && PARKING_FIX[name]
      lat, lon = PARKING_FIX[name]
      aprox = true
    end
    next if lat.to_f.abs < 1
    addr = clean(f&.dig('properties', 'address')).sub(/\s*-?\s*(\d{5} )?Málaga( \(Málaga\))?\z/, '').sub(/\s*-\s*\z/, '')
    { id: cod, n: name.sub('Pz.', 'Plaza').sub(' De ', ' de ').sub(' y Rodriguez', ' y Rodríguez'),
      d: addr, lat: r5(lat), lon: r5(lon), libres: n, aprox: aprox }
  end
  { t: now_ms, sinUbicar: (libres.keys - PARKING.keys), list: list }
end

def build_cortes
  feats = JSON.parse(http_get(SRC[:cortes]))['features']
  list = feats.filter_map do |f|
    lon, lat = f['geometry']['coordinates']
    next if lat.to_f.abs < 1
    p = f['properties']
    { id: p['ID'], d: clean(p['DESCRIPCION']), dir: clean(p['DIRECCION']), nota: clean(p['NOTAS']),
      tipo: clean(p['TIPOCORTE']), af: clean(p['TIPOAFECTACION']),
      desde: fecha_ms(p['DESDE']), hasta: fecha_ms(p['HASTA']), lat: r5(lat), lon: r5(lon) }
  end
  { t: now_ms, list: list }
end

def build_camaras
  feats = JSON.parse(http_get(SRC[:camaras]))['features']
  list = feats.filter_map do |f|
    lon, lat = f['geometry']['coordinates']
    next if lat.to_f.abs < 1
    p = f['properties']
    { id: p['ID'], n: clean(p['NOMBRE']), d: clean(p['DESCRIPCION']), dir: clean(p['DIRECCION']),
      url: p['URL'], img: p['URLIMAGEN'], lat: r5(lat), lon: r5(lon) }
  end
  { t: now_ms, list: list }
end

def build_clima
  out = { t: now_ms }
  { tiempo: :w, aire: :a, mar: :m }.each do |src, key|
    out[key] = JSON.parse(http_get(SRC[src]))['current']
  rescue StandardError => e
    warn "clima/#{src}: #{e.message}"
  end
  out
end

# nombre => [constructor, segundos de caché]
DATA = {
  'buses' => [:build_buses, 20], 'lineas' => [:build_lineas, 6 * 3600],
  'aparcamientos' => [:build_aparcamientos, 60], 'cortes' => [:build_cortes, 600],
  'camaras' => [:build_camaras, 3600], 'clima' => [:build_clima, 600]
}
CACHE = {}
LOCK = Mutex.new

def data_json(name)
  builder, ttl = DATA.fetch(name)
  LOCK.synchronize do
    hit = CACHE[name]
    return hit[1] if hit && Time.now - hit[0] < ttl
    begin
      json = JSON.generate(send(builder))
      CACHE[name] = [Time.now, json]
      json
    rescue StandardError => e
      warn "#{name}: #{e.message}"
      hit ? hit[1] : raise # si la fuente falla, se sirve lo último que se tuvo
    end
  end
end

if ARGV.include?('--snapshot')
  FileUtils.mkdir_p(File.join(ROOT, 'data'))
  DATA.each_key do |name|
    File.write(File.join(ROOT, 'data', "#{name}.json"), data_json(name))
    puts "data/#{name}.json"
  end
  exit
end

MIME = { '.html' => 'text/html; charset=utf-8', '.json' => 'application/json; charset=utf-8',
         '.png' => 'image/png', '.js' => 'text/javascript', '.css' => 'text/css' }

SKELETON = '<!doctype html><html lang="es"><head><meta charset="utf-8">' \
           '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' \
           '<style>body{margin:0}[hidden]{display:none!important}</style></head><body>'

def respond(sock, code, type, body, cache: 'no-store')
  sock.write "HTTP/1.1 #{code}\r\nContent-Type: #{type}\r\nContent-Length: #{body.bytesize}\r\n" \
             "Cache-Control: #{cache}\r\nConnection: close\r\n\r\n"
  sock.write body
end

def handle(sock)
  line = sock.gets or return
  path = URI.decode_www_form_component(line.split[1].to_s.split('?').first.to_s)
  while (h = sock.gets) && h != "\r\n"; end
  path = '/index.html' if path == '/'
  if (m = path.match(%r{\A/data/(\w+)\.json\z})) && DATA.key?(m[1])
    respond(sock, '200 OK', MIME['.json'], data_json(m[1]))
  elsif (m = path.match(%r{\A/tiles/(\d{1,2})/(\d+)/(\d+)\.png\z}))
    file = File.join(ROOT, 'tiles', m[1], m[2], "#{m[3]}.png")
    unless File.exist?(file) # se pide a OpenStreetMap una sola vez y se guarda
      png = http_get("https://tile.openstreetmap.org/#{m[1]}/#{m[2]}/#{m[3]}.png", binary: true)
      FileUtils.mkdir_p(File.dirname(file))
      File.binwrite(file, png)
    end
    respond(sock, '200 OK', MIME['.png'], File.binread(file), cache: 'max-age=604800')
  elsif path == '/index.html'
    page = File.read(File.join(ROOT, 'index.html'), encoding: 'UTF-8')
    respond(sock, '200 OK', MIME['.html'], SKELETON + page + "</body></html>")
  else
    respond(sock, '404 Not Found', 'text/plain', 'No encontrado')
  end
rescue StandardError => e
  warn "#{path}: #{e.message}"
  respond(sock, '502 Bad Gateway', 'text/plain', 'Fuente no disponible') rescue nil
ensure
  sock.close rescue nil
end

server = TCPServer.new('0.0.0.0', PORT)
puts "La movilidad de Málaga en directo → http://localhost:#{PORT}"
loop { Thread.new(server.accept) { |s| handle(s) } }
