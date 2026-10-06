/**
 * Busca secretos escritos en el codigo antes de subirlo a GitHub.
 *
 * Muestra el archivo y la linea, pero NUNCA imprime el valor encontrado:
 * solo indica de que tipo de secreto se trata y cuantos caracteres tiene.
 *
 * Uso: node scripts/buscar-secretos-codigo.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const raiz = process.cwd();

/* Archivos que se van a subir */
const archivos = execFileSync("git", ["ls-files"], {
  encoding: "utf8",
  maxBuffer: 1024 * 1024 * 20,
})
  .split("\n")
  .filter((f) => /\.(js|jsx|mjs|ts|tsx|json|md|toml|yml|yaml)$/.test(f));

/* Tipos de secreto que buscamos */
const patrones = [
  { tipo: "contrasena", re: /(?:password|passwd|pwd|clave|contrasena|contraseña)\s*[:=]\s*["'`]([^"'`]{3,})["'`]/gi },
  { tipo: "secreto",   re: /(?:secret|api[_-]?key|apikey)\s*[:=]\s*["'`]([^"'`]{6,})["'`]/gi },
  { tipo: "token",     re: /(?:token|bearer)\s*[:=]\s*["'`]([^"'`]{10,})["'`]/gi },
  { tipo: "mongodb",   re: /mongodb\+srv:\/\/([^:@/\s]+):([^@/\s]+)@/gi },
  { tipo: "jwt",       re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./g },
];

/* Palabras que convierten un valor en un placeholder, no un secreto */
const placeholders =
  /^(TU_|TU$|MI_|MI$|CAMBIAR|CAMBIA|POR_TU|PLACEHOLDER|EXAMPLE|EJEMPLO|XXXX|AAAA|\.\.\.|<|process\.env|import|undefined|null|true|false|\d+$|1234|admin|test|demo)/i;

const hallazgos = [];

console.log(`Revisando ${archivos.length} archivos...\n`);

for (const archivo of archivos) {
  let contenido;

  try {
    contenido = readFileSync(archivo, "utf8");
  } catch {
    continue;
  }

  const lineas = contenido.split(/\r?\n/);

  lineas.forEach((linea, i) => {
    for (const { tipo, re } of patrones) {
      const reg = new RegExp(re.source, re.flags);
      let m;

      while ((m = reg.exec(linea)) !== null) {
        const valor = m[1] ?? m[0];

        if (!valor) continue;
        if (valor.length < 3) continue;
        if (placeholders.test(valor)) continue;
        if (/^(http|https):/.test(valor)) continue;

        hallazgos.push({
          archivo,
          linea: i + 1,
          tipo,
          largo: valor.length,
          muestra: valor.slice(0, 2) + "*".repeat(Math.min(6, valor.length - 2)),
        });
      }
    }
  });
}

if (hallazgos.length === 0) {
  console.log("No se encontraron secretos en el codigo.");
  process.exit(0);
}

console.log(`POSIBLES SECRETOS: ${hallazgos.length}\n`);

const vistos = new Set();

for (const h of hallazgos) {
  const clave = `${h.archivo}:${h.linea}:${h.tipo}`;
  if (vistos.has(clave)) continue;
  vistos.add(clave);

  console.log(`  ${h.archivo}:${h.linea}`);
  console.log(`      tipo:   ${h.tipo}`);
  console.log(`      valor:  ${h.muestra}  (${h.largo} caracteres)`);
  console.log("");
}

void raiz;
