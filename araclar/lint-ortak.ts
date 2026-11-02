import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import stylelint from 'stylelint';

// Lint kurallarının testleri için ortak parçalar. Tip bilgili kurallar her tsconfig programını bellekte tutar; sunucu ve istemci
// programları aynı süreçte varsayılan yığını aşıyordu (1863). Bu yüzden testler programa göre ayrı dosyalarda, ayrı süreçte koşar.
export const KOK = fileURLToPath(new URL('../', import.meta.url));
// CI=true iken ayrıştırıcı tek koşu kipine geçer ve sanal kod yerine diskteki dosyayı tip denetler.
process.env.TSESTREE_SINGLE_RUN = 'false';
export const eslint = new ESLint({ cwd: KOK });

// Tip bilgili kurallar dosyanın tsconfig kapsamında olmasını ister: kod sanaldır, yol var olan bir dosyanındır.
export const SUNUCU = 'sunucu/ana.ts';
export const EKRAN = 'istemci/src/App.tsx';
export const EKRAN_TESTI = 'istemci/src/App.test.tsx';

export const SOZ = '@typescript-eslint/no-floating-promises';
export const YANLIS_SOZ = '@typescript-eslint/no-misused-promises';
export const TIP_ITHALI = '@typescript-eslint/consistent-type-imports';
export const ITHAL = '@typescript-eslint/no-restricted-imports';
export const SOZDIZIMI = 'no-restricted-syntax';

export async function ihlaller(dosya: string, kod: string): Promise<Array<{ kural: string; mesaj: string }>> {
  const [sonuc] = await eslint.lintText(kod, { filePath: join(KOK, dosya) });
  assert.ok(sonuc, `${dosya} lint kapsamında değil`);
  // Kuralsız ileti ayrıştırma hatası ya da yapılandırma uyarısıdır; metniyle görünür ki sessizce yeşil kalmasın.
  return sonuc.messages.map((m) => ({ kural: m.ruleId ?? m.message, mesaj: m.message }));
}

export const kurallar = async (dosya: string, kod: string): Promise<string[]> => (await ihlaller(dosya, kod)).map((i) => i.kural);

export async function cssKurallari(dosya: string, kod: string): Promise<string[]> {
  const { results } = await stylelint.lint({ code: kod, codeFilename: join(KOK, dosya), cwd: KOK });
  return results.flatMap((r) => r.warnings.map((u) => u.rule));
}

export const BEKLE = 'const bekle = async (): Promise<number> => 1;\n';

export const deger = (yol: string): string => `import { x } from '${yol}';\nexport const y = x;`;
