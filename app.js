// ===== Service rate table (บาท) =====
const SERVICES = {
  clean:   { label: 'ล้างแอร์',    rates: { '9000': 500,  '12000': 600,  '18000': 800,  '24000': 1000, '36000': 1500, '48000': 2000 } },
  repair:  { label: 'ซ่อมแอร์',    rates: { '9000': 800,  '12000': 1000, '18000': 1300, '24000': 1600, '36000': 2200, '48000': 2800 } },
  install: { label: 'ติดตั้งแอร์', rates: { '9000': 2500, '12000': 3000, '18000': 4000, '24000': 5500, '36000': 7500, '48000': 9500 } },
};

const SIZES = [
  { value: '9000',  label: '9,000 BTU' },
  { value: '12000', label: '12,000 BTU' },
  { value: '18000', label: '18,000 BTU' },
  { value: '24000', label: '24,000 BTU' },
  { value: '36000', label: '36,000 BTU' },
  { value: '48000', label: '48,000 BTU' },
];

// ===== State =====
let items = [];
let nextItemId = 1;

// ===== Helpers =====
const fmt = (n) => '฿' + Number(n).toLocaleString('th-TH');
const $ = (id) => document.getElementById(id);

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

  // bind events
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
      const svcLabel = it.service ? SERVICES[it.service].label : '—';
      const sizeLabel = it.size ? SIZES.find(s => s.value === it.size)?.label : '—';
      return `
        <div class="flex justify-between gap-2">
          <div class="min-w-0">
            <div class="truncate">${idx + 1}. ${svcLabel}</div>
            <div class="text-xs text-muted truncate">${sizeLabel} × ${it.qty || 1}</div>
          </div>
          <div class="font-medium whitespace-nowrap">${fmt(price)}</div>
        </div>`;
    }).join('');
  }

  const subtotal = items.reduce((s, it) => s + getRate(it.service, it.size) * (it.qty || 1), 0);
  const travel = Number($('distance').value) || 0;
  $('subTotalLabel').textContent = fmt(subtotal);
  $('travelLabel').textContent = fmt(travel);
  $('totalLabel').textContent = fmt(subtotal + travel);
}

// ===== Submit =====
function validateAndSubmit() {
  if (items.length === 0) {
    alert('กรุณาเพิ่มรายการบริการอย่างน้อย 1 รายการ');
    return;
  }
  for (const it of items) {
    if (!it.service || !it.size) {
      alert('กรุณาเลือกประเภทบริการและขนาดแอร์ให้ครบทุกรายการ');
      return;
    }
  }
  const name = $('custName').value.trim();
  const phone = $('custPhone').value.trim();
  const address = $('custAddress').value.trim();
  const date = $('bookDate').value;
  const time = $('bookTime').value;

  if (!name || !phone || !address) {
    alert('กรุณากรอกข้อมูลลูกค้าให้ครบถ้วน');
    return;
  }
  if (!date || !time) {
    alert('กรุณาเลือกวันและเวลานัดหมาย');
    return;
  }

  const subtotal = items.reduce((s, it) => s + getRate(it.service, it.size) * (it.qty || 1), 0);
  const travel = Number($('distance').value) || 0;
  const total = subtotal + travel;
  const bookingNo = genBookingNumber();

  // Render result
  $('bookingNumber').textContent = bookingNo;

  $('resultCustomer').innerHTML = `
    <div><span class="text-muted">ชื่อ:</span> ${name}</div>
    <div><span class="text-muted">โทร:</span> ${phone}</div>
    <div><span class="text-muted">ที่อยู่:</span> ${address}</div>`;

  const dt = new Date(date + 'T' + time);
  const dateStr = dt.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  $('resultSchedule').innerHTML = `
    <div><span class="text-muted">วันที่:</span> ${dateStr}</div>
    <div><span class="text-muted">เวลา:</span> ${time} น.</div>`;

  const distOpt = $('distance').options[$('distance').selectedIndex].text;
  $('resultItems').innerHTML = items.map((it, idx) => {
    const price = getRate(it.service, it.size) * (it.qty || 1);
    return `
      <div class="flex justify-between border-b border-subtle pb-2 last:border-0">
        <div>
          <div>${idx + 1}. ${SERVICES[it.service].label}</div>
          <div class="text-xs text-muted">${SIZES.find(s => s.value === it.size).label} × ${it.qty || 1}</div>
        </div>
        <div class="font-medium">${fmt(price)}</div>
      </div>`;
  }).join('') + `
    <div class="flex justify-between text-xs text-muted pt-1">
      <span>ระยะทาง</span><span>${distOpt}</span>
    </div>`;

  $('resultSubtotal').textContent = fmt(subtotal);
  $('resultTravel').textContent = fmt(travel);
  $('resultTotal').textContent = fmt(total);

  $('formView').classList.add('hidden');
  $('resultView').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
  items = [];
  nextItemId = 1;
  $('custName').value = '';
  $('custPhone').value = '';
  $('custAddress').value = '';
  $('bookDate').value = '';
  $('bookTime').value = '';
  $('distance').value = '0';
  renderItems();
  $('resultView').classList.add('hidden');
  $('formView').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  $('addItemBtn').addEventListener('click', () => {
    items.push({ id: nextItemId++, service: '', size: '', qty: 1 });
    renderItems();
  });
  $('distance').addEventListener('change', updateSummary);
  $('submitBtn').addEventListener('click', validateAndSubmit);
  $('newBookingBtn').addEventListener('click', resetForm);
  $('printBtn').addEventListener('click', () => window.print());

  // Default: add 1 empty item
  items.push({ id: nextItemId++, service: '', size: '', qty: 1 });
  renderItems();
});
