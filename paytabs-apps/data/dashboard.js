/**
 * Dashboard widgets data (mock).
 * Replace with aggregate DB queries later.
 */

function getDashboard() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const prev7 = days.map(function (d, i) {
    return { label: d, value: 40 + ((i * 37 + 11) % 120) };
  });

  const last8 = [];
  for (let h = 0; h < 8; h++) {
    last8.push({ label: (8 - h) + "h", value: 5 + ((h * 23 + 7) % 45) });
  }

  const topMerchants = [
    { name: "Beyond Links Portal", value: 182450 },
    { name: "HKS Global Group DMCC", value: 156900 },
    { name: "Heathrow Trading LLC", value: 134200 },
    { name: "Gulf Mart Online", value: 98750 },
    { name: "Skyline Electronics", value: 87300 },
    { name: "Oasis Fashion House", value: 64100 },
    { name: "Falcon Pay Services", value: 52980 },
    { name: "Pearl Logistics", value: 41560 }
  ];

  const paymentMethods = [
    { name: "Visa", value: 44 },
    { name: "MasterCard", value: 31 },
    { name: "ApplePay", value: 14 },
    { name: "Mada", value: 8 },
    { name: "Amex", value: 3 }
  ];

  return {
    tiles: {
      salesTotalToday: "AED 284,320",
      salesCountToday: 1246,
      salesTotalMTD: "AED 5,912,780",
      salesCountMTD: 28410,
      salesTotalYTD: "AED 71,204,990",
      salesCountYTD: 341228
    },
    prev7, last8, topMerchants, paymentMethods,
    passwordExpiryDays: 13
  };
}

module.exports = { getDashboard };
