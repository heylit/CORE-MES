import type { Db } from '#cekirdek/db.ts';
import type { KayitAramaIstegi, KayitAramaKaynagi } from '#paylasilan/kayit-aramasi.ts';
import type { KayitAramaSonucu } from '#paylasilan/sayfa-tanimi.ts';
import type { SiparisDurumu } from '#paylasilan/sozlesme/siparisler.ts';
import { firmaAdlari } from '../musteri-tedarikci/disari.ts';
import { siparisAra } from './sorgular.ts';

// Etiketler liste ekranındakiyle aynıdır (istemci gorunum.ts); aramada görünen durum listedekinden ayrılmasın.
const SIPARIS_DURUMU: Record<SiparisDurumu, string> = { taslak: 'Taslak', onayli: 'Onaylı', kapandi: 'Kapandı', iptal: 'İptal' };

const aciklama = (parcalar: readonly (string | null | undefined)[]): string =>
  parcalar.filter((p): p is string => p !== null && p !== undefined && p.trim() !== '').join(' · ');

// Satış siparişi (1242): sipariş no ya da müşteri sipariş no'sunda geçen kayıt. Listeyi okuyan arar; fiyat dönmez (180),
// firma adı listeyle aynı kaynaktan gelir.
async function siparisleriAra(db: Db, istek: KayitAramaIstegi): Promise<KayitAramaSonucu[]> {
  const satirlar = await siparisAra(db, istek.sade, istek.icindeDeseni, istek.basDeseni, istek.sinir);
  const adlar = await firmaAdlari(db, satirlar.map((s) => s.firma_id));
  return satirlar.map((s) => ({
    anahtar: String(s.id),
    baslik: s.no,
    aciklama: aciklama([adlar.get(s.firma_id), s.musteri_siparis_no, SIPARIS_DURUMU[s.durum]]),
    yol: `/siparisler/${s.id}`,
  }));
}

export const kayitAramaKaynaklari: readonly KayitAramaKaynagi<Db>[] = [
  { tur: 'siparis', yetki: ['siparisler.oku'], ara: siparisleriAra },
];
