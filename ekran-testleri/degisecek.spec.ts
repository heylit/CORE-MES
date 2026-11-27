// Kayıtta DEĞİŞECEK işaretli davranışlar: test bugünkü yanlışı değil beklenen doğruyu ister ve bugün düştüğü için
// test.fail() ve { tag: '@degisecek' } taşır. Kapı koşusu (npm run ekran) bunları atlar; npm run ekran:degisecek ayrıca koşar.
// Bir şerit düzeltince test geçer ve "beklenmedik geçti" diye görünür: o zaman test.fail() kaldırılır, etiket silinir ve
// test kendi modülünün dosyasına taşınıp kapı koşusuna girer. Kaynak satırı her testin adındadır (kayit/<modul>/akislar.md).
// Şu an bekleyen DEĞİŞECEK testi yok (Rota A4 recete-rota.spec.ts'e, Stok 403 stok.spec.ts'e girdi).
export {};
