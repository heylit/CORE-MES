-- Kalite Merkezi'nde giriş TMI oturumudur, ayrı PIN yoktur (yazılı onay 2026-10-16): uygulamanın kullanıcı kayıtlarındaki PIN özetleri
-- okuma yetkisi olan herkese gidiyordu ve denenerek bulunabilirdi; silinir. Kayıt yeni sürüm alır: açık ekranlar da özetsiz hâli okur.
UPDATE kalite_merkezi_belge
   SET govde = govde - 'pin', surum = nextval('kalite_merkezi_surum'), degisti = now()
 WHERE koleksiyon = 'kullanici' AND govde ? 'pin';
