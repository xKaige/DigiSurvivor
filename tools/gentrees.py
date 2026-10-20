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
           ma('Purificación', {'purify': 1}, 'Cada Digimon de atributo Virus que eliminás te cura un 1% de la vida'),
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
          ma('Visión de Tamer', {'cards': 1}, 'Elegís entre una carta más al subir de nivel')])},
 # conectores entre ramas (anillos 2, 5 y 8), ampliación del 22/10/2026
 'links': {('FUE', 'INT'): [at('Sueldo de Tamer', {'xp': 0.02, 'coin': 0.03}), at('Contrato', {'xp': 0.02, 'luck': 0.02}), at('Patrocinio', {'coin': 0.05, 'xp': 0.03})],
           ('INT', 'VIT'): [at('Inventario', {'healP': 0.04, 'coin': 0.02}), at('Proveedor', {'magP': 0.05, 'luck': 0.01}), at('Mercado Negro', {'rcChance': 0.05, 'acoin': 0.04})],
           ('VIT', 'VEL'): [at('Enfermería', {'revSpd': 0.08, 'hp': 4}), at('Primera Línea', {'hpP': 0.015, 'spP': 0.01}), at('Brigada', {'revSpd': 0.1, 'arm': 0.008})],
           ('VEL', 'FUE'): [at('Entrenamiento', {'dmgP': 0.015, 'xp': 0.01}), at('Disciplina', {'rateP': 0.015, 'dmgP': 0.01}), at('Instrucción', {'cdr': 0.012, 'xp': 0.02})]}}
# Ampliación del árbol de Tamer (22/10/2026, a pedido: era muy básico). Se agrega al final de cada rama sin tocar lo anterior.
TAMER_EXT = {
 'FUE': [mi('Estudio III', {'xp': 0.03}), mi('Práctica', {'dmgP': 0.012}), ma('Veterano', {'xp': 0.08, 'dmgP': 0.04}, '+8% de experiencia y +4% de daño'),
         mi('Maestría II', {'xp': 0.04}), mi('Técnica', {'crit': 0.006}), mi('Golpe de Tamer', {'dmgP': 0.015}),
         mi('Estrategia', {'cdr': 0.01}), ma('Gran Maestro', {'xp': 0.12, 'dmgP': 0.08, 'critD': 0.15}, '+12% de experiencia, +8% de daño y +15% de daño crítico')],
 'INT': [mi('Ahorro II', {'coin': 0.06}), mi('Cosecha II', {'acoin': 0.06}), ma('Saqueo', {'coin': 0.15, 'luck': 0.05}, '+15% de monedas y +5% de suerte'),
         mi('Suerte II', {'luck': 0.04}), mi('Tesoro', {'bossCoin': 0.1}), mi('Reciclaje Pro', {'rcChance': 0.05}),
         mi('Inversión', {'coin': 0.07}), ma('Magnate', {'coin': 0.25, 'acoin': 0.15, 'bossCoin': 0.25}, '+25% de monedas, +15% de datos de atributo y +25% de monedas de jefes')],
 'VIT': [mi('Imán II', {'magP': 0.06}), mi('Botiquín', {'healP': 0.05}), ma('Kit de Supervivencia', {'healP': 0.15, 'hp': 20}, 'Los ítems curan un 15% más y +20 de vida'),
         mi('Vida de Tamer', {'hp': 5}), mi('Abrigo', {'arm': 0.006}), mi('Descanso', {'regen': 0.1}),
         mi('Constitución', {'hpP': 0.015}), ma('Guardián', {'hpP': 0.08, 'regen': 0.4, 'arm': 0.04}, '+8% de vida, +0,4 de vida por segundo y -4% de daño recibido')],
 'VEL': [mi('Socorrista II', {'revSpd': 0.1}), mi('Fortuna II', {'luck': 0.03}), mi('Táctica', {'spP': 0.015}),
         ma('Re-sortear II', {'reroll': 2}, 'Dos re-sorteos más por partida'), mi('Reflejos', {'dodge': 0.005}), mi('Mando II', {'cdr': 0.01}),
         mi('Ritmo', {'rateP': 0.015}), ma('Comandante', {'rateP': 0.06, 'spP': 0.06, 'cdr': 0.04}, '+6% de velocidad de ataque y de velocidad, y -4% de recarga')]}
TAMER_NOTABLE = {'FUE': [('Prodigio', {'xp': 0.08}), ('Instinto de Tamer', {'dmgP': 0.05, 'crit': 0.02}), ('Leyenda', {'xp': 0.06, 'dmgP': 0.05})],
                 'INT': [('Billetera', {'coin': 0.12}), ('Coleccionista', {'acoin': 0.12, 'rcChance': 0.08}), ('Jackpot', {'luck': 0.1, 'bossCoin': 0.2})],
                 'VIT': [('Mochila Grande', {'healP': 0.1, 'magP': 0.1}), ('Corazón Firme', {'hp': 18, 'regen': 0.2}), ('Refugio', {'arm': 0.03, 'hpP': 0.03})],
                 'VEL': [('Rescatista', {'revSpd': 0.3, 'revHP': 0.15}), ('Viento a Favor', {'spP': 0.05, 'dodge': 0.02}), ('Mente Rápida', {'cdr': 0.03, 'rateP': 0.03})]}

# ---- Ampliación (~100 nodos por árbol). Los nodos de arriba NO se tocan (ids y efectos), así no se rompe lo comprado. ----
# EXT: nodos que se agregan al final de cada rama (la rama sigue derecho; el último es un principal nuevo)
EXT = {
 'vac': {'VIT': [mi('Vida II', {'hp': 6}), mi('Regeneración II', {'regen': 0.15}), mi('Constitución II', {'hpP': 0.02}),
                 ma('Inquebrantable', {'shield': 7, 'arm': 0.08}, 'Bloqueás un golpe cada 7 segundos y recibís un 8% menos de daño')],
         'FUE': [mi('Poder III', {'dmgP': 0.02}), mi('Antivirus II', {'vs1': 0.03}), mi('Precisión II', {'crit': 0.01}),
                 ma('Espada Sagrada', {'dmgP': 0.1, 'critD': 0.2}, '+10% de daño y +20% de daño crítico')],
         'VEL': [mi('Paso II', {'spP': 0.02}), mi('Reflejos II', {'dodge': 0.01}), mi('Cadencia II', {'rateP': 0.02}),
                 ma('Ángel Veloz', {'spP': 0.1, 'dodge': 0.05}, '+10% de velocidad y +5% de esquiva')],
         'INT': [mi('Concentración II', {'cdr': 0.015}), mi('Estudio II', {'xp': 0.02}), mi('Alcance II', {'area': 0.02}),
                 ma('Revelación', {'cdr': 0.08, 'area': 0.08}, '-8% de recarga y +8% de área')]},
 'vir': {'FUE': [mi('Furia III', {'dmgP': 0.025}), mi('Brutalidad II', {'critD': 0.04}), mi('Mordida II', {'leech': 0.003}),
                 ma('Devorador', {'leech': 0.03, 'dmgP': 0.08}, 'Robás un 3% más del daño y +8% de daño')],
         'VEL': [mi('Acecho III', {'spP': 0.02}), mi('Ráfaga II', {'rateP': 0.02}), mi('Esquiva II', {'dodge': 0.008}),
                 ma('Depredador', {'moveDmg': 0.1, 'spP': 0.08}, '+10% de daño al moverte y +8% de velocidad')],
         'INT': [mi('Código II', {'cdr': 0.015}), mi('Persistencia II', {'dur': 0.03}), mi('Carga II', {'spg': 0.05}),
                 ma('Pandemia', {'dur': 0.15, 'area': 0.1}, '+15% de duración y +10% de área')],
         'VIT': [mi('Carne II', {'hp': 5}), mi('Sangre II', {'leech': 0.002}), mi('Resistencia II', {'hpP': 0.02}),
                 ma('Regeneración Viral', {'regen': 0.6, 'lowRegen': 1}, '+0,6 de vida por segundo, y +1 más con menos del 30% de vida')]},
 'dat': {'INT': [mi('Persistencia II', {'dur': 0.03}), mi('Batería II', {'spg': 0.06}), mi('Memoria', {'cdr': 0.015}),
                 ma('Supercomputadora', {'cdr': 0.08, 'spg': 0.15}, '-8% de recarga y +15% de carga de SP')],
         'FUE': [mi('Cálculo II', {'dmgP': 0.02}), mi('Precisión II', {'crit': 0.01}), mi('Optimización II', {'critD': 0.04}),
                 ma('Exploit', {'crit': 0.06, 'vs0': 0.08}, '+6% de crítico y +8% de daño contra Vacuna')],
         'VEL': [mi('Transferencia II', {'spP': 0.02}), mi('Recolector II', {'magP': 0.06}), mi('Ciclo II', {'rateP': 0.02}),
                 ma('Fibra Óptica', {'spP': 0.08, 'rateP': 0.08}, '+8% de velocidad y de ataque')],
         'VIT': [mi('Integridad II', {'hp': 5}), mi('Encriptado II', {'arm': 0.01}), mi('Redundancia II', {'hpP': 0.02}),
                 ma('Copia de Seguridad', {'arm': 0.06, 'bulletRes': 0.1}, '-6% de daño recibido y -10% de daño de balas')]}}
# NOTABLE: punta de cada ramita lateral (1 nivel, efecto más fuerte), en el orden en que salen de la rama
NOTABLE = {
 'vac': {'FUE': [('Hoja Bendita', {'dmgP': 0.04, 'vs1': 0.04}), ('Golpe Justo', {'crit': 0.03, 'critD': 0.08}), ('Cruzada', {'vs1': 0.08})],
         'VIT': [('Muralla', {'hp': 20, 'arm': 0.02}), ('Fuente de Vida', {'regen': 0.4}), ('Armadura Santa', {'arm': 0.04}), ('Vigor', {'hpP': 0.06})],
         'VEL': [('Viento Sagrado', {'spP': 0.05}), ('Esquiva Celestial', {'dodge': 0.03}), ('Socorro Rápido', {'revSpd': 0.4})],
         'INT': [('Sabiduría', {'xp': 0.06, 'cdr': 0.02}), ('Plegaria', {'healP': 0.15, 'regen': 0.15}), ('Halo', {'area': 0.06})]},
 'vir': {'FUE': [('Colmillo', {'critD': 0.1}), ('Sed', {'leech': 0.01}), ('Masacre', {'dmgP': 0.06}), ('Asesino', {'crit': 0.03})],
         'VEL': [('Emboscada', {'moveDmg': 0.05}), ('Velocidad Letal', {'rateP': 0.06}), ('Sombra', {'dodge': 0.03})],
         'INT': [('Virulencia', {'dur': 0.08}), ('Mutágeno', {'spg': 0.12}), ('Brote', {'area': 0.06})],
         'VIT': [('Tejido Vivo', {'regen': 0.3}), ('Hambre', {'leech': 0.006}), ('Coraza Orgánica', {'hp': 15})]},
 'dat': {'INT': [('Paralelismo', {'cdr': 0.03}), ('Big Data', {'area': 0.06}), ('Latencia Cero', {'dur': 0.08}), ('Overclock', {'spg': 0.12})],
         'FUE': [('Inyección', {'dmgP': 0.05}), ('Vulnerabilidad', {'critD': 0.1}), ('Escaneo', {'crit': 0.03})],
         'VEL': [('Banda Ancha', {'magP': 0.15}), ('Ping', {'rateP': 0.05}), ('Streaming', {'spP': 0.05})],
         'VIT': [('Checksum', {'bulletRes': 0.06}), ('RAID', {'hpP': 0.05}), ('Escudo Antivirus', {'arm': 0.03})]}}
# LINKS2: conectores de los anillos 8 y 10 (los de los anillos 2 y 5 están en TREES[...]['links'])
LINKS2 = {
 'vac': {('FUE', 'INT'): [at('Purga Mayor', {'vs1': 0.04, 'cdr': 0.01}), at('Luz Divina', {'vs1': 0.05, 'area': 0.02})],
         ('INT', 'VIT'): [at('Serenidad', {'regen': 0.2}), at('Gracia', {'regen': 0.2, 'hpP': 0.02})],
         ('VIT', 'VEL'): [at('Bastión Ágil', {'arm': 0.015, 'spP': 0.01}), at('Égida', {'arm': 0.02, 'dodge': 0.01})],
         ('VEL', 'FUE'): [at('Valor Sagrado', {'dmgP': 0.02, 'spP': 0.01}), at('Paladín', {'dmgP': 0.03, 'crit': 0.01})]},
 'vir': {('FUE', 'INT'): [at('Epidemia', {'vs2': 0.04, 'dur': 0.02}), at('Cepa Letal', {'vs2': 0.05, 'critD': 0.03})],
         ('INT', 'VIT'): [at('Huésped', {'leech': 0.003, 'regen': 0.1}), at('Simbionte', {'leech': 0.004, 'hp': 6})],
         ('VIT', 'VEL'): [at('Bestia', {'spP': 0.02, 'hp': 5}), at('Instinto Puro', {'spP': 0.02, 'dodge': 0.01})],
         ('VEL', 'FUE'): [at('Crueldad', {'critD': 0.05}), at('Carnicero', {'critD': 0.05, 'dmgP': 0.02})]},
 'dat': {('FUE', 'INT'): [at('Compilador', {'vs0': 0.04, 'crit': 0.005}), at('Kernel', {'vs0': 0.05, 'cdr': 0.01})],
         ('INT', 'VIT'): [at('Firmware', {'cdr': 0.015, 'hp': 5}), at('Sistema Estable', {'cdr': 0.015, 'hpP': 0.02})],
         ('VIT', 'VEL'): [at('Router', {'magP': 0.05, 'spP': 0.01}), at('Red Mesh', {'magP': 0.06, 'arm': 0.01})],
         ('VEL', 'FUE'): [at('Paquetes', {'area': 0.02, 'rateP': 0.01}), at('Torrent', {'area': 0.025, 'dmgP': 0.02})]}}
PERP = {'FUE': (1, 0), 'VIT': (1, 0), 'INT': (0, 1), 'VEL': (0, 1)}
ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

def cost(t, depth, tamer):
    if tamer: return {'minor': [30 + 15 * depth, 1], 'attr': [60 + 20 * depth, 1], 'major': [200 + 100 * depth, 0]}[t]
    return {'minor': [2 + depth, 1], 'attr': [4 + depth, 1], 'major': [10 + 6 * depth, 0]}[t]

def build(T, tamer=False, key=None):
    nodes = [{'id': 'start', 't': 'start', 'n': 'Inicio', 'x': 0, 'y': 0, 'm': 1, 'fx': {}, 'link': [], 'd': T['about']}]
    arms = {}
    for arm, spec in T['arms'].items():
        title, lst = ((spec[0], spec[1] + TAMER_EXT[arm]) if tamer else (ARMN[arm], spec + EXT[key][arm]))
        dx, dy = DIRS[arm]; prev = 'start'; ids = []
        for i, nd in enumerate(lst, 1):
            nid = arm.lower() + str(i)
            c = cost(nd['t'], i, tamer)
            n = {'id': nid, 't': nd['t'], 'n': nd['n'], 'x': dx * STEP * i, 'y': dy * STEP * i, 'm': nd['m'], 'fx': nd['fx'],
                 'link': [prev], 'c': c[0], 'cl': c[1], 'arm': arm}
            if nd.get('d'): n['d'] = nd['d']
            nodes.append(n); prev = nid; ids.append(nid)
        arms[arm] = ids
    if True:
        for (a, b), lst in T['links'].items():
            for k, (ring, nd) in enumerate(zip((2, 5, 8, 10), lst + (LINKS2[key][(a, b)] if not tamer else []))):
                (ax, ay), (bx, by) = DIRS[a], DIRS[b]
                r = STEP * ring * 0.78
                nid = 'x' + a.lower() + b.lower() + str(k + 1)
                c = cost('attr', ring, tamer)
                n = {'id': nid, 't': 'attr', 'n': T['name'] + ': ' + nd['n'], 'x': round((ax + bx) * r), 'y': round((ay + by) * r), 'm': nd['m'],
                     'fx': nd['fx'], 'link': [arms[a][ring - 1], arms[b][ring - 1]], 'c': c[0], 'cl': c[1]}
                nodes.append(n)
        # ramitas laterales: salen de los nodos 3, 6, 9 (y 12 en la rama larga), alternando el lado: 2 secundarios + un notable
        for arm, ids in arms.items():
            dx, dy = DIRS[arm]; px, py = PERP[arm]
            tmpl = [n for n in (T['arms'][arm][1] + TAMER_EXT[arm] if tamer else T['arms'][arm] + EXT[key][arm]) if n['t'] == 'minor']
            NOT = TAMER_NOTABLE if tamer else NOTABLE[key]
            used = {}
            for w, k in enumerate(range(3, len(ids) + 1, 3)):
                if w >= len(NOT[arm]): break
                side = 1 if w % 2 == 0 else -1
                bx, by = dx * STEP * k, dy * STEP * k; prev = ids[k - 1]
                for j in (1, 2, 3):
                    nid = arm.lower() + 't' + str(k) + '_' + str(j)
                    x, y = round(bx + side * px * STEP * 0.78 * j), round(by + side * py * STEP * 0.78 * j)
                    if j < 3:
                        t0 = tmpl[(w * 2 + j - 1) % len(tmpl)]
                        parts = t0['n'].rsplit(' ', 1)
                        base = parts[0] if len(parts) == 2 and parts[1] in ROMAN else t0['n']
                        used[base] = used.get(base, 3) + 1
                        nd = {'t': 'minor', 'n': base + ' ' + ROMAN[used[base]], 'fx': t0['fx'], 'm': 5}
                    else:
                        nm, fx = NOT[arm][w]
                        nd = {'t': 'major', 'n': nm, 'fx': fx, 'm': 1}
                    c = cost(nd['t'], k + j, tamer)
                    n = {'id': nid, 't': nd['t'], 'n': nd['n'], 'x': x, 'y': y, 'm': nd['m'], 'fx': nd['fx'], 'link': [prev], 'c': c[0], 'cl': c[1]}
                    if nd['t'] == 'major': n['notable'] = 1
                    nodes.append(n); prev = nid
    return {'name': T['name'], 'col': T['col'], 'cur': T['cur'], 'fav': T.get('fav'), 'about': T['about'],
            'arms': {k: (v[0] if tamer else ARMN[k]) for k, v in T['arms'].items()}, 'nodes': nodes}

data = {'note': 'Generado por gentrees.py (sesión 0.6). c = costo base, cl = 1 si el costo se multiplica por el nivel.',
        'trees': {k: build(v, key=k) for k, v in TREES.items()}}
data['trees']['tam'] = build(TAMER, True)
json.dump(data, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for k, v in data['trees'].items(): print(k, len(v['nodes']), 'nodos')
