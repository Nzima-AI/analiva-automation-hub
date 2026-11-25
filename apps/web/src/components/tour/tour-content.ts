export const staffTour = [
  {
    icon: "inbox", area: "Inbox", title: "Start with the emails that need you.",
    description: "Connect a practice mailbox and let the Hub capture attachments while you work. It categorises invoices, bank statements, receipts, proposals and other business documents, then files the originals where the team can find them.",
    proof: ["Email received", "Attachment categorised", "Original stored"],
    action: "Explore the inbox", href: "/inbox",
  },
  {
    icon: "review", area: "Review queue", title: "Give exceptions your attention.",
    description: "Check which client an invoice belongs to, confirm the extracted fields, and open the original alongside the record. In Documents, uncertain classifications stay visible until someone can resolve them.",
    proof: ["Supplier and client checked", "Invoice details reviewed", "Original available for inspection"],
    action: "See the review queue", href: "/review",
  },
  {
    icon: "crm", area: "WhatsApp marketing", title: "Reach every client on WhatsApp.",
    description: "Send personalised WhatsApp campaigns through Meta directly, with no monthly fee. See each message on a phone before it goes, send at each client's best time, and watch reads, clicks and sign-ups arrive live. Replies, call-backs and opt-outs are handled for you.",
    proof: ["Live mission control", "Best-time sending and A/B tests", "Replies sorted in one inbox"],
    action: "Open WhatsApp marketing", href: "/marketing",
  },
  {
    icon: "report", area: "Books & reports", title: "Follow the numbers back to the work.",
    description: "Move between client books, bank transactions and financial statements. The Hub brings the records you’ve captured and the reporting work that follows into the same workspace.",
    proof: ["Client books", "Bank transactions", "Financial statements"],
    action: "Explore books and reports", href: "/books",
  },
  {
    icon: "ready", area: "Month-end readiness · Interactive demo", title: "See what’s holding up month-end.",
    description: "Try the pitch scenario where 127 sample emails become three decisions. Draft a statement follow-up, compare a duplicate invoice, and clear a purchase order mismatch. The DockDigi and analiva.app handoffs are simulated.",
    proof: ["Follow up for a missing statement", "Resolve the flagged invoices", "Ready for reporting"],
    action: "Try the month-end demo", href: "/demo/marketing/index.html#month-end",
  },
  {
    icon: "growth", area: "Workspace tier", title: "Give your team a place to start.",
    description: "The Pilot tier brings inbox processing, client records and campaign drafting into one workspace. See what the proposed Growth tier would add. Workspace owners can record their interest from the tier page.",
    proof: ["Start with one workflow", "Bring your team into the Hub", "Explore the proposed Growth tier"],
    action: "Compare tiers", href: "/plans",
  },
] as const;

export const clientTour = [
  {
    icon: "report", area: "Client portal", title: "Find the figures your accountant shares.",
    description: "Your portal brings together the financial reports, invoices and documents your practice has made available to you. Open a report when you need to see the detail.",
    proof: ["Your company", "Shared financial reports", "Supporting documents"],
    action: "Explore your reports", href: "/portal/reports",
  },
  {
    icon: "inbox", area: "Documents", title: "Give your accountant the right file.",
    description: "Upload a requested statement, invoice or receipt in your client workspace. You can return to Documents to see the files your practice makes available.",
    proof: ["Open Documents", "Choose a file", "Send it to your practice"],
    action: "Open your documents", href: "/portal/documents",
  },
  {
    icon: "crm", area: "Enquiries", title: "Keep your questions in one place.",
    description: "Send a question to the practice and return to the enquiry to see the reply. Your conversation stays with the context your accountant needs to help.",
    proof: ["Raise a question", "Follow the thread", "See your accountant’s reply"],
    action: "Open enquiries", href: "/portal/enquiries",
  },
] as const;
