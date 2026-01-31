import express from "express";
import cors from "cors";
import { createConnection, Socket } from "node:net";
import { json } from "body-parser";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

import { Printer } from "escpos";
const USB = require("escpos-usb");

const app = express();
app.use(json());

const PORT = 3000;
const TIMEOUT_MS = 4000;

// Init cors
const corsOptions = {
  origin: [
    "http://localhost:4200",
    "https://est-core-one-frontend-4krz.vercel.app",
  ],
  methods: ["POST", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-user-code",
    "x-company-code",
  ],
};

// Open drawer
const OPEN_DRAWER_COMMAND = Buffer.from([0x1b, 0x70, 0x00, 0x40, 0x50]);

app.use(cors(corsOptions));
app.use(json());

// Print via TCP - LAN
function printTCP(printerIP, port, data) {
  return new Promise((resolve, reject) => {
    const client = createConnection({ host: printerIP, port }, () => {
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
      device = new USB();
    } catch (err) {
      console.log(`Exception while doing something: ${err}`);
      return reject(new Error("No USB printer found"));
    }

    const printer = new Printer(device);

    device.open(function (err) {
      if (err) return reject(err);

      printer
        .raw(data)
        .cut()
        .close(() => resolve(true));
    });
  });
}

function sendTCP(host, port, data) {
  return new Promise((resolve, reject) => {
    const client = new Socket();

    // Timeout 5 seconds
    client.setTimeout(5000);

    client.connect(port, host, () => {
      client.write(data);
      client.end();
      resolve();
    });

    client.on('error', (err) => {
      client.destroy();
      reject(err);
    });

    client.on('timeout', () => {
      client.destroy();
      reject(new Error('Timeout connecting to printer'));
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

app.post("/open-drawer", async (req, res) => {
  const { printerIP, port, mode } = req.body;
  try {
    if (mode === "USB") {
      await sendUSB(OPEN_DRAWER_COMMAND);
    } else {
      if (!printerIP || !port) {
        return res.status(400).send({ success: false, message: "Missing TCP printer IP/port" });
      }
      await sendTCP(printerIP, port, OPEN_DRAWER_COMMAND);
    }
    return res.send({ success: true, message: "Drawer opened" });
  } catch (err) {
    console.error("Error opening drawer:", err);
    return res.status(500).send({ success: false, message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Local Printer Proxy Ready → port ${PORT}`);
});
