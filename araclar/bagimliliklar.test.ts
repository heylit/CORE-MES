import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Sunucu modülleri `uclar.ts` ithal edilerek keşfedilir: tek bir modülün geliştirme paketine bağlı olması bütün sunucuyu
// `npm ci --omit=dev` kurulumunda açılmaz yapar. Testler ve yalnız tür ithali sayılmaz; onlar çalışma anında yüklenmez.
const KOK = fileURLToPath(new URL('..', import.meta.url));
const KLASORLER = ['sunucu', 'paylasilan'];

function dosyalar(klasor: string): string[] {
  return readdirSync(klasor, { withFileTypes: true, recursive: true })
    .filter((g) => g.isFile() && g.name.endsWith('.ts') && !g.name.endsWith('.test.ts') && !g.name.endsWith('.d.ts'))
    .map((g) => join(g.parentPath, g.name))
    .filter((y) => !y.split(/[\\/]/).includes('test-fiksturleri'));
}

function paketAdi(belirtec: string): string | null {
  if (belirtec.startsWith('.') || belirtec.startsWith('#') || belirtec.startsWith('/') || belirtec.startsWith('node:')) return null;
  if (builtinModules.includes(belirtec.split('/')[0] ?? '')) return null;
  const p = belirtec.split('/');
  return belirtec.startsWith('@') ? `${p[0] ?? ''}/${p[1] ?? ''}` : (p[0] ?? '');
}

function calismaIthalleri(metin: string): string[] {
  const kaynak = ts.createSourceFile('x.ts', metin, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const bulunan: string[] = [];
  const gez = (d: ts.Node): void => {
    if ((ts.isImportDeclaration(d) || ts.isExportDeclaration(d)) && d.moduleSpecifier && ts.isStringLiteral(d.moduleSpecifier)) {
      const yalnizTur = ts.isImportDeclaration(d) ? d.importClause?.isTypeOnly === true : d.isTypeOnly;
      if (!yalnizTur) bulunan.push(d.moduleSpecifier.text);
    } else if (ts.isCallExpression(d) && d.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const ilk = d.arguments[0];
      if (ilk !== undefined && ts.isStringLiteral(ilk)) bulunan.push(ilk.text);
    }
    ts.forEachChild(d, gez);
  };
  gez(kaynak);
  return bulunan;
}

test('ithal ayrıştırıcı yalnız tür ithalini ve göreli yolu saymaz', () => {
  const m = "import type { A } from 'tur-paketi';\nimport { b } from 'paket';\nimport x from '@ad/alan/alt';\nimport { c } from './yerel.ts';\nconst d = await import('dinamik');";
  assert.deepEqual(calismaIthalleri(m).map(paketAdi).filter((p) => p !== null), ['paket', '@ad/alan', 'dinamik']);
});

test('sunucu ve paylaşılan kodun çalışma anında ithal ettiği her paket üretim bağımlılığıdır', () => {
  const paket = JSON.parse(readFileSync(join(KOK, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
  const uretim = new Set(Object.keys(paket.dependencies ?? {}));
  const eksik: string[] = [];
  for (const klasor of KLASORLER) {
    for (const dosya of dosyalar(join(KOK, klasor))) {
      for (const b of calismaIthalleri(readFileSync(dosya, 'utf8'))) {
        const ad = paketAdi(b);
        if (ad !== null && !uretim.has(ad)) eksik.push(`${relative(KOK, dosya)}: ${ad}`);
      }
    }
  }
  assert.deepEqual(eksik, [], 'Bu paketler package.json dependencies altına alınmalı (devDependencies --omit=dev ile kurulmaz).');
});
