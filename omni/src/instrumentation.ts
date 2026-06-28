export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { closeDatabase } = await import("@/db");
    const { stopBoss } = await import("@/lib/queue");
    const { logger } = await import("@/lib/logger");

    const shutdown = async (signal: string) => {
      logger.info(`Web process received ${signal}, shutting down gracefully...`);
      try {
        await stopBoss();
        await closeDatabase();
        logger.info("Web process shutdown complete.");
        process.exit(0);
      } catch (err) {
        logger.error("Error during web process shutdown", err);
        process.exit(1);
      }
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  }
}
