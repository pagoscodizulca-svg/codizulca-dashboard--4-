import csv
import json
import re

# We will read from scripts/raw_survey_complete.csv
# and update src/data/surveyLocations.json
email_to_seller = {
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
    'oswaldochurioncodizulca@gmail.com': 'OSCAR ORTIZ - LA COSTA',
    'josegonzalez@codizulca.com': 'JOSE G. GONZALEZ',
    'luisammv.1990@gmail.com': 'VICTORIA VARGAS'
}

def norm(text):
    if not text: return ''
    t = text.upper()
    t = re.sub(r'[\.,;\"\'\(\)]', ' ', t)
    t = re.sub(r'\b(C\s*A|S\s*A|F\s*P|E\s*I\s*R\s*L|S\s*R\s*L)\b', '', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t

with open('scripts/raw_survey_complete.csv', 'r', encoding='utf-8', errors='ignore') as f:
    reader = csv.DictReader(f)
    raw_rows = list(reader)

with open('src/data/carteraClientes.json', 'r', encoding='utf-8') as f:
    cartera = json.load(f)

cartera_by_norm = {norm(c['nombre']): c for c in cartera}

survey_records = []
seen_coords = set()

for i, s in enumerate(raw_rows):
    client_name = s.get('Cliente', '').strip()
    if not client_name:
        continue
    
    lat_str = s.get('Latitud', '').strip()
    lng_str = s.get('Longitud', '').strip()
    
    lat = None
    lng = None
    if lat_str and lng_str:
        try:
            lat = float(lat_str)
            lng = float(lng_str)
        except ValueError:
            lat = None
            lng = None

    em = s.get('Vendedor', '').strip().lower()
    seller = email_to_seller.get(em, s.get('Vendedor', ''))
    sn = norm(client_name)
    c_match = cartera_by_norm.get(sn)
    if not c_match:
        for cn, c in cartera_by_norm.items():
            if (len(sn) > 6 and sn in cn) or (len(cn) > 6 and cn in sn):
                c_match = c
                break

    cid = c_match['id'] if c_match else f'ENC-{i+1:04d}'
    
    rec = {
        'surveyId': f'SURV-{i+1:04d}',
        'clienteId': cid,
        'clienteNombre': client_name,
        'vendedorEmail': em,
        'vendedor': seller,
        'estadoEncuesta': s.get('Estado Encuesta', 'COMPLETA').strip(),
        'tipoCliente': s.get('Tipo Cliente', '').strip(),
        'rifCedula': s.get('RIF/Cédula', '').strip(),
        'telefono': s.get('Teléfono', '').strip(),
        'email': s.get('Email', '').strip(),
        'estado': s.get('Estado', '').strip() or 'Zulia',
        'municipio': s.get('Municipio', '').strip(),
        'latitud': lat if lat is not None else 0.0,
        'longitud': lng if lng is not None else 0.0,
        'hasGps': lat is not None and lng is not None and lat != 0.0,
        'notas': s.get('Notas', '').strip(),
        'fecha': s.get('Fecha', '').strip(),
        'matchedWithCartera': bool(c_match)
    }
    survey_records.append(rec)

with open('src/data/surveyLocations.json', 'w', encoding='utf-8') as f:
    json.dump(survey_records, f, indent=2, ensure_ascii=False)

print(f"Processed {len(survey_records)} records. GPS verified: {sum(1 for r in survey_records if r['hasGps'])}")
