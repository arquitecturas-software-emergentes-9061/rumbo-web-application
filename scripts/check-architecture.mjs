import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const app = resolve('src/app');
const violations = [];
const layers = new Set(['domain', 'application', 'infrastructure', 'presentation']);

function walk(directory) {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

for (const context of ['iam', 'planning', 'analytics']) {
  for (const layer of layers) {
    if (!existsSync(join(app, context, layer))) violations.push(`${context}/${layer} is missing`);
  }
}
for (const legacy of ['core', 'features']) {
  const directory = join(app, legacy);
  if (existsSync(directory) && walk(directory).some(file => file.endsWith('.ts')))
    violations.push(`${legacy} still owns TypeScript source`);
}

for (const file of walk(app).filter(path => path.endsWith('.ts') && !path.endsWith('.spec.ts'))) {
  const parts = relative(app, file).split(sep);
  const [context, layer] = parts;
  if (!['iam', 'planning', 'analytics'].includes(context) || !layers.has(layer)) continue;
  const source = readFileSync(file, 'utf8');
  const imports = source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g);
  for (const [, specifier] of imports) {
    if (layer === 'domain' && specifier.startsWith('@angular/'))
      violations.push(`${relative(app, file)}: domain imports Angular`);
    if (layer === 'application' && specifier.startsWith('@angular/common/http'))
      violations.push(`${relative(app, file)}: application imports HTTP`);
    if (!specifier.startsWith('.')) continue;
    const target = resolve(dirname(file), specifier);
    const targetParts = relative(app, target).split(sep);
    if (targetParts[0] !== context && targetParts[0] !== '..'
        && !(layer === 'presentation' && targetParts[0] === 'shared' && targetParts[1] === 'presentation'))
      violations.push(`${relative(app, file)}: imports another context directly`);
    if (layer === 'domain' && targetParts[1] !== 'domain')
      violations.push(`${relative(app, file)}: domain imports ${targetParts[1]}`);
    if (layer === 'application' && ['infrastructure', 'presentation'].includes(targetParts[1]))
      violations.push(`${relative(app, file)}: application imports ${targetParts[1]}`);
    if (layer === 'presentation' && targetParts[1] === 'infrastructure')
      violations.push(`${relative(app, file)}: presentation imports infrastructure`);
    if (layer === 'infrastructure' && targetParts[1] === 'presentation')
      violations.push(`${relative(app, file)}: infrastructure imports presentation`);
  }
}

if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log('DDD boundaries: OK');
}
