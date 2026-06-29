import { TrackingAdapter } from "./types";
import { ResendTrackingAdapter } from "./adapters/resend";
import { SesTrackingAdapter } from "./adapters/ses";
import { MailgunTrackingAdapter } from "./adapters/mailgun";
import { PostmarkTrackingAdapter } from "./adapters/postmark";

export * from "./types";

export function createTrackingAdapter(providerType: string): TrackingAdapter {
  switch (providerType) {
    case "resend_webhook":
      return new ResendTrackingAdapter();
    case "ses_sns":
      return new SesTrackingAdapter();
    case "mailgun_webhook":
      return new MailgunTrackingAdapter();
    case "postmark_webhook":
      return new PostmarkTrackingAdapter();
    default:
      throw new Error(`Unsupported tracking provider type: ${providerType}`);
  }
}
