"use strict";

const DB_NAME = "srkr-invoices-db";
const DB_VERSION = 1;
const STORE = "invoices";
const DELETE_PASSWORD = "1234";
const TRIAL_DAYS = 3;
const TRIAL_KEY = "srkrTrialStart";

const COMPANY = {
  name: "SRI RADHE KRISHNA ROADLINES",
  address: "CART SARAI ROAD, GADIKHANA CHOWK, NEAR VIR KUWAR SINGH PARK, RANCHI 834001",
  email: "EMAIL: radhekrishnaroadlines9792@gmail.com",
  mobile: "Mob: 9939269234, 6207178839",
  customer: "TO, TVS SUPPLY CHAIN SOLUTIONS LTD RANCHI JHARKHAND",
  gstin: "GSTIN: 20AACCT1412E1Z9",
  note: "NOTE: THE Hiring Of vehicles by A GOODS TRANSPORT AGENCY (GTA) IS EXEMPT UNDER GST as per entry no. 22 of Notification NO. 12/2017- CENTRAL TAX (RATE) DATED JUNE 28,2017."
};

const els = {
  form: document.querySelector("#invoiceForm"),
  slNo: document.querySelector("#slNo"),
  invoiceDate: document.querySelector("#invoiceDate"),
  description: document.querySelector("#description"),
  monthFrom: document.querySelector("#monthFrom"),
  monthTo: document.querySelector("#monthTo"),
  amount: document.querySelector("#amount"),
  amountWords: document.querySelector("#amountWords"),
  rows: document.querySelector("#invoiceRows"),
  count: document.querySelector("#invoiceCount"),
  status: document.querySelector("#statusBadge"),
  searchSlNo: document.querySelector("#searchSlNo"),
  searchBtn: document.querySelector("#searchBtn"),
  newBtn: document.querySelector("#newInvoiceBtn"),
  updateBtn: document.querySelector("#updateBtn"),
  historyBtn: document.querySelector("#historyBtn"),
  closeHistoryBtn: document.querySelector("#closeHistoryBtn"),
  historyDialog: document.querySelector("#historyDialog"),
  viewBtn: document.querySelector("#viewInvoiceBtn"),
  pdfBtn: document.querySelector("#downloadPdfBtn"),
  dialogPdfBtn: document.querySelector("#dialogPdfBtn"),
  closeInvoiceBtn: document.querySelector("#closeInvoiceBtn"),
  dialog: document.querySelector("#invoiceDialog"),
  exportBtn: document.querySelector("#exportBtn"),
  importFile: document.querySelector("#importFile"),
  preview: document.querySelector("#invoicePreview"),
  template: document.querySelector("#invoiceTemplate")
};

let db;
let invoices = [];
let editingSlNo = null;
let trialExpired = false;
let trialDaysLeft = TRIAL_DAYS;
let pdfLogoHexCache = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  db = await openDb();
  bindEvents();
  setToday();
  await refreshInvoices();
  await prepareNewInvoice();
  renderPreview(currentFormInvoice());
  checkTrial();
  registerServiceWorker();
  updateOnlineStatus();
  setupUpdateUi();
  window.setTimeout(() => checkForAppUpdate(false), 1800);
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: "slNo" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(storeMode = "readonly") {
  return db.transaction(STORE, storeMode).objectStore(STORE);
}

function getAllInvoices() {
  return new Promise((resolve, reject) => {
    const request = tx().getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => a.slNo - b.slNo));
    request.onerror = () => reject(request.error);
  });
}

function putInvoice(invoice) {
  return new Promise((resolve, reject) => {
    const request = tx("readwrite").put(invoice);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function getInvoice(slNo) {
  return new Promise((resolve, reject) => {
    const request = tx().get(Number(slNo));
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function deleteInvoiceRecord(slNo) {
  return new Promise((resolve, reject) => {
    const request = tx("readwrite").delete(Number(slNo));
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function clearInvoices() {
  return new Promise((resolve, reject) => {
    const request = tx("readwrite").clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function bindEvents() {
  els.form.addEventListener("submit", saveCurrentInvoice);
  els.amount.addEventListener("input", syncWordsAndPreview);
  ["invoiceDate", "description", "monthFrom", "monthTo"].forEach((id) => {
    document.querySelector(`#${id}`).addEventListener("input", () => renderPreview(currentFormInvoice()));
  });
  els.newBtn.addEventListener("click", prepareNewInvoice);
  els.updateBtn.addEventListener("click", () => checkForAppUpdate(true));
  els.historyBtn.addEventListener("click", openHistoryView);
  els.closeHistoryBtn.addEventListener("click", () => els.historyDialog.close());
  els.historyDialog.addEventListener("click", (event) => {
    if (event.target === els.historyDialog) els.historyDialog.close();
  });
  els.searchBtn.addEventListener("click", searchInvoice);
  els.searchSlNo.addEventListener("keydown", (event) => {
    if (event.key === "Enter") searchInvoice();
  });
  els.viewBtn.addEventListener("click", openInvoiceView);
  els.dialogPdfBtn.addEventListener("click", () => downloadInvoicePdf(currentFormInvoice()));
  els.closeInvoiceBtn.addEventListener("click", () => els.dialog.close());
  els.dialog.addEventListener("click", (event) => {
    if (event.target === els.dialog) els.dialog.close();
  });
  els.pdfBtn.addEventListener("click", () => downloadInvoicePdf(currentFormInvoice()));
  els.exportBtn.addEventListener("click", exportBackup);
  els.importFile.addEventListener("change", importBackup);
  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);
}

function setupUpdateUi() {
  window.showUpdateButton = () => {
    els.updateBtn.hidden = false;
  };
  window.hideUpdateButton = () => {
    els.updateBtn.hidden = true;
  };
  if (window.AndroidUpdater) {
    els.updateBtn.hidden = true;
  }
}

function setToday() {
  const today = new Date().toISOString().slice(0, 10);
  els.invoiceDate.value = today;
}

async function refreshInvoices() {
  invoices = await getAllInvoices();
  renderRows();
}

async function prepareNewInvoice() {
  editingSlNo = null;
  setToday();
  els.monthFrom.value = "";
  els.monthTo.value = "";
  els.amount.value = "";
  els.slNo.value = nextSlNo();
  els.description.value = "Vehicle hire charges";
  syncWordsAndPreview();
}

function nextSlNo() {
  const max = invoices.reduce((highest, invoice) => Math.max(highest, invoice.slNo), 0);
  return max + 1;
}

async function saveCurrentInvoice(event) {
  event.preventDefault();
  if (blockWhenTrialExpired()) return;
  const invoice = currentFormInvoice();
  if (!validateInvoice(invoice)) return;
  await putInvoice(invoice);
  editingSlNo = invoice.slNo;
  await refreshInvoices();
  await prepareNewInvoice();
  flash(`Saved invoice ${invoice.slNo}`);
}

function currentFormInvoice() {
  const amount = Number(els.amount.value || 0);
  return {
    slNo: Number(els.slNo.value || nextSlNo()),
    invoiceDate: els.invoiceDate.value,
    description: els.description.value,
    monthFrom: els.monthFrom.value,
    monthTo: els.monthTo.value,
    amount,
    amountWords: amountToIndianWords(amount),
    updatedAt: new Date().toISOString()
  };
}

function validateInvoice(invoice) {
  if (!invoice.invoiceDate) {
    flash("Invoice Date required");
    els.invoiceDate.focus();
    return false;
  }
  if (!invoice.monthFrom) {
    flash("Month From required");
    els.monthFrom.focus();
    return false;
  }
  if (!invoice.monthTo) {
    flash("Month To required");
    els.monthTo.focus();
    return false;
  }
  if (!invoice.amount || invoice.amount <= 0) {
    flash("Amount required");
    els.amount.focus();
    return false;
  }
  return true;
}

async function searchInvoice() {
  if (blockWhenTrialExpired()) return;
  const slNo = Number(els.searchSlNo.value);
  if (!slNo) {
    flash("Enter an Invoice No. to search");
    return;
  }
  const invoice = await getInvoice(slNo);
  if (!invoice) {
    flash(`No invoice found for Invoice No. ${slNo}`);
    return;
  }
  loadInvoice(invoice);
  flash(`Loaded invoice ${slNo}`);
}

function loadInvoice(invoice) {
  editingSlNo = invoice.slNo;
  els.slNo.value = invoice.slNo;
  els.invoiceDate.value = invoice.invoiceDate;
  els.description.value = invoice.description;
  els.monthFrom.value = invoice.monthFrom;
  els.monthTo.value = invoice.monthTo;
  els.amount.value = invoice.amount;
  syncWordsAndPreview();
}

function renderRows() {
  els.count.textContent = `${invoices.length} bill${invoices.length === 1 ? "" : "s"}`;
  if (!invoices.length) {
    els.rows.innerHTML = `<tr><td colspan="5">No local invoices saved yet.</td></tr>`;
    return;
  }
  els.rows.innerHTML = invoices
    .map((invoice) => {
      return `<tr>
        <td>${invoice.slNo}</td>
        <td>${formatDateShort(invoice.invoiceDate)}</td>
        <td>${escapeHtml(invoice.description)}</td>
        <td>${formatAmount(invoice.amount)}</td>
        <td>
          <div class="row-actions">
            <button class="row-action" type="button" data-action="edit" data-sl="${invoice.slNo}">Edit</button>
            <button class="row-action" type="button" data-action="view" data-sl="${invoice.slNo}">View</button>
            <button class="row-action danger" type="button" data-action="delete" data-sl="${invoice.slNo}">Delete</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");
  els.rows.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const invoice = await getInvoice(button.dataset.sl);
      if (!invoice) return;
      if (button.dataset.action === "delete") {
        await deleteInvoiceWithPassword(invoice.slNo);
        return;
      }
      loadInvoice(invoice);
      if (button.dataset.action === "view") openInvoiceView();
    });
  });
}

async function deleteInvoiceWithPassword(slNo) {
  const confirmed = window.confirm(`Delete invoice ${slNo}? This cannot be undone.`);
  if (!confirmed) return;
  const password = window.prompt("Enter delete password");
  if (password !== DELETE_PASSWORD) {
    flash("Wrong password. Invoice not deleted.");
    return;
  }
  await deleteInvoiceRecord(slNo);
  await refreshInvoices();
  if (Number(els.slNo.value) === Number(slNo)) {
    await prepareNewInvoice();
  }
  flash(`Deleted invoice ${slNo}`);
}

function syncWordsAndPreview() {
  els.amountWords.textContent = amountToIndianWords(Number(els.amount.value || 0));
  renderPreview(currentFormInvoice());
}

function renderPreview(invoice) {
  const node = els.template.content.cloneNode(true);
  const fields = {
    slNo: invoice.slNo || "",
    displaySl: "01",
    invoiceDate: formatDateShort(invoice.invoiceDate),
    description: invoice.description || "",
    monthBill: formatMonthBill(invoice.monthFrom, invoice.monthTo),
    amount: formatInvoiceAmount(invoice.amount || 0),
    amountWords: amountToIndianWords(invoice.amount || 0)
  };
  Object.entries(fields).forEach(([key, value]) => {
    node.querySelectorAll(`[data-field="${key}"]`).forEach((el) => {
      el.textContent = value;
    });
  });
  els.preview.replaceChildren(node);
}

function openInvoiceView() {
  if (blockWhenTrialExpired()) return;
  renderPreview(currentFormInvoice());
  if (typeof els.dialog.showModal === "function") {
    els.dialog.showModal();
  } else {
    els.dialog.setAttribute("open", "");
  }
}

function openHistoryView() {
  if (blockWhenTrialExpired()) return;
  if (typeof els.historyDialog.showModal === "function") {
    els.historyDialog.showModal();
  } else {
    els.historyDialog.setAttribute("open", "");
  }
}

function exportBackup() {
  if (blockWhenTrialExpired()) return;
  const payload = {
    app: "Sri Radhe Krishna Roadlines Offline Invoice",
    exportedAt: new Date().toISOString(),
    invoices
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  downloadBlob(blob, `srkr-invoices-backup-${dateStamp()}.json`);
  flash("Backup JSON exported");
}

async function importBackup(event) {
  if (blockWhenTrialExpired()) return;
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const imported = Array.isArray(json) ? json : json.invoices;
    if (!Array.isArray(imported)) throw new Error("Invalid backup file");
    await clearInvoices();
    for (const invoice of imported) {
      const clean = normalizeInvoice(invoice);
      if (clean) await putInvoice(clean);
    }
    await refreshInvoices();
    await prepareNewInvoice();
    flash(`Imported ${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`);
  } catch (error) {
    flash("Import failed: invalid JSON backup");
  } finally {
    event.target.value = "";
  }
}

function normalizeInvoice(invoice) {
  const slNo = Number(invoice.slNo);
  const amount = Number(invoice.amount);
  if (!slNo || Number.isNaN(amount)) return null;
  return {
    slNo,
    invoiceDate: invoice.invoiceDate || "",
    description: invoice.description || "Vehicle hire charges",
    monthFrom: invoice.monthFrom || "",
    monthTo: invoice.monthTo || "",
    amount,
    amountWords: amountToIndianWords(amount),
    updatedAt: invoice.updatedAt || new Date().toISOString()
  };
}

function amountToIndianWords(value) {
  const amount = Math.round(Number(value || 0));
  if (amount === 0) return "ZERO RUPEES ONLY";

  const ones = [
    "",
    "ONE",
    "TWO",
    "THREE",
    "FOUR",
    "FIVE",
    "SIX",
    "SEVEN",
    "EIGHT",
    "NINE",
    "TEN",
    "ELEVEN",
    "TWELVE",
    "THIRTEEN",
    "FOURTEEN",
    "FIFTEEN",
    "SIXTEEN",
    "SEVENTEEN",
    "EIGHTEEN",
    "NINETEEN"
  ];
  const tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];
  const twoDigits = (num) => {
    if (!num) return "";
    if (num < 20) return ones[num];
    return [tens[Math.floor(num / 10)], ones[num % 10]].filter(Boolean).join(" ");
  };
  const threeDigits = (num) => {
    const hundred = Math.floor(num / 100);
    const rest = num % 100;
    return [hundred ? `${ones[hundred]} HUNDRED` : "", twoDigits(rest)].filter(Boolean).join(" ");
  };
  const parts = [];
  let num = amount;
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  if (crore) parts.push(`${twoDigits(crore)} CRORE`);
  if (lakh) parts.push(`${twoDigits(lakh)} LAKH`);
  if (thousand) parts.push(`${twoDigits(thousand)} THOUSAND`);
  if (num) parts.push(threeDigits(num));
  return `${parts.join(" ")} RUPEES ONLY`;
}

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function formatInvoiceAmount(value) {
  return Number(value || 0).toFixed(2);
}

function formatDateShort(value) {
  if (!value) return "";
  const date = localDate(value);
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

function formatDateLong(value) {
  if (!value) return "";
  const date = localDate(value);
  const day = date.getDate();
  const month = date.toLocaleString("en-IN", { month: "long" });
  return `${day}${ordinal(day)} ${month} ${date.getFullYear()}`;
}

function formatMonthBill(from, to) {
  if (!from && !to) return "";
  if (from && to) return `${formatDateLong(from)}\nTo ${formatDateLong(to)}`;
  return formatDateLong(from || to);
}

function ordinal(day) {
  if (day > 10 && day < 14) return "th";
  return { 1: "st", 2: "nd", 3: "rd" }[day % 10] || "th";
}

function localDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function flash(message) {
  els.status.textContent = message;
  window.clearTimeout(flash.timer);
  flash.timer = window.setTimeout(updateOnlineStatus, 2800);
}

function updateOnlineStatus() {
  if (trialExpired) {
    els.status.textContent = "Trial expired. Data is safe.";
    return;
  }
  els.status.textContent = `Trial: ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
  });
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function downloadBlob(blob, filename) {
  if (window.AndroidFile && typeof window.AndroidFile.saveFile === "function") {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).split(",")[1] || "";
      window.AndroidFile.saveFile(filename, blob.type || "application/octet-stream", base64);
      flash(`Saved ${filename}`);
    };
    reader.onerror = () => flash("Download failed");
    reader.readAsDataURL(blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      flash("Service worker registration failed");
    });
  }
}

async function downloadInvoicePdf(invoice) {
  if (blockWhenTrialExpired()) return;
  if (!validateInvoice(invoice)) return;
  const clean = {
    ...invoice,
    amountWords: amountToIndianWords(invoice.amount || 0)
  };
  const blob = buildInvoicePdf(clean, await getPdfLogoHex());
  downloadBlob(blob, invoicePdfFilename(clean));
}

async function getPdfLogoHex() {
  if (pdfLogoHexCache !== null) return pdfLogoHexCache;
  try {
    const response = await fetch("assets/logo-pdf.jpg");
    const bytes = new Uint8Array(await response.arrayBuffer());
    pdfLogoHexCache = Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
      .join("");
  } catch (error) {
    pdfLogoHexCache = "";
  }
  return pdfLogoHexCache;
}

function invoicePdfFilename(invoice) {
  const invoiceDate = formatDateShort(invoice.invoiceDate).replace(/\./g, "-") || "date";
  return `invoice_${invoice.slNo || "draft"}_${invoiceDate}.pdf`;
}

function checkTrial() {
  const now = Date.now();
  let startedAt = Number(localStorage.getItem(TRIAL_KEY));
  if (!startedAt) {
    startedAt = now;
    localStorage.setItem(TRIAL_KEY, String(startedAt));
  }
  const elapsedDays = Math.floor((now - startedAt) / 86400000);
  const daysLeft = Math.max(0, TRIAL_DAYS - elapsedDays);
  trialDaysLeft = daysLeft;
  trialExpired = now - startedAt >= TRIAL_DAYS * 86400000;
  if (trialExpired) {
    flash("Trial expired. Data is safe.");
    setTrialDisabled(true);
  } else {
    els.status.textContent = `Trial: ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
  }
}

function blockWhenTrialExpired() {
  if (!trialExpired) return false;
  flash("Trial expired. Contact owner to unlock.");
  return true;
}

function setTrialDisabled(disabled) {
  [
    els.form.querySelector(".primary"),
    els.viewBtn,
    els.pdfBtn,
    els.historyBtn
  ].forEach((button) => {
    if (button) button.disabled = disabled;
  });
}

function checkForAppUpdate(userRequested) {
  if (window.AndroidUpdater && typeof window.AndroidUpdater.checkUpdate === "function") {
    window.AndroidUpdater.checkUpdate(Boolean(userRequested));
    return;
  }
  if (userRequested) {
    window.open("https://github.com/MrRoBoTRaJa/srkr-invoice-app/releases/latest", "_blank");
  }
}

function buildInvoicePdf(invoice, logoHex = "") {
  const content = [];
  const width = 595.28;
  const height = 841.89;
  const black = "0 0 0 rg 0 0 0 RG";

  const text = (value, x, y, size = 10, options = {}) => {
    const font = options.bold ? "F2" : "F1";
    const escaped = pdfEscape(value);
    const align = options.align || "left";
    let tx = x;
    if (align !== "left") {
      const estimated = String(value).length * size * 0.48;
      tx = align === "center" ? x - estimated / 2 : x - estimated;
    }
    content.push(`BT /${font} ${size} Tf ${tx.toFixed(2)} ${y.toFixed(2)} Td (${escaped}) Tj ET`);
  };
  const line = (x1, y1, x2, y2, w = 1) => {
    content.push(`${w} w ${x1} ${y1} m ${x2} ${y2} l S`);
  };
  const rect = (x, y, w, h) => {
    content.push(`${x} ${y} ${w} ${h} re S`);
  };
  const wrap = (value, maxChars) => {
    const words = String(value).split(/\s+/);
    const lines = [];
    let current = "";
    words.forEach((word) => {
      const test = current ? `${current} ${word}` : word;
      if (test.length > maxChars) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    });
    if (current) lines.push(current);
    return lines;
  };

  content.push(black);
  text("Mob: 9939269234,", 548, 804, 10, { bold: true, align: "right" });
  text("6207178839", 548, 790, 10, { bold: true, align: "right" });
  if (logoHex) {
    content.push("q 52 0 0 39.69 271.64 769 cm /Im1 Do Q");
  }
  text(COMPANY.name, width / 2, 752, 18, { bold: true, align: "center" });
  text(COMPANY.address, width / 2, 734, 9, { align: "center" });
  text(COMPANY.email, width / 2, 720, 9, { align: "center" });
  text("INVOICE BILL", width / 2, 674, 13, { bold: true, align: "center" });
  line(255, 670, 340, 670);

  const tableX = 70;
  const tableTop = 638;
  const col = [58, 188, 128, 132];
  const rowH = [80, 40, 104, 22, 22];
  const tableW = col.reduce((sum, value) => sum + value, 0);
  const tableH = rowH.reduce((sum, value) => sum + value, 0);
  rect(tableX, tableTop - tableH, tableW, tableH);
  const boundary1 = tableX + col[0];
  const boundary2 = tableX + col[0] + col[1];
  const boundary3 = tableX + col[0] + col[1] + col[2];
  line(boundary2, tableTop, boundary2, tableTop - rowH[0]);
  [boundary1, boundary2, boundary3].forEach((x) => {
    line(x, tableTop - rowH[0], x, tableTop - tableH);
  });
  let cy = tableTop;
  rowH.slice(0, -1).forEach((h) => {
    cy -= h;
    line(tableX, cy, tableX + tableW, cy);
  });

  text("TO, TVS SUPPLY CHAIN", tableX + 123, tableTop - 18, 11, { bold: true, align: "center" });
  text("SOLUTIONS LTD RANCHI", tableX + 123, tableTop - 34, 11, { bold: true, align: "center" });
  text("JHARKHAND", tableX + 123, tableTop - 50, 11, { bold: true, align: "center" });
  text("GSTIN:  20AACCT1412E1Z9", tableX + 123, tableTop - 68, 11, { bold: true, align: "center" });
  text(`INVOICE NO.:${invoice.slNo || ""}`, tableX + 374, tableTop - 34, 12, { bold: true, align: "center" });
  text(`INVOICE DATE ${formatDateShort(invoice.invoiceDate)}`, tableX + 374, tableTop - 52, 12, { bold: true, align: "center" });

  const headerY = tableTop - rowH[0] - 24;
  text("SERIAL", tableX + 29, headerY + 7, 8, { align: "center" });
  text("NO.", tableX + 29, headerY - 7, 8, { align: "center" });
  text("DESCRIPTION", tableX + col[0] + 94, headerY, 10, { align: "center" });
  text("MONTH OF", tableX + col[0] + col[1] + 64, headerY + 8, 10, { align: "center" });
  text("BILL", tableX + col[0] + col[1] + 64, headerY - 7, 10, { align: "center" });
  text("AMOUNT", tableX + tableW - 66, headerY, 10, { align: "center" });

  const dataTop = tableTop - rowH[0] - rowH[1];
  text("01", tableX + 29, dataTop - 58, 11, { align: "center" });
  text(invoice.description || "", tableX + col[0] + 12, dataTop - 58, 11);
  wrap(formatMonthBill(invoice.monthFrom, invoice.monthTo), 15).slice(0, 5).forEach((lineText, index) => {
    text(lineText, tableX + col[0] + col[1] + 64, dataTop - 24 - index * 15, 11, { align: "center" });
  });
  text(formatInvoiceAmount(invoice.amount), tableX + tableW - 66, dataTop - 58, 11, { align: "center" });
  text("Net Amount", tableX + 123, tableTop - tableH + 7, 10, { align: "center" });
  text(formatInvoiceAmount(invoice.amount), tableX + col[0] + col[1] + 64, tableTop - tableH + 7, 10, { align: "center" });

  text(`AMOUNT IN WORDS: ${invoice.amountWords}.`, 48, 372, 10, { bold: true });
  wrap(COMPANY.note, 105).forEach((lineText, index) => {
    text(lineText, 48, 346 - index * 13, 9);
  });

  text(COMPANY.name, 358, 170, 10, { bold: true });
  text("AUTHORIZED SIGNATORY", 378, 106, 10, { bold: true });

  const stream = content.join("\n");
  return makePdf(stream, width, height, logoHex);
}

function makePdf(contentStream, width, height, logoHex = "") {
  const resources = logoHex
    ? "/Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Im1 7 0 R >> >>"
    : "/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >>";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ${resources} /Contents 6 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`
  ];
  if (logoHex) {
    objects.push(`<< /Type /XObject /Subtype /Image /Width 131 /Height 100 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${logoHex.length + 1} >>\nstream\n${logoHex}>\nendstream`);
  }
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

function pdfEscape(value) {
  return String(value)
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}
