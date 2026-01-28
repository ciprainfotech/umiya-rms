const express = require('express');
const router = express.Router();
const { ThermalPrinter, PrinterTypes, CharacterSet } = require("node-thermal-printer");
const { createCanvas, registerFont } = require("canvas");
const path = require("path");
const fs = require("fs");

/* ============================
   1. CONFIGURATION & FONT
   ============================ */
const FONT_PATH = path.resolve(__dirname, "../fonts/Gujarati.ttf");
if (fs.existsSync(FONT_PATH)) {
    registerFont(FONT_PATH, { family: "Gujarati" });
}

// PRINTER INTERFACES
const KOT_INTERFACE = 'tcp://192.168.1.87';           // KOT Network Printer
const BILL_INTERFACE = 'tcp://192.168.1.87';  // Bill USB Shared Printer

const s = (val) => (val === null || val === undefined) ? "" : String(val);

// QUANTITY DECODER (Kathiyawadi logic: .6=1H, .2=2H, .8=3H)
const decodeQuantity = (rawQty) => {
    const q = Math.round(Number(rawQty) * 10) / 10;
    const floor = Math.floor(q + 0.01);
    const rem = Math.round((q - floor) * 10) / 10;
    if (rem === 0.6) return { fulls: floor, halves: 1 };
    if (rem === 0.2) return { fulls: floor - 1, halves: 2 };
    if (rem === 0.8) return { fulls: floor - 1, halves: 3 };
    return { fulls: floor, halves: 0 };
};

/* ============================
   2. IMAGE GENERATORS (Canvas)
   ============================ */
async function createOptimizedLine(name, qty, rate = null, amt = null, isBill = false, isHeader = false, centered = false) {
    const fontSize = isHeader ? 22 : (isBill ? 26 : 32);
    const width = 550;
    const canvas = createCanvas(width, fontSize + 15);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "black";
    ctx.textBaseline = "middle";
    const mid = canvas.height / 2;

    if (centered) {
        ctx.font = `bold ${fontSize + 6}px "Gujarati"`;
        ctx.textAlign = "center";
        ctx.fillText(name, width / 2, mid);
    } else if (!isBill) {
        // KOT Format
        ctx.font = `bold ${fontSize}px "Gujarati"`;
        ctx.textAlign = "left";
        ctx.fillText(name, 0, mid);
        ctx.font = `bold ${fontSize}px "Arial"`;
        ctx.textAlign = "right";
        ctx.fillText(qty.toString(), width, mid);
    } else {
        // Bill Format
        ctx.font = isHeader ? `bold ${fontSize}px "Arial"` : `bold ${fontSize}px "Gujarati"`;
        ctx.textAlign = "left";
        ctx.fillText(name, 0, mid);
        ctx.font = `bold ${fontSize - 2}px "Arial"`;
        ctx.textAlign = "right";
        ctx.fillText(qty.toString(), width * 0.55, mid);
        ctx.fillText(rate ? rate.toString() : "", width * 0.80, mid);
        ctx.fillText(amt ? amt.toString() : "", width, mid);
    }
    return canvas.toBuffer("image/png");
}

async function createNoteImage(noteText) {
    const fontSize = 22;
    const width = 550;
    const canvas = createCanvas(width, fontSize + 10);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "black";
    ctx.font = `italic bold ${fontSize}px "Gujarati"`;
    ctx.textBaseline = "middle";
    ctx.fillText(`-- ${noteText}`, 40, canvas.height / 2);
    return canvas.toBuffer("image/png");
}

/* ============================
   3. KOT ROUTE (TCP/IP)
   =========================== */
router.post('/kot', async (req, res) => {
    try {
        const { table_no, waiter_name, items, is_running } = req.body;
        const printer = new ThermalPrinter({
            type: PrinterTypes.EPSON,
            interface: KOT_INTERFACE,
            characterSet: CharacterSet.WPC1252,
            removeSpecialCharacters: false,
        });

        // KOT Metadata (Removed M/S and Bill No)
        printer.alignLeft();
        printer.println(`STEWARD: ${s(waiter_name || "ADMIN").toUpperCase()}`);
        printer.leftRight(`Table : ${table_no}`, `Date : ${new Date().toLocaleDateString('en-GB')}`);
        printer.println(`Time : ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);

        printer.println("================================================");
        printer.alignCenter();
        printer.setTextDoubleHeight();
        printer.bold(true);
        printer.println(is_running ? "KOT - RUNNING" : "KOT");
        printer.bold(false);
        printer.setTextNormal();
        printer.println("================================================");

        const headerImg = await createOptimizedLine("ITEM", "QTY", null, null, false, true);
        await printer.printImageBuffer(headerImg);
        printer.drawLine();

        let lineCount = 0;
        if (items && Array.isArray(items)) {
            for (const item of items) {
                const { fulls, halves } = decodeQuantity(item.quantity);
                if (fulls > 0) {
                    const img = await createOptimizedLine(s(item.name), fulls, null, null, false);
                    await printer.printImageBuffer(img);
                    lineCount++;
                }
                if (halves > 0) {
                    const img = await createOptimizedLine(`${s(item.name)} (HALF)`, halves, null, null, false);
                    await printer.printImageBuffer(img);
                    lineCount++;
                }
                if (item.note && item.note.trim() !== "") {
                    const noteImg = await createNoteImage(s(item.note));
                    await printer.printImageBuffer(noteImg);
                }
            }
        }

        printer.drawLine();
        printer.alignCenter();
        printer.bold(true);
        printer.println(`Total Items: ${lineCount}`);
        printer.bold(false);

        printer.cut();
        await printer.execute();
        res.json({ success: true });
    } catch (error) {
        console.error("KOT Error:", error);
        res.status(500).json({ success: false });
    }
});

/* ============================
   4. BILL ROUTE (USB Shared)
   =========================== */
router.post('/bill', async (req, res) => {
    try {
        const { restaurant_info, table, items, customer, bill_no, total_amount } = req.body;
        const printer = new ThermalPrinter({
            type: PrinterTypes.EPSON,
            interface: BILL_INTERFACE,
            characterSet: CharacterSet.WPC1252,
            removeSpecialCharacters: false,
        });

        // Header
        printer.alignCenter();
        printer.println("Retails Invoice");
        printer.setTextDoubleHeight();
        printer.bold(true);
        printer.println(s(restaurant_info.name).toUpperCase());
        printer.setTextNormal();
        printer.bold(false);
        printer.println(s(restaurant_info.address).toUpperCase());
        printer.println(`Mo: ${s(restaurant_info.contact)}`);
        printer.println("================================================"); 

        // Metadata
        printer.alignLeft();
        // Print M/S ONLY if customer name exists and is not 'GUEST'
        if (customer && customer.trim() !== "" && customer.toUpperCase() !== "GUEST") {
            printer.println(`M/S:     ${s(customer).toUpperCase()}`);
        }
        
        printer.leftRight(`Bill No : ${bill_no}`, `Date : ${new Date().toLocaleDateString('en-GB')}`);
        printer.leftRight(`Table : ${table.table_no}`, `Time : ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
        printer.println("================================================"); 

        const headerImg = await createOptimizedLine("ITEM", "QTY", "RATE", "AMT", true, true);
        await printer.printImageBuffer(headerImg);
        printer.drawLine();

        if (items && Array.isArray(items)) {
            for (const item of items) {
                const { fulls, halves } = decodeQuantity(item.quantity);
                const basePrice = Number(item.price_at_time || item.price_non_ac || item.price_ac || 0);

                if (fulls > 0) {
                    const img = await createOptimizedLine(s(item.name), fulls, basePrice.toFixed(0), (fulls * basePrice).toFixed(0), true);
                    await printer.printImageBuffer(img);
                }
                if (halves > 0) {
                    const hPrice = Math.ceil(basePrice * 0.6);
                    const img = await createOptimizedLine(`${s(item.name)} HALF`, halves, hPrice.toFixed(0), (halves * hPrice).toFixed(0), true);
                    await printer.printImageBuffer(img);
                }
                if (item.note && item.note.trim() !== "") {
                    const noteImg = await createNoteImage(s(item.note));
                    await printer.printImageBuffer(noteImg);
                }
            }
        }

        printer.println("================================================"); 
        printer.alignRight();
        printer.setTextDoubleHeight();
        printer.bold(true);
        printer.println(`Grand Total:   ${Math.round(total_amount).toFixed(2)}`);
        printer.setTextNormal();
        printer.bold(false);
        printer.drawLine();

        // Footer
        printer.alignCenter();
        printer.println(`GSTIN : ${s(restaurant_info.gstin || "24BLGPK9761G1ZV")}`);
        printer.println("THE ABOVE ITEMS ARE INCLUSIVE OF GST.");
        printer.newLine();
        printer.println(`For, ${s(restaurant_info.name).toUpperCase()}`);

        const footerImg = await createOptimizedLine("મુલાકાત બદલ આભાર🙏", "", null, null, false, false, true);
        await printer.printImageBuffer(footerImg);

        printer.cut();
        await printer.execute();
        res.json({ success: true });
    } catch (error) {
        console.error("Bill Error:", error);
        res.status(500).json({ success: false });
    }
});

module.exports = router;