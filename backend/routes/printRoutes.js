const express = require('express');
const router = express.Router();
const { ThermalPrinter, PrinterTypes, CharacterSet } = require("node-thermal-printer");
const { createCanvas, registerFont } = require("canvas");
const path = require("path");
const fs = require("fs");

/* ============================
   1. REGISTER GUJARATI FONT
   ============================ */
const FONT_PATH = path.resolve(__dirname, "../fonts/Gujarati.ttf");
if (fs.existsSync(FONT_PATH)) {
  registerFont(FONT_PATH, { family: "Gujarati" });
}

/* ============================
   2. PRINTER CONFIGS
   ============================ */
// Local/shared printer for KOT
const KOT_PRINTER_INTERFACE = 'tcp://192.168.1.87';
// Wi-Fi Rugtek printer for Bill (replace with your Rugtek IP)
const BILL_PRINTER_INTERFACE = '\\\\localhost\\OFFICE-MAIN';
const s = (val) => (val === null || val === undefined) ? "" : String(val);

const KOT_PRINTER_CONFIG = {
  type: PrinterTypes.EPSON,
  interface: KOT_PRINTER_INTERFACE,
  characterSet: CharacterSet.WPC1252,
  removeSpecialCharacters: false,
};

const BILL_PRINTER_CONFIG = {
  type: PrinterTypes.EPSON,
  interface: BILL_PRINTER_INTERFACE,
  characterSet: CharacterSet.WPC1252,
  removeSpecialCharacters: false,
};

/* ============================
   3. IMAGE GENERATORS
   ============================ */
async function createOptimizedLine(name, qty, rate = null, amt = null, isBill = false) {
  const fontSize = isBill ? 22 : 28;
  const width = 550;
  const canvas = createCanvas(width, fontSize + 6);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "black";
  ctx.textBaseline = "middle";
  const mid = canvas.height / 2;

  if (!isBill) {
    // BOLD Gujarati for KOT Item Name
    ctx.font = `bold ${fontSize}px "Gujarati"`;
    ctx.textAlign = "left";
    ctx.fillText(name, 0, mid);
    // BOLD Arial for KOT Quantity
    ctx.font = `bold ${fontSize}px "Arial"`;
    ctx.textAlign = "right";
    ctx.fillText(qty.toString(), width, mid);
  } else {
    // BOLD Gujarati for Bill Item Name
    ctx.font = `bold ${fontSize}px "Gujarati"`;
    ctx.textAlign = "left";
    ctx.fillText(name, 0, mid);
    // BOLD Arial for Bill Columns
    ctx.font = `bold ${fontSize}px "Arial"`;
    ctx.textAlign = "center";
    ctx.fillText(qty.toString(), width * 0.52, mid);
    ctx.textAlign = "right";
    ctx.fillText(rate.toString(), width * 0.80, mid);
    ctx.fillText(amt.toString(), width, mid);
  }
  return canvas.toBuffer("image/png");
}

async function createNoteImage(noteText) {
  const fontSize = 20;
  const width = 550;
  const canvas = createCanvas(width, fontSize + 4);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "black";
  // BOLD ITALIC for Special Instructions
  ctx.font = `bold italic ${fontSize}px "Gujarati"`;
  ctx.textBaseline = "middle";
  ctx.fillText(`-- ${noteText}`, 20, canvas.height / 2);
  return canvas.toBuffer("image/png");
}

/* ============================
   4. KOT ROUTE
   ============================ */
router.post('/kot', async (req, res) => {
  try {
    const { table_no, waiter_name, items, is_running } = req.body;
    const printer = new ThermalPrinter(KOT_PRINTER_CONFIG);

    const date = new Date().toLocaleDateString('en-GB');
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    printer.alignLeft();
    printer.bold(true);
    printer.println(`STWD: ${s(waiter_name).toUpperCase()} | TBL: ${table_no}`);
    printer.bold(false);
    printer.leftRight(`Date: ${date}`, `Time: ${time}`);
    printer.drawLine();

    printer.alignCenter();
    printer.setTextDoubleHeight();
    printer.bold(true);
    printer.println(is_running ? "KOT - RUNNING" : "KOT");
    printer.setTextNormal();
    printer.bold(false);
    printer.drawLine();

    let totalQty = 0;
    if (items && Array.isArray(items)) {
      for (const item of items) {
        totalQty += Number(item.quantity);

        const itemImg = await createOptimizedLine(s(item.name), item.quantity, null, null, false);
        await printer.printImageBuffer(itemImg);

        if (item.note && item.note.trim() !== "") {
          const noteImg = await createNoteImage(s(item.note));
          await printer.printImageBuffer(noteImg);
        }
      }
    }

    printer.drawLine();
    printer.alignCenter();
    printer.bold(true);
    printer.println(`Total Items: ${totalQty}`);
    printer.bold(false);
    printer.cut();
    await printer.execute();
    res.json({ success: true });

  } catch (error) {
    console.error("KOT Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ============================
   5. BILL ROUTE
   ============================ */
router.post('/bill', async (req, res) => {
  try {
    const { restaurant_info, table, items, customer, bill_no, total_amount } = req.body;
    const printer = new ThermalPrinter(BILL_PRINTER_CONFIG);

    printer.alignCenter();
    printer.setTextDoubleHeight();
    printer.bold(true);
    printer.println(s(restaurant_info.name).toUpperCase());
    printer.setTextNormal();
    printer.bold(false);
    printer.println(s(restaurant_info.address));
    printer.println(`Mo: ${s(restaurant_info.contact)}`);
    printer.drawLine();

    printer.alignLeft();
    printer.bold(true);
    printer.println(`M/S: ${s(customer || "GUEST").toUpperCase()}`);
    printer.bold(false);
    printer.leftRight(`Bill No: ${bill_no}`, `Date: ${new Date().toLocaleDateString('en-GB')}`);
    printer.leftRight(`Table: ${table.table_no}`, `Time: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    printer.drawLine();

    if (items && Array.isArray(items)) {
      for (const item of items) {
        const qty = item.quantity || 0;
        const rate = item.price || 0;
        const amt = qty * rate;

        const itemImg = await createOptimizedLine(s(item.name), qty, rate.toFixed(0), amt.toFixed(0), true);
        await printer.printImageBuffer(itemImg);

        if (item.note && item.note.trim() !== "") {
          const noteImg = await createNoteImage(s(item.note));
          await printer.printImageBuffer(noteImg);
        }
      }
    }

    printer.drawLine();
    printer.alignRight();
    printer.setTextDoubleHeight();
    printer.bold(true);
    printer.println(`Grand Total:  ${parseFloat(total_amount).toFixed(2)}`);
    printer.setTextNormal();
    printer.bold(false);
    printer.drawLine();

    printer.alignCenter();
    // BOLD for footer
    const footerImg = await createOptimizedLine("પધારજો, ફરી પધારજો!", "", "", "", false);
    await printer.printImageBuffer(footerImg);

    printer.cut();
    await printer.execute();
    res.json({ success: true });

  } catch (error) {
    console.error("BILL Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;