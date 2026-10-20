import { describe, expect, it } from 'vitest';
import { tembellestir } from './tembel-rotalar.ts';

describe('tembellestir', () => {
  it('yerel .tsx dosyasindan gelen ekranlari tembel yukler; ayni dosyanin ekranlari tek parcaya duser', () => {
    const cikti = tembellestir([
      "import type { ModulRotasi } from '../../ortak/rota/kesif.ts';",
      "import { Oee, OeeMakineler } from './Oee.tsx';",
      "export const rotalar: ModulRotasi[] = [{ yol: '/oee', ekran: Oee }, { yol: '/oee/makineler', ekran: OeeMakineler }];",
    ].join('\n'));
    expect(cikti).not.toContain("import { Oee, OeeMakineler } from './Oee.tsx';");
    expect(cikti).toContain("const Oee = __tembel(() => import('./Oee.tsx').then((m) => ({ default: m.Oee })));");
    expect(cikti).toContain("const OeeMakineler = __tembel(() => import('./Oee.tsx').then((m) => ({ default: m.OeeMakineler })));");
    expect(cikti).toContain("import { lazy as __tembel } from 'react';");
    expect(cikti).toContain("import type { ModulRotasi } from '../../ortak/rota/kesif.ts';");
  });

  it('tanimlar rotalar dizisinden once gelir: dizi kurulurken ekran adi tanimli olmali', () => {
    const cikti = tembellestir("import { Oee } from './Oee.tsx';\nexport const rotalar = [{ yol: '/oee', ekran: Oee }];\n") ?? '';
    expect(cikti.indexOf('const Oee =')).toBeGreaterThan(-1);
    expect(cikti.indexOf('const Oee =')).toBeLessThan(cikti.indexOf('export const rotalar'));
  });

  it('cok satirli ithali de tembel yukler', () => {
    const cikti = tembellestir("import {\n  Bir, Iki,\n} from './talep/Ekran.tsx';\nexport const rotalar = [];\n");
    expect(cikti).toContain("const Bir = __tembel(() => import('./talep/Ekran.tsx').then((m) => ({ default: m.Bir })));");
    expect(cikti).toContain("const Iki = __tembel(() => import('./talep/Ekran.tsx').then((m) => ({ default: m.Iki })));");
  });

  it('bilesen olmayan ad iceren, takma adli, paketten ya da .ts dosyasindan gelen ithale dokunmaz', () => {
    const kaynak = [
      "import { CncEslestirme, ESLESTIRME_YOLU } from './CncEslestirme.tsx';",
      "import { paletli } from './KomutPaleti.tsx';",
      "import { Ana as Ekran } from './Ana.tsx';",
      "import { TUM_BOLUMLER } from './bolumler.ts';",
      "import { Navigate } from 'react-router-dom';",
      "import type { Tip } from './Tip.tsx';",
      'export const rotalar = [];',
    ].join('\n');
    expect(tembellestir(kaynak)).toBeNull();
  });
});
