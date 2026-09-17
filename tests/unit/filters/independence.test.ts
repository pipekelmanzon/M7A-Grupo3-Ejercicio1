import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Verifica que ningún filtro importe a otro filtro ni a la capa HTTP.
 * Un filtro solo puede depender del núcleo del pipeline, del dominio, de
 * repositorios y servicios expuestos por interfaz, y de utilidades. Esto
 * es lo que permite probar cada filtro por separado, como pide la letra.
 */

const projectRoot = path.resolve(__dirname, '..', '..', '..');
const filtersDir = path.join(projectRoot, 'src', 'filters');

function importSpecifiers(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf8');
  return [...content.matchAll(/from\s+['"](.+?)['"]/g)].map((match) => match[1]!);
}

function resolvesInsideFilters(fromFile: string, specifier: string): boolean {
  if (!specifier.startsWith('.')) return false;
  const resolved = path.normalize(path.join(path.dirname(fromFile), specifier));
  return resolved.startsWith(filtersDir);
}

function referencesHttpLayer(specifier: string): boolean {
  return specifier === 'express' || specifier.includes('/http/') || specifier.includes('../http');
}

describe('independencia de los filtros', () => {
  const files = readdirSync(filtersDir).filter((file) => file.endsWith('.ts'));

  it('hay filtros para revisar', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s no importa a otro filtro ni a la capa HTTP', (file) => {
    const filePath = path.join(filtersDir, file);
    const specifiers = importSpecifiers(filePath);

    const importsAnotherFilter = specifiers.filter((specifier) => resolvesInsideFilters(filePath, specifier));
    const importsHttpLayer = specifiers.filter(referencesHttpLayer);

    expect(importsAnotherFilter).toEqual([]);
    expect(importsHttpLayer).toEqual([]);
  });
});
