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
const KOT_PRINTER_INTERFACE = 'tcp://192.168.1.87';
const BILL_PRINTER_INTERFACE = '\\\\localhost\\OFFICE-MAIN';

const s = (val) => (val === null || val === undefined) ? "" : String(val);
const DOUBLE_LINE = "================================================";
const RESTAURANT_INFO = {
    name: "HOTEL UMIYA KATHIYAWADI",
    address: "Vasad Road, Borsad", 
    gstin: "24BLGPK9761G1ZV", // Enter actual GSTIN or leave empty
};

// Helper to decode Kathiyawadi Qty logic (e.g. 1.6 = 1 Full, 1 Half)
const decodeQty = (rawQty) => {
    const q = Math.round(Number(rawQty) * 10) / 10;
    const fulls = Math.floor(q + 0.01);
    const rem = Math.round((q - fulls) * 10) / 10;
    
    let halves = 0;
    if (rem === 0.6) halves = 1;
    if (rem === 0.2) halves = 2; 
    if (rem === 0.8) halves = 3; 
    return { fulls, halves };
};

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
   3. IMAGE GENERATORS (OPTIMIZED FOR SPACE)
   ============================ */

async function createBrandingHeader(text) {
  const canvas = createCanvas(550, 55);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, 550, 50);
  ctx.fillStyle = "black";
  ctx.font = 'bold 40px "Arial"'; 
  ctx.textAlign = "center";
  ctx.textBaseline = "middle"; 
  ctx.fillText(text.toUpperCase(), 275, 25);
  return canvas.toBuffer("image/png");
}

async function createKOTHeader(tableNo, typeText) {
  const canvas = createCanvas(550, 45);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, 550, 45);
  ctx.fillStyle = "black";
  ctx.textBaseline = "middle";
  ctx.font = 'bold 45px "Arial"';
  ctx.textAlign = "left";
  ctx.fillText(`TBL: ${tableNo}`, 0, 24);
  ctx.font = 'bold 30px "Arial"';
  ctx.textAlign = "right";
  ctx.fillText(typeText, 550, 24);
  return canvas.toBuffer("image/png");
}

async function createGrandTotalImage(totalValue) {
  const canvas = createCanvas(550, 45);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, 550, 45);
  ctx.fillStyle = "black";
  ctx.font = 'bold 40px "Arial"'; 
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(`Grand Total:  ${totalValue}`, 550, 24);
  return canvas.toBuffer("image/png");
}

async function createOptimizedLine(name, qty, rate = null, amt = null, isBill = false, isHeader = false) {
  const fontSize = isHeader ? 24 : (isBill ? 26 : 32); 
  const height = fontSize + 6;
  const width = 550;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "black";
  ctx.textBaseline = "middle";
  const mid = height / 2;

  if (!isBill) {
    ctx.font = isHeader ? `bold ${fontSize}px "Arial"` : `bold ${fontSize}px "Gujarati"`;
    ctx.textAlign = "left";
    ctx.fillText(name, 0, mid);
    ctx.font = `bold ${fontSize}px "Arial"`;
    ctx.textAlign = "right";
    ctx.fillText(qty.toString(), width, mid);
  } else {
    ctx.font = (isHeader || !isNaN(name)) ? `bold ${fontSize}px "Arial"` : `bold ${fontSize}px "Gujarati"`;
    ctx.textAlign = "left";
    ctx.fillText(name, 0, mid);
    ctx.font = `bold ${fontSize}px "Arial"`;
    ctx.textAlign = "center";
    ctx.fillText(qty.toString(), width * 0.55, mid);
    ctx.textAlign = "right";
    ctx.fillText(rate ? rate.toString() : "", width * 0.82, mid);
    ctx.fillText(amt ? amt.toString() : "", width, mid);
  }
  return canvas.toBuffer("image/png");
}

async function createNoteImage(noteText) {
  const fontSize = 24; 
  const canvas = createCanvas(550, fontSize + 4);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, 550, canvas.height);
  ctx.fillStyle = "black";
  ctx.font = `bold italic ${fontSize}px "Gujarati"`;
  ctx.textBaseline = "middle";
  ctx.fillText(`-- ${noteText}`, 25, canvas.height / 2);
  return canvas.toBuffer("image/png");
}

/* ============================
   4. KOT ROUTE
   ============================ */
router.post('/kot', async (req, res) => {
  try {
    const { table, table_no, waiter_name, steward, items, is_running } = req.body;
    const printer = new ThermalPrinter(KOT_PRINTER_CONFIG);
    
    const tNo = s(table?.table_no || table_no || "---");
    const stwd = s(waiter_name || steward || "Admin");
    
    const typeLabel = (is_running === true || is_running === "true" || is_running === 1) ? "KOT-RUNNING" : "KOT";

    const kotHead = await createKOTHeader(tNo, typeLabel);
    await printer.printImageBuffer(kotHead);
    
    printer.alignLeft();
    printer.println(`WAITER: ${stwd.toUpperCase()}`);
    printer.leftRight(`Date: ${new Date().toLocaleDateString('en-GB')}`, `Time: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    printer.println(DOUBLE_LINE);

    const colImg = await createOptimizedLine("ITEM", "QTY", null, null, false, true);
    await printer.printImageBuffer(colImg);
    printer.println(DOUBLE_LINE);

    let totalRowsCount = 0;

    for (const item of items) {
      const { fulls, halves } = decodeQty(item.quantity);
      
      if (fulls > 0) {
        totalRowsCount++;
        const itemImg = await createOptimizedLine(s(item.name), fulls, null, null, false);
        await printer.printImageBuffer(itemImg);
      }
      
      if (halves > 0) {
        totalRowsCount++;
        const halfImg = await createOptimizedLine(`${s(item.name)} (અડધુ)`, halves, null, null, false);
        await printer.printImageBuffer(halfImg);
      }

      const note = item.special_instruction || item.note;
      if (note && note.trim() !== "") {
        const noteImg = await createNoteImage(s(note));
        await printer.printImageBuffer(noteImg);
      }
    }

    printer.println(DOUBLE_LINE);
    printer.alignCenter();
    printer.bold(true);
    printer.print(`Total Items: ${totalRowsCount}`); 
    
    printer.cut(); 
    await printer.execute();
    res.json({ success: true });
  } catch (error) {
    console.error("KOT Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ============================
   5. BILL ROUTE (FIXED AGGREGATION)
   ============================ */
router.post('/bill', async (req, res) => {
  try {
    const {table, items, customer, bill_no, total_amount } = req.body;
    const printer = new ThermalPrinter(BILL_PRINTER_CONFIG);
    const restaurant_info = RESTAURANT_INFO;
    printer.alignCenter();
    printer.println("Retails Invoice");
    const brandImg = await createBrandingHeader(restaurant_info.name);
    await printer.printImageBuffer(brandImg);
    printer.println(s(restaurant_info.address));
    printer.println(`GSTIN: ${s(restaurant_info.gstin)}`);
    printer.println(DOUBLE_LINE);

    printer.alignLeft();
    if (customer && customer.trim() !== "" && customer.toUpperCase() !== "GUEST") {
      printer.bold(true);
      printer.println(`M/S: ${customer.toUpperCase()}`);
      printer.bold(false);
    }
    
    printer.leftRight(`Bill No: ${bill_no}`, `Date: ${new Date().toLocaleDateString('en-GB')}`);
    printer.leftRight(`Table: ${table?.table_no || "---"}`, `Time: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    printer.println(DOUBLE_LINE);

    const headImg = await createOptimizedLine("ITEM", "QTY", "RATE", "AMT", true, true);
    await printer.printImageBuffer(headImg);
    printer.println(DOUBLE_LINE);

    // --- AGGREGATION LOGIC STARTS HERE ---
    // We group items by name to merge different instructions into single quantity
    const billSummary = {};

    for (const item of items) {
      const name = s(item.name);
      // Ensure we get a valid number, preferring the current price if available
      const price = Number(item.price || item.price_at_time || 0);
      const { fulls, halves } = decodeQty(item.quantity);

      if (!billSummary[name]) {
        billSummary[name] = { 
          fulls: 0, 
          halves: 0, 
          price: price 
        };
      }
      
      billSummary[name].fulls += fulls;
      billSummary[name].halves += halves;
    }
    // --- AGGREGATION LOGIC ENDS ---

    // Now iterate the Aggregated Summary to print
    for (const [name, data] of Object.entries(billSummary)) {
      const baseRate = data.price;

      // 1. Print Fulls merged
      if (data.fulls > 0) {
        const amt = data.fulls * baseRate;
        const line = await createOptimizedLine(name, data.fulls, baseRate.toFixed(0), amt.toFixed(0), true);
        await printer.printImageBuffer(line);
      }
      
      // 2. Print Halves merged (Separate line)
      if (data.halves > 0) {
        const halfRate = Math.ceil(baseRate * 0.6);
        const amt = data.halves * halfRate;
        const line = await createOptimizedLine(`${name} (Half)`, data.halves, halfRate.toFixed(0), amt.toFixed(0), true);
        await printer.printImageBuffer(line);
      }
    }

    printer.println(DOUBLE_LINE);
    
    const totalImg = await createGrandTotalImage(parseFloat(total_amount).toFixed(2));
    await printer.printImageBuffer(totalImg);

    printer.println(DOUBLE_LINE);
    printer.alignCenter();
    printer.println("THE ABOVE ITEMS ARE INCLUSIVE OF GST.");
    printer.println("");
    printer.println(`For, ${s(restaurant_info.name)}`);
    printer.print("THANKS, VISIT AGAIN!"); 
    
    printer.partialCut();
    await printer.execute();
    res.json({ success: true });
  } catch (error) {
    console.error("BILL Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;