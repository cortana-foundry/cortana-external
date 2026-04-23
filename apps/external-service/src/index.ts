import fs from "node:fs";
import https from "node:https";
import { createAdaptorServer, serve } from "@hono/node-server";

import { createApplication } from "./app.js";
import { ExternalServiceLifecycleSupervisor } from "./service-lifecycle.js";
import { getConfig } from "./config.js";
import { createLogger } from "./lib/logger.js";
import { ensurePortAvailable } from "./lib/port.js";

const startupLogger = createLogger("startup");
const refreshLogger = createLogger("refresh");
const shutdownLogger = createLogger("shutdown");


async function main(): Promise<void> {
  const config = getConfig();
  await ensurePortAvailable(config.PORT);
  const tlsCertPath = config.EXTERNAL_SERVICE_TLS_CERT_PATH.trim();
  const tlsKeyPath = config.EXTERNAL_SERVICE_TLS_KEY_PATH.trim();
  const tlsEnabled = Boolean(tlsCertPath && tlsKeyPath);
  if (tlsEnabled) {
    await ensurePortAvailable(config.EXTERNAL_SERVICE_TLS_PORT);
  }

  const { app, services } = createApplication();

  const lifecycle = new ExternalServiceLifecycleSupervisor(services, {
    startup: startupLogger,
    refresh: refreshLogger,
    shutdown: shutdownLogger,
  });
  await lifecycle.startup();
  lifecycle.startMaintenance();

  const server = serve({
    fetch: app.fetch,
    hostname: "127.0.0.1",
    port: config.PORT,
  });

  let tlsServer: ReturnType<typeof createAdaptorServer> | null = null;
  if (tlsEnabled) {
    const cert = fs.readFileSync(tlsCertPath);
    const key = fs.readFileSync(tlsKeyPath);
    tlsServer = createAdaptorServer({
      fetch: app.fetch,
      createServer: https.createServer,
      serverOptions: { cert, key },
    });
    tlsServer.listen(config.EXTERNAL_SERVICE_TLS_PORT, "127.0.0.1");
  }

  startupLogger.log(`Starting server on 127.0.0.1:${config.PORT}`);
  if (tlsEnabled) {
    startupLogger.log(`Starting TLS server on 127.0.0.1:${config.EXTERNAL_SERVICE_TLS_PORT}`);
  }

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    shutdownLogger.log("draining connections...");
    await lifecycle.shutdown();
    tlsServer?.close();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => {
    void shutdown();
  });
  process.on("SIGINT", () => {
    void shutdown();
  });
}

void main().catch((error) => {
  startupLogger.error("startup aborted", error);
  process.exit(1);
});
