import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bolumGorunur, gorunurBolumler, kaynakSuz, sonYediGun, type AramaAdayi } from './kurallar.ts';

test('KI-1 bölüm sahibinin okuma işlemlerinden biriyle görünür; işlemsiz kişide hiçbiri', () => {
  assert.equal(bolumGorunur(['sayfa.istasyonlar'], 'tesis'), true);
  assert.equal(bolumGorunur(['istasyonlar.yaz'], 'tesis'), true);
  assert.equal(bolumGorunur(['ik.izin-oku'], 'izin'), true);
  assert.equal(bolumGorunur(['sayfa.kaynak-izi'], 'maliyet'), false);
  assert.deepEqual(gorunurBolumler(['sayfa.kaynak-izi']), []);
  assert.deepEqual(gorunurBolumler(['oee.oku', 'finans.maliyet-oku', 'sayfa.vardiya']), ['vardiya', 'oee', 'maliyet']);
});

test('KI-2 kodda ya da adda arar, Türkçe harf duyarsız; kodu tam tutan önce, sonra aktif, tür ve ad', () => {
  const a = (tur: AramaAdayi['tur'], id: number, kod: string | null, ad: string, aktif = true): AramaAdayi => ({ tur, id, kod, ad, aktif, ust: null });
  const adaylar = [a('kisi', 1, 'T-1', 'Işık Tornacı'), a('makine', 2, 'TORNA-2', 'Torna'), a('istasyon', 3, 'TOR', 'Torna Hattı'), a('makine', 4, 'T-9', 'Eski Torna', false)];
  assert.deepEqual(kaynakSuz(adaylar, 'tor').map((x) => x.id), [3, 2, 1, 4]);
  assert.deepEqual(kaynakSuz(adaylar, 'ISIK').map((x) => x.id), [1]);
  assert.deepEqual(kaynakSuz(adaylar, '  ').map((x) => x.id), [3, 2, 1, 4]);
  assert.deepEqual(kaynakSuz(adaylar, 'yok'), []);
});

test('KI-3 OEE penceresi bugün dahil son yedi gün; ay ve yıl dönümünde doğru', () => {
  assert.deepEqual(sonYediGun('2026-10-30'), { baslangic: '2026-10-24', bitis: '2026-10-30' });
  assert.deepEqual(sonYediGun('2026-03-02'), { baslangic: '2026-02-24', bitis: '2026-03-02' });
  assert.deepEqual(sonYediGun('2027-01-03'), { baslangic: '2026-12-28', bitis: '2027-01-03' });
});
