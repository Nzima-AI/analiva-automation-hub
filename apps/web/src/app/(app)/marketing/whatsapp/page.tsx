import { redirect } from "next/navigation";

/** Moved: WhatsApp connection is under Settings, replies under Inbox. */
export default function WhatsAppMoved() {
  redirect("/marketing/settings");
}
