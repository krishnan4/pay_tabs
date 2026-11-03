/**
 * ============================================================
 *  MANUAL CONFIG — இங்கே மட்டும் மாத்தினா போதும்
 * ============================================================
 *
 *  FORMAT: 'DD/Mon/YYYY HH:MM'
 *  Example: '03/Nov/2026 11:00'
 *
 *  REPORT_DATES — report title keyword → date
 *  ID_DATES     — specific ID → date  ⬅️ புதுசா சேர்த்தது
 *
 *  Server start ஆகும்போதே ID_DATES-ல் உள்ள IDs
 *  automatically DB-ல் update ஆகும்.
 * ============================================================
 */

module.exports = {

  // ✅ Default date — எந்த match-உம் இல்லன்னா இது use ஆகும்
  DEFAULT_GENERATED_ON: '03/Nov/2026 11:00',

  // ✅ Per-report-title date
  REPORT_DATES: {
    'UAE Payouts':             '29/Sep/2026 11:00',
    'Accounting Aggregation':  '03/Nov/2026 11:00',
    'Settlements':             '01/Nov/2026 09:00',
    // 'YourReportTitle':      'DD/Mon/YYYY HH:MM',
  },

  // ✅ Per-ID date — இங்கே ID போட்டா அந்த record update ஆகும்
  // ⬇️ இங்கே மட்டும் மாத்தணும்
  ID_DATES: {
    376188: '03/Nov/2026 11:00',   // ⬅️ இந்த ID-க்கு இந்த date
    376032: '03/Nov/2026 11:30',   // ⬅️ இந்த ID-க்கு இந்த date
    364630: '15/Oct/2026 09:30',   // ⬅️ இந்த ID-க்கு இந்த date
    364533: '01/Oct/2026 08:45',   // ⬅️ இந்த ID-க்கு இந்த date
    364436: '22/Sep/2026 10:00',   // ⬅️ இந்த ID-க்கு இந்த date
    // ⬅️ புதுசா ID சேர்க்கணும்னா இங்கே போடு:
    // 999999: 'DD/Mon/YYYY HH:MM',
  }

};

