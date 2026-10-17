# Genera src/data/trees.json: 3 árboles de atributo (cruz FUE/INT/VEL/VIT) y el árbol de Tamer.
# Uso: py -P gentrees.py <salida.json>
import json, sys
out = sys.argv[1]
STEP = 110
DIRS = {'FUE': (0, -1), 'INT': (1, 0), 'VIT': (0, 1), 'VEL': (-1, 0)}
ARMN = {'FUE': 'Fuerza', 'INT': 'Inteligencia', 'VIT': 'Vitalidad', 'VEL': 'Velocidad'}
NEXT = {'FUE': 'INT', 'INT': 'VIT', 'VIT': 'VEL', 'VEL': 'FUE'}   # vecinos para los conectores

def mi(n, fx, d=None): return {'t': 'minor', 'n': n, 'fx': fx, 'm': 5, 'd': d}
def ma(n, fx, d): return {'t': 'major', 'n': n, 'fx': fx, 'm': 1, 'd': d}
def at(n, fx, d=None): return {'t': 'attr', 'n': n, 'fx': fx, 'm': 3, 'd': d}

TREES = {
 'vac': {'name': 'Vacuna', 'col': '#4db8ff', 'cur': 'vac', 'fav': 'VIT', 'about': 'Los protectores: aguantar, curarse y proteger al compañero',
  'arms': {
   'VIT': [mi('Vida', {'hp': 6}), mi('Coraza', {'arm': 0.01}),
           ma('Escudo Sagrado', {'shield': 10}, 'Bloqueás un golpe cada 10 segundos'),
           mi('Regeneración', {'regen': 0.15}), mi('Constitución', {'hpP': 0.02}),
           ma('Último Bastión', {'lastStand': 1}, 'Una vez por partida, un golpe mortal te deja con 1 de vida y 3 s invulnerable'),
           mi('Botiquín', {'healP': 0.06}), mi('Coraza II', {'arm': 0.01}),
           ma('Fortaleza Sagrada', {'arm': 0.1, 'hpP': 0.1}, '-10% de daño recibido y +10% de vida')],
   'FUE': [mi('Poder', {'dmgP': 0.02}), mi('Antivirus', {'vs1': 0.03}),
           ma('Purificación', {'purify': 1}, 'Cada Virus que eliminás te cura un 1% de la vida'),
           mi('Precisión', {'crit': 0.01}), mi('Poder II', {'dmgP': 0.02}),
           ma('Juicio', {'vs1': 0.25}, '+25% de daño contra Virus')],
   'VEL': [mi('Paso', {'spP': 0.02}), mi('Reflejos', {'dodge': 0.01}),
           ma('Paso Ligero', {'dodge': 0.08}, '+8% de chance de esquivar golpes'),
           mi('Cadencia', {'rateP': 0.02}), mi('Socorro', {'revSpd': 0.1}),
           ma('Rescate', {'revSpd': 1, 'revHP': 0.25}, 'Revivís compañeros el doble de rápido y vuelven con 75% de vida')],
   'INT': [mi('Concentración', {'cdr': 0.015}), mi('Estudio', {'xp': 0.02}),
           ma('Aura Curativa', {'aura': 1}, 'Los compañeros cerca tuyo se curan 1,5 de vida por segundo'),
           mi('Alcance', {'area': 0.02}), mi('Medicina', {'healP': 0.05}),
           ma('Bendición', {'healP': 0.5, 'regen': 0.5}, 'Los ítems curan un 50% más y +0,5 de vida por segundo')]},
  'links': {('FUE', 'INT'): [at('Purga', {'vs1': 0.03}), at('Juicio Lúcido', {'vs1': 0.03, 'cdr': 0.01})],
            ('INT', 'VIT'): [at('Calma', {'regen': 0.1}), at('Templanza', {'regen': 0.15, 'hp': 4})],
            ('VIT', 'VEL'): [at('Guardia', {'arm': 0.01}), at('Guardia Ágil', {'arm': 0.01, 'dodge': 0.01})],
            ('VEL', 'FUE'): [at('Coraje', {'dmgP': 0.015}), at('Carga Sagrada', {'dmgP': 0.02, 'spP': 0.01})]}},
 'vir': {'name': 'Virus', 'col': '#c05bff', 'cur': 'vir', 'fav': 'FUE', 'about': 'Los agresivos: mucho daño a cambio de riesgo',
  'arms': {
   'FUE': [mi('Furia', {'dmgP': 0.025}), mi('Instinto', {'crit': 0.01}),
           ma('Berserker', {'berserk': 1}, 'Con menos del 30% de vida hacés +40% de daño'),
           mi('Brutalidad', {'critD': 0.04}), mi('Mordida', {'leech': 0.003}),
           ma('Sed de Datos', {'leech': 0.04}, 'Robás un 4% del daño que hacés'),
           mi('Furia II', {'dmgP': 0.025}), mi('Instinto II', {'crit': 0.01}),
           ma('Ejecución', {'execute': 0.12}, 'Los enemigos que quedan con menos del 12% de vida mueren de un golpe')],
   'VEL': [mi('Acecho', {'spP': 0.02}), mi('Ráfaga', {'rateP': 0.02}),
           ma('Frenesí', {'moveDmg': 0.15}, 'Mientras te movés hacés +15% de daño'),
           mi('Acecho II', {'spP': 0.02}), mi('Esquiva', {'dodge': 0.008}),
           ma('Cazador', {'killSpeed': 1}, 'Al eliminar un enemigo, +15% de velocidad por 2 s')],
   'INT': [mi('Código', {'cdr': 0.015}), mi('Persistencia', {'dur': 0.03}),
           ma('Infección', {'infect': 1}, 'Tus golpes infectan: el enemigo pierde un 20% extra en 3 s'),
           mi('Carga', {'spg': 0.05}), mi('Propagación', {'area': 0.02}),
           ma('Corrupción', {'corrupt': 1}, 'Los infectados explotan al morir y dañan a los de alrededor')],
   'VIT': [mi('Carne', {'hp': 5}), mi('Sangre', {'leech': 0.002}),
           ma('Sangre Fría', {'lowRegen': 2}, 'Con menos del 30% de vida te curás 2 por segundo'),
           mi('Resistencia', {'hpP': 0.02}), mi('Mutación', {'regen': 0.1}),
           ma('Oscuridad Dominada', {'darkMaster': 1, 'dmgP': 0.05}, 'La evolución oscura solo te baja hasta el 60% de vida, y +5% de daño')]},
  'links': {('FUE', 'INT'): [at('Contagio', {'vs2': 0.03}), at('Plaga', {'vs2': 0.03, 'dur': 0.02})],
            ('INT', 'VIT'): [at('Parásito', {'leech': 0.002}), at('Simbiosis', {'leech': 0.002, 'regen': 0.1})],
            ('VIT', 'VEL'): [at('Instinto Salvaje', {'spP': 0.015}), at('Huida', {'spP': 0.015, 'hp': 4})],
            ('VEL', 'FUE'): [at('Saña', {'critD': 0.03}), at('Golpe Bajo', {'critD': 0.04, 'crit': 0.005})]}},
 'dat': {'name': 'Dato', 'col': '#ffb02e', 'cur': 'dat', 'fav': 'INT', 'about': 'Los técnicos: skills, control del campo y eficiencia',
  'arms': {
   'INT': [mi('Procesador', {'cdr': 0.02}), mi('Expansión', {'area': 0.025}),
           ma('Sobrecarga', {'overload': 1}, 'Cada 5 skills que usás, la quinta sale dos veces'),
           mi('Persistencia', {'dur': 0.03}), mi('Batería', {'spg': 0.06}),
           ma('Compresión', {'slots': 1}, 'Podés tener una skill activa más (5 en vez de 4)'),
           mi('Procesador II', {'cdr': 0.02}), mi('Expansión II', {'area': 0.025}),
           ma('Aprendizaje', {'cards': 1}, 'Elegís entre una carta más al subir de nivel')],
   'FUE': [mi('Cálculo', {'dmgP': 0.02}), mi('Antivacuna', {'vs0': 0.03}),
           ma('Análisis', {'vs0': 0.1, 'crit': 0.05}, '+10% de daño contra Vacuna y +5% de crítico'),
           mi('Precisión', {'crit': 0.01}), mi('Optimización', {'critD': 0.04}),
           ma('Punto Débil', {'critD': 0.5}, 'Los críticos hacen +50% de daño')],
   'VEL': [mi('Transferencia', {'spP': 0.02}), mi('Recolector', {'magP': 0.06}),
           ma('Campo de Datos', {'slowAura': 1}, 'Los enemigos cerca tuyo van un 20% más lentos'),
           mi('Ciclo', {'rateP': 0.02}), mi('Caché', {'cdr': 0.01}),
           ma('Recarga Dinámica', {'moveCdr': 0.25}, 'Mientras te movés, tus skills recargan un 25% más rápido')],
   'VIT': [mi('Integridad', {'hp': 5}), mi('Encriptado', {'arm': 0.01}),
           ma('Firewall', {'bulletRes': 0.25}, 'Las balas enemigas te hacen un 25% menos'),
           mi('Redundancia', {'hpP': 0.02}), mi('Filtro', {'bulletRes': 0.03}),
           ma('Respaldo', {'backup': 1}, 'Una vez por partida, al caer volvés con 50% de vida')]},
  'links': {('FUE', 'INT'): [at('Algoritmo', {'vs0': 0.03}), at('Heurística', {'vs0': 0.03, 'crit': 0.005})],
            ('INT', 'VIT'): [at('Compilación', {'cdr': 0.01}), at('Depuración', {'cdr': 0.01, 'hp': 4})],
            ('VIT', 'VEL'): [at('Protocolo', {'magP': 0.04}), at('Ancho de Banda', {'magP': 0.04, 'spP': 0.01})],
            ('VEL', 'FUE'): [at('Paquete', {'area': 0.015}), at('Ráfaga de Datos', {'area': 0.02, 'rateP': 0.01})]}}
}
TAMER = {'name': 'Tamer', 'col': '#4dffb8', 'cur': 'coins', 'about': 'Mejoras de tu cuenta: sirven con cualquier Digimon',
 'arms': {
  'FUE': ('Experiencia', [mi('Estudio', {'xp': 0.03}), mi('Estudio II', {'xp': 0.03}),
          ma('Inicio Rápido', {'quick': 1}, 'La primera evolución llega un nivel antes'), mi('Maestría', {'xp': 0.04})]),
  'INT': ('Botín', [mi('Ahorro', {'coin': 0.06}), mi('Cosecha', {'acoin': 0.06}),
          ma('Cazarrecompensas', {'bossCoin': 0.5}, 'Los jefes dan un 50% más de monedas'), mi('Suerte', {'luck': 0.04})]),
  'VIT': ('Logística', [mi('Imán', {'magP': 0.06}), mi('Reciclaje', {'rcChance': 0.06}),
          ma('Mochila', {'itemStart': 1}, 'Empezás cada partida con una Carne al lado'), mi('Primeros Auxilios', {'healP': 0.05})]),
  'VEL': ('Mando', [mi('Socorrista', {'revSpd': 0.1}),
          ma('Re-sortear', {'reroll': 2}, 'Dos veces por partida podés cambiar las cartas que te salieron'),
          mi('Fortuna', {'luck': 0.03}),
          ma('Visión de Tamer', {'cards': 1}, 'Elegís entre una carta más al subir de nivel')])}}

def cost(t, depth, tamer):
    if tamer: return {'minor': [30 + 15 * depth, 1], 'major': [200 + 100 * depth, 0]}[t]
    return {'minor': [2 + depth, 1], 'attr': [4 + depth, 1], 'major': [10 + 6 * depth, 0]}[t]

def build(T, tamer=False):
    nodes = [{'id': 'start', 't': 'start', 'n': 'Inicio', 'x': 0, 'y': 0, 'm': 1, 'fx': {}, 'link': [], 'd': T['about']}]
    arms = {}
    for arm, spec in T['arms'].items():
        title, lst = (spec if tamer else (ARMN[arm], spec))
        dx, dy = DIRS[arm]; prev = 'start'; ids = []
        for i, nd in enumerate(lst, 1):
            nid = arm.lower() + str(i)
            c = cost(nd['t'], i, tamer)
            n = {'id': nid, 't': nd['t'], 'n': nd['n'], 'x': dx * STEP * i, 'y': dy * STEP * i, 'm': nd['m'], 'fx': nd['fx'],
                 'link': [prev], 'c': c[0], 'cl': c[1], 'arm': arm}
            if nd.get('d'): n['d'] = nd['d']
            nodes.append(n); prev = nid; ids.append(nid)
        arms[arm] = ids
    if not tamer:
        for (a, b), lst in T['links'].items():
            for k, (ring, nd) in enumerate(zip((2, 5), lst)):
                (ax, ay), (bx, by) = DIRS[a], DIRS[b]
                r = STEP * ring * 0.78
                nid = 'x' + a.lower() + b.lower() + str(k + 1)
                c = cost('attr', ring, False)
                n = {'id': nid, 't': 'attr', 'n': T['name'] + ': ' + nd['n'], 'x': round((ax + bx) * r), 'y': round((ay + by) * r), 'm': nd['m'],
                     'fx': nd['fx'], 'link': [arms[a][ring - 1], arms[b][ring - 1]], 'c': c[0], 'cl': c[1]}
                nodes.append(n)
    return {'name': T['name'], 'col': T['col'], 'cur': T['cur'], 'fav': T.get('fav'), 'about': T['about'],
            'arms': {k: (v[0] if tamer else ARMN[k]) for k, v in T['arms'].items()}, 'nodes': nodes}

data = {'note': 'Generado por gentrees.py (sesión 0.6). c = costo base, cl = 1 si el costo se multiplica por el nivel.',
        'trees': {k: build(v) for k, v in TREES.items()}}
data['trees']['tam'] = build(TAMER, True)
json.dump(data, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for k, v in data['trees'].items(): print(k, len(v['nodes']), 'nodos')
