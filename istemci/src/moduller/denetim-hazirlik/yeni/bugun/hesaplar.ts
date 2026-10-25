import { PROGRAM_SIRASI } from '../icerik/programlar.ts';
import { siradakiDenetim } from '../kurallar/denetim-takvimi.ts';
import type { KuralBaglami } from '../kurallar/puan.ts';
import { bugunTarihi, gunFarki, tariheGore } from '../tarih.ts';
import type { Cihaz, Denetim, GorunumKodu, KysSekmesi, Profil } from '../tipler.ts';

// Bugün ekranının saf hesapları (prototip greet, postAuditPanel, onbSteps). Y0 kurallar/ içinde karşılığı yoktu; yere taşınması Y0'a istek olarak yazıldı.

export function selamlama(saat: number): string {
  if (saat < 5) return 'İyi geceler';
  if (saat < 12) return 'Günaydın';
  if (saat < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

export interface SonrasiAdimi { ok: boolean; t: string; go: GorunumKodu }
export interface DenetimSonrasi { a: Denetim; adimlar: SonrasiAdimi[] }

// Son 90 günde biten dış denetim varsa sürdürme adımları; iç denetim ve ön değerlendirme sayılmaz.
export function denetimSonrasi(st: Profil, bugun: string = bugunTarihi()): DenetimSonrasi | null {
  const son = st.audits
    .filter((a) => {
      if (a.kind !== 'audit' || a.status !== 'done' || /İç denetim|Ön değerlendirme/.test(a.type)) return false;
      const dd = gunFarki(a.end || a.date);
      return dd <= 0 && dd >= -90;
    })
    .sort(tariheGore)
    .pop();
  if (!son) return null;
  const dofTamam = !(son.res.major + son.res.minor) || st.audits.some((x) => x.parent === son.id && x.sub === 'ncr');
  return {
    a: son,
    adimlar: [
      { ok: dofTamam, t: 'Bulgular için DÖF son günü belirlendi', go: 'takvim' },
      { ok: st.ic.plan.rows.some((r) => r.months.length > 0), t: 'Yıllık iç denetim programı hazır', go: 'icd' },
      { ok: st.ic.saha.some((x) => x.done), t: 'Saha kontrollerine başlandı', go: 'icd' },
      { ok: PROGRAM_SIRASI.some((k) => st.pw[k].oz.rounds.length > 0), t: 'Periyodik öz değerlendirme yapılıyor', go: 'kontrol' },
      { ok: st.audits.some((a) => a.kind === 'audit' && a.status === 'plan' && a.date > bugun), t: 'Sonraki denetim takvimde', go: 'takvim' },
    ],
  };
}

export interface BaslarkenAdimi { t: string; d: string; ok: boolean; go: GorunumKodu | 'hizli-tur'; kys?: KysSekmesi }

// Başlarken: önerilen ilk yedi adım; her biri kayıttan kendiliğinden işaretlenir. Cihazlar Kalibrasyon modülünden gelir.
export function baslarkenAdimlari(kb: KuralBaglami, cihazlar: readonly Cihaz[]): BaslarkenAdimi[] {
  const st = kb.profil;
  const w = kb.calisma;
  return [
    { t: 'Firma adını girin', d: 'Dokümanlara, raporlara ve yedeğe işlenir.', ok: !!st.profile.firma, go: 'profil' },
    { t: `${kb.pg.s} denetim tarihini ekleyin`, d: 'Hazırlık programı ve geri sayım bu tarihe göre çalışır.', ok: !!siradakiDenetim(st, kb.program), go: 'takvim' },
    { t: 'İlk ölçümü yapın: 10 soruluk hızlı tur', d: 'Yaklaşık 15 dakika. Hazırlık puanınız ilk kez oluşur.', ok: Object.keys(w.ans).length >= 10, go: 'hizli-tur' },
    { t: 'Raporda ilk açığınızı kapatın', d: 'Aksiyon planında bir maddeyi tamamlayıp işaretleyin.', ok: Object.values(w.done).some(Boolean), go: 'rapor' },
    { t: 'Bu haftanın hazırlık görevlerine bakın', d: 'Haftalık programda bir görevi işaretleyin.', ok: Object.keys(w.checks).length > 0 || w.wkx.length > 0, go: 'hazirlik' },
    { t: 'Firma geneli: ölçüm cihazlarınızı ekleyin', d: 'Kalibrasyon takibi tüm programlar için ortaktır.', ok: cihazlar.length > 0, go: 'kalib' },
    { t: 'Firma geneli: KYS yol haritasına başlayın', d: 'Bir yapı taşını taslak ya da yürürlükte olarak işaretleyin.', ok: Object.values(st.kys.items).some((x) => x.st > 0), go: 'kys', kys: 'yol' },
  ];
}
