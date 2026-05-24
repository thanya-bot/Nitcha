// ===== Company info (for quotation) =====
const COMPANY = {
  name: 'บริการแอร์ครบวงจร',
  tagline: 'AC Service & Installation',
  address: '123/45 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพฯ 10110',
  phone: '02-123-4567',
  email: 'service@acservice.co.th',
  taxId: '0-1234-56789-01-2',
};

// ===== Service rate table (บาท) =====
// ค่าเริ่มต้น (fallback) — จะถูกแทนที่ด้วยข้อมูลจาก Google Sheet เมื่อโหลดสำเร็จ
let SERVICES = {
  clean:   { label: 'ล้างแอร์',    rates: { '9000': 500,  '12000': 600,  '18000': 800,  '24000': 1000, '36000': 1500, '48000': 2000 } },
  repair:  { label: 'ซ่อมแอร์',    rates: { '9000': 800,  '12000': 1000, '18000': 1300, '24000': 1600, '36000': 2200, '48000': 2800 } },
  install: { label: 'ติดตั้งแอร์', rates: { '9000': 2500, '12000': 3000, '18000': 4000, '24000': 5500, '36000': 7500, '48000': 9500 } },
};

let SIZES = [
  { value: '9000',  label: '9,000 BTU' },
  { value: '12000', label: '12,000 BTU' },
  { value: '18000', label: '18,000 BTU' },
  { value: '24000', label: '24,000 BTU' },
  { value: '36000', label: '36,000 BTU' },
  { value: '48000', label: '48,000 BTU' },
];

const DISTANCE_LABELS = {
  '0': 'ในรัศมี 5 กม.',
  '100': '6 - 10 กม.',
  '200': '11 - 20 กม.',
  '350': '21 - 30 กม.',
  '500': '31 - 50 กม.',
  '800': 'มากกว่า 50 กม.',
};

const VAT_RATE = 0.07;
const STORAGE_KEY = 'nitcha_bookings_v1';

// ===== Google Sheet integration =====
// pubhtml URL ที่เผยแพร่ — ใช้สำหรับ embed/แสดงในแท็บ
const SHEET_PUBHTML_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQbLTBxowSWLfHSAae_ih_K15AFwHsJ8D1QToFHYIVmbPkNwczDjGuNukLO9tAUaRDE-EHZ5sadfpcI/pubhtml';
// CSV ของชีตแรก (สำหรับโหลดราคา)  — เปลี่ยน gid ถ้าราคาอยู่ชีตอื่น
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQbLTBxowSWLfHSAae_ih_K15AFwHsJ8D1QToFHYIVmbPkNwczDjGuNukLO9tAUaRDE-EHZ5sadfpcI/pub?output=csv';
// URL ของ Google Apps Script Web App (Deploy as Web App) สำหรับ "เขียน" การจองกลับเข้าชีต
// ถ้าเว้นว่าง ระบบจะข้ามการส่ง (บันทึก local อย่างเดียว)
const APPS_SCRIPT_URL = '';

// ===== State =====
let items = [];
let nextItemId = 1;
let currentBooking = null;

// ===== Helpers =====
const fmt = (n) => '฿' + Number(n).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function getRate(service, size) {
  if (!service || !size) return 0;
  return SERVICES[service]?.rates[size] ?? 0;
}

function genBookingNumber() {
  const d = new Date();
  const y = d.getFullYear().toString().slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `AC${y}${m}${day}-${rand}`;
}

function calcTotals(its, distance, withVat) {
  const subtotal = its.reduce((s, it) => s + getRate(it.service, it.size) * (it.qty || 1), 0);
  const travel = Number(distance) || 0;
  const base = subtotal + travel;
  const vat = withVat ? Math.round(base * VAT_RATE * 100) / 100 : 0;
  return { subtotal, travel, vat, total: base + vat };
}

function formatThaiDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
}

// ===== Storage =====
function loadBookings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch { return []; }
}
function saveBookings(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}
function addBooking(b) {
  const list = loadBookings();
  list.unshift(b);
  saveBookings(list);
  updateHistoryCount();
}
function deleteBooking(no) {
  const list = loadBookings().filter(b => b.bookingNo !== no);
  saveBookings(list);
  renderHistory();
  updateHistoryCount();
}
function updateHistoryCount() {
  const c = loadBookings().length;
  $('historyCount').textContent = c ? `(${c})` : '';
}

// ===== Render item rows =====
function renderItems() {
  const container = $('itemsContainer');
  if (items.length === 0) {
    container.innerHTML = `
      <div class="card-dashed p-6 text-center text-sm text-muted">
        ยังไม่มีรายการบริการ — กด "เพิ่มรายการ" เพื่อเริ่มต้น
      </div>`;
    updateSummary();
    return;
  }

  container.innerHTML = items.map((it, idx) => {
    const sizeOpts = SIZES.map(s => `<option value="${s.value}" ${it.size===s.value?'selected':''}>${s.label}</option>`).join('');
    const svcOpts = Object.entries(SERVICES).map(([k, v]) => `<option value="${k}" ${it.service===k?'selected':''}>${v.label}</option>`).join('');
    const price = getRate(it.service, it.size) * (it.qty || 1);
    return `
      <div class="border border-subtle rounded-lg p-4 bg-white" data-id="${it.id}">
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm font-medium text-muted">รายการที่ ${idx + 1}</span>
          <button type="button" class="text-sm text-muted hover:text-ink remove-item" data-id="${it.id}" aria-label="ลบ">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor" class="w-4 h-4 inline-block">
              <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m11.456 0a48.11 48.11 0 00-3.478-.397M6.34 5.79V4.5a2.25 2.25 0 012.25-2.25h6.82a2.25 2.25 0 012.25 2.25v1.29" />
            </svg>
          </button>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div class="sm:col-span-5">
            <label class="label">ประเภทบริการ</label>
            <select class="field svc-select" data-id="${it.id}">
              <option value="">-- เลือกบริการ --</option>
              ${svcOpts}
            </select>
          </div>
          <div class="sm:col-span-4">
            <label class="label">ขนาดแอร์</label>
            <select class="field size-select" data-id="${it.id}">
              <option value="">-- เลือกขนาด --</option>
              ${sizeOpts}
            </select>
          </div>
          <div class="sm:col-span-3">
            <label class="label">จำนวน</label>
            <input type="number" min="1" value="${it.qty || 1}" class="field qty-input" data-id="${it.id}" />
          </div>
        </div>
        <div class="flex justify-end items-center mt-3 pt-3 border-t border-subtle">
          <span class="text-sm text-muted mr-2">ราคา:</span>
          <span class="text-sm font-semibold">${fmt(price)}</span>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.svc-select').forEach(el => {
    el.addEventListener('change', e => {
      const id = Number(e.target.dataset.id);
      const it = items.find(i => i.id === id);
      if (it) { it.service = e.target.value; renderItems(); }
    });
  });
  container.querySelectorAll('.size-select').forEach(el => {
    el.addEventListener('change', e => {
      const id = Number(e.target.dataset.id);
      const it = items.find(i => i.id === id);
      if (it) { it.size = e.target.value; renderItems(); }
    });
  });
  container.querySelectorAll('.qty-input').forEach(el => {
    el.addEventListener('input', e => {
      const id = Number(e.target.dataset.id);
      const it = items.find(i => i.id === id);
      const v = Math.max(1, Number(e.target.value) || 1);
      if (it) { it.qty = v; updateSummary(); }
    });
  });
  container.querySelectorAll('.remove-item').forEach(el => {
    el.addEventListener('click', e => {
      const id = Number(e.currentTarget.dataset.id);
      items = items.filter(i => i.id !== id);
      renderItems();
    });
  });

  updateSummary();
}

function updateSummary() {
  const list = $('summaryList');
  if (items.length === 0) {
    list.innerHTML = `<div class="card-dashed p-4 text-center text-xs text-muted">ยังไม่มีรายการ</div>`;
  } else {
    list.innerHTML = items.map((it, idx) => {
      const price = getRate(it.service, it.size) * (it.qty || 1);
      const svcLabel = it.service ? (SERVICES[it.service]?.label || it.service) : '—';
      const sizeLabel = it.size ? SIZES.find(s => s.value === it.size)?.label : '—';
      return `
        <div class="flex justify-between gap-2">
          <div class="min-w-0">
            <div class="truncate">${idx + 1}. ${esc(svcLabel)}</div>
            <div class="text-xs text-muted truncate">${esc(sizeLabel)} × ${it.qty || 1}</div>
          </div>
          <div class="font-medium whitespace-nowrap">${fmt(price)}</div>
        </div>`;
    }).join('');
  }

  const withVat = $('vatToggle').checked;
  const { subtotal, travel, vat, total } = calcTotals(items, $('distance').value, withVat);
  $('subTotalLabel').textContent = fmt(subtotal);
  $('travelLabel').textContent = fmt(travel);
  $('vatLabel').textContent = fmt(vat);
  $('vatRow').classList.toggle('hidden', !withVat);
  $('totalLabel').textContent = fmt(total);
}

// ===== Submit =====
function validateAndSubmit() {
  if (items.length === 0) { alert('กรุณาเพิ่มรายการบริการอย่างน้อย 1 รายการ'); return; }
  for (const it of items) {
    if (!it.service || !it.size) {
      alert('กรุณาเลือกประเภทบริการและขนาดแอร์ให้ครบทุกรายการ'); return;
    }
  }
  const name = $('custName').value.trim();
  const phone = $('custPhone').value.trim();
  const address = $('custAddress').value.trim();
  const note = $('custNote').value.trim();
  const date = $('bookDate').value;
  const time = $('bookTime').value;

  if (!name || !phone || !address) { alert('กรุณากรอกข้อมูลลูกค้าให้ครบถ้วน'); return; }
  if (!date || !time) { alert('กรุณาเลือกวันและเวลานัดหมาย'); return; }

  const withVat = $('vatToggle').checked;
  const distance = $('distance').value;
  const totals = calcTotals(items, distance, withVat);

  const booking = {
    bookingNo: genBookingNumber(),
    createdAt: new Date().toISOString(),
    customer: { name, phone, address, note },
    schedule: { date, time },
    items: items.map(it => ({ service: it.service, size: it.size, qty: it.qty || 1, rate: getRate(it.service, it.size) })),
    distance: { value: Number(distance), label: DISTANCE_LABELS[distance] || '-' },
    withVat,
    totals,
  };

  addBooking(booking);
  syncBookingToSheet(booking);
  currentBooking = booking;
  showResult(booking);
}

// ===== Sync booking → Google Sheet (via Apps Script Web App) =====
function syncBookingToSheet(b) {
  if (!APPS_SCRIPT_URL) return;
  const payload = {
    bookingNo: b.bookingNo,
    createdAt: b.createdAt,
    name: b.customer.name,
    phone: b.customer.phone,
    address: b.customer.address,
    note: b.customer.note,
    date: b.schedule.date,
    time: b.schedule.time,
    items: b.items.map(it => `${(SERVICES[it.service]?.label || it.service)} ${SIZES.find(s=>s.value===it.size)?.label||''} ×${it.qty}`).join(' | '),
    distance: b.distance.label,
    subtotal: b.totals.subtotal,
    travel: b.totals.travel,
    vat: b.totals.vat,
    total: b.totals.total,
  };
  // ใช้ no-cors เพื่อหลีกเลี่ยง CORS preflight ของ Apps Script
  fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  }).catch(err => console.warn('Sync to sheet failed:', err));
}

// ===== Load rates from Google Sheet =====
// คาดว่าชีตมีคอลัมน์: service, size, price
// service = clean | repair | install ; size = 9000/12000/18000/24000/36000/48000
function parseCsv(text) {
  // ลบ BOM ที่ Google CSV มักใส่มา
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i+1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i+1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => String(v).trim() !== ''));
}

// คีย์มาตรฐานสำหรับชื่อบริการ (ใช้เก็บใน items/booking — ทนต่อภาษา/อักษรพิเศษ)
function makeServiceKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^\w฀-๿]/g, '');
}

// ดึงตัวเลข BTU จาก header เช่น "9,000 BTU" / "12000" / "9k" → "9000" ; "9" → "9000"
function normalizeSizeKey(s) {
  const digits = String(s || '').replace(/[^\d]/g, '');
  if (!digits) return null;
  let n = Number(digits);
  if (n > 0 && n < 100) n = n * 1000; // "9" → 9000
  return String(n);
}

function formatBtuLabel(key) {
  const n = Number(key);
  if (!n || Number.isNaN(n)) return key;
  return n.toLocaleString('en-US') + ' BTU';
}

async function fetchCsvWithFallback(url) {
  // 1) ลองตรง
  try {
    const r = await fetch(url, { cache: 'no-store', redirect: 'follow' });
    if (r.ok) {
      const text = await r.text();
      if (text && text.length > 0) return { text, via: 'direct' };
    }
    console.warn('direct fetch returned', r.status);
  } catch (e) {
    console.warn('direct fetch failed:', e.message);
  }
  // 2) Fallback ผ่าน CORS proxy สาธารณะ
  const proxied = 'https://corsproxy.io/?' + encodeURIComponent(url);
  const r2 = await fetch(proxied, { cache: 'no-store' });
  if (!r2.ok) throw new Error('Proxy HTTP ' + r2.status);
  const text = await r2.text();
  return { text, via: 'corsproxy.io' };
}

async function loadRatesFromSheet(silent) {
  const status = $('sheetStatus');
  if (status && !silent) status.textContent = 'กำลังโหลดราคาจากชีต...';
  try {
    const url = SHEET_CSV_URL + (SHEET_CSV_URL.includes('?') ? '&' : '?') + 't=' + Date.now();
    const { text, via } = await fetchCsvWithFallback(url);
    console.log('[rates] fetched via', via, '— bytes:', text.length);
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error('ชีตไม่มีข้อมูล');

    // แถวแรก = ขนาด BTU (col 0 มัก = label/ว่าง), แถวถัดมา = ชื่อบริการ + ราคาแต่ละ BTU
    const header = rows[0];
    const sizeCols = []; // {col, sizeKey}
    for (let c = 1; c < header.length; c++) {
      const sz = normalizeSizeKey(header[c]);
      if (sz) sizeCols.push({ col: c, sizeKey: sz });
    }
    if (sizeCols.length === 0) throw new Error('ไม่พบขนาด BTU ในแถวบนสุด');

    // สร้าง SIZES ใหม่ตามลำดับในชีต (ไม่ซ้ำ)
    const newSizes = [];
    const seenSize = new Set();
    for (const { sizeKey } of sizeCols) {
      if (!seenSize.has(sizeKey)) {
        seenSize.add(sizeKey);
        newSizes.push({ value: sizeKey, label: formatBtuLabel(sizeKey) });
      }
    }

    // สร้าง SERVICES ใหม่จากแถวล่าง
    const newServices = {};
    let cellCount = 0;
    for (let r = 1; r < rows.length; r++) {
      const rawName = (rows[r][0] || '').trim();
      if (!rawName) continue;
      const key = makeServiceKey(rawName);
      if (!key) continue;
      if (!newServices[key]) newServices[key] = { label: rawName, rates: {} };
      for (const { col, sizeKey } of sizeCols) {
        const raw = rows[r][col];
        if (raw == null || String(raw).trim() === '') continue;
        const price = Number(String(raw).replace(/[^\d.-]/g, ''));
        if (!Number.isNaN(price) && price >= 0) {
          newServices[key].rates[sizeKey] = price;
          cellCount++;
        }
      }
    }
    if (cellCount === 0 || Object.keys(newServices).length === 0) {
      throw new Error('ไม่พบข้อมูลราคาในชีต');
    }

    SIZES = newSizes;
    SERVICES = newServices;

    // ลบรายการ items ที่อ้างถึง service/size ที่ไม่มีอีกแล้ว
    items = items.map(it => ({
      ...it,
      service: SERVICES[it.service] ? it.service : '',
      size: SIZES.some(s => s.value === it.size) ? it.size : '',
    }));

    const stamp = new Date().toLocaleTimeString('th-TH');
    if (status) status.textContent = `อัปเดตราคาล่าสุด • ${Object.keys(SERVICES).length} บริการ × ${SIZES.length} ขนาด • ${stamp}`;
    const mini = $('ratesStatus');
    if (mini) {
      mini.textContent = `✓ ราคาอัปเดตจาก Google Sheet • ${stamp}`;
      mini.style.color = '#166534';
    }
    renderItems();
  } catch (err) {
    console.error('loadRatesFromSheet failed:', err);
    if (status) status.textContent = 'โหลดไม่สำเร็จ: ' + err.message;
    const mini = $('ratesStatus');
    if (mini) {
      mini.textContent = '⚠ โหลดราคาจากชีตไม่สำเร็จ: ' + err.message + ' (ใช้ราคาสำรอง)';
      mini.style.color = '#B91C1C';
    }
  }
}

function showResult(b) {
  $('bookingNumber').textContent = b.bookingNo;

  $('resultCustomer').innerHTML = `
    <div><span class="text-muted">ชื่อ:</span> ${esc(b.customer.name)}</div>
    <div><span class="text-muted">โทร:</span> ${esc(b.customer.phone)}</div>
    <div><span class="text-muted">ที่อยู่:</span> ${esc(b.customer.address)}</div>
    ${b.customer.note ? `<div><span class="text-muted">หมายเหตุ:</span> ${esc(b.customer.note)}</div>` : ''}`;

  $('resultSchedule').innerHTML = `
    <div><span class="text-muted">วันที่:</span> ${formatThaiDate(b.schedule.date)}</div>
    <div><span class="text-muted">เวลา:</span> ${esc(b.schedule.time)} น.</div>`;

  $('resultItems').innerHTML = b.items.map((it, idx) => {
    const price = it.rate * it.qty;
    const sizeLabel = SIZES.find(s => s.value === it.size)?.label || '-';
    return `
      <div class="flex justify-between border-b border-subtle pb-2 last:border-0">
        <div>
          <div>${idx + 1}. ${(SERVICES[it.service]?.label || it.service)}</div>
          <div class="text-xs text-muted">${sizeLabel} × ${it.qty}</div>
        </div>
        <div class="font-medium">${fmt(price)}</div>
      </div>`;
  }).join('') + `
    <div class="flex justify-between text-xs text-muted pt-1">
      <span>ระยะทาง</span><span>${esc(b.distance.label)}</span>
    </div>`;

  $('resultSubtotal').textContent = fmt(b.totals.subtotal);
  $('resultTravel').textContent = fmt(b.totals.travel);
  $('resultVatRow').classList.toggle('hidden', !b.withVat);
  $('resultVat').textContent = fmt(b.totals.vat);
  $('resultTotal').textContent = fmt(b.totals.total);

  $('formView').classList.add('hidden');
  $('resultView').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
  items = [];
  nextItemId = 1;
  currentBooking = null;
  $('custName').value = '';
  $('custPhone').value = '';
  $('custAddress').value = '';
  $('custNote').value = '';
  $('bookDate').value = '';
  $('bookTime').value = '';
  $('distance').value = '0';
  $('vatToggle').checked = false;
  items.push({ id: nextItemId++, service: '', size: '', qty: 1 });
  renderItems();
  $('resultView').classList.add('hidden');
  $('formView').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== PDF Quotation =====
function buildPdfHtml(b) {
  const itemsRows = b.items.map((it, idx) => {
    const sizeLabel = SIZES.find(s => s.value === it.size)?.label || '-';
    return `
      <tr>
        <td>${idx + 1}</td>
        <td>
          <div style="font-weight:500;">${(SERVICES[it.service]?.label || it.service)}</div>
          <div style="color:#888780;font-size:11px;">${sizeLabel}</div>
        </td>
        <td class="text-right">${fmt(it.rate)}</td>
        <td class="text-right">${it.qty}</td>
        <td class="text-right" style="font-weight:500;">${fmt(it.rate * it.qty)}</td>
      </tr>`;
  }).join('');

  const issueDate = new Date(b.createdAt);
  const validUntil = new Date(issueDate.getTime() + 7 * 86400000);
  const dateFmt = (d) => d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });

  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:24px;border-bottom:2px solid #1A1A1A;">
      <div>
        <div class="doc-title">${esc(COMPANY.name)}</div>
        <div style="color:#888780;font-size:12px;margin-top:2px;">${esc(COMPANY.tagline)}</div>
        <div style="margin-top:12px;color:#1A1A1A;font-size:12px;line-height:1.7;">
          ${esc(COMPANY.address)}<br/>
          โทร. ${esc(COMPANY.phone)} • ${esc(COMPANY.email)}<br/>
          เลขประจำตัวผู้เสียภาษี: ${esc(COMPANY.taxId)}
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:18px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:#1A1A1A;">ใบเสนอราคา</div>
        <div style="color:#888780;font-size:11px;margin-bottom:8px;">QUOTATION</div>
        <div style="font-size:16px;font-weight:600;">${esc(b.bookingNo)}</div>
        <div style="color:#888780;font-size:12px;margin-top:8px;">วันที่ออก: ${dateFmt(issueDate)}</div>
        <div style="color:#888780;font-size:12px;">มีอายุถึง: ${dateFmt(validUntil)}</div>
      </div>
    </div>

    <div style="display:flex;gap:32px;margin-bottom:28px;">
      <div style="flex:1;">
        <div class="doc-h2">ลูกค้า / BILL TO</div>
        <div style="font-weight:500;font-size:14px;">${esc(b.customer.name)}</div>
        <div style="color:#1A1A1A;margin-top:2px;">${esc(b.customer.phone)}</div>
        <div style="color:#888780;margin-top:6px;line-height:1.5;">${esc(b.customer.address)}</div>
        ${b.customer.note ? `<div style="color:#888780;margin-top:4px;font-style:italic;">หมายเหตุ: ${esc(b.customer.note)}</div>` : ''}
      </div>
      <div style="flex:1;">
        <div class="doc-h2">นัดหมายให้บริการ / SERVICE DATE</div>
        <div style="font-weight:500;">${formatThaiDate(b.schedule.date)}</div>
        <div style="color:#1A1A1A;margin-top:2px;">เวลา ${esc(b.schedule.time)} น.</div>
        <div style="color:#888780;margin-top:8px;font-size:12px;">ระยะทาง: ${esc(b.distance.label)}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:40px;">#</th>
          <th>รายการ</th>
          <th class="text-right" style="width:100px;">ราคา/หน่วย</th>
          <th class="text-right" style="width:60px;">จำนวน</th>
          <th class="text-right" style="width:110px;">รวม</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>

    <div style="display:flex;justify-content:flex-end;margin-top:24px;">
      <div style="width:280px;">
        <div style="display:flex;justify-content:space-between;padding:6px 0;color:#888780;">
          <span>ค่าบริการรวม</span><span>${fmt(b.totals.subtotal)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;color:#888780;">
          <span>ค่าเดินทาง</span><span>${fmt(b.totals.travel)}</span>
        </div>
        ${b.withVat ? `
        <div style="display:flex;justify-content:space-between;padding:6px 0;color:#888780;border-top:1px solid rgba(0,0,0,0.08);">
          <span>มูลค่าก่อนภาษี</span><span>${fmt(b.totals.subtotal + b.totals.travel)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;color:#888780;">
          <span>ภาษีมูลค่าเพิ่ม (VAT 7%)</span><span>${fmt(b.totals.vat)}</span>
        </div>` : ''}
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:2px solid #1A1A1A;margin-top:4px;font-size:16px;font-weight:700;">
          <span>ยอดรวมสุทธิ</span><span>${fmt(b.totals.total)}</span>
        </div>
      </div>
    </div>

    <div style="margin-top:48px;padding-top:20px;border-top:1px solid rgba(0,0,0,0.08);color:#888780;font-size:11px;line-height:1.7;">
      <div style="font-weight:600;color:#1A1A1A;margin-bottom:6px;">เงื่อนไขการให้บริการ</div>
      • ใบเสนอราคานี้มีอายุ 7 วันนับจากวันที่ออก<br/>
      • ราคารวมค่าแรงและค่าเดินทางแล้ว ไม่รวมค่าอะไหล่ (ถ้ามี)<br/>
      • กรุณาชำระเงินภายในวันที่รับบริการ<br/>
      • หากต้องการยกเลิกหรือเปลี่ยนแปลงนัดหมาย กรุณาแจ้งล่วงหน้าอย่างน้อย 24 ชั่วโมง
    </div>

    <div style="display:flex;justify-content:space-between;margin-top:60px;gap:60px;">
      <div style="flex:1;text-align:center;">
        <div style="border-top:1px solid #1A1A1A;padding-top:8px;color:#888780;font-size:12px;">ผู้เสนอราคา</div>
      </div>
      <div style="flex:1;text-align:center;">
        <div style="border-top:1px solid #1A1A1A;padding-top:8px;color:#888780;font-size:12px;">ผู้อนุมัติ / ลูกค้า</div>
      </div>
    </div>`;
}

function downloadPdf(b) {
  const target = $('pdfDoc');
  target.innerHTML = buildPdfHtml(b);
  const opt = {
    margin: 0,
    filename: `Quotation-${b.bookingNo}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#FFFFFF' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  };
  html2pdf().set(opt).from(target).save();
}

// ===== History =====
function renderHistory() {
  const wrap = $('historyTableWrap');
  const q = ($('historySearch').value || '').toLowerCase().trim();
  const list = loadBookings().filter(b => {
    if (!q) return true;
    return b.bookingNo.toLowerCase().includes(q)
      || b.customer.name.toLowerCase().includes(q)
      || b.customer.phone.toLowerCase().includes(q);
  });

  if (list.length === 0) {
    wrap.innerHTML = `
      <div class="card-dashed p-10 text-center">
        <p class="text-sm text-muted">${q ? 'ไม่พบรายการที่ตรงกับการค้นหา' : 'ยังไม่มีประวัติการจอง'}</p>
      </div>`;
    return;
  }

  wrap.innerHTML = `
    <table class="w-full text-sm">
      <thead class="text-left text-xs text-muted uppercase tracking-wide">
        <tr class="border-b border-subtle">
          <th class="py-3 px-2">เลขจอง</th>
          <th class="py-3 px-2">ลูกค้า</th>
          <th class="py-3 px-2">นัดหมาย</th>
          <th class="py-3 px-2">รายการ</th>
          <th class="py-3 px-2 text-right">ยอดรวม</th>
          <th class="py-3 px-2 text-right">การดำเนินการ</th>
        </tr>
      </thead>
      <tbody>
        ${list.map(b => {
          const svcSet = [...new Set(b.items.map(it => it.service))];
          const badges = svcSet.map(s => {
            const cls = s === 'clean' ? 'badge-clean' : s === 'repair' ? 'badge-repair' : 'badge-install';
            const label = SERVICES[s]?.label || s;
            return `<span class="badge ${cls}">${esc(label)}</span>`;
          }).join(' ');
          return `
            <tr class="border-b border-subtle hover:bg-canvas">
              <td class="py-3 px-2 font-medium whitespace-nowrap">${esc(b.bookingNo)}</td>
              <td class="py-3 px-2">
                <div class="font-medium">${esc(b.customer.name)}</div>
                <div class="text-xs text-muted">${esc(b.customer.phone)}</div>
              </td>
              <td class="py-3 px-2 whitespace-nowrap">
                <div>${esc(b.schedule.date)}</div>
                <div class="text-xs text-muted">${esc(b.schedule.time)} น.</div>
              </td>
              <td class="py-3 px-2"><div class="flex flex-wrap gap-1">${badges}</div></td>
              <td class="py-3 px-2 text-right font-semibold whitespace-nowrap">${fmt(b.totals.total)}</td>
              <td class="py-3 px-2 text-right whitespace-nowrap">
                <button class="btn-secondary view-btn" data-no="${esc(b.bookingNo)}" style="padding:4px 10px;font-size:12px;">ดู</button>
                <button class="btn-secondary pdf-btn" data-no="${esc(b.bookingNo)}" style="padding:4px 10px;font-size:12px;">PDF</button>
                <button class="btn-danger del-btn" data-no="${esc(b.bookingNo)}">ลบ</button>
              </td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  wrap.querySelectorAll('.view-btn').forEach(el => el.addEventListener('click', e => openDetail(e.currentTarget.dataset.no)));
  wrap.querySelectorAll('.pdf-btn').forEach(el => el.addEventListener('click', e => {
    const b = loadBookings().find(x => x.bookingNo === e.currentTarget.dataset.no);
    if (b) downloadPdf(b);
  }));
  wrap.querySelectorAll('.del-btn').forEach(el => el.addEventListener('click', e => {
    const no = e.currentTarget.dataset.no;
    if (confirm(`ต้องการลบการจอง ${no} ใช่หรือไม่?`)) deleteBooking(no);
  }));
}

function openDetail(no) {
  const b = loadBookings().find(x => x.bookingNo === no);
  if (!b) return;
  const body = $('detailBody');
  body.innerHTML = `
    <div class="card-dashed p-4 text-center mb-5">
      <p class="text-xs text-muted">เลขจอง / ใบเสนอราคา</p>
      <p class="text-xl font-semibold mt-1">${esc(b.bookingNo)}</p>
    </div>
    <div class="space-y-5 text-sm">
      <div>
        <h4 class="text-xs font-semibold text-muted uppercase mb-2">ลูกค้า</h4>
        <div>${esc(b.customer.name)} • ${esc(b.customer.phone)}</div>
        <div class="text-muted mt-1">${esc(b.customer.address)}</div>
        ${b.customer.note ? `<div class="text-muted mt-1 italic">${esc(b.customer.note)}</div>` : ''}
      </div>
      <div>
        <h4 class="text-xs font-semibold text-muted uppercase mb-2">นัดหมาย</h4>
        <div>${formatThaiDate(b.schedule.date)} เวลา ${esc(b.schedule.time)} น.</div>
        <div class="text-muted text-xs mt-1">ระยะทาง: ${esc(b.distance.label)}</div>
      </div>
      <div>
        <h4 class="text-xs font-semibold text-muted uppercase mb-2">รายการ</h4>
        ${b.items.map((it, idx) => {
          const sizeLabel = SIZES.find(s => s.value === it.size)?.label || '-';
          return `
            <div class="flex justify-between border-b border-subtle py-2">
              <div>
                <div>${idx + 1}. ${(SERVICES[it.service]?.label || it.service)}</div>
                <div class="text-xs text-muted">${sizeLabel} × ${it.qty}</div>
              </div>
              <div class="font-medium">${fmt(it.rate * it.qty)}</div>
            </div>`;
        }).join('')}
      </div>
      <div class="border-t border-subtle pt-3 space-y-1">
        <div class="flex justify-between text-muted"><span>ค่าบริการรวม</span><span>${fmt(b.totals.subtotal)}</span></div>
        <div class="flex justify-between text-muted"><span>ค่าเดินทาง</span><span>${fmt(b.totals.travel)}</span></div>
        ${b.withVat ? `<div class="flex justify-between text-muted"><span>VAT 7%</span><span>${fmt(b.totals.vat)}</span></div>` : ''}
        <div class="flex justify-between text-lg font-semibold pt-2 border-t border-subtle">
          <span>ยอดรวมสุทธิ</span><span>${fmt(b.totals.total)}</span>
        </div>
      </div>
      <button class="btn-primary w-full" id="detailPdfBtn">ดาวน์โหลด PDF ใบเสนอราคา</button>
    </div>`;
  $('detailPdfBtn').addEventListener('click', () => downloadPdf(b));
  $('detailModal').classList.remove('hidden');
}

function closeDetail() {
  $('detailModal').classList.add('hidden');
}

// ===== Tabs =====
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $('tabCreate').classList.toggle('hidden', name !== 'create');
  $('tabHistory').classList.toggle('hidden', name !== 'history');
  $('tabSheet').classList.toggle('hidden', name !== 'sheet');
  if (name === 'history') renderHistory();
  if (name === 'sheet') {
    const frame = $('sheetFrame');
    if (!frame.src) frame.src = SHEET_PUBHTML_URL + (SHEET_PUBHTML_URL.includes('?') ? '&' : '?') + 'widget=true&headers=false';
  }
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  $('addItemBtn').addEventListener('click', () => {
    items.push({ id: nextItemId++, service: '', size: '', qty: 1 });
    renderItems();
  });
  $('distance').addEventListener('change', updateSummary);
  $('vatToggle').addEventListener('change', updateSummary);
  $('submitBtn').addEventListener('click', validateAndSubmit);
  $('newBookingBtn').addEventListener('click', resetForm);
  $('downloadPdfBtn').addEventListener('click', () => { if (currentBooking) downloadPdf(currentBooking); });

  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('historySearch').addEventListener('input', renderHistory);
  $('clearHistoryBtn').addEventListener('click', () => {
    if (confirm('ต้องการลบประวัติการจองทั้งหมดใช่หรือไม่?')) {
      saveBookings([]);
      renderHistory();
      updateHistoryCount();
    }
  });
  $('openSheetLink').href = SHEET_PUBHTML_URL;
  $('reloadSheetBtn').addEventListener('click', () => {
    const f = $('sheetFrame');
    f.src = SHEET_PUBHTML_URL + (SHEET_PUBHTML_URL.includes('?') ? '&' : '?') + 'widget=true&headers=false&t=' + Date.now();
  });
  $('loadRatesBtn').addEventListener('click', loadRatesFromSheet);

  $('closeDetail').addEventListener('click', closeDetail);
  $('detailModal').addEventListener('click', e => { if (e.target.id === 'detailModal') closeDetail(); });

  items.push({ id: nextItemId++, service: '', size: '', qty: 1 });
  renderItems();
  updateHistoryCount();

  // ปุ่มรีโหลดบนการ์ดสรุป
  const reloadBtn = $('reloadRatesBtn');
  if (reloadBtn) reloadBtn.addEventListener('click', () => loadRatesFromSheet(false));

  // ดึงราคาจากชีตทันทีที่เข้าหน้า + รีเฟรชอัตโนมัติทุก 10 วินาที (เรียลไทม์)
  loadRatesFromSheet(true);
  setInterval(() => loadRatesFromSheet(true), 10000);
  // ดึงใหม่ทันทีเมื่อผู้ใช้สลับกลับมาที่แท็บ / โฟกัสหน้าต่าง
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadRatesFromSheet(true);
  });
  window.addEventListener('focus', () => loadRatesFromSheet(true));
  window.addEventListener('online', () => loadRatesFromSheet(true));
});
