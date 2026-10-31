/* ================================================================
   PENGATURAN SUMBER DATA WEB HKO
   ----------------------------------------------------------------
   SHEET_ID = kode Google Sheet yang menjadi sumber isi web.
   Ambil dari link spreadsheet, yaitu bagian di antara "/d/" dan "/edit".
   Contoh link:
     https://docs.google.com/spreadsheets/d/1AbCdEfGhIjK.../edit#gid=0
                                             ^^^^^^^^^^^^^^ ini SHEET_ID
   Spreadsheet harus dibagikan: "Siapa saja yang memiliki link — Pelihat".

   Bila SHEET_ID dikosongkan, web memakai data cadangan
   (assets/data-cadangan.js).
   ================================================================ */
window.HKO_CONFIG = {
  SHEET_ID: '1RBc_k8vrN-qCm5PeHmTNh4gr9WloNpvC',

  // Nama tab di spreadsheet (jangan diubah kecuali nama tab juga diubah)
  TABS: ['pengaturan', 'kategori', 'layanan', 'isi'],

  // Batas waktu menunggu spreadsheet (milidetik)
  TIMEOUT_MS: 8000,

  // Logo: file lokal diutamakan, bila belum ada pakai alamat cadangan
  LOGO_LOKAL: 'assets/logo.png',
  LOGO_CADANGAN: 'https://mpp.jambikota.go.id/storage/instansi/ATR_BPN.png'
};
