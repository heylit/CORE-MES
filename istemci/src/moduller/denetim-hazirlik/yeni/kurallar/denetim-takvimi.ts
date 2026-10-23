import { PROGRAMLAR, eyGrade, type ProgramTanimi } from '../icerik/programlar.ts';
import { TYPES_EY } from '../icerik/iso9001.ts';
import { yeniDenetim } from '../normalize.ts';
import { ISO_TARIH, ayEkle, bugunTarihi, gunEkle, gunFarki, tariheGore } from '../tarih.ts';
import type { Denetim, Depo, Profil, ProgramKodu } from '../tipler.ts';

// Denetim takvimi kuralları (prototip TAKVİM bölümü). Son günler (EYDEP belge teslimi, DÖF/NCR planı) denetime bağlı alt kayıttır ve
// denetim değişince yeniden hesaplanır.

// Sıradaki denetim: plandaki en yakın; yoksa son 60 günde biten. '*' bütün programlar.
export function siradakiDenetim(profil: Profil, prog: ProgramKodu | '*'): Denetim | null {
  const t = bugunTarihi();
  const liste = profil.audits.filter((a) => a.kind === 'audit' && (prog === '*' || a.prog === prog) && a.status !== 'cancel');
  const yakin = liste.filter((a) => a.status === 'plan' && (a.end || a.date) >= t).sort(tariheGore)[0];
  if (yakin) return yakin;
  return liste.filter((a) => {
    const e = a.end || a.date;
    return e < t && gunFarki(e) >= -60;
  }).sort(tariheGore).pop() ?? null;
}

// EYDEP: belgeler değerlendirmeden en geç 15 gün önce teslim edilir (ön değerlendirme hariç).
export function belgeSonGunuEsitle(a: Denetim, profil: Profil): void {
  if (a.kind !== 'audit') return;
  const gerekli = a.prog === 'eydep' && a.status !== 'cancel' && a.type !== TYPES_EY[0];
  const alt = profil.audits.find((x) => x.parent === a.id && x.sub === 'docs');
  if (gerekli) {
    const d = gunEkle(a.date, -15);
    if (alt) alt.date = d;
    else profil.audits.push(yeniDenetim({ prog: 'eydep', kind: 'deadline', sub: 'docs', parent: a.id, type: "Belgelerin SSB'ye son teslim günü", date: d, note: 'Değerlendirmeden en geç 15 gün önce' }));
  } else if (alt) {
    profil.audits = profil.audits.filter((x) => x !== alt);
  }
}

// Biten ISO/AS denetiminde majör ya da minör varsa DÖF/NCR planı bitişten 30 gün sonra (EYDEP hariç).
export function dofSonGunuEsitle(a: Denetim, profil: Profil): void {
  if (a.kind !== 'audit' || a.prog === 'eydep') return;
  const alt = profil.audits.find((x) => x.parent === a.id && x.sub === 'ncr');
  const n = a.res.major + a.res.minor;
  if (a.status === 'done' && n > 0) {
    const d = gunEkle(a.end || a.date, 30);
    const tur = a.prog === 'as9100' ? 'NCR yanıtı: düzeltme ve faaliyet planı son günü' : 'DÖF planı teslimi (süreyi kuruluşunuza göre düzenleyin)';
    if (alt) {
      alt.date = d;
      alt.type = tur;
      alt.note = `${String(n)} uygunsuzluk`;
    } else {
      profil.audits.push(yeniDenetim({ prog: a.prog, kind: 'deadline', sub: 'ncr', parent: a.id, type: tur, date: d, note: `${String(n)} uygunsuzluk` }));
    }
  } else if (alt) {
    profil.audits = profil.audits.filter((x) => x !== alt);
  }
}

// Genel bakıştaki "denetim tarihi": plandaki sıradaki denetim kaydırılır (süresi korunur), yoksa yeni denetim açılır.
export function denetimTarihiAyarla(profil: Profil, prog: ProgramKodu, v: string): void {
  if (!ISO_TARIH.test(v)) return;
  let a = siradakiDenetim(profil, prog);
  const t = bugunTarihi();
  if (a && a.status === 'plan' && (a.end || a.date) >= t) {
    const sure = a.end ? Math.round((new Date(a.end).getTime() - new Date(a.date).getTime()) / 86_400_000) : 0;
    a.date = v;
    a.end = sure > 0 ? gunEkle(v, sure) : '';
  } else {
    a = yeniDenetim({ prog, type: '', date: v, cb: profil.profile.kurulus });
    profil.audits.push(a);
  }
  belgeSonGunuEsitle(a, profil);
}

export interface DenetimOnerisi { type: string; date: string; why: string }

export function sonrakiDenetimOnerisi(a: Denetim): DenetimOnerisi {
  const taban = a.end || a.date;
  const T = a.type || '';
  if (a.prog === 'eydep') {
    if (T === TYPES_EY[0]) return { type: TYPES_EY[1] ?? '', date: ayEkle(taban, 3), why: 'Ön değerlendirmeden sonra gelişim için yaklaşık 3 ay bırakıldı' };
    if (a.res.score !== '' && a.res.score < 50) return { type: TYPES_EY[1] ?? '', date: ayEkle(taban, 12), why: 'Olumsuz sonuçta değerlendirmeden 1 yıl geçmeden yeniden başvurulamaz' };
    return { type: TYPES_EY[2] ?? '', date: ayEkle(taban, 33), why: 'Sertifika süresini kamuya açık bir kaynakta doğrulayamadım; 3 yıl varsayılıp süre dolmadan planlandı. Tarihi sertifikanızdaki geçerlilik tarihine göre düzeltin' };
  }
  const ty = PROGRAMLAR[a.prog].types;
  if (/^Aşama 1/.test(T)) return { type: ty[1] ?? '', date: gunEkle(taban, 42), why: "Aşama 2 genellikle Aşama 1'den birkaç hafta sonra yapılır" };
  if (/^Aşama 2|^Yeniden|geçiş/.test(T)) return { type: ty[2] ?? '', date: ayEkle(taban, 11), why: 'İlk gözetim sertifika kararından itibaren 12 ayı geçmemeli; kuruluşunuzla teyit edin' };
  if (/^1\. gözetim/.test(T)) return { type: ty[3] ?? '', date: ayEkle(taban, 12), why: 'Gözetim denetimleri yılda bir yapılır' };
  if (/^2\. gözetim/.test(T)) return { type: ty[4] ?? '', date: ayEkle(taban, 10), why: 'Yeniden belgelendirme sertifika süresi dolmadan tamamlanmalı' };
  return { type: T || 'Denetim', date: ayEkle(taban, 12), why: 'Yıllık tekrar varsayıldı; düzenleyebilirsiniz' };
}

// Denetime kalan gün (sıradaki denetim yoksa null).
export function kalanGun(profil: Profil, prog: ProgramKodu): number | null {
  const a = siradakiDenetim(profil, prog);
  return a ? gunFarki(a.date) : null;
}

// Önerilen hazırlık dönemi (PREP sırası): 0 en erken ... 4 denetim günü, 5 sonrası; denetim yoksa -1.
export function onerilenAsama(kalan: number | null, pg: ProgramTanimi): number {
  const t = pg.phaseDays;
  if (kalan === null) return -1;
  if (kalan < 0) return 5;
  if (kalan === 0) return 4;
  if (kalan < t[2]) return 3;
  if (kalan < t[1]) return 2;
  if (kalan < t[0]) return 1;
  return 0;
}

export const denetimBasligi = (a: Denetim, profil: Profil): string =>
  `${PROGRAMLAR[a.prog].s} · ${a.type || (a.kind === 'deadline' ? 'Son gün' : 'Denetim')}${profil.profile.firma ? ` · ${profil.profile.firma}` : ''}`;

export const denetimAciklamasi = (a: Denetim): string =>
  [a.cb ? `${a.prog === 'eydep' ? 'Değerlendiren: ' : 'Kuruluş: '}${a.cb}` : '', a.note, 'Denetim Hazırlık aracından eklendi.'].filter(Boolean).join('\n');

export interface TakvimSatiri { pid: string; a: Denetim; st: Profil }

// Takvimin kapsamı: bütün profiller ya da yalnız açık profil.
export function butunDenetimler(depo: Depo, kapsam: 'all' | 'mine'): TakvimSatiri[] {
  const out: TakvimSatiri[] = [];
  for (const pid of depo.order) {
    if (kapsam === 'mine' && pid !== depo.active) continue;
    const st = depo.data[pid];
    if (!st) continue;
    for (const a of st.audits) out.push({ pid, a, st });
  }
  return out;
}

// Denetimin ardından aynı programda daha sonraki bir denetim planlanmış mı (sonraki denetim önerisi gösterilmez).
export const devamiVar = (o: TakvimSatiri): boolean =>
  o.st.audits.some((x) => x !== o.a && x.kind === 'audit' && x.prog === o.a.prog && x.status === 'plan' && x.date > (o.a.end || o.a.date));

// Sonuç metni (takvim satırı, performans ipucu).
export function sonucMetni(a: Denetim): string {
  if (a.status === 'cancel') return 'İptal edildi';
  if (a.status !== 'done') return '';
  if (a.prog === 'eydep') return a.res.score === '' ? 'Tamamlandı' : `${String(a.res.score)} puan · ${eyGrade(a.res.score) ? `${eyGrade(a.res.score)} seviyesi` : 'eşik altı'}`;
  const r = a.res;
  const parcalar = [r.major ? `${String(r.major)} majör` : '', r.minor ? `${String(r.minor)} minör` : '', r.obs ? `${String(r.obs)} gözlem` : ''].filter(Boolean);
  return parcalar.length ? parcalar.join(', ') : 'Bulgusuz';
}
