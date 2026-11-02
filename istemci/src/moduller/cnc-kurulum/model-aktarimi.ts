import type { BagGovdesi, BelgeAyrintisi, BelgeListesiCevabi, BelgeOlusturGovdesi, RevizyonEkleGovdesi, SurumGovdesi } from '#paylasilan/sozlesme/belge-merkezi.ts';
import { api } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../ortak/veri/istek-kimligi.ts';
import { dosyaYukle, onizlemeGonder } from '../belge-merkezi/disari.ts';

// Seçili makinenin modeli Çizimler'e 3B model belgesi olarak gider (taslak; yayın Çizimler ekranından). Aynı makine ikinci kez
// aktarılınca yeni belge açılmaz: adıyla bulunan belgeye revizyon eklenir, dosya aynıysa hiçbir şey yazılmaz. İstasyona bağ
// Çizim Merkezi'nin CNC makineleri sayfasında kullanıcının seçtiği istasyonla kurulur (yayinlaVeEslestir).

export interface AktarilacakModel { makineId: string; no: string | null; ad: string; glb: Uint8Array }

export const belgeAdi = (m: Pick<AktarilacakModel, 'no' | 'ad'>): string => (m.no ? `${m.no} · ${m.ad}` : m.ad);
const ACIKLAMA = 'CNC Kurulum Motoru makine modeli (glTF, metre, Y yukarı).';

// yayinda: aktarılan dosya Çizimler'de zaten yayındadır (haritada seçilebilir); yeni belge ve yeni revizyon taslaktır.
export interface AktarimSonucu { sonuc: 'yeni' | 'revizyon' | 'ayni'; belgeId: number; yayinda: boolean; ozet: string }

export async function modeliCizimlereAktar(m: AktarilacakModel): Promise<AktarimSonucu> {
  const ad = belgeAdi(m);
  const dosyaAdi = `cnc-${m.makineId}.glb`;
  const ozet = await dosyaYukle(m.glb, () => {});
  const sorgu = new URLSearchParams({ ara: ad, tur: '3b-model' });
  const liste = await api.get<BelgeListesiCevabi>(`/cizimler?${sorgu.toString()}`);
  const mevcut = liste.satirlar.find((b) => b.ad === ad && b.aktif);
  if (!mevcut) {
    const govde: BelgeOlusturGovdesi = { ad, tur: '3b-model', aciklama: ACIKLAMA, ozet, dosyaAdi };
    // Belge açma ucu tekrar korumalıdır: istek kimliksiz reddedilir; cevabı yitirilen istek aynı kimlikle yinelenir.
    const yeni = await tekrarKorumaliGonder((deneme) => api.post<BelgeAyrintisi>('/cizimler', govde, deneme));
    return { sonuc: 'yeni', belgeId: yeni.id, yayinda: false, ozet };
  }
  const belge = await api.get<BelgeAyrintisi>(`/cizimler/${mevcut.id}`);
  const ayni = belge.revizyonlar.find((r) => r.ozet === ozet);
  if (ayni) return { sonuc: 'ayni', belgeId: belge.id, yayinda: ayni.durum === 'yayinda', ozet };
  const govde: RevizyonEkleGovdesi = { ozet, dosyaAdi, surum: belge.surum };
  await api.post<BelgeAyrintisi>(`/cizimler/${mevcut.id}/revizyon-ekle`, govde);
  return { sonuc: 'revizyon', belgeId: belge.id, yayinda: false, ozet };
}

// Makineyle eşleştirilen model aktarımda yayına alınır (kullanıcı kararı, kart #1196): fabrika haritası yalnız yayındaki modeli
// gösterir. Yayınlama ayrı yetkidir; yoksa revizyon taslak kalır, bağ yine kurulur. İstasyonun önceki modeli bağdan Çizim
// Merkezi'nde düşer (CZ-14).
export async function yayinlaVeEslestir(a: Pick<AktarimSonucu, 'belgeId' | 'ozet'>, istasyonId: number, yayinlayabilir: boolean): Promise<{ yayinda: boolean }> {
  let belge = await api.get<BelgeAyrintisi>(`/cizimler/${a.belgeId}`);
  const r = belge.revizyonlar.find((x) => x.ozet === a.ozet);
  if (r && r.durum !== 'yayinda' && yayinlayabilir) {
    belge = await api.post<BelgeAyrintisi>(`/cizimler/${a.belgeId}/revizyonlar/${r.id}/yayinla`, { surum: belge.surum } satisfies SurumGovdesi);
  }
  if (!belge.baglar.some((b) => b.hedefModul === 'istasyonlar' && b.hedefId === istasyonId)) {
    belge = await api.post<BelgeAyrintisi>(`/cizimler/${a.belgeId}/bag-ekle`, { hedefModul: 'istasyonlar', hedefId: istasyonId, surum: belge.surum } satisfies BagGovdesi);
  }
  return { yayinda: belge.revizyonlar.some((x) => x.ozet === a.ozet && x.durum === 'yayinda') };
}

// 780 a: istasyonun küçük resmi yayındaki model revizyonunun önizlemesidir; eşleşen model yayına girince kareler elde olan GLB'den
// üretilir. Taslağın önizlemesi yazılmaz (Çizimler reddeder), kareleri olan revizyon yeniden üretilmez.
export type KucukResimSonucu = 'uretildi' | 'vardi' | 'taslak';
export async function kucukResimUret(a: Pick<AktarimSonucu, 'belgeId' | 'ozet'>, glb: Uint8Array): Promise<KucukResimSonucu> {
  const belge = await api.get<BelgeAyrintisi>(`/cizimler/${a.belgeId}`);
  const r = belge.revizyonlar.find((x) => x.ozet === a.ozet);
  if (!r || r.durum !== 'yayinda') return 'taslak';
  if (r.onizlemeKareSayisi > 0) return 'vardi';
  await onizlemeGonder(r, { dosyaYolu: `/cizimler/${a.belgeId}/revizyonlar/${r.id}/dosya`, yazmaYolu: `/cizimler/${a.belgeId}/revizyonlar/${r.id}/onizleme`, veri: glb });
  return 'uretildi';
}

// Makinenin Çizim Merkezi'ndeki durumu: aynı adlı etkin 3B model belgesi ve bağlı olduğu istasyon. Belgesi olmayan makine
// haritada yoktur; belgesi olup istasyona bağlanmamış makine haritaya eklenemez.
export interface MevcutEslesme { belgeId: number; yayinda: boolean; istasyonId: number | null }

const LISTE_BOYU = 200;
// Belge listesi sayfalıdır; bu kadar sayfadan sonrası okunmaz (her biri 200 belge).
const AZAMI_LISTE_SAYFASI = 10;

export async function mevcutEslesmeler(adlar: readonly string[]): Promise<Map<string, MevcutEslesme>> {
  const aranan = new Set(adlar);
  const belgeler = new Map<string, BelgeListesiCevabi['satirlar'][number]>();
  for (let sayfa = 1; sayfa <= AZAMI_LISTE_SAYFASI; sayfa += 1) {
    const sorgu = new URLSearchParams({ tur: '3b-model', sayfa: String(sayfa), sayfaBoyu: String(LISTE_BOYU) });
    const liste = await api.get<BelgeListesiCevabi>(`/cizimler?${sorgu.toString()}`);
    for (const b of liste.satirlar) if (b.aktif && aranan.has(b.ad) && !belgeler.has(b.ad)) belgeler.set(b.ad, b);
    if (liste.satirlar.length < liste.sayfaBoyu) break;
  }
  const sonuc = new Map<string, MevcutEslesme>();
  for (const [ad, b] of belgeler) {
    let istasyonId: number | null = null;
    if (b.bagSayisi > 0) {
      const ayrinti = await api.get<BelgeAyrintisi>(`/cizimler/${b.id}`);
      istasyonId = ayrinti.baglar.find((g) => g.hedefModul === 'istasyonlar')?.hedefId ?? null;
    }
    sonuc.set(ad, { belgeId: b.id, yayinda: b.yayindakiHarf !== null, istasyonId });
  }
  return sonuc;
}
