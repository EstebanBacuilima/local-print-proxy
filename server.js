const express = require("express");
const cors = require("cors");
const net = require("net");
const bodyParser = require("body-parser");
const escpos = require("escpos");
escpos.USB = require("escpos-usb");

const app = express();
app.use(bodyParser.json());

const PORT = 3000;
const TIMEOUT_MS = 4000;

// Init cors
const corsOptions = {
  origin: "http://localhost:4200",
  methods: ["POST", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-user-code",
    "x-company-code",
  ],
};
app.use(cors(corsOptions));
app.use(bodyParser.json());

// Print via TCP - LAN
function printTCP(printerIP, port, data) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection({ host: printerIP, port }, () => {
      client.write(data, () => {
        client.end();
        resolve(true);
      });
    });

    client.setTimeout(TIMEOUT_MS);

    client.on("timeout", () => {
      client.destroy();
      reject(new Error("TCP timeout: printer not responding"));
    });

    client.on("error", reject);
  });
}

// Print by usb
function printUSB(data) {
  return new Promise((resolve, reject) => {
    let device;

    try {
      device = new escpos.USB();
    } catch (err) {
      return reject(new Error("No USB printer found"));
    }

    const printer = new escpos.Printer(device);

    device.open(function (err) {
      if (err) return reject(err);

      printer
        .raw(data)
        .cut()
        .close(() => resolve(true));
    });
  });
}

// Main api
app.post("/print-receipt", async (req, res) => {
  const { escPosContent, printerIP, port, mode } = req.body;

  if (!escPosContent)
    return res
      .status(400)
      .send({ success: false, message: "Missing ESC/POS data" });
  const bytes = Buffer.from(escPosContent, "base64");
  try {
    if (mode === "USB") {
      await printUSB(bytes);
    } else {
      if (!printerIP || !port)
        return res
          .status(400)
          .send({ success: false, message: "Missing TCP printer IP/port" });
      await printTCP(printerIP, port, bytes);
    }
    return res.send({ success: true, message: "Printed OK" });
  } catch (err) {
    console.error("Error printing:", err);
    return res.status(500).send({ success: false, message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Local Printer Proxy Ready → port ${PORT}`);
});
