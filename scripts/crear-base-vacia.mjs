/**
 * Crea una copia VACIA de la base de datos de Control Acceso.
 *
 * Copia la estructura (tablas, columnas, indices) pero NO los datos.
 * Asi el repositorio de GitHub puede llevar una base de ejemplo sin
 * las 57 personas, sus RUT, claves, tokens y fotos.
 *
 * Uso: node scripts/crear-base-vacia.mjs
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync, statSync, copyFileSync, unlinkSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const ORIGEN = join(raiz, "data", "control-acceso.db");
const DESTINO = join(raiz, "data", "control-acceso-vacio.db");

if (!existsSync(ORIGEN)) {
  console.error("No existe la base original en", ORIGEN);
  process.exit(1);
}

/* --- Paso 1: leer la estructura de la base original --- */
const origen = new DatabaseSync(ORIGEN, { readOnly: true });

const tablas = origen
  .prepare(
    `SELECT name, sql FROM sqlite_master
     WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  )
  .all();

const indices = origen
  .prepare(
    `SELECT sql FROM sqlite_master
     WHERE type='index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'`
  )
  .all();

origen.close();

console.log(`Base original: ${ORIGEN}`);
console.log(`  Tablas: ${tablas.length}, indices: ${indices.length}\n`);

/* --- Paso 2: crear la base vacia con la misma estructura --- */
if (existsSync(DESTINO)) {
  console.log("Ya existe, se borra la anterior:");
  unlinkSync(DESTINO);
}

const nueva = new DatabaseSync(DESTINO);

nueva.exec("PRAGMA journal_mode = DELETE;");

for (const t of tablas) {
  nueva.exec(t.sql);
  console.log(`  tabla creada: ${t.name}`);
}

for (const i of indices) {
  try {
    nueva.exec(i.sql);
  } catch {
    /* algunos indices dependen de datos, no hacen falta en la vacia */
  }
}

nueva.close();

/* --- Paso 3: verificar que quedo vacia --- */
const comprobacion = new DatabaseSync(DESTINO, { readOnly: true });

const tablasNuevas = comprobacion
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  .all()
  .map((t) => t.name);

let registros = 0;
const detalle = [];

for (const t of tablasNuevas) {
  const { n } = comprobacion.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get();
  registros += n;
  detalle.push(`    ${t.padEnd(20)} ${n}`);
}

comprobacion.close();

console.log("\nVerificacion de la base vacia:");
console.log(detalle.join("\n"));
console.log(`\n  Tablas: ${tablasNuevas.length}   Registros: ${registros}`);

if (registros !== 0) {
  console.error("\nERROR: la base no quedo vacia");
  process.exit(1);
}

const kb = (statSync(DESTINO).size / 1024).toFixed(1);

console.log(`\nListo: data/control-acceso-vacio.db (${kb} KB, sin datos)`);

/* --- Comparacion de tamanos --- */
const kbOriginal = (statSync(ORIGEN).size / 1024).toFixed(1);
console.log(`  Original con datos: ${kbOriginal} KB`);
console.log(`  Vacia:              ${kb} KB`);

void copyFileSync;
