const express = require("express");
const net = require("net");
const bodyParser = require("body-parser");

const app = express();
const PORT = 3000;
const TIMEOUT_MS = 5000; 

// Middleware parse json requests
app.use(bodyParser.json());

// Endpoint to receive the print job from Railway
app.post("/print-receipt", (req, res) => {
  const { printerIP, port, escPosContent } = req.body;

  if (!escPosContent || !printerIP || !port) {
    return res.status(400).send({ message: "Faltan datos de impresión." });
  }

  // 1. Start TCP/IP connection to the printer
  const client = net.createConnection(
    { host: printerIP, port: port, timeout: TIMEOUT_MS },
    () => {
      // 2. Use 'latin1' (or 'binary') to map the ESC/POS string to bytes
      const data = Buffer.from(escPosContent, "latin1");

      client.write(data, () => {
        client.end(); // Close connection
        res.send({
          success: true,
          message: "Print sent to local proxy.",
        });
      });
    }
  );

  client.on("error", (err) => {
    console.error(`Error TCP: ${err.message}`);
    res
      .status(500)
      .send({
        success: false,
        message: `Error connecting to the printer: ${err.message}`,
      });
  });

  client.on("timeout", () => {
    client.destroy();
    res
      .status(500)
      .send({ success: false, message: "TCP connection timeout." });
  });
});

app.listen(PORT, () => {
  console.log(`Local proxy running on http://localhost:${PORT}`);
});
