/**
 * Test env bootstrap. Provides valid placeholder values so modules that import
 * "@/env" at load time (services, repositories) can be unit-tested. Uses ||=
 * so a real environment is never overridden.
 */
process.env.APP_URL ||= "http://localhost:3000";
process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/test";
process.env.BETTER_AUTH_SECRET ||= "test_secret_value_at_least_16_chars";
process.env.BETTER_AUTH_URL ||= "http://localhost:3000";
process.env.ENCRYPTION_MASTER_KEY ||= Buffer.alloc(32).toString("base64");
process.env.RESEND_API_KEY ||= "re_test_placeholder";
process.env.RESEND_WEBHOOK_SECRET ||= "whsec_test_placeholder";
