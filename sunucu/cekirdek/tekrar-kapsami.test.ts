import assert from 'node:assert/strict';
import { test } from 'node:test';
import { modulBasinaUclar } from './uygulama.ts';

// ADR 0025 kural 5: stok hareketi, üretim kaydı, emir kapama, sevkiyat ve finans hareketi yazan uç tekrar korumalıdır;
// ağ kopup yinelenen komut ikinci kez uygulanmaz. Bu modüllerin yazma uçları taranır.
const KRITIK_MODULLER = ['finans', 'sevkiyat', 'stok', 'uretim-emirleri'];

// Kural girdiğinde korumasız olan uçlar. Uç korununca (istemci çağrısı istek kimliği yollayarak) satır buradan silinir;
// listeye yeni satır eklenmez, yeni kritik yazma ucu korumalı doğar.
const KORUMASIZ_BORC: readonly string[] = [
  // finans
  'POST /finans/ayar/guncelle',
  'POST /finans/belgeler/:id/duzelt',
  'POST /finans/belgeler/:id/iptal',
  'POST /finans/butce/belirle',
  'POST /finans/cekler/:id/duzelt',
  'POST /finans/cekler/:id/geri-al',
  'POST /finans/cekler/:id/iptal',
  'POST /finans/cekler/:id/karsiliksiz',
  'POST /finans/cekler/:id/odendi',
  'POST /finans/cekler/:id/tahsil',
  'POST /finans/cekler/:id/tahsile-ver',
  'POST /finans/dagitimlar/:id/iptal',
  'POST /finans/duzenli-odemeler/:id/guncelle',
  'POST /finans/firmalar/:id/aktif',
  'POST /finans/firmalar/:id/pasif',
  'POST /finans/genel-gider-oranlari/ekle',
  'POST /finans/hesaplar/:id/aktif',
  'POST /finans/hesaplar/:id/guncelle',
  'POST /finans/hesaplar/:id/pasif',
  'POST /finans/hesaplar/ekle',
  'POST /finans/kapanis/isaretle',
  'POST /finans/kdv-oranlari/ekle',
  'POST /finans/kdv-oranlari/kapat',
  'POST /finans/kurlar/ekle',
  'POST /finans/kurlar/guncelle',
  'POST /finans/mahsuplar/:id/iptal',
  'POST /finans/maliyetler/:tur/yaz',
  'POST /finans/odemeler/:id/iptal',
  'POST /finans/oneriler/durum',
  'POST /finans/sabit-kiymetler/:id/guncelle',
  'POST /finans/sabit-kiymetler/:id/pasif',
  'POST /finans/virmanlar/:id/iptal',
  // sevkiyat
  'POST /sevkiyat/araclar/:id/guncelle',
  'POST /sevkiyat/araclar/:id/pasiflestir',
  'POST /sevkiyat/isler/:id/guncelle',
  'POST /sevkiyat/kalemler/:id/tasima',
  'POST /sevkiyat/noktalar/:id/guncelle',
  'POST /sevkiyat/noktalar/:id/pasiflestir',
  'POST /sevkiyat/planlar/:tarih/dagit',
  'POST /sevkiyat/planlar/:tarih/kaydet',
  'POST /sevkiyat/planlar/:tarih/yerlestir',
  // stok
  'POST /stok/depo-bolumleri/:id/raflari-kaydet',
  'POST /stok/depo-goz-kalemleri/sil',
  'POST /stok/depo-goz-kalemleri/yaz',
  'POST /stok/hareketler/:id/geri-al',
  'POST /stok/harita-bolumleri/:id/depo',
  'POST /stok/konumlar',
  'POST /stok/konumlar/:id/duzenle',
  'POST /stok/konumlar/:id/pasif-yap',
  'POST /stok/konumlar/haritadan-esle',
  'POST /stok/malzeme-fisleri/:id/gonder',
  'POST /stok/malzeme-istekleri/:id/hazirla',
  'POST /stok/malzeme-istekleri/:id/iptal-et',
  'POST /stok/malzeme-istekleri/:id/kabul-et',
  'POST /stok/malzeme-istekleri/:id/reddet',
  'POST /stok/malzeme-istekleri/:id/teslim-et',
  'POST /stok/malzemeler/:id/ayar-duzenle',
  'POST /stok/raflar',
  'POST /stok/raflar/:id/duzenle',
  'POST /stok/raflar/:id/pasif-yap',
  'POST /stok/refakat-partileri/:id/iptal-et',
  'POST /stok/sepet/satirlar/:id/degistir',
  'POST /stok/sepet/satirlar/:id/sil',
  'POST /stok/teslimler/:id/iptal-et',
  'POST /stok/teslimler/:id/itiraz',
  'POST /stok/teslimler/:id/reddet',
  'POST /stok/teslimler/:id/teslim-al',
  'POST /stok/uretim-hazirligi',
  'POST /stok/yerlesim/kaydet',
  // uretim-emirleri
  'POST /adimli-emirler/:id/adim-duzenle',
  'POST /adimli-emirler/:id/adim-kaynagi',
  'POST /adimli-emirler/:id/adim-sil',
  'POST /adimli-emirler/:id/ek-adim-kaldir',
  'POST /adimli-emirler/:id/hazirlik-muafiyeti',
  'POST /adimli-emirler/:id/iptal',
  'POST /adimli-emirler/:id/is-emirleri/:isEmriId/ayar',
  'POST /adimli-emirler/:id/is-emirleri/:isEmriId/katil',
  'POST /adimli-emirler/:id/is-emirleri/:isEmriId/katilim/ayril',
  'POST /adimli-emirler/:id/is-emirleri/:isEmriId/katilim/duraklat',
  'POST /adimli-emirler/:id/is-emirleri/:isEmriId/makine-devral',
  'POST /adimli-emirler/:id/kapanis/geri-ac',
  'POST /adimli-emirler/:id/kapanis/kalite-onay',
  'POST /adimli-emirler/:id/kapanis/kalite-ret',
  'POST /adimli-emirler/:id/kapanis/muaf',
  'POST /adimli-emirler/:id/kapanis/mudur-onay',
  'POST /adimli-emirler/:id/kapanis/mudur-ret',
  'POST /adimli-emirler/:id/kapat',
  'POST /adimli-emirler/:id/oncelik',
  'POST /adimli-emirler/:id/plana-al',
  'POST /adimli-emirler/:id/uretim-yeri',
  'POST /uretim-emirleri/:id/adimlar/:adimId/tamamla',
  'POST /uretim-emirleri/:id/ayar',
  'POST /uretim-emirleri/:id/katil',
  'POST /uretim-emirleri/:id/katilim/ayril',
  'POST /uretim-emirleri/:id/katilim/duraklat',
  'POST /uretim-emirleri/:id/makine-devral',
];

async function kritikYazmaUclari(): Promise<{ anahtar: string; korumali: boolean }[]> {
  return (await modulBasinaUclar())
    .filter((m) => KRITIK_MODULLER.includes(m.modul))
    .flatMap((m) => m.uclar.filter((u) => u.yontem !== 'GET').map((u) => ({ anahtar: `${u.yontem} ${u.yol}`, korumali: u.tekrarKorumali })));
}

test('tekrar kapsamı: kritik modülde korumasız yazma ucu yalnız borç listesinde durur', async () => {
  const uclar = await kritikYazmaUclari();
  assert.ok(uclar.length > 0, 'kritik modüllerin uçları bulunamadı');
  const listesiz = uclar.filter((u) => !u.korumali && !KORUMASIZ_BORC.includes(u.anahtar)).map((u) => u.anahtar);
  assert.deepEqual(listesiz, [], 'yeni kritik yazma ucu tekrarKorumali: true taşır');
});

test('tekrar kapsamı: borç listesi güncel; korunan ya da kaldırılan uç listeden silinir', async () => {
  const korumasiz = new Set((await kritikYazmaUclari()).filter((u) => !u.korumali).map((u) => u.anahtar));
  assert.deepEqual(KORUMASIZ_BORC.filter((a) => !korumasiz.has(a)), []);
  assert.equal(new Set(KORUMASIZ_BORC).size, KORUMASIZ_BORC.length, 'listede aynı uç iki kez');
});
