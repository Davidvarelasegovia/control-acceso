/**
 * Revisa quantas personas hay en la base de datos de Control Acceso.
 *
 * Solo muestra CANTIDADES y NOMBRES DE COLUMNAS, jamas datos personales,
 * credenciales ni fotos. Sirve para decidir si la base se puede subir
 * a GitHub o si hay que dejarla fuera.
 */
import { DatabaseSync } from "node:sqlite";
import { statSync } from "node:fs";

const ruta = process.argv[2] || "D:/Control_acceso/data/control-acceso.db";

console.log(`Base:  ${ruta}`);
console.log(`Peso:  ${Math.round(statSync(ruta).size / 1024)} KB\n`);

const db = new DatabaseSync(ruta, { readOnly: true });

const tablas = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  .all()
  .map((t) => t.name);

let total = 0;

console.log("Registros por tabla:");
for (const tabla of tablas) {
  try {
    const { n } = db.prepare(`SELECT COUNT(*) AS n FROM "${tabla}"`).get();
    total += n;
    console.log(`  ${tabla.padEnd(20)} ${String(n).padStart(5)}`);
  } catch {
    console.log(`  ${tabla.padEnd(20)}     ?`);
  }
}
console.log(`\nTotal de registros: ${total}`);

/* --- Columnas sospechosas de contener datos personales --- */
const sospechosos =
  /password|contrasena|clave|hash|token|secret|cedula|rut\b|dni|email|correo|telefono|foto|imagen|base64|sueldo|ingreso|direccion/i;

console.log("\nColumnas con datos personales o credenciales:");

let tablasConDatos = [];

for (const tabla of tablas) {
  try {
    const columnas = db.prepare(`PRAGMA table_info("${tabla}")`).all();
    const malas = columnas.map((c) => c.name).filter((c) => sospechosos.test(c));

    if (malas.length > 0) {
      console.log(`\n  ${tabla}`);
      for (const c of malas) console.log(`      - ${c}`);
      tablasConDatos.push(tabla);
    }
  } catch {
    /* no se pudo inspeccionar */
  }
}

if (tablasConDatos.length === 0) {
  console.log("\n  (ninguna)");
}

db.close();

console.log(
  `\nConclusion: hay ${tablasConDatos.length} tablas con datos sensibles.`
);
console.log(
  "Si el repositorio de GitHub es publico, esta base NO debe subirse."
);
