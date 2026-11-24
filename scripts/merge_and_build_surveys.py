import csv
import json
import re
import glob
import os

# Complete mapping from email to Codizulca seller
EMAIL_TO_SELLER = {
    'jh3590055@gmail.com': 'JUAN HERNANDEZ',
    'sarahreyesrosales@gmail.com': 'SARAH REYES',
    'mariabricenosala@gmail.com': 'MARIA BRICEÑO',
    'moremelcobranza@gmail.com': 'ANGELICA MORENO',
    'cobranzaslauyleo05@gmail.com': 'LEONARDO RIOS',
    'hernandj81@gmail.com': 'HERNAN PAZ',
    'maryerygarcia29@gmail.com': 'MARYERY GARCIA',
    'carlos.fuenmayorrp@gmail.com': 'CARLOS FUENMAYOR',
    'oscardortizh06@gmail.com': 'OSCAR ORTIZ - CORO',
    'lugoyoleida00@gmail.com': 'YOLEIDA LUGO',
    'marianachacinrosas@gmail.com': 'CUENTAS CLAVE 1 - MC (MARIANA CHACIN)',
    'luisgustavo127@gmail.com': 'VICTORIA VARGAS',
    'sairuvalles92@gmail.com': 'CUENTAS CLAVE 2 - SV (SAIRU VALLES)',
    'johnatansoto18@gmail.com': 'JOHNATAN SOTO VILLA DEL ROS',
    'paab937@gmail.com': 'PEDRO ABREU',
    'adeljaraba0704@gmail.com': 'ADEL JARABA',
    'elchupax@gmail.com': 'PEDRO ABREU',
    'epina3343@gmail.com': 'EDUARDO PIÑA',
    'araujojuanpabla@gmail.com': 'J PABLO ARAUJO',
    'josegregorio161177@gmail.com': 'JOSE G. GONZALEZ',
    'solerelisab@gmail.com': 'ELISA SOLER',
    'oswaldochurioncodizulca@gmail.com': 'OSWALDO CHURION',
    'josegonzalez@codizulca.com': 'JOSE G. GONZALEZ',
    'luisammv.1990@gmail.com': 'VICTORIA VARGAS'
}

def norm(text):
    if not text: return ''
    t = text.upper()
    t = re.sub(r'[.,;\"\'()]', ' ', t)
    t = re.sub(r'\b(C\s*A|S\s*A|F\s*P|E\s*I\s*R\s*L|S\s*R\s*L)\b', '', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t

# Load Cartera
cartera_norm_map = {}
if os.path.exists('src/data/carteraClientes.json'):
    with open('src/data/carteraClientes.json', encoding='utf-8') as f:
        cartera = json.load(f)
    for c in cartera:
        cartera_norm_map[norm(c.get('nombre', ''))] = c
        if c.get('rif'):
            cartera_norm_map[norm(c['rif'])] = c

# Prioritized list of files to read (all batches, parts, and complete raw files)
explicit_files = [
    'scripts/raw_survey_part1.csv',
    'scripts/raw_survey_part2.csv',
    'scripts/raw_survey_part_user1.csv',
    'scripts/batch1.txt',
    'scripts/batch2.txt',
    'scripts/batch_26_27sep.csv',
    'scripts/batch_21sep.csv',
    'scripts/batch_19_20sep.csv',
    'scripts/batch_14_18sep.csv',
    'scripts/survey_part7.csv',
    'scripts/survey_part6.csv',
    'scripts/survey_part5.csv',
    'scripts/survey_part4.csv',
    'scripts/survey_part3.csv',
    'scripts/survey_part2.csv',
    'scripts/survey_input.csv',
    'scripts/raw_survey_complete.csv'
]

# Discover any other csv/txt files in scripts/
all_discovered = sorted(glob.glob('scripts/*.csv') + glob.glob('scripts/*.txt'))
files_to_read = []
for ef in explicit_files:
    if os.path.exists(ef) and ef not in files_to_read:
        files_to_read.append(ef)
for df in all_discovered:
    if df not in files_to_read and os.path.exists(df):
        files_to_read.append(df)

print(f"Reading from {len(files_to_read)} survey data files...")

seen_records = {}
coord_cache_by_name = {}
coord_cache_by_rif = {}

fieldnames = ['Fecha', 'Vendedor', 'Cliente', 'Estado Encuesta', 'Tipo Cliente', 'RIF/Cédula', 'Teléfono', 'Email', 'Estado', 'Municipio', 'Latitud', 'Longitud', 'Notas']

for fn in files_to_read:
    try:
        with open(fn, 'r', encoding='utf-8', errors='ignore') as f:
            reader = csv.reader(f)
            for row in reader:
                if not row or len(row) < 3: continue
                if row[0].strip() == 'Fecha' or 'Vendedor' in row[1]: continue
                
                while len(row) < 13:
                    row.append('')
                
                fecha = row[0].strip()
                vendedor = row[1].strip()
                cliente = row[2].strip()
                estado_enc = row[3].strip() if len(row) > 3 else ''
                tipo_cli = row[4].strip() if len(row) > 4 else ''
                rif = row[5].strip() if len(row) > 5 else ''
                telf = row[6].strip() if len(row) > 6 else ''
                email = row[7].strip() if len(row) > 7 else ''
                estado = row[8].strip() if len(row) > 8 else ''
                muni = row[9].strip() if len(row) > 9 else ''
                lat_str = row[10].strip() if len(row) > 10 else ''
                lng_str = row[11].strip() if len(row) > 11 else ''
                notas = row[12].strip() if len(row) > 12 else ''
                
                if not cliente: continue

                # Clean and parse coordinates
                lat = None
                lng = None
                try:
                    if lat_str:
                        lat = float(lat_str)
                except:
                    pass
                try:
                    if lng_str:
                        lng = float(lng_str)
                except:
                    pass

                # Fix swapped coordinates if needed (Lat 8..13, Lng -73..-67)
                if lat is not None and lng is not None:
                    if lat < 0 and lng > 0:
                        lat, lng = lng, lat
                    if lat != 0 and lng != 0:
                        norm_cli = norm(cliente)
                        norm_rif = norm(rif)
                        if norm_cli:
                            coord_cache_by_name[norm_cli] = (lat, lng, muni, estado)
                        if norm_rif and len(norm_rif) > 5:
                            coord_cache_by_rif[norm_rif] = (lat, lng, muni, estado)

                seller = EMAIL_TO_SELLER.get(vendedor.lower(), vendedor)
                norm_name = norm(cliente)
                norm_rif = norm(rif)

                # Primary deduplication key:
                # Use RIF if valid (> 5 chars) to prevent duplicate surveys of same legal business,
                # else (norm_name, seller) to avoid merging distinct clients with generic names across sellers.
                key = norm_rif if (norm_rif and len(norm_rif) > 5) else (norm_name, seller.upper())

                rec = {
                    'Fecha': fecha,
                    'Vendedor': vendedor,
                    'sellerCanonical': seller,
                    'Cliente': cliente,
                    'Estado Encuesta': estado_enc or 'COMPLETA',
                    'Tipo Cliente': tipo_cli,
                    'RIF/Cédula': rif,
                    'Teléfono': telf,
                    'Email': email,
                    'Estado': estado,
                    'Municipio': muni,
                    'Latitud': lat,
                    'Longitud': lng,
                    'Notas': notas
                }

                if key not in seen_records:
                    seen_records[key] = rec
                else:
                    existing = seen_records[key]
                    existing_has_gps = existing['Latitud'] is not None and existing['Longitud'] is not None
                    new_has_gps = lat is not None and lng is not None

                    if new_has_gps and not existing_has_gps:
                        seen_records[key] = rec
                    elif new_has_gps and existing_has_gps:
                        # If existing is PENDIENTE or MODIFICADA and new is COMPLETA, adopt new
                        if existing['Estado Encuesta'] != 'COMPLETA' and estado_enc == 'COMPLETA':
                            seen_records[key] = rec
                        else:
                            # Enrich missing metadata fields
                            if not existing['Teléfono'] and telf: existing['Teléfono'] = telf
                            if not existing['Municipio'] and muni: existing['Municipio'] = muni
                            if not existing['Estado'] and estado: existing['Estado'] = estado
                            if not existing['RIF/Cédula'] and rif: existing['RIF/Cédula'] = rif
                            if not existing['Tipo Cliente'] and tipo_cli: existing['Tipo Cliente'] = tipo_cli
                            if not existing['Email'] and email: existing['Email'] = email
                    else:
                        # Neither has GPS, enrich fields
                        if not existing['Teléfono'] and telf: existing['Teléfono'] = telf
                        if not existing['Municipio'] and muni: existing['Municipio'] = muni
                        if not existing['Estado'] and estado: existing['Estado'] = estado
                        if not existing['RIF/Cédula'] and rif: existing['RIF/Cédula'] = rif
                        if not existing['Tipo Cliente'] and tipo_cli: existing['Tipo Cliente'] = tipo_cli

    except Exception as err:
        print(f"Error reading {fn}:", err)

raw_rows = list(seen_records.values())
print(f"Total unified unique survey rows collected: {len(raw_rows)}")

# Second pass: propagate coordinates if missing from cache
propagated_count = 0
for r in raw_rows:
    if r['Latitud'] is None or r['Longitud'] is None or r['Latitud'] == 0 or r['Longitud'] == 0:
        c_name_norm = norm(r['Cliente'])
        c_rif_norm = norm(r['RIF/Cédula'])
        
        cached = coord_cache_by_name.get(c_name_norm) or coord_cache_by_rif.get(c_rif_norm)
        if cached:
            r['Latitud'] = cached[0]
            r['Longitud'] = cached[1]
            if not r['Municipio'] and cached[2]:
                r['Municipio'] = cached[2]
            if not r['Estado'] and cached[3]:
                r['Estado'] = cached[3]
            propagated_count += 1

print(f"Propagated coordinates for {propagated_count} rows!")

output_data = []
with_coords_count = 0

for i, r in enumerate(raw_rows):
    survey_id = f"SURV-{i+1:04d}"
    c_name = r['Cliente'].strip()
    norm_name = norm(c_name)
    c_rif = r['RIF/Cédula'].strip()
    
    cartera_match = cartera_norm_map.get(norm_name) or cartera_norm_map.get(norm(c_rif))
    if not cartera_match:
        for k, v in cartera_norm_map.items():
            if len(norm_name) > 6 and (norm_name in k or k in norm_name):
                cartera_match = v
                break
                
    seller = r['sellerCanonical']
    
    lat = r['Latitud']
    lng = r['Longitud']
    
    if lat is not None and lng is not None:
        with_coords_count += 1
        
    client_id = str(cartera_match['id']) if cartera_match else (c_rif if c_rif else f"ENC-{i+1:04d}")
    
    output_data.append({
        'surveyId': survey_id,
        'clienteId': client_id,
        'clienteNombre': c_name,
        'vendedorEmail': r['Vendedor'].strip(),
        'vendedor': seller,
        'estadoEncuesta': r['Estado Encuesta'].strip() or 'COMPLETA',
        'tipoCliente': r['Tipo Cliente'].strip(),
        'rifCedula': c_rif,
        'telefono': r['Teléfono'].strip(),
        'email': r['Email'].strip(),
        'estado': r['Estado'].strip(),
        'municipio': r['Municipio'].strip(),
        'latitud': lat,
        'longitud': lng,
        'notas': r['Notas'].strip(),
        'fecha': r['Fecha'].strip(),
        'matchedWithCartera': bool(cartera_match)
    })

# Save to src/data/surveyLocations.json
with open('src/data/surveyLocations.json', 'w', encoding='utf-8') as f:
    json.dump(output_data, f, indent=2, ensure_ascii=False)

print(f"Successfully generated src/data/surveyLocations.json with {len(output_data)} records! ({with_coords_count} with GPS coordinates)")

# Also update raw_survey_complete.csv
with open('scripts/raw_survey_complete.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    for r in raw_rows:
        writer.writerow({
            'Fecha': r['Fecha'],
            'Vendedor': r['Vendedor'],
            'Cliente': r['Cliente'],
            'Estado Encuesta': r['Estado Encuesta'],
            'Tipo Cliente': r['Tipo Cliente'],
            'RIF/Cédula': r['RIF/Cédula'],
            'Teléfono': r['Teléfono'],
            'Email': r['Email'],
            'Estado': r['Estado'],
            'Municipio': r['Municipio'],
            'Latitud': str(r['Latitud']) if r['Latitud'] is not None else '',
            'Longitud': str(r['Longitud']) if r['Longitud'] is not None else '',
            'Notas': r['Notas']
        })

print("Successfully updated scripts/raw_survey_complete.csv!")
